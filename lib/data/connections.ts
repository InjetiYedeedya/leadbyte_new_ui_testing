import { LEADBYTE_API_URL } from "@/lib/api/config";
import {
  OAUTH_START_PATHS,
  type OAuthPlatform,
  type OAuthStatus,
} from "@/lib/api/oauth-status";

/**
 * The platform catalogue and the OAuth entry points.
 *
 * The connect flow, confirmed from the live app's `Integrations.jsx` and
 * verified against the Lambda:
 *
 *   1. browser → GET {API}/api/oauth/{platform}   (302, no API key needed)
 *   2. provider consent
 *   3. redirect back with an account list in QUERY PARAMS
 *   4. user picks an account/property
 *   5. POST /api/webhook/{platform}-selected-account
 *   6. the platform's *_Frontend_Check row gets Status = "Done"
 *
 * Steps 1–2 work today. Steps 3–5 need the return-URL shape from the backend
 * (docs/backend/BACKEND.md, Q4) — until then the return handler reads every
 * param spelling the live app accepted.
 */

export type ConnectionGroup = "analytics" | "advertising" | "social" | "email";

export interface PlatformDef {
  id: OAuthPlatform;
  label: string;
  group: ConnectionGroup;
  /** What connecting it unlocks — shown on the card. */
  purpose: string;
  /** False when the live app also has it dark. */
  available: boolean;
}

/**
 * `x` (Twitter) and LinkedIn Social are deliberately absent: both are
 * `comingSoon: true` in the live app, so they are not parity items.
 */
export const PLATFORMS: PlatformDef[] = [
  {
    id: "googleAnalytics",
    label: "Google Analytics",
    group: "analytics",
    purpose: "Sessions, pages, traffic sources and conversions.",
    available: true,
  },
  {
    id: "googleAds",
    label: "Google Ads",
    group: "advertising",
    purpose: "Campaign spend, clicks, conversions and CPA.",
    available: true,
  },
  {
    id: "metaAds",
    label: "Meta Ads",
    group: "advertising",
    purpose: "Facebook and Instagram campaign performance.",
    available: true,
  },
  {
    id: "linkedInAds",
    label: "LinkedIn Ads",
    group: "advertising",
    purpose: "B2B campaign performance and job-title targeting.",
    available: true,
  },
  {
    id: "facebook",
    label: "Facebook",
    group: "social",
    purpose: "Page posting and engagement metrics.",
    available: true,
  },
  {
    id: "instagram",
    label: "Instagram",
    group: "social",
    purpose: "Post scheduling and engagement metrics.",
    available: true,
  },
  {
    id: "youtube",
    label: "YouTube",
    group: "social",
    purpose: "Channel uploads and video performance.",
    available: true,
  },
];

export const GROUP_LABELS: Record<ConnectionGroup, string> = {
  analytics: "Analytics",
  advertising: "Advertising",
  social: "Social Media",
  email: "Email",
};

/**
 * Absolute URL that starts a platform's OAuth flow.
 *
 * It points at the backend directly rather than through our server: the flow
 * is a 302 chain the browser must follow itself, and these routes are exempt
 * from the `x-api-key` gate (verified — a plain navigation returns 302).
 */
export function oauthStartUrl(platform: OAuthPlatform): string | null {
  if (!LEADBYTE_API_URL) return null;
  return `${LEADBYTE_API_URL}${OAUTH_START_PATHS[platform]}`;
}

/** Copy for each connection state. Keeps the wording consistent across screens. */
/**
 * The word on the status badge.
 *
 * "Unknown" for an error rather than "Error": we could not reach the check, and
 * saying the connection failed would send someone back through consent for
 * something that is very likely fine.
 */
export function statusLabel(status: OAuthStatus): string {
  switch (status) {
    case "valid":
      return "Connected";
    case "pending":
      return "Finish setup";
    case "expired":
      return "Expired";
    case "error":
      return "Unknown";
    default:
      return "Not connected";
  }
}

