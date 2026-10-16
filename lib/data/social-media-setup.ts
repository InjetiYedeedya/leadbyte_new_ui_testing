import type { OAuthPlatform } from "@/lib/api/oauth-status";

/**
 * The Social Media agent's posting form, read, checked and shaped
 * (2026-10-01). Ported from the legacy `SocialMedia.jsx`, whose single form
 * this app had dropped: it only ever sent an "activate" call, so a customer
 * with accounts connected had no way to have anything posted.
 *
 * Two modes, as in legacy:
 *
 * - **Full**: the agent writes the posts. The customer picks a media type and
 *   when to post (every day, or chosen dates). Sent to `/api/webhook/main`
 *   with `agent_type: SOCIAL_MEDIA`.
 * - **Semi**: the customer supplies the media (up to 10 images, or one
 *   video). Sent to `/api/webhook/social-media-semi`.
 *
 * Field names below are the legacy body's, verbatim — n8n's workflows were
 * built against them. Pure, so every rule is tested.
 */

export const SOCIAL_MODES = ["full", "semi"] as const;
export type SocialMode = (typeof SOCIAL_MODES)[number];

export const SOCIAL_MEDIA_TYPES = ["image", "video", "carousel"] as const;
export type SocialMediaType = (typeof SOCIAL_MEDIA_TYPES)[number];

/** The platforms this app can connect, and the label legacy keys them by. */
export const SOCIAL_POST_PLATFORMS = ["instagram", "facebook", "youtube"] as const satisfies readonly OAuthPlatform[];
export type SocialPostPlatform = (typeof SOCIAL_POST_PLATFORMS)[number];

export const SOCIAL_PLATFORM_LABEL: Record<SocialPostPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
};

/** Legacy's `PlatformsActive` also names these two; this app cannot connect them, so they are sent false. */
const LEGACY_ONLY_LABELS = ["X (Twitter)", "LinkedIn"] as const;

export const MAX_SOCIAL_IMAGES = 10;
export const MAX_SOCIAL_VIDEOS = 1;
export const MAX_POST_INFO = 2000;

export type SocialSchedule = { kind: "everyday" } | { kind: "dates"; dates: string[] };

export interface SocialMediaFile {
  url: string;
  kind: "image" | "video";
}

export interface SocialSetup {
  mode: SocialMode;
  platforms: SocialPostPlatform[];
  /** Full only. */
  mediaType: SocialMediaType;
  /** Full only. */
  schedule: SocialSchedule;
  /** Semi only: already in S3, uploaded from the browser. */
  media: SocialMediaFile[];
  postInfo: string;
}

/** The form's input names, shared with the components that post them. */
export const SOCIAL_INPUT = {
  mode: "mode",
  platforms: "platforms",
  mediaType: "mediaType",
  scheduleKind: "scheduleKind",
  postDates: "postDates",
  media: "socialMedia",
  postInfo: "postInfo",
} as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The uploaded media, from the uploader's hidden JSON. Only https URLs survive
 * — the browser hands us S3 URLs, and anything else is not a file we stored.
 */
export function decodeSocialMedia(raw: unknown): SocialMediaFile[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: SocialMediaFile[] = [];
  for (const item of parsed) {
    const row = item as Record<string, unknown> | null;
    const url = typeof row?.url === "string" ? row.url.trim() : "";
    const kind = row?.kind === "video" ? "video" : row?.kind === "image" ? "image" : null;
    if (!kind || !/^https:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, kind });
  }
  return out;
}

export function readSocialForm(form: FormData): SocialSetup {
  const mode = SOCIAL_MODES.find((m) => m === str(form.get(SOCIAL_INPUT.mode))) ?? "full";
  const platforms = SOCIAL_POST_PLATFORMS.filter((platform) =>
    form.getAll(SOCIAL_INPUT.platforms).some((value) => str(value) === platform),
  );
  const mediaType = SOCIAL_MEDIA_TYPES.find((t) => t === str(form.get(SOCIAL_INPUT.mediaType))) ?? "image";
  const dates = [
    ...new Set(
      form
        .getAll(SOCIAL_INPUT.postDates)
        .map((value) => str(value))
        .filter((value) => DAY.test(value)),
    ),
  ].sort();
  const schedule: SocialSchedule =
    str(form.get(SOCIAL_INPUT.scheduleKind)) === "dates" ? { kind: "dates", dates } : { kind: "everyday" };
  return {
    mode,
    platforms,
    mediaType,
    schedule,
    media: mode === "semi" ? decodeSocialMedia(form.get(SOCIAL_INPUT.media)) : [],
    postInfo: str(form.get(SOCIAL_INPUT.postInfo)).slice(0, MAX_POST_INFO),
  };
}

/**
 * Everything wrong, at once, in the legacy app's words where it had them.
 * `today` is `YYYY-MM-DD` in the customer's terms; a posting date must be
 * after it (legacy disabled today and earlier in its calendar).
 */
