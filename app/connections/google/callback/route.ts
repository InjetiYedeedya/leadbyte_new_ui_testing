import { APP_URL } from "@/lib/api/config";
import { signText } from "@/lib/signed-text";
import { NOT_STARTED_HERE, consentStarted } from "@/lib/auth/oauth-pending";
import { redirect } from "next/navigation";
import { GOOGLE_RESULT_PATH } from "@/components/analysis/google-connect-result";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { checkOAuthStatus, readGoogleTargets, readGrantedGoogleProducts } from "@/lib/api/oauth-status";
import { cookies } from "next/headers";
import { verifyValue } from "@/lib/auth/signed-cookie";
import {
  GOOGLE_FLOW_COOKIE,
  isGoogleFlow,
  mergeGoogleProducts,
  productsForReturn,
} from "@/lib/data/google-products";
import { recordOAuthConnection } from "@/lib/api/oauth-connect";
import {
  GOOGLE_PROPERTIES_COOKIE,
  findGoogleProperties,
} from "@/lib/data/google-properties";
import { GOOGLE_SITES_COOKIE, findGoogleSites } from "@/lib/data/google-sites";
import { OFFER_MAX_AGE } from "@/lib/data/google-callback-payload";

/**
 * Where n8n returns the browser after Google consent.
 *
 * ## Why this is a route and not a page
 *
 * n8n needs ONE stable URL. Pointing it straight at a page would couple an
 * external system to our internal structure — and we moved `/intelligence/*`
 * to `/overview/*` the same day this was written, which would have broken it
 * and required a coordinated n8n change plus a deploy. This route absorbs that:
 * n8n never learns where the data actually lives.
 *
 * Hand n8n exactly this, per environment:
 *
 *   http://localhost:3000/connections/google/callback
 *   https://<prod domain>/connections/google/callback
 *
 * ## WE write the connected row, not n8n
 *
 * This note used to say the `Google_website_Frontend_check` row was "written by
 * a separate downstream step" of n8n, and that checking it here was a race we
 * would lose. That was wrong, and it hid a missing feature for as long as it
 * stood: there is no such step. The legacy production app writes that row from
 * its own frontend (`Integrations.jsx` → `syncFrontendCheckConnect`), and when
 * this app was rewritten only the READ came across.
 *
 * So a successful consent is recorded here, by us, before the customer is sent
 * on — see `recordOAuthConnection`. Without it, consent completed, Google
 * returned the property list, and the account still read "Not connected"
 * forever, because nothing ever said otherwise. Measured 2026-09-08 on a
 * `google-unified` consent that returned 3 properties and 2 sites.
 *
 * ## Why it still never reports failure
 *
 * The write can fail, and a status check straight after it can still be early.
 * A confirmed row means `connected`, and anything else means `pending` — NOT
 * failed. Telling someone their connection failed seconds after they approved
 * it, when it is merely still landing, is worse than saying nothing: they would
 * reconnect, and reconnecting is the one thing that cannot help.
 *
 * The prompt itself is gated on the real status, so it disappears on its own
 * once the row lands.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    // Consent succeeded but our own session expired while they were away.
    // Sign-in restores it, and the Google connection is already stored.
    redirect("/login?connected=google");
  }

  // Only a consent THIS browser started (`lib/auth/oauth-pending.ts`). This
  // route writes from its query string, so an unasked-for link must not be
  // able to set a mailbox, record a connection or plant accounts.
  if (!(await consentStarted("google"))) {
    console.warn("[google-callback] rejected: no consent was started from this browser");
    redirect(NOT_STARTED_HERE);
  }

  // CONFIRMED shape (backend, 2026-09-03). n8n redirects with:
  //
  //   ?status=success
  //   &platform=google-analytics
  //   &accounts=<URI-encoded JSON array of the property objects>
  //
  // `accounts` is the notable one: the property list arrives HERE, in the URL,
  // rather than needing a separate call to
  // /api/webhook/google-analytics-properties. That is how the legacy app gets
  // it too.
  const query = request.nextUrl.searchParams;
  const status = query.get("status");
  //
  // Each flow names its payload differently:
  //
  //   accounts  Analytics       — a bare array of property objects
  //   sites     Search Console  — a bare array of site objects
  //   data      both at once    — an object wrapping some arrangement of the two
  //
  // Every parameter is searched for both kinds of row, so `platform` is not
  // trusted to say what arrived and adding a flow does not mean editing this
  // route. Which lists come back is what decides what the customer is asked.
  const payload = query.get("accounts") ?? query.get("sites") ?? query.get("data");
  const properties = findGoogleProperties(payload);
  const sites = findGoogleSites(payload);

  console.log(
    `[google-callback] status=${status ?? "none"} ` +
      `platform=${query.get("platform") ?? "none"} ` +
      `properties=${properties.length} sites=${sites.length}`,
  );

  if (status !== null && status !== "success") {
    // n8n told us plainly that it failed. This is the ONE case where saying so
    // is honest — everything else is treated as pending below.
    //
    // The `message` it sends is written for a person ("No Google Analytics
    // properties found for this account"), and is far more useful than any
    // generic copy we could invent — so it is carried through rather than
    // dropped. Capped because it arrives in a URL and lands in a banner.
    const message = (query.get("message") ?? "").slice(0, 200);
    const to = new URL("/overview/website-audit", APP_URL);
    to.searchParams.set("google", "failed");
    if (message) to.searchParams.set("message", signText(message));
    redirect(to.pathname + to.search);
  }

  // Consent succeeded, so record it — this is the row every "is it connected?"
  // check in the app reads, and nothing else writes it. Done BEFORE the picker
  // because the selection save asks the backend about a connection that has to
  // exist by then; n8n was answering "No connected Google account found" at
  // exactly this point.
  //
  // Not awaited for its result: a failed write must not strand someone who has
  // already approved us at Google. It logs loudly and the screens go on saying
  // "not connected", which stays true until the row is there.
  //
  // Only on EVIDENCE of a completed consent: `status=success`, or a property
  // or site list. A return with no status at all is not a success — it used
  // to be recorded as "Done, never expires" anyway (audit, 2026-09-29).
  if (status === "success" || properties.length > 0 || sites.length > 0) {
    // Which Google products this consent granted, added to any granted
    // before — Analytics and Search Console are separate grants that share
    // this one row (`lib/data/google-products.ts`).
    const store = await cookies();
    const startedFlow = await verifyValue(GOOGLE_FLOW_COOKIE, store.get(GOOGLE_FLOW_COOKIE)?.value);
    const granted = productsForReturn(isGoogleFlow(startedFlow) ? startedFlow : null, {
      properties: properties.length,
      sites: sites.length,
    });
    const [before, earlier] = await Promise.all([
      readGrantedGoogleProducts(session.businessId),
      readGoogleTargets(session.businessId),
    ]);
    // Analytics and Search Console share this one row. When one of them was
    // already chosen, connecting the OTHER must not undo it: this write used
    // to drop the earlier pick and mark the whole row "awaiting choice", so a
    // working Analytics showed "Connect" the moment Search Console was
    // started on its own — and stayed that way if its picker was left
    // (2026-10-12). The earlier pick is carried over and the row stays usable;
    // the picker still opens for the new product and rewrites the row.
    const hadChoice = earlier.propertyId !== "" || earlier.site !== "";
    await recordOAuthConnection(
      "googleAnalytics",
      session.businessId,
      session.userId,
      hadChoice
        ? {
            id: earlier.propertyId || earlier.site,
            name: earlier.property || earlier.site,
            property: earlier.property,
            propertyId: earlier.propertyId,
            site: earlier.site,
          }
        : undefined,
      {
        // With a list to pick from and an earlier pick kept, the NEW product
        // is added only when its pick is saved (the picker records the
        // product it picked) — so it never reads connected with nothing
        // chosen, while the earlier one stays connected throughout.
        ...(granted.length > 0 || before !== "all"
          ? {
              googleProducts: mergeGoogleProducts(
                before,
                hadChoice && (properties.length > 0 || sites.length > 0) ? [] : granted,
              ),
            }
          : {}),
        // A list is coming back, so the customer still has to choose from
        // it. Until they do this reads "Finish setup", not "Connected" — a
        // consent abandoned at the picker connected nothing anyone can use.
        // The picker's save rewrites the row without it. Not when something
        // was already chosen (above): that part of the row IS usable.
        awaitingChoice: !hadChoice && (properties.length > 0 || sites.length > 0),
      },
    );
    store.delete(GOOGLE_FLOW_COOKIE);
  } else {
    console.warn("[google-callback] no success status and nothing returned — not recording a connection");
  }

  // The customer usually owns several properties across several accounts, so
  // they have to say which one this workspace should read.
  //
  // The list rides in a short-lived httpOnly cookie rather than the URL: it is
  // several hundred bytes even for a small account, and a query string is the
  // wrong place for a payload that is only needed by the very next page.
  //
  // The cookie is set on an explicit `NextResponse.redirect` rather than via
  // `cookies().set()` + `redirect()`. The latter looks equivalent and is not:
  // `redirect()` throws, and the cookie mutation did not survive onto the
  // response — the picker then found no list and bounced straight back, which
  // is exactly what it did the first time this was tried.
  if (properties.length > 0 || sites.length > 0) {
    const response = NextResponse.redirect(
      new URL("/connections/google/select", APP_URL),
    );
    const options = {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: OFFER_MAX_AGE,
    } as const;

    // Two cookies rather than one, so the combined flow and the two single ones
    // write exactly the same thing — the picker then has no special case.
    //
    // A list this flow did not return is CLEARED, not left alone. Someone who
    // abandons the combined flow half way and then connects Search Console on
    // its own would otherwise still be shown the Analytics properties from the
    // abandoned attempt, and asked to choose one they never re-approved.
    if (properties.length > 0) {
      response.cookies.set(GOOGLE_PROPERTIES_COOKIE, JSON.stringify(properties), options);
    } else {
      // Cleared by writing an already-expired cookie with the SAME options
      // rather than `.delete(name)`, which does not carry the path the cookie
      // was set with — the "/"-scoped cookie then survived, and a
      // Search-Console-only return still offered stale Analytics properties.
      response.cookies.set(GOOGLE_PROPERTIES_COOKIE, "", { ...options, maxAge: 0 });
    }
    if (sites.length > 0) {
      response.cookies.set(GOOGLE_SITES_COOKIE, JSON.stringify(sites), options);
    } else {
      response.cookies.set(GOOGLE_SITES_COOKIE, "", { ...options, maxAge: 0 });
    }
    return response;
  }

  const google = await checkOAuthStatus("googleAnalytics", session.businessId);
  const state = google.status === "valid" ? "connected" : "pending";

  // Keywords are the reason anyone connects this, so that is where they land.
  redirect(`${GOOGLE_RESULT_PATH}?google=${state}`);
}
