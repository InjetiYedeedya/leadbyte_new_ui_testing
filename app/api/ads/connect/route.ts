import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { startConsent } from "@/lib/auth/oauth-pending";
import { LEADBYTE_API_URL, adsCallbackUrl } from "@/lib/api/config";
import { signValue } from "@/lib/auth/signed-cookie";
import { platformFromAny } from "@/lib/data/ads-accounts";
import { ADS_RETURN_COOKIE, ADS_RETURN_MAX_AGE, adsReturnValue } from "@/lib/data/ads-return";

/**
 * Starts the Google Ads, Meta Ads or LinkedIn Ads authorisation.
 *
 * ## Why this route exists
 *
 * The same reason `/api/google/connect` does: consent is a redirect chain the
 * BROWSER walks, so the destination has to be a plain navigable URL — and the
 * identifiers on it must come from the session rather than the page, or a link
 * could be edited to connect someone else's account.
 *
 * ## The contract (backend team, 2026-09-03)
 *
 *   GET {API}/api/oauth/google-connect?email=<e>&user_id=<id>&redirect_uri=<u>
 *   GET {API}/api/oauth/meta-ads?…                                  Meta Ads
 *   GET {API}/api/oauth/linkedin-ads?…                              LinkedIn Ads
 *
 * Every start forwards `redirect_uri` to n8n. LinkedIn and Meta return the
 * browser to it with `?status=success&platform=…&accounts=…`
 * (LINKEDIN_ADS_FLOW.md 1.1-1.2); Google Ads does not yet (see
 * `adsCallbackUrl`).
 *
 * No `x-api-key`: `/api/oauth/*` is exempt, because a browser navigation cannot
 * attach a header.
 *
 * Both parameters are REQUIRED here, unlike the Google Analytics flow which
 * takes `email` and `business_id`. The Connections page previously linked
 * straight at the Lambda with neither, so n8n had no user to attribute the
 * tokens to.
 *
 * Note `googleAds` starts at `/api/oauth/google-connect`, NOT
 * `/api/oauth/google-ads`, which 404s. That correction came from the backend
 * team and is easy to "fix" back into a 404.
 */
const FLOW_PATHS = {
  "google-ads": "/api/oauth/google-connect",
  "meta-ads": "/api/oauth/meta-ads",
  "linkedin-ads": "/api/oauth/linkedin-ads",
} as const;

// Not exported: a route file may only export handlers and Next's own config
// keys. Exporting a helper here fails the generated route type check, and so
// `npm run build`.
type AdsFlow = keyof typeof FLOW_PATHS;

function isAdsFlow(value: string | null): value is AdsFlow {
  return value !== null && Object.hasOwn(FLOW_PATHS, value);
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const platform = request.nextUrl.searchParams.get("platform");
  if (!isAdsFlow(platform)) {
    console.error(`[ads-connect] unknown platform: ${platform ?? "none"}`);
    redirect("/intelligence/connections?error=unknown-platform");
  }

  if (!LEADBYTE_API_URL) {
    console.error("[ads-connect] LEADBYTE_API_URL is not set — cannot start authorisation.");
    redirect("/intelligence/connections?error=unavailable");
  }

  const url = new URL(`${LEADBYTE_API_URL}${FLOW_PATHS[platform]}`);
  // `businessId` holds the account email in live mode. A redirect carries no
  // token, so these are how n8n identifies the user.
  url.searchParams.set("email", session.businessId);
  if (session.userId) {
    url.searchParams.set("user_id", session.userId);
  } else {
    // Sessions minted before the uid was stored have none. Logged rather than
    // sent empty: an empty `user_id` writes a row that looks attributed and is
    // not — the same rule `saveGoogleSelection` follows.
    console.warn(`[ads-connect] no userId on the session for ${session.businessId}`);
  }

  // All three, not just LinkedIn: Meta's n8n flow also honours it (it rides
  // the OAuth `state`), and without it Meta returned wherever n8n defaulted.
  // Google Ads ignores it today — harmless — see `adsCallbackUrl`.
  url.searchParams.set("redirect_uri", adsCallbackUrl());

  console.log(`[ads-connect] ${platform} -> ${FLOW_PATHS[platform]}`);
  // Marks this browser as having started the flow; the return route checks it
  // (`lib/auth/oauth-pending.ts`).
  const response = await startConsent(url.toString(), "ads");

  // Started from the agent's own page (`runGateCopy` adds `from=agent`): leave
  // a note so the picker returns there (`lib/data/ads-return.ts`). Started
  // anywhere else, clear any old note, so an abandoned agent connect cannot
  // redirect a later one begun from Connections.
  const agentPlatform = platformFromAny(platform);
  if (request.nextUrl.searchParams.get("from") === "agent" && agentPlatform) {
    response.cookies.set(
      ADS_RETURN_COOKIE,
      await signValue(ADS_RETURN_COOKIE, adsReturnValue(agentPlatform)),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: ADS_RETURN_MAX_AGE,
      },
    );
  } else {
    response.cookies.delete(ADS_RETURN_COOKIE);
  }
  return response;
}
