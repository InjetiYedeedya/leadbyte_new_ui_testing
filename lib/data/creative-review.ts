/**
 * Reads the review email's link for `/creative/approve`.
 *
 * The email (built by n8n) carries the whole creative in the query string, in
 * the shape the legacy app's `CreativeApprove.jsx` read, so this keeps that
 * shape exactly — the emails already in inboxes point here:
 *
 *   ?platform=meta_ads&urls=<u1>,<u2>          (or `url=<u>`), images and
 *                                               videos in one list
 *   ?platform=google_ads&images=<u>,<label>|<u>,<label>&videos=<u>,<label>|…
 *   &location_key=<text>                        optional, shown in the copy
 *
 * `platform` missing means Meta: the legacy page and the backend's
 * `/api/creative/approve` both default it that way, and the first Meta emails
 * were sent without one. Any OTHER value is refused, so a mistyped link says
 * it is broken instead of approving through the wrong platform's workflow.
 *
 * Every param is also kept, unchanged, in `passThrough`: the approver
 * workflow finds the campaign from fields this page never reads.
 */

export type CreativePlatform = "meta_ads" | "google_ads";

export type CreativeAsset = { url: string; label: string };

export type CreativeReview = {
  platform: CreativePlatform;
  locationKey: string;
  images: CreativeAsset[];
  videos: CreativeAsset[];
  /** The incoming params, to forward to the approver as they came. */
  passThrough: Record<string, string>;
};

/** Our own flags on this URL, never forwarded. */
const OWN_PARAMS = new Set(["approved", "error"]);

/**
 * The most a link may carry. A real review is a few hundred characters of
 * URLs; the cap is what stops the approve action being a free relay for
 * anything someone cares to paste after `?`.
 */
export const MAX_QUERY_LENGTH = 8000;

const VIDEO_EXTENSION = /\.(mp4|mov|avi|webm|mkv)$/i;

/** By the path's extension; the query string (S3 signatures) is ignored. */
export function isVideoUrl(url: string): boolean {
  try {
    return VIDEO_EXTENSION.test(new URL(url).pathname);
  } catch {
    return VIDEO_EXTENSION.test(url.split("?")[0] ?? "");
  }
}

/**
 * Only an `https:` URL reaches an `<img>` or `<video>`. The link is public
 * and editable by anyone, so a `javascript:` or `http:` value is dropped
 * rather than rendered.
 */
function safeUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Google's size when the email did not name one. The legacy page ALWAYS did
 * this, by position (4 square, then 4 vertical, then landscape); here it is
 * only the fallback, because the email sends the real label beside each URL.
 */
export function fallbackGoogleLabel(index: number): string {
  if (index < 4) return "Square";
  if (index < 8) return "Vertical";
  return "Landscape";
}

/** `url,label|url,label` → assets. A part with no comma is a bare URL. */
function readTagged(value: string | null, fallback: (index: number) => string): CreativeAsset[] {
  if (!value) return [];
  const assets: CreativeAsset[] = [];
  for (const part of value.split("|")) {
    const comma = part.indexOf(",");
    const rawUrl = comma === -1 ? part : part.slice(0, comma);
    const url = safeUrl(rawUrl);
    if (!url) continue;
    const label = comma === -1 ? "" : part.slice(comma + 1).trim();
    assets.push({ url, label: label || fallback(assets.length) });
  }
  return assets;
}

function readPlatform(value: string | null): CreativePlatform | null {
  const key = (value ?? "").trim().toLowerCase();
  if (key === "" || key === "meta_ads") return "meta_ads";
  if (key === "google_ads") return "google_ads";
  return null;
}

/**
 * The review this link describes, or null when it cannot be shown: an
 * unknown platform, no usable asset, or a query past `MAX_QUERY_LENGTH`.
 */
export function readCreativeReview(params: URLSearchParams): CreativeReview | null {
  if (params.toString().length > MAX_QUERY_LENGTH) return null;

  const platform = readPlatform(params.get("platform"));
  if (!platform) return null;

  let images: CreativeAsset[];
  let videos: CreativeAsset[];

  if (platform === "google_ads") {
    images = readTagged(params.get("images"), fallbackGoogleLabel);
    videos = readTagged(params.get("videos"), () => "");
  } else {
    const listed = (params.get("urls") ?? "").split(",");
    const all = (listed.some((value) => value.trim() !== "") ? listed : [params.get("url") ?? ""])
      .map(safeUrl)
      .filter((url): url is string => url !== null);
    images = all.filter((url) => !isVideoUrl(url)).map((url) => ({ url, label: "" }));
    videos = all.filter(isVideoUrl).map((url) => ({ url, label: "" }));
  }

  if (images.length + videos.length === 0) return null;

  const passThrough: Record<string, string> = {};
  for (const [key, value] of params) {
    if (!OWN_PARAMS.has(key)) passThrough[key] = value;
  }

  return {
    platform,
    locationKey: (params.get("location_key") ?? "").trim(),
    images,
    videos,
    passThrough,
  };
}

/** The approver's body: the link's own fields, plus the decision. */
export function approvalBody(review: CreativeReview): Record<string, string> {
  return { ...review.passThrough, platform: review.platform, action: "approved" };
}
