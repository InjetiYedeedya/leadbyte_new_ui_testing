import "server-only";
import { cookies } from "next/headers";
import { isPublicWebsite } from "@/lib/url-safety";
import { startAnalysis } from "@/lib/data/analysis-job";
import { decodePendingUrl } from "@/lib/data/pending-url-value";

/**
 * The website typed on the entry screen, and starting its analysis.
 *
 * These lived in `app/actions.ts`, a `"use server"` file — and every function
 * exported from one is a Server Action anyone can call with any arguments.
 * `startAnalysisForUrl` took any URL and started a paid, forced crawl with no
 * public-website check and no rate limit (audit, 2026-09-29). As plain server
 * helpers they can only be reached through the actions that call them.
 */

export const PENDING_URL_COOKIE = "leadbyte_pending_url";

/**
 * Kicks off the analysis for a URL we have just saved.
 *
 * MUST NEVER THROW, for the same reason `savePendingWebsiteUrl` cannot: by the
 * time this runs the user is signed in and their URL is stored, so a failure
 * here must not undo either. It is a best-effort head start — the Website
 * audit tab still has a Run analysis button, and the three Intelligence
 * screens show their own failed state from the job status.
 *
 * The URL is checked again here: it can come from the pending cookie, which a
 * visitor can edit, so the entry form's check is not enough on its own.
 *
 * The scheme is added back because we store the URL bare (`novaflow.io`) and
 * the backend answers a schemeless `website_url` with a 400.
 */
export async function startAnalysisForUrl(
  businessId: string,
  websiteUrl: string,
  options: { force?: boolean } = {},
): Promise<void> {
  if (!isPublicWebsite(websiteUrl)) {
    console.warn(`[stage-01] refused to analyse ${websiteUrl} for ${businessId}: not a public website`);
    return;
  }
  try {
    await startAnalysis(
      websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`,
      options,
    );
  } catch (error) {
    console.error(
      `[stage-01] saved ${websiteUrl} for ${businessId} but could not start the ` +
        "analysis. They can start it from the Website audit tab. Cause:",
      error,
    );
  }
}

/**
 * The URL the entry form left behind, and clearing it.
 *
 * The cookie is written by `captureWebsiteUrl` and picked up either by
 * `completeSignIn` (a new account) or by the wait screen (an existing one).
 */
export async function readPendingUrl(account: string): Promise<string | null> {
  const store = await cookies();
  // Only a URL typed signed out, or by this same account (`pending-url-value.ts`).
  return decodePendingUrl(store.get(PENDING_URL_COOKIE)?.value, account);
}

export async function clearPendingUrl(): Promise<void> {
  const store = await cookies();
  store.delete(PENDING_URL_COOKIE);
}
