import type { SourceOutcome } from "@/lib/api/read-cascade";
import { flatten, normKey, pickNum, pickStr, ratio, type Row } from "./fields";

/**
 * The Social Media tab's numbers: which platform earns the most engagement for
 * what it reaches (legacy dashboard implementation guide §5.3).
 *
 * ## Why the comparison is a RATE, not a count
 *
 * Raw likes favour whichever platform has the biggest audience, which is the
 * one thing the reader already knows. Engagement ÷ audience is the question
 * the tab exists to answer: for every person a post reached, how many acted
 * on it.
 *
 * ## Why audience is never added across measures
 *
 * Instagram and Facebook report REACH (people), X and YouTube report VIEWS
 * (plays). They are different claims — one person can view five times — so a
 * platform's rate uses only its own measure, labelled, and nothing on the tab
 * sums a reach into a views figure. Which measure a platform uses is decided
 * once per platform (the first spelling any of its posts carries), so one
 * platform's rate is never a mix of reach on some posts and views on others.
 *
 * Pure and client-safe: the posts panel island receives this module's output
 * as props.
 */

export type PlatformId = "instagram" | "facebook" | "x" | "youtube";

/** One measure of audience, with every spelling it has been written under. */
interface AudienceMeasure {
  label: "Reach" | "Views";
  keys: readonly string[];
}

const REACH: AudienceMeasure = { label: "Reach", keys: ["Reach", "reach_count", "reachCount", "post_reach"] };
const VIEWS: AudienceMeasure = {
  label: "Views",
  keys: ["views_count", "view_count", "views", "viewCount", "video_views"],
};

interface PlatformSpec {
  id: PlatformId;
  name: string;
  /** Raw DynamoDB table name — the same spelling `lib/data/agent-dashboard.ts` reads. */
  table: string;
  /** Tried in order; the first any post carries is the platform's measure. */
  audience: readonly AudienceMeasure[];
  /** What this platform calls a share, or null where it has none (YouTube). */
  shares: { label: "Shares" | "Retweets"; keys: readonly string[] } | null;
  hasMediaType: boolean;
  hasNewSubs: boolean;
}

const LINK_KEYS = ["PostLink", "post_link", "Postlink", "permalink", "post_url", "url", "link"];
const LIKE_KEYS = ["Like_count", "likes_count", "likes", "likeCount"];
const COMMENT_KEYS = ["Comment_count", "comments_count", "comments", "commentCount"];
/** Stable ids, used to tell two syncs of one post apart when it has no link. */
const ID_KEYS = ["post_id", "media_id", "video_id", "tweet_id", "id"];

/**
 * The four platforms, in the order the tab shows them.
 *
 * Facebook falls back to views because the dashboard reader this replaces
 * (`SOCIAL_SOURCES` in `agent-dashboard.ts`) read Facebook's audience as
 * `views_count` — rows written that way must not lose their audience. The
 * fallback is per platform, never per post; see the module note.
 */
export const SOCIAL_PLATFORMS: readonly PlatformSpec[] = [
  {
    id: "instagram",
    name: "Instagram",
    table: "Instagram_analytics",
    audience: [REACH],
    shares: { label: "Shares", keys: ["share_count", "shares_count", "shares"] },
    hasMediaType: true,
    hasNewSubs: false,
  },
  {
    id: "facebook",
    name: "Facebook",
    table: "Facebook_Analytics",
    audience: [REACH, VIEWS],
    shares: { label: "Shares", keys: ["Shares", "share_count", "shares_count"] },
    hasMediaType: false,
    hasNewSubs: false,
  },
  {
    id: "x",
    name: "X",
    table: "social_media_twitter",
    audience: [VIEWS],
    shares: { label: "Retweets", keys: ["retweet_count", "retweets", "Retweets", "retweetCount"] },
    hasMediaType: false,
    hasNewSubs: false,
  },
  {
    id: "youtube",
    name: "YouTube",
    table: "Youtube_analytics",
    audience: [VIEWS],
    shares: null,
    hasMediaType: false,
    hasNewSubs: true,
  },
];

export const SOCIAL_TABLES: readonly string[] = SOCIAL_PLATFORMS.map((p) => p.table);

/* ---------- shapes ---------- */

export interface SocialPost {
  /** Unique within its platform — the de-duplication key. */
  key: string;
  /** Raw link as stored; the view makes it safe with `webHref`. */
  link: string;
  likes: number | null;
  comments: number | null;
  /** Shares, or retweets on X. Always null on YouTube. */
  shares: number | null;
  /** In the platform's own measure — see `PlatformPerformance.audienceLabel`. */
  audience: number | null;
  /** YouTube only. */
  newSubs: number | null;
  /** Instagram only, as the platform spelt it ("CAROUSEL_ALBUM"); "" when not reported. */
  mediaType: string;
  /** Likes + comments + shares that were reported; null when none were. */
  engagement: number | null;
}

