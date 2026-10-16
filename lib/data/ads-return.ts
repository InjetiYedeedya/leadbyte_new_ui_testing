import type { AdsPlatform } from "@/lib/data/ads-accounts";

/**
 * Back to the agent after connecting its ad account.
 *
 * The account picker always finished on the Connections page, so someone who
 * pressed "Connect Google Ads" on the Google Ads agent — the only reason they
 * were connecting — landed on a list of eight other accounts and had to find
 * their way back. Now a connect started FROM an agent page returns to it.
 *
 * ## Why a cookie, and why only the platform is in it
 *
 * n8n does not carry anything of ours through consent, so the start route
 * (`/api/ads/connect?…&from=agent`) leaves a signed, short-lived note and the
 * picker reads it. The note holds the PLATFORM, never a path: where to go is
 * looked up in the closed map below, so no value from a request or a cookie
 * can ever become a redirect target. The `leadbyte_` prefix means signing out
 * sweeps it with everything else (`lib/auth/sign-out.ts`).
 */
export const ADS_RETURN_COOKIE = "leadbyte_ads_return";

/** Half an hour, matching the consent marker in `oauth-pending.ts`. */
export const ADS_RETURN_MAX_AGE = 30 * 60;

/** Where each platform's agent lives. The only places this can send anyone. */
export const AGENT_PAGE_FOR: Record<AdsPlatform, string> = {
  googleAds: "/agents/google-ads",
  metaAds: "/agents/meta-ads",
  linkedInAds: "/agents/linkedin-ads",
};

/** What the start route stores (before signing). */
export function adsReturnValue(platform: AdsPlatform, now: number = Date.now()): string {
  return `${platform}|${now}`;
}

/**
 * The agent page to return to, or null to keep the usual Connections landing.
 *
 * Null unless the note is for THIS platform and recent: a Google Ads note must
 * not send a Meta connection to the Google Ads agent, and a note left by an
 * abandoned connect must not hijack a later one started from Connections.
 */
export function adsReturnPath(
  verified: string | null,
  platform: AdsPlatform,
  now: number = Date.now(),
): string | null {
  if (!verified) return null;
  const [stored, at] = verified.split("|");
  const age = now - Number(at);
  if (stored !== platform || !Number.isFinite(age) || age < 0 || age >= ADS_RETURN_MAX_AGE * 1000) {
    return null;
  }
  return `${AGENT_PAGE_FOR[platform]}?connected=1`;
}
