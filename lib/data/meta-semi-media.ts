/**
 * Meta Ads semi-automation media: the user's own creative.
 *
 * Full automation = the agent writes the creative (the prompt pipeline). Semi
 * automation = the customer supplies it, and for Meta that is one of three
 * shapes — a single square image, a single vertical video, or a 2–10 image
 * carousel. This module is the ONE declaration of the per-type rules and the
 * `semiAutomationMedia` object the executor receives; the uploader validates
 * against it and the launch payload carries what it builds.
 *
 * Client-safe and pure: no cookies, no transport. The uploader imports the
 * specs; the Server Action imports the builder and validator. The bytes go to
 * S3 directly from the browser (see `app/api/ads-media/upload-url`); only the
 * resulting URLs ever travel in the campaign request.
 */

import { ratioMatches } from "@/lib/media-dimensions";

export type SemiMediaType = "image" | "video" | "carousel";

export const SEMI_MEDIA_TYPES: SemiMediaType[] = ["image", "video", "carousel"];

export interface SemiMediaSpec {
  type: SemiMediaType;
  label: string;
  /** `accept` for the file input. */
  accept: string;
  minFiles: number;
  maxFiles: number;
  /** Per-file byte ceiling. */
  maxBytes: number;
  /**
   * The aspect ratio to enforce, or null when any ratio is accepted.
   *
   * Video was null until 2026-10-02 — "Any size", with 9:16 only recommended.
   * The legacy spec now says send 9:16 and declare it (`videoRequirement`), so
   * it is enforced like the square image is. `tolerance`, when set, is the
   * absolute slack on width ÷ height (0.01 for video, per the spec); without
   * it the shared 3% rule in `ratioMatches` applies.
   */
  ratio: { w: number; h: number; label: string; tolerance?: number } | null;
  /** The rule as a sentence, shown under the picker. */
  hint: string;
}

const MB = 1024 * 1024;

export const SEMI_MEDIA_SPECS: Record<SemiMediaType, SemiMediaSpec> = {
  image: {
    type: "image",
    label: "Image",
    accept: "image/jpeg,image/png",
    minFiles: 1,
    maxFiles: 1,
    maxBytes: 10 * MB,
    ratio: { w: 1, h: 1, label: "1:1" },
    hint: "One square (1:1) JPG or PNG, up to 10 MB.",
  },
  video: {
    type: "video",
    label: "Video",
    // Named types, not `video/*`: Meta takes these three, and `video/*` let
    // the picker offer formats the ad platform then refuses.
    accept: "video/mp4,video/quicktime,video/webm",
    minFiles: 1,
    maxFiles: 1,
    maxBytes: 1024 * MB,
    ratio: { w: 9, h: 16, label: "9:16", tolerance: 0.01 },
    hint: "One vertical (9:16) MP4, MOV or WebM video, up to 1 GB.",
  },
  carousel: {
    type: "carousel",
    label: "Carousel",
    accept: "image/jpeg,image/png",
    minFiles: 2,
    maxFiles: 10,
    maxBytes: 10 * MB,
    ratio: { w: 1, h: 1, label: "1:1" },
    hint: "2 to 10 square (1:1) images, up to 10 MB each.",
  },
};

/** Whether a file's MIME type is one the spec's picker accepts. */
export function acceptsFileType(spec: SemiMediaSpec, contentType: string): boolean {
  return spec.accept.split(",").includes(contentType.trim().toLowerCase());
}

/** Whether measured dimensions satisfy the spec's ratio (always, when it has none). */
export function semiRatioMatches(dim: { w: number; h: number }, spec: SemiMediaSpec): boolean {
  const ratio = spec.ratio;
  if (!ratio || dim.h <= 0) return ratio === null;
  if (ratio.tolerance === undefined) return ratioMatches(dim, ratio);
  return Math.abs(dim.w / dim.h - ratio.w / ratio.h) <= ratio.tolerance;
}

/** The S3 folder the backend names for each type. */
export function semiMediaFolder(type: SemiMediaType): string {
  return `meta-ads/semi-automation/${type}`;
}

/**
 * The `semiAutomationMedia` object the executor reads.
 *
 * Shape taken from the legacy app: `url` is the first asset (all types have
 * one), `urls` is the full list, and the requirement strings are metadata the
 * n8n flow echoes. `minImages` is present only for a carousel.
 */
export interface SemiAutomationMedia {
  type: SemiMediaType;
  required: true;
  url: string;
  urls: string[];
  imageRequirement: string | null;
  videoRequirement: string | null;
  minImages?: number;
}

export function buildSemiAutomationMedia(
  type: SemiMediaType,
  urls: string[],
): SemiAutomationMedia {
  const media: SemiAutomationMedia = {
    type,
    required: true,
    url: urls[0] ?? "",
    urls,
    imageRequirement: type === "video" ? null : "1:1 ratio",
    videoRequirement: type === "video" ? "9:16" : null,
  };
  if (type === "carousel") media.minImages = 2;
  return media;
}

/**
 * Whether a set of uploaded URLs satisfies the type's rules. Returns a reason
 * to show when it does not, or null when it is good to launch.
 */
export function validateSemiAutomationMedia(media: SemiAutomationMedia | null): string | null {
  if (!media) return "Choose a media type and upload your creative before launching.";
  const spec = SEMI_MEDIA_SPECS[media.type];
  const urls = media.urls.filter((u) => u.trim() !== "");
  if (media.type === "carousel" && urls.length < spec.minFiles) {
    return "A carousel needs at least 2 images. Add another before launching.";
  }
  if (urls.length < spec.minFiles) {
    return `Please upload your ${media.type} before proceeding with Semi Automation.`;
  }
  // The picker stops at the limit, but a form can be posted without it.
  if (urls.length > spec.maxFiles) {
    return media.type === "carousel"
      ? `A carousel can have at most ${spec.maxFiles} images. Remove some before launching.`
      : `Upload just one ${media.type} for this ad.`;
  }
  return null;
}

/**
 * Parses the JSON the uploader submits in a hidden field. Never throws — a
 * malformed value is treated as "nothing uploaded", which the validator then
 * reports honestly.
 */
export function parseSemiAutomationMedia(raw: unknown): SemiAutomationMedia | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const obj = parsed as Partial<SemiAutomationMedia> | null;
  if (!obj || typeof obj !== "object") return null;
  const type = obj.type;
  if (type !== "image" && type !== "video" && type !== "carousel") return null;
  const urls = Array.isArray(obj.urls)
    ? obj.urls.filter((u): u is string => typeof u === "string" && u.trim() !== "")
    : [];
  if (urls.length === 0) return null;
  return buildSemiAutomationMedia(type, urls);
}
