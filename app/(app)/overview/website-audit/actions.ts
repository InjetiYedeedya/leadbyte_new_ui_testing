"use server";

import { beginAction, guardMessage } from "@/lib/data/action-guard";
import { dropAnalysisCache } from "@/lib/data/analysis-cache";
import { revalidatePath } from "next/cache";
import { currentBusinessId } from "@/components/page-shell";
import { getBusinessProfileRepo } from "@/lib/data/business-profile-repo";
import {
  clearJob,
  currentJobId,
  readJobProgress,
  startAnalysis,
  type JobProgress,
} from "@/lib/data/analysis-job";
import { ApiError, ApiTimeoutError } from "@/lib/api/client";

export interface StartResult {
  ok: boolean;
  /** Present when we could not start. Safe to show the user. */
  message?: string;
}

/**
 * Starts a website analysis for the signed-in account.
 *
 * The URL comes from the saved profile rather than a form field: Stage 01
 * already collected it, and re-asking here would let the two disagree.
 */
export async function runAnalysis(force = false): Promise<StartResult> {
  const businessId = await currentBusinessId();
  const profile = await getBusinessProfileRepo().get(businessId);
  const websiteUrl = profile?.websiteUrl?.trim();

  if (!websiteUrl) {
    return {
      ok: false,
      message: "Add your website address first — you can do that on the welcome screen.",
    };
  }

  // A forced crawl is a paid run of the crawler; one per account per minute.
  const guard = beginAction(businessId, "analysis", { staleAfterMs: 60_000, minIntervalMs: 60_000 });
  if (!guard.ok) return { ok: false, message: guardMessage(guard.reason) };

  // Whatever happens next, the stored analysis is about to be replaced or
  // re-served; the remembered copy is the one thing that must not survive it.
  // `revalidatePath` below does not reach it — that cache is keyed by tag.
  await dropAnalysisCache(businessId);

  try {
    const outcome = await startAnalysis(
      websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`,
      { force },
    );
    // A cached result is already stored, so every section can render right
    // away — there is no job to poll and nothing would refresh these pages.
    if (outcome.kind !== "queued") {
      revalidatePath("/overview/business-profile");
      revalidatePath("/overview/geo-analysis");
      revalidatePath("/overview");
    }
  } catch (error) {
    // Nothing started, so a Retry must not be refused as "just started" — it
    // was, silently, for a minute after every failed start (audit, 2026-09-29).
    // A timeout may have started one, so that keeps the minute's wait.
    if (error instanceof ApiTimeoutError) guard.release();
    else guard.forget();
    console.error(`[analysis] could not start for ${businessId}:`, error);
    if (error instanceof ApiError && error.status < 500) {
      // 4xx here is about the request — e.g. a URL the backend rejects — so
      // its message is worth showing.
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "Couldn't start the analysis. Please try again." };
  }

  guard.release();
  revalidatePath("/overview/website-audit");
  return { ok: true };
}

/**
 * Retry after a failure, from a `<form action={...}>`.
 *
 * Returns void because that is what a form action must return, and clears the
 * failed job first so a fresh one can be watched. `force` skips the cached
 * result — retrying is pointless if it just re-serves the failure.
 */
export async function retryAnalysis(): Promise<void> {
  await clearJob();
  const result = await runAnalysis(true);
  await dropAnalysisCache(await currentBusinessId());
  if (!result.ok) {
    console.error(`[analysis] retry failed: ${result.message ?? "no message"}`);
  }
  revalidatePath("/overview/business-profile");
  revalidatePath("/overview/website-audit");
  revalidatePath("/overview/geo-analysis");
}

/**
 * Progress for the poller. Clears the stored job once it finishes so the page
 * stops polling and falls back to reading the stored result.
 */
export async function analysisProgress(): Promise<JobProgress & { finished: boolean }> {
  const jobId = await currentJobId();
  if (!jobId) return { state: "unknown", finished: true };

  const progress = await readJobProgress(jobId);

  if (progress.state === "done" || progress.state === "failed") {
    await clearJob();
    // The crawl has just written a new analysis, so the remembered one is
    // wrong by definition. Dropped BEFORE the paths are revalidated, so the
    // re-render reads the new payload rather than re-caching the old.
    await dropAnalysisCache(await currentBusinessId());
    // The audit and GEO pages both read the stored analysis, so refresh both.
    revalidatePath("/overview/website-audit");
    revalidatePath("/overview/geo-analysis");
    revalidatePath("/overview");
    return { ...progress, finished: true };
  }

  return { ...progress, finished: false };
}
