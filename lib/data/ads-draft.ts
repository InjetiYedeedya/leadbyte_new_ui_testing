import { cookies } from "next/headers";
import type { ChatGptAdsSetup } from "./chatgpt-ads-setup";
import type {
  AdsAdType,
  AdsBidding,
  AdsObjective,
  AdsRecommendation,
  GenerateDestination,
} from "./ads-types";
import type { AdsCopy } from "./ads-campaign-request";
import type { DestinationField } from "./ads-destination";

/**
 * The campaign being built, carried across the steps.
 *
 * ## Why a cookie, when two better-sounding options were available
 *
 * A DynamoDB row in `leadbyte_openai_ads` cannot be read back by our own
 * helpers: `saveAgentSetup` writes with `id: numericRowId(email)` as the
 * partition key while `agentSetupExists` reads `/api/data/{table}/{email}`.
 * They disagree, so a row written by one is invisible to the other.
 *
 * `devGlobal()` is failure #1 in `ads-suggestion.ts`'s own header — lost on a
 * dev restart and on any serverless cold start, across a flow that can span
 * fifteen minutes while an image renders.
 *
 * So: a chunked httpOnly cookie, the same mechanism the ad plan already uses,
 * with two faults of that implementation fixed (see below).
 *
 * ## The one field that can overflow, and what happens when it does
 *
 * `advise`'s `history` is opaque and grows every round — the variable we least
 * control. It is stored, because the Plan screen needs it to hold a
 * conversation, but it is stored LAST and dropped FIRST: the writer is
 * attempted with it and retried without. So a long argument costs the argument,
 * never the campaign. Nothing secret is in it either way — campaign facts the
 * customer typed, and model prose.
 */

/** What `advise` said, kept small enough to store. Never the whole reply. */
export interface AdviceSummary {
  objective?: AdsObjective;
  billingBasis?: string;
  /** The goal could not be delivered and something safer was chosen. */
  downgraded?: boolean;
  risks: string[];
  bidding?: AdsBidding;
  /** Each becomes a card with an Apply button. Bounded — see `MAX_RECOMMENDATIONS`. */
  recommendations: AdsRecommendation[];
  /** What it answered when the customer pushed back. Empty on round one. */
  reply?: string;
  round?: number;
  /**
   * Opaque, and the ONLY field here that grows without limit.
   *
   * Sent back unchanged or the model starts over and repeats its first answer.
   * It is stored last and dropped first: `setAdsDraft` is attempted with it and
   * retried without, so a long conversation costs the conversation rather than
   * the campaign.
   */
  history?: unknown[];
}

/**
 * How many recommendation cards to keep.
 *
 * Not a display limit — a storage one. Each carries a paragraph of reasoning,
 * and the draft lives in a cookie with a hard ceiling. Six is more than anyone
 * reads before acting.
 */
export const MAX_RECOMMENDATIONS = 6;

export interface AdsDraft {
  /** `${businessId}::openai-ads`. A draft from another account never loads. */
  key: string;
  setup: ChatGptAdsSetup;
  /** What `read_website` found, so later steps need not re-fetch. */
  site?: { url: string; title: string; brief: string };
  advice?: AdviceSummary;
  copy?: AdsCopy;
  /** Where `generate` says the advert sends people, and what it still needs. */
  destination?: GenerateDestination;
  /**
   * Store and website links the customer supplied when asked.
   *
   * Kept so a redraft does not ask again — `generate` is not deterministic and
   * someone may redraft many times, and re-collecting the same App Store link
   * on each would make the button unusable.
   */
  destinations?: Partial<Record<DestinationField, string>>;
  adType?: AdsAdType;
  /** Semi: the picture the customer uploaded. */
  imageUrl?: string;
  /** Full: the render we started. `outputKey` is what `create` needs. */
  image?: { jobId: string; outputKey: string; startedAt: number };
  created?: {
    campaignId: string;
    adGroupId?: string;
    adId?: string;
    status: string;
    /** The platform's human name for the campaign — what the review screen shows. */
    campaignName?: string;
    /** `approved`, `in_review`, … — shown beside the status. */
    reviewStatus?: string;
    /** Where the advert sends people; the one URL worth offering as a link. */
    targetUrl?: string;
  };
  updatedAt: number;
}

