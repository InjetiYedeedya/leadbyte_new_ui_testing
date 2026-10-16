import type { AgentBackendId } from "@/lib/data/agent-setup";

/**
 * What a semi-automated launch has to supply.
 *
 * Semi automation means the customer provides the creative and the agent only
 * assembles the campaign around it — so the difference between the two modes is
 * not a flag, it is these files.
 *
 * The lists come from the live app's own semi forms. They are per-platform and
 * genuinely different: Google wants a landscape, a square and a logo because
 * Performance Max composes them itself; Meta wants one asset because a Meta ad
 * IS one asset; LinkedIn takes several images or a single video.
 *
 * ## Sizes
 *
 * The ratios are DATA, not prose in a hint. They used to be label text only,
 * on the reasoning that Google rejects a wrong-shaped asset at its own upload
 * with a clear message — but that message arrives after the campaign has been
 * assembled around the file. Google's creative is now collected in the
 * automation-mode dialog (the same place Meta's is), and the uploader there
 * checks each file against its slot before a byte goes to S3, so the ratio has
 * to be readable by code.
 *
 * Google's slots go further than a ratio: each demands an exact pixel size
 * (`size`) and has its own ceiling — 10 MB for an image, 5 MB for a logo — per
 * the legacy Google Display spec. Meta's slot keeps a 10 MB one to match
 * `SEMI_MEDIA_SPECS`, which is what actually governs the Meta uploader — this
 * entry is the fallback shape, not its source of truth.
 */

export interface CreativeField {
  name: string;
  label: string;
  hint: string;
  accept: string;
  required: boolean;
  /**
   * The aspect ratio the slot demands, or null when any shape is accepted.
   * Checked in the browser at ±3% — exports are rarely pixel-perfect — except
   * where `size` is set, which is stricter and wins.
   */
  ratio: { w: number; h: number; label: string } | null;
  /** Per-file byte ceiling. */
  maxBytes: number;
  /**
   * The exact pixel size the slot demands (Google Display, legacy spec
   * 2026-10-02). Google's own upload refuses an off-size display asset, and it
   * does so after the campaign has been assembled around it — so "close
   * enough" is refused here instead.
   */
  size?: { width: number; height: number };
  /** The S3 folder the legacy app filed this slot's uploads under. */
  folder?: string;
}

const IMAGES = "image/png,image/jpeg,image/webp";

const MB = 1024 * 1024;

const GOOGLE_DISPLAY = "google-ads/display-assets";

