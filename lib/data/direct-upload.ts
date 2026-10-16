/**
 * One creative file, straight from the browser to S3: ask our
 * `/api/ads-media/upload-url` for a signed PUT, then PUT the bytes.
 *
 * Shared by the Meta, Google and LinkedIn semi uploaders, which each had their
 * own copy of these two steps behind ONE catch saying "Upload failed. Check
 * your connection and retry." That sentence was shown for things a connection
 * has nothing to do with — a sign step answering with an error page instead
 * of JSON (a Cloudflare limit, a 500), S3 refusing an expired or mismatched
 * signature, a file over the size limit — so the customer retried, got the
 * same message, and reported it as broken (LBS-1147 f). Each step now says
 * which one failed and why, in words someone can act on.
 *
 * Client-safe: no server imports, so the islands can use it. `fetchImpl` is
 * injectable so the wording is tested without a network.
 */

export type DirectUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string; signIn?: string };

export const SIGN_UNREACHABLE =
  "We couldn't reach LeadByte to start the upload. Check your connection and try again.";
export const SIGN_SERVER_ERROR =
  "Our server couldn't prepare the upload just now. Please try again in a minute.";
export const PUT_INTERRUPTED =
  "The upload was interrupted before it finished. Try again — if it keeps happening, try a smaller file or another network.";
export const PUT_TOO_LARGE = "This file is too large to upload. Use a smaller file.";
export const PUT_LINK_EXPIRED =
  "The upload link expired or didn't match this file. Add the file again.";

/** The sign step's reply, read as text first: an error page is not JSON. */
function parseJson(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const str = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined);

/** Why S3 refused, from its XML `<Code>`. Pure. */
export function putRefusalMessage(status: number, body: string): string {
  const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1] ?? "";
  if (status === 413 || code === "EntityTooLarge") return PUT_TOO_LARGE;
  if (/^(AccessDenied|SignatureDoesNotMatch|RequestExpired|ExpiredToken)$/.test(code) || status === 403) {
    return PUT_LINK_EXPIRED;
  }
  return `File storage refused the upload (${code || `status ${status}`}). Try again.`;
}

export async function directUpload(
  signBody: Record<string, unknown>,
  file: Blob,
  contentType: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DirectUploadResult> {
  let signRes: Response;
  try {
    signRes = await fetchImpl("/api/ads-media/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signBody),
    });
  } catch {
    return { ok: false, error: SIGN_UNREACHABLE };
  }

  const signed = parseJson(await signRes.text().catch(() => ""));
  const uploadUrl = str(signed.uploadUrl);
  const fileUrl = str(signed.fileUrl);
  if (!signRes.ok || !uploadUrl || !fileUrl) {
    const signIn = str(signed.signIn);
    const error =
      str(signed.error) ??
      (signRes.status === 413 ? PUT_TOO_LARGE : signRes.status >= 500 || signRes.ok ? SIGN_SERVER_ERROR : "Couldn't prepare the upload.");
    return { ok: false, error, ...(signIn ? { signIn } : {}) };
  }

  // The bytes go straight to S3. The Content-Type MUST match what was signed,
  // and no Authorization header may be sent — the signature is it.
  let put: Response;
  try {
    put = await fetchImpl(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
  } catch {
    return { ok: false, error: PUT_INTERRUPTED };
  }
  if (!put.ok) {
    return { ok: false, error: putRefusalMessage(put.status, await put.text().catch(() => "")) };
  }
  return { ok: true, url: fileUrl };
}