export interface MediaMixSlice {
  /** Readable: "Carousel album", or "Type not reported". */
  label: string;
  count: number;
  share: number;
}

export interface PlatformPerformance {
  id: PlatformId;
  name: string;
  ok: boolean;
  error: string | null;
  /** De-duplicated, sorted by total engagement, biggest first. */
  posts: SocialPost[];
  /** Null when no post carried an audience figure at all. */
  audienceLabel: "Reach" | "Views" | null;
  sharesLabel: "Shares" | "Retweets" | null;
  hasMediaType: boolean;
  hasNewSubs: boolean;
  /** Every reported engagement on the platform, or null when none. */
  engagement: number | null;
  /** Engagement over the posts the rate is based on — the rate's numerator. */
  ratedEngagement: number | null;
  /** Summed audience over the posts the rate is based on — its denominator. */
  audience: number | null;
  /** Engagement ÷ audience, over posts carrying BOTH; null when there are none. */
  rate: number | null;
  /** How many posts the rate is based on. */
  ratedPosts: number;
  /** Instagram only; empty elsewhere. */
  mediaMix: MediaMixSlice[];
}

export interface SocialPerformance {
  /** All four, in `SOCIAL_PLATFORMS` order, loaded or not. */
  platforms: PlatformPerformance[];
  /** Platforms with at least one post. */
  tracked: number;
  totalEngagement: number | null;
  /** Platforms with a rate, best first. */
  ranked: PlatformPerformance[];
  best: PlatformPerformance | null;
  /** Summed audience per measure — never reach and views added together. */
  audienceByMeasure: { label: "Reach" | "Views"; total: number }[];
  failed: PlatformPerformance[];
}

/* ---------- mapping ---------- */

/** Sums the parts that are present; null only when every part is missing. */
function sumPresent(...parts: (number | null)[]): number | null {
  let total = 0;
  let seen = false;
  for (const part of parts) {
    if (part !== null) {
      total += part;
      seen = true;
    }
  }
  return seen ? total : null;
}