export const SEMI_CREATIVES: Record<AgentBackendId, CreativeField[]> = {
  // Slot NAMES are the posted `creativeUrls` keys and the launch body's
  // `creatives` keys, so they stay as they were; labels, sizes and ceilings
  // follow the legacy Google Display spec (2026-10-02). Order is the order the
  // customer sees them.
  "google-ads": [
    {
      name: "landscapeImage",
      label: "Landscape image",
      hint: "1200 × 628px — the main image in most placements. Up to 10 MB.",
      accept: IMAGES,
      required: true,
      ratio: { w: 1.91, h: 1, label: "1.91:1" },
      maxBytes: 10 * MB,
      size: { width: 1200, height: 628 },
      folder: `${GOOGLE_DISPLAY}/landscape`,
    },
    {
      name: "squareImage",
      label: "Square image",
      hint: "1200 × 1200px. Up to 10 MB.",
      accept: IMAGES,
      required: true,
      ratio: { w: 1, h: 1, label: "1:1" },
      maxBytes: 10 * MB,
      size: { width: 1200, height: 1200 },
      folder: `${GOOGLE_DISPLAY}/square`,
    },
    {
      name: "portraitImage",
      label: "Portrait image",
      hint: "960 × 1200px. Up to 10 MB.",
      accept: IMAGES,
      required: false,
      ratio: { w: 4, h: 5, label: "4:5" },
      maxBytes: 10 * MB,
      size: { width: 960, height: 1200 },
      folder: `${GOOGLE_DISPLAY}/portrait`,
    },
    {
      name: "logoSquare",
      label: "Logo square",
      hint: "1200 × 1200px. Up to 5 MB.",
      accept: IMAGES,
      required: true,
      ratio: { w: 1, h: 1, label: "1:1" },
      maxBytes: 5 * MB,
      size: { width: 1200, height: 1200 },
      folder: `${GOOGLE_DISPLAY}/logo-square`,
    },
    {
      name: "logoLandscape",
      label: "Logo landscape",
      hint: "1200 × 300px. Up to 5 MB.",
      accept: IMAGES,
      required: false,
      ratio: { w: 4, h: 1, label: "4:1" },
      maxBytes: 5 * MB,
      size: { width: 1200, height: 300 },
      folder: `${GOOGLE_DISPLAY}/logo-landscape`,
    },
  ],
  "meta-ads": [
    {
      name: "semiMediaFile",
      label: "Ad image",
      hint: "1:1 works everywhere. One asset per ad.",
      accept: IMAGES,
      required: true,
      ratio: { w: 1, h: 1, label: "1:1" },
      maxBytes: 10 * MB,
    },
  ],
  "linkedin-ads": [
    {
      name: "semiImage",
      label: "Ad image",
      hint: "1.91:1 or 1:1",
      accept: IMAGES,
      required: true,
      // Two shapes are accepted, so no single ratio can be enforced. LinkedIn
      // still collects its creative on the details form, where nothing checks.
      ratio: null,
      maxBytes: 5 * MB,
    },
  ],
  // No semi flow: Lead Qualification supplies its own files at setup, and the
  // two SEO agents run straight from their Configure popup.
  "lead-qualification": [],
  "on-page-seo": [],
  "off-page-seo": [],
  // Empty because nothing is known, not because none is needed: no OpenAI Ads
  // workflow exists yet, so which creative slots it expects — and at what
  // ratios and size ceilings — is unanswered. Guessing would put upload boxes
  // in front of the customer that reject files for invented reasons. Fill this
  // in from the workflow's own requirements when the backend team answers.
  "openai-ads": [],
  // Social Media has no semi-automated flow in this app — it drafts its own
  // posts from published content, which is the whole point of it. Empty
  // because there is nothing to collect, not because it is unfinished.
  "social-media": [],
};

export function creativesFor(agentId: AgentBackendId): CreativeField[] {
  return SEMI_CREATIVES[agentId] ?? [];
}

/**
 * Whether every required creative is present.
 *
 * Checked before anything is uploaded: a half-uploaded set leaves orphan files
 * in S3 and a campaign that cannot be assembled.
 */
export function missingCreatives(agentId: AgentBackendId, form: FormData): string[] {
  return creativesFor(agentId)
    .filter((field) => {
      if (!field.required) return false;
      const value = form.get(field.name);
      return !(value instanceof File) || value.size === 0;
    })
    .map((field) => field.label);
}

/**
 * The uploaded creative, as slot name -> S3 URL.
 *
 * This is what the launch body has always carried (`creatives`, plus the same
 * pairs spread top-level). What changed is where it is built: Google's files
 * now go browser -> S3 from the automation-mode dialog, so the map arrives in a
 * hidden form field instead of being assembled server-side from FormData.
 */
export type CreativeUrls = Record<string, string>;

/** What the uploader writes into its hidden field. */
export function serialiseCreativeUrls(urls: CreativeUrls): string {
  return JSON.stringify(urls);
}

/**
 * Reads that hidden field back.
 *
 * Never throws, and keeps only slots the platform actually declares: the map is
 * spread into the executor body at the top level, so an unknown key would
 * arrive there as a field nobody defined. A malformed value reads as "nothing
 * uploaded", which `missingCreativeUrls` then reports honestly — the same
 * contract as `parseSemiAutomationMedia`.
 */
export function parseCreativeUrls(agentId: AgentBackendId, raw: unknown): CreativeUrls {
  if (typeof raw !== "string" || raw.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const known = new Set(creativesFor(agentId).map((field) => field.name));
  const urls: CreativeUrls = {};
  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!known.has(name)) continue;
    if (typeof value !== "string" || value.trim() === "") continue;
    urls[name] = value;
  }
  return urls;
}