export function validateSocial(
  setup: SocialSetup,
  connected: readonly SocialPostPlatform[],
  today: string,
): string[] {
  const problems: string[] = [];
  if (setup.platforms.length === 0) problems.push("Select at least one platform");

  const notConnected = setup.platforms.filter((platform) => !connected.includes(platform));
  if (notConnected.length > 0) {
    problems.push(
      `Please connect ${notConnected.map((p) => SOCIAL_PLATFORM_LABEL[p]).join(", ")} in Integrations before running the Social Media Agent.`,
    );
  }

  if (setup.mode === "full" && setup.schedule.kind === "dates") {
    if (setup.schedule.dates.length === 0) problems.push("Choose at least one date to post on, or pick Every day.");
    if (setup.schedule.dates.some((date) => date <= today)) problems.push("Posting dates must be after today.");
  }

  if (setup.mode === "semi") {
    const images = setup.media.filter((file) => file.kind === "image").length;
    const videos = setup.media.filter((file) => file.kind === "video").length;
    if (images + videos === 0) {
      problems.push("In semi-automation mode, you must upload an image or video before running the agent.");
    }
    if (images > 0 && videos > 0) problems.push("Upload images or a video — not both in the same post.");
    if (videos > MAX_SOCIAL_VIDEOS) problems.push("You can upload only 1 video.");
    if (images > MAX_SOCIAL_IMAGES) problems.push(`You can upload up to ${MAX_SOCIAL_IMAGES} images.`);
  }
  return problems;
}

/** `{ "Instagram": true, "Facebook": false, … }` — legacy keys it by LABEL. */
export function platformsActive(platforms: readonly SocialPostPlatform[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const platform of SOCIAL_POST_PLATFORMS) map[SOCIAL_PLATFORM_LABEL[platform]] = platforms.includes(platform);
  for (const label of LEGACY_ONLY_LABELS) map[label] = false;
  return map;
}

/** The full-mode schedule fields, exactly as legacy wrote them. Empty in semi. */
function scheduleFields(setup: SocialSetup, now: Date): Record<string, string> {
  if (setup.mode !== "full") return {};
  if (setup.schedule.kind === "everyday") {
    return { PostingSchedule: "everyday", EverydayMonth: now.toISOString().slice(0, 7) };
  }
  return { PostingSchedule: setup.schedule.dates.join(",") };
}

function modeFields(setup: SocialSetup): Record<string, unknown> {
  return setup.mode === "full"
    ? { MediaType: setup.mediaType }
    : { MediaUrls: setup.media.map((file) => file.url) };
}

export interface SocialBusiness {
  businessName: string;
  websiteUrl: string;
  businessType: string;
  specialization: string;
  logoUrl: string;
}

export interface SocialIds {
  email: string;
  userId?: string;
  now: Date;
}

/**
 * The `leadbyte_social_media` row, as legacy saved it (`SocialMedia.jsx`
 * `agentData`). `id` is added because the other agent tables are keyed on it
 * (`numericRowId`); a table keyed on `email` ignores the extra attribute.
 */
export function buildSocialRow(
  setup: SocialSetup,
  { email, userId, now }: SocialIds,
  { id, youtubeActivated, logoUrl }: { id: number; youtubeActivated: boolean; logoUrl: string },
): Record<string, unknown> {
  const at = now.toISOString();
  return {
    id,
    email,
    ClientEmail: email,
    ...(userId ? { userId } : {}),
    PlatformsActive: platformsActive(setup.platforms),
    AutomationMode: setup.mode,
    ...scheduleFields(setup, now),
    ...modeFields(setup),
    LogoUrl: logoUrl || null,
    youtube_activated: youtubeActivated,
    CreatedAt: at,
    UpdatedAt: at,
    PostCreationInfo: setup.postInfo,
    agentType: "social-media",
    configured: true,
    status: "active",
  };
}

/**
 * The webhook body (legacy `webhookData`): the same campaign fields plus the
 * business the posts are written for. Full mode wraps it in the `main`
 * envelope (`job_id`, `agent_name`); semi adds `automationMode: "semi"`.
 */
export function buildSocialWebhook(
  setup: SocialSetup,
  business: SocialBusiness,
  { email, userId, now }: SocialIds,
  { isUpdate, jobId }: { isUpdate: boolean; jobId: string },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email,
    PlatformsActive: platformsActive(setup.platforms),
    AutomationMode: setup.mode,
    ...scheduleFields(setup, now),
    ...modeFields(setup),
    PostCreationInfo: setup.postInfo,
    BusinessName: business.businessName,
    WebsiteURL: business.websiteUrl,
    ReportEmail: email,
    BusinessType: business.businessType,
    Specialization: business.specialization,
    BrandLogoUrl: business.logoUrl,
    isUpdate,
    webhookTriggeredAt: now.toISOString(),
  };
  if (setup.mode === "semi") return { ...body, automationMode: "semi" };
  return {
    job_id: jobId,
    email_address: email,
    user_id: userId ?? "",
    agent_name: "Social Media Agent",
    timestamp: now.toISOString(),
    ...body,
  };
}

/**
 * What a saved row says about the last run, to start the form from it.
 * Post ideas are deliberately not carried over (legacy: a new idea each run).
 */
export function socialDefaultsFromRow(row: Record<string, unknown> | null): Partial<SocialSetup> & {
  youtubeActivated: boolean;
} {
  if (!row) return { youtubeActivated: false };
  const active = (row.PlatformsActive ?? {}) as Record<string, unknown>;
  const platforms = SOCIAL_POST_PLATFORMS.filter((platform) => active[SOCIAL_PLATFORM_LABEL[platform]] === true);
  const mode = SOCIAL_MODES.find((m) => m === row.AutomationMode);
  const mediaType = SOCIAL_MEDIA_TYPES.find((t) => t === row.MediaType);
  const schedule = typeof row.PostingSchedule === "string" ? row.PostingSchedule : "";
  return {
    youtubeActivated: row.youtube_activated === true,
    ...(mode ? { mode } : {}),
    ...(platforms.length > 0 ? { platforms } : {}),
    ...(mediaType ? { mediaType } : {}),
    ...(schedule === "everyday"
      ? { schedule: { kind: "everyday" as const } }
      : schedule
        ? { schedule: { kind: "dates" as const, dates: schedule.split(",").filter((d) => DAY.test(d)) } }
        : {}),
  };
}
