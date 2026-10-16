import { ApiError, apiRequest } from "@/lib/api/client";
import { isRedirectError } from "@/lib/auth/session-expired";
import { SIGN_IN_AGAIN } from "@/lib/data/upload-messages";
import { uploadProblem, type UploadKind } from "@/lib/data/file-check";

export { SIGN_IN_AGAIN };

/**
 * Getting a file into S3, in two hops.
 *
 * ## The contract (AGENTS-INTEGRATION.md, 2026-09-03)
 *
 *   POST /api/upload-url  { fileName, contentType, folder, userEmail, flat }
 *     -> { success, uploadUrl, key, fileUrl }
 *
 *   PUT <uploadUrl>       Content-Type: <the SAME contentType>
 *                         body: raw bytes, and NO auth header
 *
 * Two rules, both of which fail in ways that look like something else:
 *
 * - **The `Content-Type` on the PUT must match the one the URL was signed
 *   for.** S3 signs the header into the URL, so a mismatch is a 403 — which
 *   reads as a permissions problem rather than a typo.
 * - **The PUT carries no `Authorization` and no `x-api-key`.** The signature is
 *   the auth; sending our own headers is how a presigned URL gets rejected.
 *
 * The upload runs on the server, not the browser: the presigned URL is minted
 * with the customer's JWT, and handing that round trip to the client would mean
 * exposing it. The file arrives in a Server Action's FormData and goes straight
 * out again.
 */

export interface UploadedFile {
  /** The public URL to hand to the agent — `lead_database_url` and friends. */
  fileUrl: string;
  /** The S3 key, kept for logs. */
  key: string;
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly userMessage?: string,
    /** True when the fix is signing in again, not retrying. */
    readonly signInAgain = false,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

/** Uploads take longer than a data read; the 8s deadline aborts a real file. */
const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * The content type to sign for.
 *
 * The browser fills `File.type` from the OS, and it is empty often enough to
 * matter — a `.xlsx` picked on Windows frequently arrives blank. Guessing from
 * the extension is better than signing for `""`, which S3 then rejects at PUT
 * time with a 403 that says nothing about the cause.
 */
export function contentTypeOf(file: File): string {
  if (file.type !== "") return file.type;

  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const byExtension: Record<string, string> = {
    csv: "text/csv",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };

  return byExtension[extension] ?? "application/octet-stream";
}

/**
 * The only file types this app ever uploads (audit, 2026-09-25).
 *
 * Anything was signed before — including SVG and HTML, which a browser will
 * run as a page if the stored object is ever opened directly, turning the
 * company's own bucket into a phishing or script host. Images and video for
 * ad creative; spreadsheets, PDFs and documents for the lead agent.
 */
export const ALLOWED_UPLOAD_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

/** Largest file accepted: video can be big, everything else is kept small. */
export function maxUploadBytes(contentType: string): number {
  return contentType.startsWith("video/") ? 100 * 1024 * 1024 : 25 * 1024 * 1024;
}

/**
 * The name sent to the signer: the last path segment only, and only letters,
 * digits, dots, dashes and underscores. A name like `../../x` must never be
 * able to steer where the object lands.
 */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(-100);
  return cleaned === "" ? "file" : cleaned;
}

/** A signed PUT target plus the public URL the bytes will live at. */
export interface PresignedUpload {
  uploadUrl: string;
  fileUrl: string;
  key: string;
}

/**
 * Mints a presigned S3 PUT for one file. SERVER-ONLY — it authenticates to the
 * backend with the session JWT, which never reaches the browser.
 *
 * Split out of `uploadFile` so a Route Handler can hand the short-lived,
 * single-object PUT target to the browser (which then PUTs the bytes to S3
 * itself) without the browser ever holding a bearer token. `uploadFile` still
 * uses it for the server-side path.
 *
 * `contentType` MUST be the exact type the browser will PUT with — S3 signs it
 * into the URL, so a mismatch is a 403 that reads like a permissions problem.
 */