function larger(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/**
 * The link as a comparison key: scheme, `www.` and trailing slashes dropped.
 * The query string is KEPT — a YouTube link's video id lives in `?v=`, so
 * stripping it would fold every video into one.
 */
function linkKey(link: string): string {
  return link
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

/** The measure a platform's audience is read in: the first any row carries. */
function audienceMeasureFor(spec: PlatformSpec, rows: Row[]): AudienceMeasure | null {
  for (const measure of spec.audience) {
    if (rows.some((row) => pickNum(row, ...measure.keys) !== null)) return measure;
  }
  return null;
}

function readPost(spec: PlatformSpec, flat: Row, measure: AudienceMeasure | null, index: number): SocialPost {
  const link = pickStr(flat, ...LINK_KEYS);
  const id = pickStr(flat, ...ID_KEYS);
  const likes = pickNum(flat, ...LIKE_KEYS);
  const comments = pickNum(flat, ...COMMENT_KEYS);
  const shares = spec.shares ? pickNum(flat, ...spec.shares.keys) : null;
  return {
    // A row with neither link nor id cannot be matched to another sync, so it
    // counts as its own post rather than being guessed into one.
    key: link ? `link:${linkKey(link)}` : id ? `id:${id}` : `row:${index}`,
    link,
    likes,
    comments,
    shares,
    audience: measure ? pickNum(flat, ...measure.keys) : null,
    newSubs: spec.hasNewSubs
      ? pickNum(flat, "subscriber_count", "subscribers_gained", "subscribersGained", "new_subscribers", "new_subs")
      : null,
    mediaType: spec.hasMediaType ? pickStr(flat, "Media_type", "mediaType", "media_product_type") : "",
    engagement: sumPresent(likes, comments, shares),
  };
}

/**
 * One post per link.
 *
 * The agent re-syncs a post's figures, so a table can hold the same post once
 * per sync (rule 6) — counted as-is, a post synced three times contributes its
 * likes three times. Merged by the BIGGEST value per field, not by the last
 * row: these figures are cumulative (a like is not taken back often enough to
 * matter), so the largest is the most recent, and rows carry no reliable sync
 * time to sort by. Per field, so a sync that missed a column cannot blank a
 * figure an earlier sync had.
 */
function dedupe(posts: SocialPost[]): SocialPost[] {
  const byKey = new Map<string, SocialPost>();
  for (const post of posts) {
    const prev = byKey.get(post.key);
    if (!prev) {
      byKey.set(post.key, post);
      continue;
    }
    const likes = larger(prev.likes, post.likes);
    const comments = larger(prev.comments, post.comments);
    const shares = larger(prev.shares, post.shares);
    byKey.set(post.key, {
      key: prev.key,
      link: prev.link || post.link,
      likes,
      comments,
      shares,
      audience: larger(prev.audience, post.audience),
      newSubs: larger(prev.newSubs, post.newSubs),
      mediaType: prev.mediaType || post.mediaType,
      engagement: sumPresent(likes, comments, shares),
    });
  }
  return [...byKey.values()];
}

/** Biggest engagement first; a post with none reported sinks; audience breaks ties. */
function byEngagement(a: SocialPost, b: SocialPost): number {
  return (
    (b.engagement ?? -1) - (a.engagement ?? -1) || (b.audience ?? -1) - (a.audience ?? -1)
  );
}

/** `CAROUSEL_ALBUM` → `Carousel album`. */
export function mediaTypeLabel(raw: string): string {
  const words = raw.trim().replace(/[_-]+/g, " ").toLowerCase();
  if (words === "") return "Type not reported";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function mediaMixOf(posts: SocialPost[]): MediaMixSlice[] {
  if (posts.length === 0) return [];
  const counts = new Map<string, { label: string; count: number }>();
  for (const post of posts) {
    const key = normKey(post.mediaType);
    const entry = counts.get(key) ?? { label: mediaTypeLabel(post.mediaType), count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  // A mix with no types reported at all is a single grey bar that says
  // nothing; the panel is left out instead.
  if (counts.size === 1 && counts.has("")) return [];
  return [...counts.values()]
    .map((slice) => ({ ...slice, share: slice.count / posts.length }))
    .sort((a, b) => b.count - a.count);
}

export function mapPlatform(spec: PlatformSpec, outcome: SourceOutcome | undefined): PlatformPerformance {
  const rows = (outcome?.rows ?? []).map(flatten);
  const measure = audienceMeasureFor(spec, rows);
  const posts = dedupe(rows.map((row, i) => readPost(spec, row, measure, i))).sort(byEngagement);

  // The rate is taken over posts carrying BOTH figures. A post with likes and
  // no reach would add to the top of the fraction and nothing to the bottom,
  // and inflate the rate by exactly the posts the platform under-reports.
  const rated = posts.filter((p) => p.engagement !== null && p.audience !== null);
  const ratedEngagement = sumPresent(...rated.map((p) => p.engagement));
  const ratedAudience = sumPresent(...rated.map((p) => p.audience));

  return {
    id: spec.id,
    name: spec.name,
    // A missing outcome is a table nobody asked for, not a failed read.
    ok: outcome?.ok ?? true,
    error: outcome?.error ?? null,
    posts,
    audienceLabel: measure?.label ?? null,
    sharesLabel: spec.shares?.label ?? null,
    hasMediaType: spec.hasMediaType,
    hasNewSubs: spec.hasNewSubs,
    engagement: sumPresent(...posts.map((p) => p.engagement)),
    ratedEngagement,
    audience: ratedAudience,
    rate: ratio(ratedEngagement, ratedAudience),
    ratedPosts: rated.length,
    mediaMix: spec.hasMediaType ? mediaMixOf(posts) : [],
  };
}

/** Best rate first; on a tie, the rate resting on more posts. */
function byRate(a: PlatformPerformance, b: PlatformPerformance): number {
  return (b.rate ?? -1) - (a.rate ?? -1) || b.ratedPosts - a.ratedPosts;
}

export function buildSocialPerformance(outcomes: Record<string, SourceOutcome | undefined>): SocialPerformance {
  const platforms = SOCIAL_PLATFORMS.map((spec) => mapPlatform(spec, outcomes[spec.table]));
  const ranked = platforms.filter((p) => p.rate !== null).sort(byRate);

  const audienceByMeasure: SocialPerformance["audienceByMeasure"] = [];
  for (const label of ["Reach", "Views"] as const) {
    const total = sumPresent(
      ...platforms.filter((p) => p.audienceLabel === label).map((p) => sumPresent(...p.posts.map((x) => x.audience))),
    );
    if (total !== null) audienceByMeasure.push({ label, total });
  }

  return {
    platforms,
    tracked: platforms.filter((p) => p.posts.length > 0).length,
    totalEngagement: sumPresent(...platforms.map((p) => p.engagement)),
    ranked,
    best: ranked[0] ?? null,
    audienceByMeasure,
    failed: platforms.filter((p) => !p.ok),
  };
}