/**
 * Which required slots are still empty, by label.
 *
 * The client half of this gate disables the dialog's Proceed button, but a form
 * post is forgeable, so the Server Action re-checks with this before storing
 * anything.
 */
export function missingCreativeUrls(agentId: AgentBackendId, urls: CreativeUrls): string[] {
  return creativesFor(agentId)
    .filter((field) => field.required && (urls[field.name] ?? "").trim() === "")
    .map((field) => field.label);
}

// ---------------------------------------------------------------------------
// Google Ads semi automation: the whole creative set, video included.
// ---------------------------------------------------------------------------

/**
 * The optional Performance Max video.
 *
 * Deliberately NOT in `SEMI_CREATIVES["google-ads"]`. That list is the image
 * slot -> URL map, which is spread top-level into the launch body; a video URL
 * there would arrive as a field the executor never defined. The video travels
 * in its own two hidden fields and lands in `semiAutomationMedia.video`.
 */
export const GOOGLE_VIDEO_FIELD = {
  name: "performanceMaxVideo",
  label: "Performance Max video",
  hint: "Optional. Upload a 16:9 video or paste a YouTube URL.",
  // Named types, not `video/*`, for the same reason as Meta's picker: `video/*`
  // offers formats the ad platform then refuses.
  accept: "video/mp4,video/quicktime,video/webm",
  maxBytes: 1024 * MB,
  ratio: { w: 16, h: 9, label: "16:9", tolerance: 0.01 },
  folder: `${GOOGLE_DISPLAY}/video`,
} as const;

/** The hidden fields the Google uploader posts beside `creativeUrls`. */
export const GOOGLE_VIDEO_URL_FIELD = "googleVideoUrl";
export const GOOGLE_YOUTUBE_URL_FIELD = "googleYoutubeUrl";

/**
 * Which file a presign request for Google may name: an image slot, or the
 * video. The upload route should sign nothing else — that is what keeps it from
 * being a general-purpose signer for the creatives folder.
 */
export function googleUploadField(
  slot: string,
): { name: string; folder: string; kind: "image" | "video" } | null {
  if (slot === GOOGLE_VIDEO_FIELD.name) {
    return { name: slot, folder: GOOGLE_VIDEO_FIELD.folder, kind: "video" };
  }
  const field = creativesFor("google-ads").find((f) => f.name === slot);
  if (!field || !field.folder) return null;
  return { name: field.name, folder: field.folder, kind: "image" };
}

/** Whether a picked file's MIME type is one the field's `accept` lists. */
export function acceptsType(accept: string, contentType: string): boolean {
  return accept.split(",").includes(contentType.trim().toLowerCase());
}

/**
 * Why a picked image does not fit its slot, or null when it does.
 *
 * `dim` null means the browser could not decode it. That is refused, not let
 * through: the size IS the requirement, and a file whose size nobody could read
 * is exactly the one Google would reject later.
 */
export function imageSizeProblem(
  field: Pick<CreativeField, "size">,
  dim: { w: number; h: number } | null,
): string | null {
  if (!dim) return "Could not read image dimensions.";
  const size = field.size;
  if (!size) return null;
  if (dim.w === size.width && dim.h === size.height) return null;
  return `Image must be exactly ${size.width}x${size.height}px. Your image is ${dim.w}x${dim.h}px.`;
}

/** Whether measured video dimensions are 16:9, within the spec's 0.01. */
export function videoRatioMatches(dim: { w: number; h: number }): boolean {
  if (dim.h <= 0) return false;
  const { w, h, tolerance } = GOOGLE_VIDEO_FIELD.ratio;
  return Math.abs(dim.w / dim.h - w / h) <= tolerance;
}

export const YOUTUBE_LINK_PROBLEM = "Enter a YouTube link (youtube.com or youtu.be).";

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);

/** An https link on one of YouTube's own hosts. Empty is not a link. */
export function isYoutubeUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  return url.protocol === "https:" && YOUTUBE_HOSTS.has(url.hostname.toLowerCase());
}

/** A slot as the missing-assets sentence spells it: "Landscape image (1200 x 628px)". */
function sizeLabel(field: CreativeField): string {
  return field.size ? `${field.label} (${field.size.width} x ${field.size.height}px)` : field.label;
}

