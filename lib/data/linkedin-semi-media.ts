/**
 * LinkedIn's semi-automation creative: the customer's own images or video,
 * collected on the automation step like Meta's (2026-10-08).
 *
 * The rules are the live app's (LINKEDIN_ADS_AGENT_SPEC §7): uploads are
 * OPTIONAL — Semi launches with none, and an Event ad needs no file — up to
 * 10 images (JPG or PNG, 5 MB each) OR one video (MP4 or MOV, 100 MB), never
 * both. It replaced one REQUIRED image slot on the details form, which left a
 * Video views campaign unable to upload its video and an Event ad blocked on
 * an image it does not use.
 *
 * Files go from the browser to S3 (`/api/ads-media/upload-url`,
 * `platform: "linkedin"`); only URLs reach the server, as one JSON field,
 * and every rule is checked again here because a post is forgeable. The
 * launch sends them as `mediaAssets`, the shape LinkedIn's workflow reads.
 */

export const LINKEDIN_SEMI_INPUT = "linkedinSemiMedia";

export const LINKEDIN_MAX_IMAGES = 10;
export const LINKEDIN_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;
export const LINKEDIN_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const LINKEDIN_VIDEO_TYPES = ["video/mp4", "video/quicktime"] as const;
export const LINKEDIN_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

/** The S3 folders, by kind — the images one is the legacy app's. */
export const LINKEDIN_MEDIA_FOLDERS = {
  image: "linkedin-ads/semi-images",
  video: "linkedin-ads/semi-videos",
} as const;

export type LinkedInMediaKind = "image" | "video";

export interface LinkedInSemiMedia {
  images: string[];
  video: string | null;
}

export const NO_LINKEDIN_MEDIA: LinkedInSemiMedia = { images: [], video: null };

/** The kind a file type is, or null when LinkedIn semi does not take it. Pure. */
export function linkedInMediaKind(contentType: string): LinkedInMediaKind | null {
  if ((LINKEDIN_IMAGE_TYPES as readonly string[]).includes(contentType)) return "image";
  if ((LINKEDIN_VIDEO_TYPES as readonly string[]).includes(contentType)) return "video";
  return null;
}

/** Why a set of new files cannot join what is already there, or null. Pure. */
export function linkedInMixProblem(
  existing: readonly LinkedInMediaKind[],
  adding: readonly LinkedInMediaKind[],
): string | null {
  const all = [...existing, ...adding];
  const images = all.filter((kind) => kind === "image").length;
  const videos = all.filter((kind) => kind === "video").length;
  if (images > 0 && videos > 0) {
    if (existing.includes("image")) return "You already added images. Remove them to upload a video instead.";
    if (existing.includes("video")) return "You already added a video. Remove it to upload images instead.";
    return "Upload images or a video — not both.";
  }
  if (videos > 1) return "You can upload only 1 video.";
  if (images > LINKEDIN_MAX_IMAGES) {
    const room = LINKEDIN_MAX_IMAGES - existing.length;
    return `You can upload up to ${LINKEDIN_MAX_IMAGES} images. You can add ${Math.max(0, room)} more.`;
  }
  return null;
}

/** Why one file is refused before uploading, or null. Pure. */
export function linkedInFileProblem(file: { name: string; type: string; size: number }): string | null {
  const kind = linkedInMediaKind(file.type);
  if (kind === null) return `${file.name} isn't supported. Use JPG or PNG images, or an MP4 or MOV video.`;
  if (kind === "image" && file.size > LINKEDIN_IMAGE_MAX_BYTES) return `${file.name} is over the 5 MB image limit.`;
  if (kind === "video" && file.size > LINKEDIN_VIDEO_MAX_BYTES) return `${file.name} is over the 100 MB video limit.`;
  return null;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The posted creative, cleaned: https URLs only, at most 10 images, and a
 * video only when there are no images. Nothing posted is no creative, which
 * is allowed. Pure.
 */
export function parseLinkedInSemiMedia(raw: unknown): LinkedInSemiMedia {
  if (typeof raw !== "string" || raw.trim() === "") return NO_LINKEDIN_MEDIA;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return NO_LINKEDIN_MEDIA;
  }
  if (!value || typeof value !== "object") return NO_LINKEDIN_MEDIA;
  const { images, video } = value as { images?: unknown; video?: unknown };
  const cleanImages = Array.isArray(images) ? images.filter(isHttpsUrl) : [];
  const cleanVideo = isHttpsUrl(video) ? video : null;
  return { images: cleanImages, video: cleanVideo };
}

/** What a posted creative breaks, or null — the uploader's rules again. Pure. */
export function validateLinkedInSemiMedia(media: LinkedInSemiMedia): string | null {
  if (media.images.length > 0 && media.video !== null) return "Upload images or a video — not both.";
  if (media.images.length > LINKEDIN_MAX_IMAGES) {
    return `You can upload up to ${LINKEDIN_MAX_IMAGES} images.`;
  }
  return null;
}

/**
 * The launch's `mediaAssets`: `images` as the workflow has always read it,
 * plus `videoUrl` when there is a video. Pure.
 */
export function linkedInMediaAssets(media: LinkedInSemiMedia): { images: string[]; videoUrl?: string } {
  return media.video ? { images: [], videoUrl: media.video } : { images: [...media.images] };
}
