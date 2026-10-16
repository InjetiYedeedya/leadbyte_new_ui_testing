import { NextResponse, type NextRequest } from "next/server";
import { LINKEDIN_MEDIA_FOLDERS, linkedInMediaKind } from "@/lib/data/linkedin-semi-media";
import { getSession } from "@/lib/auth/session";
import { presignUpload, SIGN_IN_AGAIN, UploadError } from "@/lib/data/uploads";
import { STALE_LOGIN_PATH, isRedirectError } from "@/lib/auth/session-expired";
import { SEMI_MEDIA_SPECS, semiMediaFolder, type SemiMediaType } from "@/lib/data/meta-semi-media";
import { googleUploadField } from "@/lib/data/ads-creatives";

/**
 * Presigns one S3 PUT for a semi-automation creative — Meta's or Google's.
 *
 * ## Why this route exists
 *
 * The uploaders are client islands and the customer's own file must go straight
 * to S3 — the bytes never belong in the campaign request. But the browser
 * cannot call the backend's `/api/upload-url` itself: the JWT lives in an
 * httpOnly cookie it cannot read, and the backend rejects a browser `Origin`.
 * So this BFF route does the signing with the session token server-side and
 * hands back only the short-lived, single-object PUT target. The browser then
 * PUTs the bytes with no app credentials at all — the S3 signature is the auth.
 *
 * The same seam `/api/locations` is: a Route Handler owns an upstream call the
 * island cannot make for itself. It is not an open proxy — it signs uploads
 * into two fixed folder shapes and nothing else.
 *
 * ## Why one route for both platforms
 *
 * It was `/api/meta-media/upload-url` while Meta was the only platform
 * collecting creative in the automation-mode dialog. Google now does too, and
 * the two differ by a folder and which list of slots is legal — everything
 * else, including the content-type guard that keeps this from signing an
 * arbitrary file class into a creatives folder, is identical. A second route
 * would have been that guard, twice.
 */

/** The Social Media agent's own images and video — the legacy app's folder. */
const SOCIAL_FOLDER = "social-media/media";

/** What a social post may carry (legacy `MediaUploader`; AVI is not signable here). */
const SOCIAL_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"]);

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: {
    fileName?: unknown;
    contentType?: unknown;
    platform?: unknown;
    type?: unknown;
    slot?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const fileName = typeof body.fileName === "string" ? body.fileName : "";
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  // Meta was here first and posted no platform; default to it so an older tab
  // mid-flow keeps working rather than failing at the upload.
  const platform =
    body.platform === "google"
      ? "google"
      : body.platform === "social"
        ? "social"
        : body.platform === "linkedin"
          ? "linkedin"
          : "meta";

  if (!fileName || !contentType) {
    return NextResponse.json({ error: "Missing file details." }, { status: 400 });
  }

  let folder: string;
  let wantsVideo = false;

  if (platform === "social") {
    // Images or one video for a post (2026-10-01). A fixed list of types, so
    // this cannot sign some other file class into the posts folder.
    if (!SOCIAL_MEDIA_TYPES.has(contentType)) {
      return NextResponse.json({ error: "Use a JPG, PNG or WebP image, or an MP4 or MOV video." }, { status: 400 });
    }
    folder = SOCIAL_FOLDER;
    wantsVideo = contentType.startsWith("video/");
  } else if (platform === "linkedin") {
    // LinkedIn semi creative (2026-10-08): JPG/PNG images or an MP4/MOV
    // video, each kind into its own folder — and nothing else signs here.
    const kind = linkedInMediaKind(contentType);
    if (kind === null) {
      return NextResponse.json({ error: "Use JPG or PNG images, or an MP4 or MOV video." }, { status: 400 });
    }
    folder = LINKEDIN_MEDIA_FOLDERS[kind];
    wantsVideo = kind === "video";
  } else if (platform === "google") {
    // The slot has to be one Google actually declares — this is what stops the
    // route being a general-purpose signer for the creatives folder.
    const slot = typeof body.slot === "string" ? body.slot : "";
    // Each slot has its own folder — the legacy `google-ads/display-assets/*`
    // ones (GOOGLE_ADS_AGENT_SPEC §11.2) — and the video slot signs a video.
    const field = googleUploadField(slot);
    if (!field) {
      return NextResponse.json({ error: "Unknown creative slot." }, { status: 400 });
    }
    folder = field.folder;
    wantsVideo = field.kind === "video";
  } else {
    const type = body.type as SemiMediaType;
    if (type !== "image" && type !== "video" && type !== "carousel") {
      return NextResponse.json({ error: "Unknown media type." }, { status: 400 });
    }
    folder = semiMediaFolder(type);
    wantsVideo = SEMI_MEDIA_SPECS[type].accept.includes("video");
  }

  // Guard the content type against the picker's own kind, so this cannot be
  // used to sign an upload of some other file class into the creatives folder.
  const kindOk = wantsVideo ? contentType.startsWith("video/") : contentType.startsWith("image/");
  if (!kindOk) {
    return NextResponse.json({ error: "That file type is not allowed here." }, { status: 400 });
  }

  try {
    const signed = await presignUpload({
      fileName,
      contentType,
      folder,
      email: session.businessId,
    });
    return NextResponse.json(signed);
  } catch (error) {
    // A login the backend has given up on. `apiRequest` signals that with a
    // redirect, which a fetch from the browser cannot follow — so it was
    // caught below and reported as "couldn't prepare that upload", sending
    // the customer round a retry that could never work (2026-10-01). It is
    // answered as what it is, with where to go.
    if (isRedirectError(error) || (error instanceof UploadError && error.signInAgain)) {
      console.warn(`[ads-media] presign refused: the session for ${session.businessId} needs a fresh sign-in`);
      return NextResponse.json({ error: SIGN_IN_AGAIN, signIn: STALE_LOGIN_PATH }, { status: 401 });
    }
    console.error(`[ads-media] presign failed for ${platform}:`, error);
    const message =
      error instanceof UploadError && error.userMessage
        ? error.userMessage
        : "We couldn't prepare that upload. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
