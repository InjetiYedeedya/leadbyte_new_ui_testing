"use server";

import { getSession } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import {
  clearJob,
  currentJobId,
  currentJobStartedAt,
  readJobProgress,
} from "@/lib/data/analysis-job";
import { devGlobal } from "@/lib/dev-global";
import { beginAction } from "@/lib/data/action-guard";

/** Longer than any real crawl (the slowest measured was ~3 minutes). */
const LOST_JOB_MS = 15 * 60_000;
import { fetchLatestAnalysisFresh } from "@/lib/data/website-analysis";
import { dropAnalysisCache } from "@/lib/data/analysis-cache";
import { getBusinessProfileRepo } from "@/lib/data/business-profile-repo";
import { firstFilled } from "@/lib/data/profile-display";
import { clearPendingUrl, readPendingUrl, startAnalysisForUrl } from "@/lib/data/pending-website";

/**
 * Starts the crawl from the wait screen, not before it.
 *
 * ## Why this exists
 *
 * `captureWebsiteUrl` used to save the URL AND start the analysis before
 * redirecting. Starting it is a backend round trip that took 18 seconds against
 * the live service — eighteen seconds of the entry page looking exactly as it
 * did before the click, followed by a progress screen with almost nothing left
 * to wait for. The wait was real; it was just happening on the wrong screen.
 *
 * So the action now saves the URL and redirects immediately, and the wait
 * screen calls this on mount. The slow part happens where someone can see it.
 *
 * ## Why it is safe to call twice
 *
 * React strict mode mounts an island twice in dev, and a reload calls it again.
 * A second crawl is a real cost, so this returns early when a job is already in
 * flight. Cookies are writable here because a Server Action is one of the two
 * places they are — which is the whole reason this is not done in the page.
 */
export async function startAnalysisIfIdle(): Promise<{ started: boolean }> {
  const session = await getSession();
  if (!session) return { started: false };

  if (await currentJobId()) return { started: false };

  // Each start is a paid, forced crawl, and the job cookie above is the only
  // thing stopping a repeat — deleting it started another, without limit
  // (audit, 2026-09-29). Once a minute, like `runAnalysis`.
  const guard = beginAction(session.businessId, "analysis:start", {
    staleAfterMs: 60_000,
    minIntervalMs: 60_000,
  });
  if (!guard.ok) return { started: false };

  // The entry form leaves the URL in a cookie rather than saving it, because
  // the save is an 11-second backend call and it belongs on this screen. Fall
  // back to the stored profile for a reload, where the cookie is spent.
  const pending = firstFilled(await readPendingUrl(session.businessId));
  let websiteUrl = pending;

  if (pending) {
    try {
      await getBusinessProfileRepo().saveWebsiteUrl(session.businessId, pending, session.userId);
      // NOT cleared here. The page reads this cookie for its heading on every
      // render, so spending it at save time left the screen saying "Analysing
      // your website" for the rest of the wait. `analysisWaitState` clears it
      // once the analysis has actually landed.
    } catch (error) {
      // Keep the cookie: an unsaved URL is worth another attempt, and the
      // analysis below can still run against it.
      console.error(`[analysing] could not save ${pending} for ${session.businessId}:`, error);
    }
  } else {
    const profile = await getBusinessProfileRepo()
      .get(session.businessId)
      .catch(() => null);
    websiteUrl = firstFilled(profile?.websiteUrl);
  }

  if (!websiteUrl) {
    console.warn(`[analysing] no website on file for ${session.businessId} — nothing to analyse`);
    return { started: false };
  }

  // `force`: the customer asked for this by pressing Analyze. Without it the
  // backend answers with its cached result, no job is queued, and the screen
  // has nothing to show.
  await startAnalysisForUrl(session.businessId, websiteUrl, { force: true });
  return { started: (await currentJobId()) !== null };
}

/**
 * Is the analysis actually IN the frontend yet?
 *
 * ## Why this is not `analysisProgress()`
 *
 * That action answers "has the job stopped", which is a different question and
 * the reason this screen kept vanishing after a second or two. Two ways it
 * says "finished" without any data having arrived:
 *
 * - **No job id reads as finished.** `analysisProgress()` returns
 *   `{ state: "unknown", finished: true }` when the cookie is empty — which is
 *   also what a cached-result start leaves behind.
 * - **`done` is the crawler's word, not ours.** The status can flip before
 *   `/latest` will serve the payload, and the profile page then renders empty
 *   because it went looking a moment too early.
 *
 * So the wait ends when `/latest` actually returns something. The screen stays
 * up until the data the next page needs is in hand, which is what a loading
 * screen is FOR.
 */
