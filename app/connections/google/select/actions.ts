"use server";

import { signText } from "@/lib/signed-text";
import { dropConnectedDataCache } from "@/lib/data/connected-data";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { readGoogleTargets, readGrantedGoogleProducts } from "@/lib/api/oauth-status";
import { recordOAuthConnection } from "@/lib/api/oauth-connect";
import { mergeGoogleProducts } from "@/lib/data/google-products";
import { GOOGLE_SAVED_COOKIE } from "@/lib/data/google-callback-payload";
import { GOOGLE_PROPERTIES_COOKIE, parseGoogleProperties } from "@/lib/data/google-properties";
import { GOOGLE_SITES_COOKIE, parseGoogleSites } from "@/lib/data/google-sites";
import { GoogleSaveError, saveGoogleSelection } from "@/lib/data/google-selection";
import { GOOGLE_RESULT_PATH } from "@/components/analysis/google-connect-result";

function failed(message: string): never {
  redirect(`${GOOGLE_RESULT_PATH}?google=failed&message=` + encodeURIComponent(signText(message)));
}

/**
 * Records the Analytics property and/or Search Console site the customer picked.
 *
 * Each choice is looked up from the SAME cookie the picker rendered, not
 * rebuilt from the form. The form carries only an id, so a tampered post cannot
 * invent a property or a site that was never offered.
 *
 * Both selections go in ONE request, so there is no half-saved state. On any
 * failure neither list is cleared, so a retry re-offers exactly what was
 * offered before without a second trip through Google consent.
 */
export async function selectGoogleTargets(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const store = await cookies();
  const properties = parseGoogleProperties(store.get(GOOGLE_PROPERTIES_COOKIE)?.value);
  const sites = parseGoogleSites(store.get(GOOGLE_SITES_COOKIE)?.value);

  const propertyId = String(formData.get("propertyId") ?? "");
  const siteUrl = String(formData.get("siteUrl") ?? "");
  const chosenProperty = properties.find((p) => p.propertyId === propertyId);
  const chosenSite = sites.find((s) => s.siteUrl === siteUrl);

  // Already saved, and the lists cleared behind it. Reporting a failure here
  // would contradict the success this same action just reported.
  if (properties.length === 0 && sites.length === 0 && store.get(GOOGLE_SAVED_COOKIE)) {
    redirect(`${GOOGLE_RESULT_PATH}?google=connected`);
  }

  if (!chosenProperty && !chosenSite) {
    // Two very different faults land here and used to be reported identically,
    // which made the live one impossible to diagnose: the offer window lapsed
    // (no lists left), or a submitted id was not one we offered (lists present,
    // no match — a stale tab, or a tampered post). Say which in the log; the
    // customer gets the one message either way, because the remedy is the same.
    const offered = properties.length + sites.length;
    console.error(
      offered === 0
        ? "[google-select] offer expired: no lists in the cookies"
        : `[google-select] no match: submitted propertyId=${propertyId || "none"} ` +
          `siteUrl=${siteUrl || "none"} against ${properties.length} properties ` +
          `and ${sites.length} sites`,
    );

    // Sending them back to the picker is pointless if the lists are gone, so
    // say what happened where they can act on it.
    failed("That selection expired. Please connect Google again.");
  }

  let timedOut = false;
  try {
    await saveGoogleSelection({
      email: session.businessId,
      userId: session.userId,
      property: chosenProperty,
      site: chosenSite,
    });
  } catch (error) {
    // A deadline of ours is not a refusal of theirs. n8n writes the row and
    // then keeps the connection open, so this same path used to quote our own
    // plumbing — "The operation was aborted due to timeout" — at a customer
    // whose connection had in fact saved, under a banner reading "Nothing was
    // changed on your account". That sentence was simply false, and it sent
    // people back through Google consent for no reason.
    if (error instanceof GoogleSaveError && error.timedOut) {
      console.warn(
        "[google-select] save exceeded our deadline — checking the status row " +
          "instead of assuming failure:",
        error.message,
      );
      timedOut = true;
    } else {
      console.error("[google-select] could not save the chosen targets:", error);
      // n8n's own wording when it gave any. "No connected Google account found.
      // Please reconnect." tells someone what to do; "please try again" invites
      // them to repeat the thing that just failed.
      failed(
        (error instanceof GoogleSaveError ? error.userMessage : undefined) ??
          "We couldn't save that selection. Please try again.",
      );
    }
  }

  // The pick is made, so the connection is no longer half done: rewrite the
  // row the callback left `awaitingChoice`, now naming what was chosen so the
  // Connections page can say WHICH property and site this workspace reads.
  // Written after a timeout too — n8n commits before it answers, so a save
  // that outran our deadline has almost always landed (see below), and
  // leaving the row half-done would show "Finish setup" over a working
  // connection. The earlier choice for the OTHER product is kept.
  const before = await readGoogleTargets(session.businessId);
  await recordOAuthConnection(
    "googleAnalytics",
    session.businessId,
    session.userId,
    {
      id: chosenProperty?.propertyId || chosenSite?.siteUrl || before.propertyId || before.site,
      name: chosenProperty?.propertyName || chosenSite?.siteUrl || before.property || before.site,
      property: chosenProperty?.propertyName || before.property,
      propertyId: chosenProperty?.propertyId || before.propertyId,
      site: chosenSite?.siteUrl || before.site,
    },
    // The pick is itself proof of the product: a property is Analytics, a
    // site is Search Console. Merged in rather than relying on the
    // callback's earlier write alone — when that write had not landed, this
    // rewrote the row with no products and Analytics showed "Connect" right
    // after its property was picked (2026-10-12).
    {
      googleProducts: mergeGoogleProducts(await readGrantedGoogleProducts(session.businessId), [
        ...(chosenProperty ? (["analytics"] as const) : []),
        ...(chosenSite ? (["search_console"] as const) : []),
      ]),
    },
  );

  // Confirmed only when the backend answered us. A timeout is "still
  // landing" — never "failed".
  const landed = !timedOut;

  // Only clear the lists once the save is confirmed. An unconfirmed one keeps
  // them, so a second attempt costs a click rather than another trip through
  // Google consent.
  if (landed) {
    if (chosenProperty) store.delete(GOOGLE_PROPERTIES_COOKIE);
    if (chosenSite) store.delete(GOOGLE_SITES_COOKIE);
  }

  // Set either way: a repeat submit after a timeout must not be reported as an
  // expired offer, which is what the empty-lists branch above would call it.
  store.set(GOOGLE_SAVED_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  // The Performance screen this redirects to reads the data bundle; the
  // saved copy predates the property just chosen.
  dropConnectedDataCache(session.businessId);

  redirect(`${GOOGLE_RESULT_PATH}?google=${landed ? "connected" : "pending"}`);
}
