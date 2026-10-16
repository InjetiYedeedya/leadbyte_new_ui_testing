import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { startConsent } from "@/lib/auth/oauth-pending";
import { LEADBYTE_API_URL, socialCallbackUrl } from "@/lib/api/config";

/**
 * Starts the Facebook, Instagram or YouTube authorisation.
 *
 * ## Why this route exists, and what it fixes
 *
 * The same reason `/api/ads/connect` does — consent is a redirect chain the
 * BROWSER walks, so the destination must be a plain navigable URL, and the
 * identifiers on it must come from the session rather than the page, or a link
 * could be edited to connect someone else's account.
 *
 * It also fixes a live defect. Until now `connectUrl()` routed only Analytics,
 * Google Ads and Meta Ads through our own handlers and fell through to
 * `oauthStartUrl()` for everything else — a bare `{API}/api/oauth/facebook`
 * with **no query string at all**. That is the exact fault
 * `lib/data/connections.ts` records as having broken the ad platforms: "n8n had
 * no user to attribute the tokens to". Facebook and Instagram were still on
 * that path.
 *
 * ## The contract
 *
 *   GET {API}/api/oauth/facebook?email=<e>&user_id=<id>&redirect_uri=<u>
 *   GET {API}/api/oauth/instagram?…
 *   GET {API}/api/oauth/youtube?…
 *
 * Routes taken from `docs/migration/2026-08-28-legacy-parity-inventory.md`
 * §3.6, which lists all three as the legacy app's own OAuth starts. Facebook
 * and Instagram were already in `OAUTH_START_PATHS`; YouTube is added there.
 *
 * No `x-api-key`: `/api/oauth/*` is exempt, because a browser navigation
 * cannot attach a header.
 *
 * ## `redirect_uri` is sent even though the backend ignores it today
 *
 * `docs/backend/BACKEND.md` §A1b records that the OAuth start currently
 * STRIPS `redirect_uri` — n8n always returns to its own callback, which is why
 * a Google connection still lands on the legacy app. Sending it is harmless
 * while ignored and is what makes the return land here the moment n8n honours
 * it; `/api/google/connect` already makes the same call. Until then the
 * customer's connection still shows up, because the status comes from the
 * check table on the next page load rather than from the return trip.
 */
const FLOW_PATHS = {
  facebook: "/api/oauth/facebook",
  instagram: "/api/oauth/instagram",
  youtube: "/api/oauth/youtube",
} as const;

// Not exported: a route file may only export handlers and Next's own config
// keys. Exporting a helper here fails the generated route type check, and so
// `npm run build`.
type SocialFlow = keyof typeof FLOW_PATHS;

function isSocialFlow(value: string | null): value is SocialFlow {
  return value !== null && Object.hasOwn(FLOW_PATHS, value);
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const platform = request.nextUrl.searchParams.get("platform");
  // A closed literal map, so nothing from the query can reach the outgoing
  // URL. The only thing the caller chooses is which of three keys to use.
  if (!isSocialFlow(platform)) {
    console.error(`[social-connect] unknown platform: ${platform ?? "none"}`);
    redirect("/intelligence/connections?error=unknown-platform");
  }

  if (!LEADBYTE_API_URL) {
    console.error("[social-connect] LEADBYTE_API_URL is not set — cannot start authorisation.");
    redirect("/intelligence/connections?error=unavailable");
  }

  const url = new URL(`${LEADBYTE_API_URL}${FLOW_PATHS[platform]}`);
  // `businessId` holds the account email in live mode. A redirect carries no
  // token, so these are how n8n identifies the user.
  url.searchParams.set("email", session.businessId);
  url.searchParams.set("redirect_uri", socialCallbackUrl());
  if (session.userId) {
    url.searchParams.set("user_id", session.userId);
  } else {
    // Sessions minted before the uid was stored have none. Logged rather than
    // sent empty: an empty `user_id` writes a row that looks attributed and is
    // not — the same rule `/api/ads/connect` follows.
    console.warn(`[social-connect] no userId on the session for ${session.businessId}`);
  }

  console.log(`[social-connect] ${platform} -> ${FLOW_PATHS[platform]}`);
  // Marks this browser as having started the flow; the return route checks it
  // (`lib/auth/oauth-pending.ts`).
  return startConsent(url.toString(), "social");
}