/**
 * What the badge cannot say, or null when there is nothing to add.
 *
 * This was one `describeStatus` returning a whole sentence, which was rendered
 * beside a badge that already carried the same word — every connected row read
 * "Connected" twice, and every unconnected one "Not connected. Not connected".
 * A note earns its line by adding something: when the access expires, or how to
 * recover it.
 *
 * `"never"` is the backend's non-expiring marker, not a date, so it is not
 * rendered as one.
 */
export function statusNote(status: OAuthStatus, expiry: string | null): string | null {
  switch (status) {
    case "valid":
      // Case-insensitive, matching `isExpiryValid` — the backend's real rows
      // spell this "Never", and a strict `!== "never"` let that through as a
      // literal "Renews Never" caption instead of treating it as non-expiring.
      return expiry && expiry.toLowerCase() !== "never" ? `Renews ${expiry}` : null;
    case "pending":
      return "Choose which account to use to finish connecting.";
    case "expired":
      return "Reconnect to resume syncing.";
    case "error":
      return "We could not check this just now.";
    default:
      return null;
  }
}

export function statusBadgeVariant(
  status: OAuthStatus,
): "connection-connected" | "connection-not-connected" | "connection-analysing" {
  if (status === "valid") return "connection-connected";
  if (status === "error" || status === "pending") return "connection-analysing";
  return "connection-not-connected";
}

/**
 * Where a platform's Connect/Reconnect button should point.
 *
 * Google Analytics goes through OUR route, not the backend's start path: only
 * `/api/google/connect` derives `email` from the session and sends the
 * `redirect_uri` the callback needs. Every other platform still links straight
 * at the backend, which is exempt from the `x-api-key` gate and 302s onward.
 *
 * Search Console has no entry here on purpose — it is not an `OAuthPlatform`,
 * because it has no Frontend_check table of its own. See `googleFlowUrl`.
 */
export function connectUrl(platform: OAuthPlatform): string | null {
  if (platform === "googleAnalytics") return googleFlowUrl("analytics");
  // Google Ads and Meta Ads both REQUIRE `email` and `user_id` on the consent
  // start (backend, 2026-09-03). Linking straight at the Lambda, as this used
  // to, sent neither — so n8n had no user to attribute the tokens to.
  if (platform === "googleAds") return "/api/ads/connect?platform=google-ads";
  if (platform === "metaAds") return "/api/ads/connect?platform=meta-ads";
  // The three social platforms had that same defect until 2026-09-11: they
  // fell through to `oauthStartUrl` below, which builds a bare Lambda URL with
  // NO query string, so a Facebook or Instagram consent started with nothing
  // saying who was connecting. `/api/social/connect` adds the session's email,
  // the uid and a `redirect_uri`.
  if (platform === "facebook" || platform === "instagram" || platform === "youtube") {
    return `/api/social/connect?platform=${platform}`;
  }
  // LinkedIn Ads was the last one on that bare path. It now goes through the
  // same ads route and account picker as Google Ads and Meta Ads, which adds
  // the email, the uid and the `redirect_uri` its n8n flow returns to.
  if (platform === "linkedInAds") return "/api/ads/connect?platform=linkedin-ads";
  return oauthStartUrl(platform);
}

/**
 * Our own Google connect route, per flow.
 *
 * Always available — unlike `oauthStartUrl` this needs no `LEADBYTE_API_URL`,
 * because the route itself reports an unconfigured backend rather than
 * rendering a dead link.
 */
export function googleFlowUrl(flow: "analytics" | "search-console" | "unified"): string {
  return `/api/google/connect?flow=${flow}`;
}

/**
 * The Connections meter's two numbers, from every card on the page: true for a
 * connected card, false for one waiting to be connected, null for a card that
 * cannot be connected here at all ("Not available") and so is left out.
 *
 * It counted the seven `PLATFORMS` alone, so once Search Console, Email,
 * GitHub and WordPress had cards of their own it read "7 of 7 … Everything is
 * reporting" above cards saying "Not connected" (2026-10-13).
 */
export function meterTally(cards: readonly (boolean | null)[]): { connected: number; total: number } {
  const counted = cards.filter((card): card is boolean => card !== null);
  return { connected: counted.filter(Boolean).length, total: counted.length };
}
