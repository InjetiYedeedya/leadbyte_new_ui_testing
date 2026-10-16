import { APP_URL } from "@/lib/api/config";
import { saveFacebookPage } from "@/lib/data/facebook-pages";
import { signText } from "@/lib/signed-text";
import { NOT_STARTED_HERE, consentStarted } from "@/lib/auth/oauth-pending";
import { paramNames } from "@/lib/log-redact";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { recordOAuthConnection } from "@/lib/api/oauth-connect";
import { checkOAuthStatus } from "@/lib/api/oauth-status";
import {
  SOCIAL_ACCOUNTS_MAX_AGE,
  SOCIAL_OFFER_MAX_AGE,
  parseSocialAccountsParam,
  readFlatSocialAccount,
  socialAccountsCookie,
  socialDeclinedCookie,
  socialOfferCookie,
} from "@/lib/data/social-accounts";

/**
 * Where n8n returns the browser after Facebook, Instagram or YouTube consent.
 *
 * ## Why this is not `connections/ads/callback`
 *
 * That route already serves two platforms and could have served five — but its
 * `PLATFORM_ALIASES` map (`lib/data/ads-accounts.ts`) resolves `facebook` to
 * `"metaAds"`, because for the ads flow "facebook" IS Meta. A `platform=facebook`
 * return through it would therefore record a **Meta Ads** connection and leave
 * the Facebook row still saying "Not connected". Two meanings for one word is
 * the whole reason this is a separate file.
 *
 * ## The picker, and why only sometimes
 *
 * Facebook returns every page the login administers — five, on the account
 * this was built against — and the agent posts to exactly ONE of them.
 * Choosing for them would publish to the wrong audience, which is the same
 * reason the Google and ad-account pickers exist and the one mistake here that
 * a customer cannot undo.
 *
 * So the count decides, and nothing else:
 *
 * - **0** — nothing to remember. Straight back to Connections.
 * - **1** — nothing to choose. Saved as the record; a dialog offering one
 *   option is a click that asks a question with no second answer.
 * - **2+** — stashed as an OFFER and the dialog opens on Connections.
 *
 * YouTube sends one channel, so in practice it never sees the dialog.
 *
 * ## What is trusted, and what is not
 *
 * `email` and `user_id` arrive in the URL and are IGNORED — both are
 * attacker-editable, and the session already says who this is. Trusting the
 * URL would let one person's consent be attributed to another's workspace.
 * Only `platform`, `status` and `message` are read, and `platform` only
 * through a closed map.
 *
 * ## `redirect_uri` IS honoured here
 *
 * `docs/backend/BACKEND.md` §A1b records the OAuth start stripping
 * `redirect_uri`, and this route was written assuming it would be dormant
 * until that changed. It is not: verified 2026-09-11 by a real connect, which
 * landed here and logged its query. That finding was about the **Google**
 * start; the social starts honour it. Do not re-derive "this is unreachable"
 * from §A1b.
 */

/** The query's `platform` value → our own platform id. A closed map. */
const PLATFORMS = {
  facebook: "facebook",
  instagram: "instagram",
  youtube: "youtube",
  // n8n has used both spellings for the channel flow in the legacy app's
  // webhooks (`youtube_connect` vs `youtube-connect`), so accept either here
  // rather than lose a completed consent to a hyphen.
  "youtube-channel": "youtube",
} as const;

type IncomingPlatform = keyof typeof PLATFORMS;