export async function presignUpload({
  fileName,
  contentType,
  folder,
  email,
}: {
  fileName: string;
  contentType: string;
  folder: string;
  email: string;
}): Promise<PresignedUpload> {
  if (!ALLOWED_UPLOAD_TYPES.has(contentType)) {
    throw new UploadError(
      `refused to sign ${contentType || "an unknown type"}`,
      "That file type can't be uploaded. Use an image, a video, a spreadsheet, a PDF or a document.",
    );
  }
  fileName = safeFileName(fileName);
  let signed: { uploadUrl?: string; fileUrl?: string; key?: string };
  try {
    signed = await apiRequest<{ uploadUrl?: string; fileUrl?: string; key?: string }>(
      "/api/upload-url",
      {
        method: "POST",
        body: { fileName, contentType, folder, userEmail: email, flat: false },
        timeoutMs: UPLOAD_TIMEOUT_MS,
      },
    );
  } catch (error) {
    // A dead session leaves as a redirect, not as this call's own
    // failure — see isRedirectError in session-expired.ts.
    if (isRedirectError(error)) throw error;
    // The backend would not accept this login (an expired refresh, or one
    // superseded by a sign-in elsewhere). Said as that, so the customer signs
    // in again rather than retrying an upload that can never work.
    if (error instanceof ApiError && error.status === 401) {
      throw new UploadError(`upload-url refused the session for ${fileName}`, SIGN_IN_AGAIN, true);
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new UploadError(`could not sign an upload for ${fileName}: ${detail}`);
  }

  if (!signed?.uploadUrl || !signed?.fileUrl) {
    throw new UploadError(
      `upload-url answered without a URL for ${fileName}: ${JSON.stringify(signed)}`,
    );
  }

  return { uploadUrl: signed.uploadUrl, fileUrl: signed.fileUrl, key: signed.key ?? "" };
}

/**
 * Uploads one file and returns the URL the agents refer to it by.
 *
 * Throws `UploadError` rather than returning null: a run that proceeds without
 * its leads file is worse than one that stops and says why.
 */
export async function uploadFile(
  file: File,
  {
    folder,
    email,
    kind,
  }: {
    folder: string;
    email: string;
    /**
     * Which field this file came from. Given, the file must pass that field's
     * check (`uploadProblem`: its types, and bytes that match its name) before
     * anything is signed — the browser runs the same check, but a check that
     * only runs there can be skipped.
     */
    kind?: UploadKind;
  },
): Promise<UploadedFile> {
  if (kind) {
    const problem = await uploadProblem(file, kind);
    if (problem) throw new UploadError(`refused ${file.name} for ${kind}: ${problem}`, problem);
  }
  const contentType = contentTypeOf(file);
  if (file.size > maxUploadBytes(contentType)) {
    throw new UploadError(
      `${file.name} is ${file.size} bytes, over the limit`,
      `That file is too large. The limit is ${Math.round(maxUploadBytes(contentType) / 1024 / 1024)} MB.`,
    );
  }

  const signed = await presignUpload({ fileName: file.name, contentType, folder, email });

  const response = await fetch(signed.uploadUrl, {
    method: "PUT",
    // Exactly the type the URL was signed for, and nothing else. An
    // Authorization header here invalidates the signature.
    headers: { "Content-Type": contentType },
    body: new Uint8Array(await file.arrayBuffer()),
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  }).catch((error: unknown) => {
    throw new UploadError(
      `PUT to S3 failed for ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
      "We couldn't upload that file. Please try again.",
    );
  });

  if (!response.ok) {
    // 403 here is almost always the content-type mismatch, so say so in the log
    // — it is the difference between a five-minute fix and an afternoon.
    throw new UploadError(
      `S3 rejected ${file.name} with ${response.status}` +
        (response.status === 403 ? " (usually a Content-Type mismatch with the signed URL)" : ""),
      "We couldn't upload that file. Please try again.",
    );
  }

  return { fileUrl: signed.fileUrl, key: signed.key ?? "" };
}