export type WaitState =
  | { state: "running" }
  | { state: "ready" }
  | { state: "failed"; message?: string };

/**
 * The last state we logged, per job.
 *
 * `devGlobal` because Next dev compiles this module once per route segment
 * that imports it, so a plain module-level object is not guaranteed to be the
 * same one across two Server Actions (see CLAUDE.md).
 *
 * This exists so the poll logs TRANSITIONS and not every 1.5-second tick: one
 * line when the crawl starts running, one when it finishes, one when the
 * payload is servable. Three lines per run, and they answer "where did the
 * five minutes go" without a debugging session.
 */
const seen = devGlobal<Record<string, string>>("analysis-wait-state", () => ({}));

function logTransition(jobId: string, state: string, startedAt: number | null): void {
  if (seen[jobId] === state) return;
  seen[jobId] = state;

  const elapsed = startedAt === null ? "?" : `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
  console.log(`[analysis] ${jobId} -> ${state} at ${elapsed}`);
}

export async function analysisWaitState(): Promise<WaitState> {
  const session = await getSession();
  if (!session) return { state: "failed", message: "Your session expired. Please sign in again." };

  const jobId = await currentJobId();

  const startedAt = await currentJobStartedAt();

  if (jobId) {
    try {
      const progress = await readJobProgress(jobId);
      logTransition(jobId, progress.state, startedAt);

      if (progress.state === "failed") {
        // Spent. Left behind, the cookie made `startAnalysisIfIdle` refuse the
        // next start as "already running" (audit, 2026-09-29).
        await clearJob();
        return { state: "failed", message: progress.error };
      }
      // "unknown" is what an expired or missing job reads as — the status
      // read never throws. Treated as running it held the screen for the
      // cookie's whole hour. Past the point no real crawl takes, it is lost.
      if (
        progress.state === "unknown" &&
        startedAt !== null &&
        Date.now() - startedAt > LOST_JOB_MS
      ) {
        await clearJob();
        return {
          state: "failed",
          message: "We lost track of this analysis. Please start it again.",
        };
      }
      if (progress.state !== "done") {
        return { state: "running" };
      }
      // Done — fall through and wait for the payload to be servable.
    } catch (error) {
      // A status read that THROWS must not trap the screen. It used to
      // propagate out of this action, the island read it as "still running",
      // and the wait never checked `/latest` at all — so a crawl that had
      // finished kept the customer waiting until they reloaded.
      //
      // Falling through is the point: `/latest` answering is the real signal,
      // and it is reachable even when the status endpoint is not.
      console.error(`[analysing] status read failed for job ${jobId}:`, error);
    }
  }

  const payload = await fetchLatestAnalysisFresh(session.businessId, 25_000).catch(() => null);
  if (jobId) {
    // The gap between these two is its own fact: the crawler can report `done`
    // before `/latest` will serve the payload, and that gap is time the
    // customer spends on a screen that cannot leave yet.
    logTransition(jobId, payload === null ? "done-but-not-servable" : "servable", startedAt);
  }
  if (payload === null) return { state: "running" };

  // The pages downstream read this through their repos; refresh them so the
  // profile is populated the moment the customer lands on it.
  //
  // `dropAnalysisCache` is NOT optional alongside these. `revalidatePath`
  // clears the rendered pages; the analysis read has its own cross-request
  // cache keyed by tag, and nothing but `revalidateTag` empties it. Without
  // this line the crawl finishes, the screen redirects, and the pages it lands
  // on serve the PREVIOUS analysis for up to a minute — which reads as the
  // crawl having achieved nothing.
  await dropAnalysisCache(session.businessId);
  revalidatePath("/overview/business-profile");
  revalidatePath("/overview/website-audit");
  revalidatePath("/overview/geo-analysis");
  revalidatePath("/overview");
  // Spent, both of them: the crawl is finished AND its payload is readable, so
  // nothing is left to watch. Clearing earlier is what let a reload restart the
  // whole thing.
  await clearJob();
  await clearPendingUrl();
  return { state: "ready" };
}