function platformFrom(value: string | null): (typeof PLATFORMS)[IncomingPlatform] | null {
  if (value === null) return null;
  const key = value.toLowerCase();
  return Object.hasOwn(PLATFORMS, key) ? PLATFORMS[key as IncomingPlatform] : null;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    redirect("/login?connected=social");
  }

  // Only a consent THIS browser started (`lib/auth/oauth-pending.ts`). This
  // route writes from its query string, so an unasked-for link must not be
  // able to set a mailbox, record a connection or plant accounts.
  if (!(await consentStarted("social"))) {
    console.warn("[social-callback] rejected: no consent was started from this browser");
    redirect(NOT_STARTED_HERE);
  }

  const params = request.nextUrl.searchParams;
  const platform = platformFrom(params.get("platform"));

  if (!platform) {
    // The customer has just approved something; a 404 is a worse answer than
    // the page that shows what is connected.
    console.error(`[social-callback] unrecognised platform: ${params.get("platform") ?? "none"}`);
    redirect("/intelligence/connections");
  }

  // n8n says so explicitly and usually says why. Its wording is carried to the
  // screen, because "No Facebook pages found for this user" tells someone what
  // happened and "something went wrong" does not.
  if (params.get("status") === "error") {
    const message = params.get("message") ?? "";
    console.error(`[social-callback] ${platform} returned an error: ${message || "no message"}`);
    redirect(
      `/intelligence/connections?error=oauth&message=${encodeURIComponent(
        signText(message || "That connection didn't complete. You can try again."),
      )}`,
    );
  }

  // Whether the table can confirm it yet. A "Done" row is written by a
  // downstream n8n step, so a check immediately after consent is a race we
  // often lose — `pending` says "we are waiting", never "it failed", which is
  // the rule `/connections/google/callback` follows.
  const status = await checkOAuthStatus(platform, session.businessId);
  const state = status.status === "valid" ? "done" : "pending";

  // Which account this landed on. There is no endpoint to ask afterwards, so
  // the cookie written below is the only record of the name.
  //
  // Two shapes, both observed 2026-09-11 and neither guessable:
  //   Facebook  ?accounts=[{"user":{…},"pages":[{id,name},…]}]
  //   YouTube   ?title=Leadbyte+ai&channel_id=UC…      (flat, no JSON at all)
  // JSON first, then the flat parameters — a provider that sends both should
  // be believed about the list rather than the single value.
  const fromJson = parseSocialAccountsParam(
    params.get("accounts") ?? params.get("channels") ?? params.get("data"),
  );
  const accounts = fromJson.length > 0 ? fromJson : readFlatSocialAccount(params);

  // Our own record that this account connected — written only on EVIDENCE of
  // a completed consent: n8n saying `status=success`, or the account it
  // returned. It was written on every return, including a cancelled consent
  // with no status at all, and the record says "Done, never expires" — so
  // agents unlocked with no working token behind them (audit, 2026-09-29).
  // n8n writes the authoritative row when it stores the tokens; this covers
  // the moment before that downstream step runs.
  if (params.get("status") === "success" || accounts.length > 0) {
    // One account is the choice already made, so it is saved WITH the row
    // (`selectedAccount`) — the name then survives other browsers and a
    // sign-out, not only this browser's cookie (2026-10-01). Several wait for
    // the picker, which saves the one chosen.
    // A single Facebook page is NOT final yet: n8n has to be told about it
    // first (below). Until then the row reads "Finish setup", so a failed
    // hand-off never leaves Facebook marked connected with no page to post.
    const pendingFacebookPage = platform === "facebook" && accounts.length === 1;
    const settled = accounts.length === 1 && !pendingFacebookPage;
    const recorded = await recordOAuthConnection(
      platform,
      session.businessId,
      session.userId,
      settled ? accounts[0] : undefined,
      // Several to pick from, or none to post as: not usable yet. Reads
      // "Finish setup" until the picker saves a choice (which rewrites this
      // row) — a closed dialog used to leave it "Connected" for good once
      // the one-hour offer cookie lapsed, or in any other browser.
      { awaitingChoice: !settled },
    );
    if (!recorded) {
      // Never fatal: n8n's own row is the one that counts. Logged so a silent
      // write failure is still visible.
      console.warn(`[social-callback] could not record ${platform} for ${session.businessId}`);
    }
  } else {
    console.warn(`[social-callback] ${platform}: no success status and no account — not recording a connection`);
  }

  // The whole query, logged deliberately.
  //
  // Facebook's and YouTube's shapes are known; Instagram's is not, and neither
  // is what a provider will send after a workflow change. A name we cannot read
  // is silently absent and looks like "we just don't show it" — this line is
  // how that gets diagnosed in one connect instead of a probing session, and it
  // is exactly how both shapes above were found. Server console only, in a BFF
  // whose logs never reach a browser — the same reason `agent-setup.ts` prints
  // its outgoing bodies.
  if (accounts.length === 0) {
    // Parameter NAMES only: the values can carry OAuth codes and tokens.
    console.log(
      `[social-callback] ${platform} returned no readable accounts. Params: ${paramNames(params)}`,
    );
  }

  console.log(`[social-callback] ${platform} -> ${state}, ${accounts.length} account(s)`);

  // One Facebook page is a choice already made, so it is saved with the
  // backend now, as the picker does for several (`facebook-pages.ts`).
  // The row is rewritten with the page only once n8n has accepted it.
  let facebookFailure: string | null = null;
  if (platform === "facebook" && accounts.length === 1) {
    const page = accounts[0]!;
    const result = await saveFacebookPage(session.businessId, session.userId, page);
    if (result.saved) {
      await recordOAuthConnection(platform, session.businessId, session.userId, page);
    } else {
      facebookFailure = result.reason;
    }
  }

  // More than one means a choice is outstanding, and `choose` is what opens the
  // dialog on arrival. It is a plain query parameter rather than a flag on the
  // cookie so the same dialog can be reopened later from the row's "Choose
  // account" link — people close tabs between consent and the click.
  const needsChoice = accounts.length > 1;
  const destination = new URL(
    facebookFailure !== null
      ? `/intelligence/connections?error=facebook-page&message=${encodeURIComponent(signText(facebookFailure))}`
      : `/intelligence/connections?connected=${platform}&state=${state}` +
          (needsChoice ? `&choose=${platform}` : ""),
    APP_URL,
  );

  // `NextResponse.redirect` rather than `cookies().set()` + `redirect()`. The
  // two look equivalent and are not — `redirect()` throws, and the cookie
  // mutation does not survive onto the response. That exact mistake cost the
  // Google picker a round of debugging; see its callback for the note.
  //
  // Used even when there is nothing to store, because there is always
  // something to CLEAR: a fresh consent has to lift a previous refusal whether
  // or not this return named an account.
  const response = NextResponse.redirect(destination);

  // Connecting again is the answer to a previous refusal, so the marker that
  // holds the platform at "Not connected" goes. Without this, someone who left
  // the picker once would reconnect, pick a page, and still be told they have
  // no account connected.
  response.cookies.delete(socialDeclinedCookie(platform));

  if (accounts.length > 0) {
    response.cookies.set(
      needsChoice ? socialOfferCookie(platform) : socialAccountsCookie(platform),
      JSON.stringify(accounts),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: needsChoice ? SOCIAL_OFFER_MAX_AGE : SOCIAL_ACCOUNTS_MAX_AGE,
      },
    );
  }

  // A previous connection's answer, now superseded by a question. Left in
  // place the row would name a page beside a "Choose account" link — a settled
  // answer and an open question about the same connection — and if the offer
  // lapsed unanswered it would go on naming a page this consent may no longer
  // cover.
  if (needsChoice) {
    response.cookies.delete(socialAccountsCookie(platform));
  }

  return response;
}