const CHUNK_PREFIX = "leadbyte_ads_draft_";
const CHUNK_SIZE = 3000;
const MAX_CHUNKS = 8;

/**
 * Two hours, not the plan cookie's one.
 *
 * A full-automation render alone can take fifteen minutes, and a customer who
 * steps away during it should not come back to an empty form.
 */
const MAX_AGE = 2 * 60 * 60;

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
} as const;

export function draftKey(businessId: string): string {
  return `${businessId}::openai-ads`;
}

/** Base64url, so the stored length is the sent length and chunking is exact. */
function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

/** Split for storage. Exported so the ceiling is testable without cookies. */
export function serialiseDraft(draft: AdsDraft): string[] {
  const encoded = encode(JSON.stringify(draft));
  const chunks: string[] = [];
  for (let at = 0; at < encoded.length; at += CHUNK_SIZE) {
    chunks.push(encoded.slice(at, at + CHUNK_SIZE));
  }
  return chunks;
}

/**
 * Rebuild a draft, or null.
 *
 * Never throws. A torn chunk set, a draft from another account, or anything
 * that is not a draft at all all answer null — and the caller sends the
 * customer back to step one, which is recoverable. An exception here would take
 * the page down instead.
 */
export function parseDraft(raw: string, key: string): AdsDraft | null {
  const json = decode(raw);
  if (json === null) return null;

  try {
    const value = JSON.parse(json) as AdsDraft;
    if (typeof value !== "object" || value === null) return null;
    // One account's draft must never surface under another's. The key is
    // checked rather than assumed because the cookie travels with the browser,
    // and browsers are shared.
    return value.key === key ? value : null;
  } catch {
    return null;
  }
}

export async function getAdsDraft(businessId: string): Promise<AdsDraft | null> {
  const store = await cookies();
  let raw = "";
  for (let index = 0; index < MAX_CHUNKS; index += 1) {
    const chunk = store.get(`${CHUNK_PREFIX}${index}`)?.value;
    if (chunk === undefined) break;
    raw += chunk;
  }
  if (raw === "") return null;
  return parseDraft(raw, draftKey(businessId));
}

/**
 * Merge a patch into the stored draft.
 *
 * ## Why this returns a boolean
 *
 * `setSuggestion` logs and returns `void` when a plan needs more chunks than
 * it has, so an over-size plan is silently dropped and the only symptom is the
 * NEXT page redirecting to step one — a bug that looks like a routing fault
 * and is not. This says so instead, and every caller checks it.
 *
 * A patch rather than a whole draft, so a step never has to re-serialise state
 * it did not touch and cannot accidentally blank a field it forgot.
 */
export async function setAdsDraft(
  businessId: string,
  patch: Partial<Omit<AdsDraft, "key" | "updatedAt">>,
): Promise<boolean> {
  const store = await cookies();
  const current = await getAdsDraft(businessId);

  const draft: AdsDraft = {
    ...current,
    ...patch,
    key: draftKey(businessId),
    updatedAt: Date.now(),
  } as AdsDraft;

  const chunks = serialiseDraft(draft);
  if (chunks.length > MAX_CHUNKS) {
    console.error(
      `[ads-draft] ${chunks.length} chunks needed, ceiling is ${MAX_CHUNKS} — not stored`,
    );
    return false;
  }

  chunks.forEach((chunk, index) => store.set(`${CHUNK_PREFIX}${index}`, chunk, COOKIE_OPTIONS));
  // Clear any chunk left by a longer previous draft, or a stale tail would be
  // appended to the new one and the whole thing would fail to parse.
  for (let index = chunks.length; index < MAX_CHUNKS; index += 1) {
    store.delete(`${CHUNK_PREFIX}${index}`);
  }
  return true;
}

export async function clearAdsDraft(): Promise<void> {
  const store = await cookies();
  for (let index = 0; index < MAX_CHUNKS; index += 1) {
    store.delete(`${CHUNK_PREFIX}${index}`);
  }
}
