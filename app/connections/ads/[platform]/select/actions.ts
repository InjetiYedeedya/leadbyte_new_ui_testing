"use server";

import { signText } from "@/lib/signed-text";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { recordOAuthConnection } from "@/lib/api/oauth-connect";
import { verifyValue } from "@/lib/auth/signed-cookie";
import { ADS_RETURN_COOKIE, adsReturnPath } from "@/lib/data/ads-return";
import {
  AdsSelectError,
  ADS_OFFER_MAX_AGE,
  ADS_PLATFORMS,
  adsAccountsCookie,
  confirmAdsConnected,
  disconnectAdsPlatform,
  fetchLinkedInAccounts,
  parseStoredAccounts,
  platformFromSlug,
  selectAdAccount,
  slugOf,
} from "@/lib/data/ads-accounts";

/**
 * Saves the ad account the customer picked, then confirms it landed.
 *
 * The choice is checked against the list the backend offers RIGHT NOW rather
 * than trusted from the form. The form carries only an id, so a tampered post
 * cannot select an account this consent never granted — the same rule the
 * Google picker follows, where the offered list is re-read from its cookie.
 */
export async function selectAdsAccount(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const slug = String(formData.get("platform") ?? "");
  const platform = platformFromSlug(slug);
  if (!platform) {
    console.error(`[ads-select] unknown platform: ${slug || "none"}`);
    redirect("/intelligence/connections?error=unknown-platform");
  }

  const accountId = String(formData.get("accountId") ?? "");

  // Checked against the SAME list the picker rendered. The form carries only an
  // id, so a tampered post cannot select an account this consent never granted.
  const store = await cookies();
  const offered = parseStoredAccounts(store.get(adsAccountsCookie(platform))?.value);
  const chosen = offered.find((account) => account.id === accountId);

  if (!chosen) {
    // Two different faults, named apart in the log because they need different
    // remedies: the consent has lapsed (nothing offered at all), or the posted
    // id was not one of the offers (a stale tab, or a tampered post).
    console.error(
      offered.length === 0
        ? `[ads-select] ${platform}: no accounts offered — consent may have lapsed`
        : `[ads-select] ${platform}: submitted ${accountId || "none"} is not among ` +
          `${offered.length} offered accounts`,
    );
    redirect(`/connections/ads/${slugOf(platform)}/select?error=expired`);
  }

  try {
    // The whole account, so `currency` and `business_name` reach the backend
    // rather than just the id.
    await selectAdAccount(platform, {
      email: session.businessId,
      userId: session.userId,
      account: chosen,
    });
  } catch (error) {
    const label = ADS_PLATFORMS[platform].label;
    // Our deadline is not their refusal. n8n writes the account and then
    // keeps the connection open, so a save that outran us has usually landed
    // — and reporting it as failed sent people round consent again for an
    // account that was already saved. Ask the status table before deciding.
    // (The Google picker has always done this; this one did not.)
    const timedOut = error instanceof AdsSelectError && error.timedOut;
    if (timedOut) {
      console.warn(`[ads-select] saving the ${platform} account outran our deadline — checking whether it landed`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (!timedOut || !(await confirmAdsConnected(platform, session.businessId))) {
      console.error(`[ads-select] saving the ${platform} account failed:`, error);
      const message = timedOut
        ? `${label} is taking longer than usual to save your account. It may still finish — refresh this page in a minute before trying again.`
        : ((error instanceof AdsSelectError ? error.userMessage : undefined) ??
          `We couldn't save that ${label} account. Please try again.`);
      redirect(
        `/intelligence/connections?error=save&message=${encodeURIComponent(signText(message))}`,
      );
    }
  }

  // Record the connection ourselves, the same way the Google flow does and for
  // the same reason: nothing else writes this row. Ads connecting is only an
  // OAuth login — there is no mailbox step and nothing else to complete — so
  // the moment an account is chosen the connection is real, and the Frontend
  // Check row is the only thing that says so anywhere in the app.
  //
  // The chosen account rides along, matching the legacy app's
  // `syncFrontendCheckConnect('google-ads', email, uid, pickedAccount)`.
  //
  // Its answer is read (META_ADS_AGENT_SPEC MA-CON-01). It was ignored, so a
  // failed write still reported "connected" — and the agent's gate, which reads
  // this very row, then said "not connected" on the next screen. Back to the
  // picker instead, with the offered list kept so a retry is one click.
  const recorded = await recordOAuthConnection(
    platform,
    session.businessId,
    session.userId,
    chosen,
  );
  if (!recorded) {
    console.error(`[ads-select] ${platform}: account saved, but the connection row was not written`);
    redirect(`/connections/ads/${slugOf(platform)}/select?error=record`);
  }

  // Spent: the choice is saved, so a stale list must not be re-offered. Cleared
  // only after the save succeeded — a failure keeps it, so a retry costs a
  // click rather than another trip through consent.
  store.delete(adsAccountsCookie(platform));

  // Step 4. A false here is "not confirmed yet", never "failed" — the row is
  // written downstream of the save, so an immediate check can lose the race.
  // The Connections page then shows it as still connecting rather than broken.
  const confirmed = await confirmAdsConnected(platform, session.businessId);

  // Started from the agent's page: go back to it, where the setup form is now
  // unlocked (`lib/data/ads-return.ts`). One use only.
  const backToAgent = adsReturnPath(
    await verifyValue(ADS_RETURN_COOKIE, store.get(ADS_RETURN_COOKIE)?.value),
    platform,
  );
  store.delete(ADS_RETURN_COOKIE);
  if (backToAgent) redirect(backToAgent);

  redirect(
    `/intelligence/connections?connected=${slugOf(platform)}&state=${confirmed ? "done" : "pending"}`,
  );
}

/**
 * LinkedIn only: fetch the ad-account list when it did not come back with the
 * consent (LINKEDIN_ADS_FLOW.md 1.3), then show the picker again.
 *
 * A button, not something the page does on render: the list call runs an n8n
 * workflow, and opening a screen must not have side effects.
 */
export async function loadLinkedInAccounts(): Promise<void> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const accounts = await fetchLinkedInAccounts(session.businessId);
  if (accounts.length === 0) {
    redirect("/connections/ads/linkedin-ads/select?loaded=none");
  }

  const store = await cookies();
  store.set(adsAccountsCookie("linkedInAds"), JSON.stringify(accounts), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADS_OFFER_MAX_AGE,
  });
  redirect("/connections/ads/linkedin-ads/select");
}

/**
 * "Disconnect account" on the picker: removes the connection row and the
 * offered list, then says so on the Connections page.
 */
export async function disconnectAdsAccount(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const platform = platformFromSlug(String(formData.get("platform") ?? ""));
  if (!platform) {
    redirect("/intelligence/connections?error=unknown-platform");
  }

  const removed = await disconnectAdsPlatform(platform, session.businessId);
  // The offered list goes either way: it belongs to a consent the customer
  // has just said they no longer want.
  (await cookies()).delete(adsAccountsCookie(platform));

  if (!removed) {
    redirect(
      `/intelligence/connections?error=disconnect&message=${encodeURIComponent(
        signText(`We couldn't disconnect ${ADS_PLATFORMS[platform].label} just now. Please try again.`),
      )}`,
    );
  }
  redirect(`/intelligence/connections?disconnected=${slugOf(platform)}`);
}
