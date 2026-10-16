import { checkOAuthStatus, chosenAccountName } from "@/lib/api/oauth-status";
import { SOCIAL_PLATFORMS } from "@/lib/data/agent-social-gate";
import { PLATFORMS } from "@/lib/data/connections";
import {
  describeSocialAccounts,
  getSocialAccounts,
  getSocialOffer,
  isSocialDeclined,
} from "@/lib/data/social-accounts";
import type { OAuthPlatform } from "@/lib/api/oauth-status";

/**
 * Which social accounts this workspace has actually connected.
 *
 * SERVER ONLY — `checkOAuthStatus` reads the account's check tables through
 * `lib/api/client.ts`, which attaches the bearer from an httpOnly cookie. The
 * id list and the gate message live in `agent-social-gate.ts` instead, which
 * is client-safe, so a popup can explain the rule without dragging the API
 * client into the browser bundle. Same split as `agent-email-gate.ts` (the
 * rule) and `email-callback.ts` (the cookie read).
 */

/**
 * The connected ones, in the order the Connections page lists them.
 *
 * Only `valid` counts. An `expired` connection cannot post and an `error` is a
 * check we could not complete — treating either as connected would let the
 * agent start against an account it cannot reach, which is exactly what the
 * gate is for. The three checks run together because `checkOAuthStatus` is
 * wrapped in React `cache()`, so the page asking after the action costs
 * nothing.
 */
export async function connectedSocialPlatforms(email: string): Promise<OAuthPlatform[]> {
  if (!email) return [];

  const results = await Promise.all(
    SOCIAL_PLATFORMS.map(async (platform) => ({
      platform,
      connected: await socialPlatformConnected(platform, email),
    })),
  );

  return results.filter(({ connected }) => connected).map(({ platform }) => platform);
}

/**
 * Whether one social platform counts as connected — the single rule, consulted
 * by the Connections row and by the agent's gate.
 *
 * Three conditions, and only the first is the backend's to answer:
 *
 * - the check table says consent happened;
 * - the customer did not then leave the picker, having been told in as many
 *   words that no account would be connected;
 * - and no choice is still outstanding.
 *
 * That last one is the difference between "connected" and "usable". Facebook
 * hands back every page a login administers and the agent publishes to exactly
 * one, so a consent with the page unpicked is a connection that cannot post.
 * Counting it satisfied the gate and listed Facebook under "Posting to" with
 * nothing beneath it — an agent one click from publishing to a page nobody
 * chose, which is the outcome the picker exists to prevent.
 *
 * Note the asymmetry, and it is deliberate: an OUTSTANDING offer blocks, a
 * missing account name does not. A connection made before names were captured
 * has no name and no offer, and it is a real connection — YouTube looked
 * exactly like that until 2026-09-11.
 *
 * Kept here rather than inlined so the readers cannot drift, which is the same
 * reason `agent-social-gate.ts` owns the platform list.
 */
export async function socialPlatformConnected(
  platform: OAuthPlatform,
  email: string,
): Promise<boolean> {
  if (await isSocialDeclined(platform)) return false;
  if (await socialChoicePending(platform)) return false;
  return (await checkOAuthStatus(platform, email)).status === "valid";
}

/** A list was offered and has not been picked from. */
export async function socialChoicePending(platform: OAuthPlatform): Promise<boolean> {
  return (await getSocialOffer(platform)).length > 0;
}

export interface PendingSocialChoice {
  platform: OAuthPlatform;
  label: string;
  /** How many accounts are waiting — "5 pages" is more use than "an account". */
  count: number;
}

/**
 * The platforms connected but unfinished, for the screens that have to say so.
 *
 * Without this the state is invisible: `connectedSocialPlatforms` now excludes
 * them, so the agent page would simply not mention Facebook at all — and
 * "nothing here" is indistinguishable from "you never connected it", which is
 * the wrong thing to tell someone who just did.
 */
export async function pendingSocialChoices(): Promise<PendingSocialChoice[]> {
  const pending = await Promise.all(
    SOCIAL_PLATFORMS.map(async (platform) => ({
      platform,
      label: PLATFORMS.find((p) => p.id === platform)?.label ?? platform,
      count: (await getSocialOffer(platform)).length,
    })),
  );
  return pending.filter(({ count }) => count > 0);
}

/** Whether the Social Media agent's gate is satisfied. */
export async function anySocialConnected(email: string): Promise<boolean> {
  return (await connectedSocialPlatforms(email)).length > 0;
}

export interface ConnectedSocialAccount {
  platform: OAuthPlatform;
  /** "Facebook", "YouTube" — the same label the Connections page uses. */
  label: string;
  /** The account name, when the connect flow told us. Null when it did not. */
  account: string | null;
}

/**
 * The connected accounts, named where we know them.
 *
 * For the agent screen, which has to answer "where will this post?" before
 * someone presses Activate. The platform comes from the check table and the
 * name from the cookie the callback wrote, so a connection made before names
 * were captured still appears — just without one.
 */
export async function connectedSocialAccounts(email: string): Promise<ConnectedSocialAccount[]> {
  const platforms = await connectedSocialPlatforms(email);

  return Promise.all(
    platforms.map(async (platform) => ({
      platform,
      label: PLATFORMS.find((p) => p.id === platform)?.label ?? platform,
      account: await socialAccountName(platform, email),
    })),
  );
}

/** This browser's name for the account first (it is the freshest), then the backend's. */
export function pickAccountName(fromCookie: string | null, fromBackend: string): string | null {
  return fromCookie ?? (fromBackend.trim() !== "" ? fromBackend.trim() : null);
}

/**
 * The connected account's name, wherever it is known (2026-10-01): the cookie
 * the callback wrote in this browser, else the backend's record, so a second
 * browser or a fresh sign-in still names the page.
 */
export async function socialAccountName(platform: OAuthPlatform, email: string): Promise<string | null> {
  const fromCookie = describeSocialAccounts(await getSocialAccounts(platform));
  return pickAccountName(fromCookie, fromCookie ? "" : await chosenAccountName(platform, email));
}