/**
 * The sentence shown while Proceed is blocked on required slots, naming only
 * the ones still missing — or null when none are.
 */
export function googleMissingMessage(urls: CreativeUrls): string | null {
  const missing = creativesFor("google-ads").filter(
    (field) => field.required && (urls[field.name] ?? "").trim() === "",
  );
  if (missing.length === 0) return null;
  return `Please upload the required Semi Automation assets before proceeding: ${missing
    .map(sizeLabel)
    .join(", ")}`;
}

/** `semiAutomationMedia.images` keys, from the slot names that stay unchanged. */
const IMAGE_KEYS = {
  landscapeImage: "landscape",
  squareImage: "square",
  portraitImage: "portrait",
  logoSquare: "logoSquare",
  logoLandscape: "logoLandscape",
} as const;

type GoogleImageKey = (typeof IMAGE_KEYS)[keyof typeof IMAGE_KEYS];

export interface GoogleImageAsset {
  label: string;
  required: boolean;
  width: number;
  height: number;
  /** "" when the slot was left empty — the key is always present. */
  url: string;
}

export interface GoogleSemiAutomationMedia {
  images: Record<GoogleImageKey, GoogleImageAsset>;
  video: {
    label: "Performance Max video";
    required: false;
    aspectRatio: "16:9";
    youtubeUrl: string;
    uploadedUrl: string;
  };
}

/**
 * The `semiAutomationMedia` object for a Google semi launch, in the legacy
 * app's shape: every image slot present (url "" when empty) with its spec
 * attached, and the video's two possible sources side by side.
 */
export function googleSemiAutomationMedia(
  urls: CreativeUrls,
  video: { youtubeUrl: string; uploadedUrl: string },
): GoogleSemiAutomationMedia {
  const images = {} as Record<GoogleImageKey, GoogleImageAsset>;
  for (const field of creativesFor("google-ads")) {
    const key = IMAGE_KEYS[field.name as keyof typeof IMAGE_KEYS];
    if (!key || !field.size) continue;
    images[key] = {
      label: field.label,
      required: field.required,
      width: field.size.width,
      height: field.size.height,
      url: (urls[field.name] ?? "").trim(),
    };
  }
  return {
    images,
    video: {
      label: GOOGLE_VIDEO_FIELD.label,
      required: false,
      aspectRatio: "16:9",
      youtubeUrl: video.youtubeUrl.trim(),
      uploadedUrl: video.uploadedUrl.trim(),
    },
  };
}

export type GoogleSemiMediaResult =
  | { ok: true; creatives: CreativeUrls; media: GoogleSemiAutomationMedia }
  | { ok: false; problems: string[] };

function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isHttpsUrl(raw: string): boolean {
  try {
    return new URL(raw).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Reads and checks the Google uploader's three hidden fields on the server.
 *
 * The dialog's Proceed button is disabled until all of this holds, but a form
 * post is forgeable, so the Server Action re-checks. Never throws: a malformed
 * field reads as "not supplied" and comes back as a problem, never as a 500.
 */
export function readGoogleSemiMedia(formData: FormData): GoogleSemiMediaResult {
  const creatives = parseCreativeUrls("google-ads", formData.get("creativeUrls"));
  const youtubeUrl = formString(formData, GOOGLE_YOUTUBE_URL_FIELD);
  const uploadedUrl = formString(formData, GOOGLE_VIDEO_URL_FIELD);

  const problems: string[] = [];
  const missing = googleMissingMessage(creatives);
  if (missing) problems.push(missing);
  if (youtubeUrl !== "" && !isYoutubeUrl(youtubeUrl)) problems.push(YOUTUBE_LINK_PROBLEM);
  // Only our presign route fills this, and it answers https S3 URLs. Anything
  // else came from a forged form and is refused rather than dropped — dropping
  // it would launch without the video the customer believes they sent.
  if (uploadedUrl !== "" && !isHttpsUrl(uploadedUrl)) {
    problems.push("The uploaded video could not be read. Upload it again.");
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    creatives,
    media: googleSemiAutomationMedia(creatives, { youtubeUrl, uploadedUrl }),
  };
}
