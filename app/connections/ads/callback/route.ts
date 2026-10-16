import { signText } from "@/lib/signed-text";
import { NOT_STARTED_HERE, consentStarted } from "@/lib/auth/oauth-pending";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  ADS_OFFER_MAX_AGE,
  adsAccountsCookie,
  parseAccountsParam,
  platformFromAny,
  slugOf,
} from "@/lib/data/ads-accounts";

/**
 * Where n8n returns the browser after Google Ads, Meta Ads or LinkedIn Ads
 * consent. LinkedIn is sent here by the `redirect_uri` `/api/ads/connect`
 * adds; the other two have it configured in n8n.
 *
 * ## The payload (n8n's own redirect, 2026-09-03)
 *
 *   ?status=success&platform=meta&userId=<fb uid>&accounts=<encoded JSON>
 *   ?status=error&platform=meta&message=<text>&userId=<id>&email=<address>
 *
 * The live app sends these to `https://app.leadbyte.ai/integrations`, which is
 * the LEGACY app's page. This is the equivalent here, and the URL n8n should be
 * given per environment:
 *
 *   http://localhost:3000/connections/ads/callback
 *   https://<prod domain>/connections/ads/callback
 *
 * `platform` decides which picker to open, so it need not be in the path — one
 * URL serves both platforms, and n8n never learns where the picker lives.
 *
 * ## The accounts arrive HERE, and only here
 *
 * The documented "list ad accounts" call is not a data source: probing it
 * returned `{"received":true}` for Meta and a 404 for Google (see
 * `lib/data/ads-accounts.ts`). n8n pushes the list to the browser instead, the
 * same way the Google Analytics flow pushes properties. So this route is the
 * one place the list is ever obtained, and losing it here means the customer
 * walks through consent again.
 *
 * The list is handed on in an httpOnly cookie rather than a query string: it
 * would otherwise sit in the address bar, in history, and in any log that
 * records URLs, which is not where a customer's account inventory belongs.
 *
 * ## `userId` and `email` are deliberately ignored
 *
 * Both are in the URL and both are attacker-editable. The session already says
 * who this is; trusting the URL instead would let one person's consent be
 * attributed to another's workspace.
 */
/** LinkedIn's error codes, written out. An unknown code falls through to the
    generic line rather than showing a customer a raw slug. */
function reasonText(reason: string | null): string {
  if (reason === "no_ad_accounts") {
    return "That LinkedIn account has no ad accounts on it.";
  }
  return "";
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  // Only a consent THIS browser started (`lib/auth/oauth-pending.ts`). This
  // route writes from its query string, so an unasked-for link must not be
  // able to set a mailbox, record a connection or plant accounts.
  if (!(await consentStarted("ads"))) {
    console.warn("[ads-callback] rejected: no consent was started from this browser");
    redirect(NOT_STARTED_HERE);
  }

  const params = request.nextUrl.searchParams;
  const platform = platformFromAny(params.get("platform"));

  if (!platform) {
    // The customer has just approved something; a 404 is a worse answer than
    // the page that shows what is connected.
    console.error(`[ads-callback] unrecognised platform: ${params.get("platform") ?? "none"}`);
    redirect("/intelligence/connections");
  }

  const slug = slugOf(platform);

  // n8n said so explicitly, and usually says why — "No Meta ad accounts found
  // for this user" tells someone what happened; "something went wrong" does
  // not. Its wording is carried to the screen.
  if (params.get("status") === "error") {
    // Meta and Google send a written `message`; LinkedIn sends a code in
    // `reason` (`no_ad_accounts`). Reading only `message` left LinkedIn on the
    // generic fallback, which loses the one useful fact n8n sent.
    const message = params.get("message") ?? reasonText(params.get("reason"));
    console.error(`[ads-callback] ${slug} returned an error: ${message || "no message"}`);
    redirect(
      `/intelligence/connections?error=oauth&message=${encodeURIComponent(
        signText(message || "That connection didn't complete. You can try again."),
      )}`,
    );
  }

  const accounts = parseAccountsParam(params.get("accounts"));

  // LinkedIn has a second source for the list (`fetchLinkedInAccounts`), so an
  // empty return is not a dead end there: the picker offers to load them. Any
  // stale offer from an earlier consent is cleared so it cannot be re-shown.
  if (accounts.length === 0 && platform === "linkedInAds") {
    console.warn("[ads-callback] linkedin-ads arrived with no accounts — offering the fallback list");
    (await cookies()).delete(adsAccountsCookie(platform));
    redirect(`/connections/ads/${slug}/select`);
  }

  if (accounts.length === 0) {
    // Consent succeeded but no readable list came with it. There is nothing to
    // ask about, and no second source to try, so say what happened where the
    // customer can act on it rather than showing an empty picker.
    console.error(
      `[ads-callback] ${slug} arrived with no readable accounts — raw parameter ` +
        `${params.get("accounts") === null ? "absent" : "present but unreadable"}`,
    );
    redirect(
      `/intelligence/connections?error=oauth&message=${encodeURIComponent(
        signText("We couldn't read your ad accounts back from that connection. Please try connecting again."),
      )}`,
    );
  }

  const store = await cookies();
  store.set(adsAccountsCookie(platform), JSON.stringify(accounts), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADS_OFFER_MAX_AGE,
  });

  console.log(`[ads-callback] ${slug} offered ${accounts.length} account(s)`);
  redirect(`/connections/ads/${slug}/select`);
}
