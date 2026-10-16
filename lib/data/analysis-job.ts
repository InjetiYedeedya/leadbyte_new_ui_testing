import { isRedirectError } from "@/lib/auth/session-expired";
import { cache } from "react";
import { cookies } from "next/headers";
import { apiGet, apiPost } from "@/lib/api/client";
import { parsePartialErrors, type SectionFailure } from "@/lib/data/analysis-errors";

/**
 * Starting and tracking a website-analysis job.
 *
 * CONTRACT (backend, 2026-08-27):
 *   POST /api/website-analyze              -> 202 { job_id }
 *   GET  /api/website-analyze/status/{id}  -> { status, progress?, data? }
 *
 * Both require the JWT. `user_id` is taken from the token and must NOT be sent
 * in the body — sending it is what the old synchronous contract wanted.
 *
 * Field names in the STATUS response are read defensively. The routes are
 * confirmed by probe, but the exact spelling of the status value and progress
 * counters isn't, so every plausible variant is accepted rather than silently
 * reporting "running" forever because we looked for the wrong key.
 */

const JOB_COOKIE = "leadbyte_analysis_job";

export type JobState = "queued" | "running" | "done" | "failed" | "unknown";

export interface JobProgress {
  state: JobState;
  /**
   * CONFIRMED 2026-08-28: the backend does NOT emit progress counters — the
   * downstream crawler doesn't stream them. These stay optional so a future
   * version can supply them, but the UI must not wait on them, and must not
   * render a progress bar that can never fill.
   */
  pagesCrawled?: number;
  totalPages?: number;
  error?: string;
  /**
   * Sections that could not be produced, while the job as a whole reported
   * `done`. A job can succeed and still hand back `seo: null` — the status
   * response says which step failed and why in `partial_errors`, and without
   * reading it the screens cannot tell that apart from "never analysed".
   */
  partialErrors?: SectionFailure[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Normalises the job state.
 *
 * CONFIRMED by the backend team 2026-08-28: the set is exactly
 * `queued | running | done | failed` — no synonyms. The extra spellings are
 * kept as a cheap safety net (an unrecognised value would poll forever), but
 * they are not expected to occur.
 */
export function toJobState(raw: unknown): JobState {
  const value = String(raw ?? "").toLowerCase().trim();
  if (["done", "complete", "completed", "succeeded", "success", "finished"].includes(value)) {
    return "done";
  }
  if (["failed", "error", "failure"].includes(value)) return "failed";
  if (["running", "in_progress", "in-progress", "processing", "started"].includes(value)) {
    return "running";
  }
  if (["queued", "pending", "waiting", "accepted"].includes(value)) return "queued";
  return "unknown";
}

/** Pulls a job id out of the 202 response, whatever it is called. */
export function jobIdFrom(payload: unknown): string | null {
  const root = record(payload);
  const data = record(root.data);
  for (const source of [root, data]) {
    for (const key of ["job_id", "jobId", "id", "jobID"]) {
      const value = source[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
  }
  return null;
}

export function parseProgress(payload: unknown): JobProgress {
  const root = record(payload);
  const data = record(root.data);
  const state = toJobState(root.status ?? root.state ?? data.status ?? data.state);
  const progress = record(root.progress ?? data.progress);

  const partialErrors = parsePartialErrors(root.partial_errors ?? data.partial_errors);

  return {
    state,
    pagesCrawled: num(progress.pagesCrawled ?? progress.crawled ?? progress.done),
    totalPages: num(progress.totalPages ?? progress.total),
    error: typeof root.error === "string" ? root.error : undefined,
    ...(partialErrors.length > 0 ? { partialErrors } : {}),
  };
}

/**
 * What the POST actually told us.
 *
 * The backend answers one of two ways: a queued job, or a cached result that is
 * already `done` with `data` inline. `unknown` means we could not read either,
 * in which case the caller falls back to re-reading `/latest` rather than
 * guessing.
 */
export type StartOutcome =
  | { kind: "queued"; jobId: string }
  | { kind: "done" }
  | { kind: "unknown" };

export function startOutcomeFrom(payload: unknown): StartOutcome {
  const jobId = jobIdFrom(payload);
  if (jobId !== null) return { kind: "queued", jobId };

  const root = record(payload);
  const data = record(root.data);
  if (toJobState(root.status ?? root.state ?? data.status) === "done") {
    return { kind: "done" };
  }
  return { kind: "unknown" };
}

/**
 * The three states every analysis-backed screen has to render.
 *
 * `done` collapses to `idle`: the job is no longer in flight and the payload is
 * readable, so the page shows data rather than a progress message. An
 * unreadable status stays `running` — declaring failure because we could not
 * parse a status field would be worse than waiting.
 */
export type AnalysisPhase =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "failed"; message?: string };

export function phaseFrom(progress: JobProgress): AnalysisPhase {
  if (progress.state === "failed") return { phase: "failed", message: progress.error };
  if (progress.state === "done") return { phase: "idle" };
  return { phase: "running" };
}

/**
 * Kicks off an analysis and remembers the job id.
 *
 * The id lives in an httpOnly cookie rather than in memory: a job outlives the
 * request that started it, and in-memory state does not survive a server
 * restart or a second instance. (Same reasoning as the paywall-gate bug.)
 */
export async function startAnalysis(
  websiteUrl: string,
  options: { force?: boolean } = {},
): Promise<StartOutcome> {
  // `website_url` MUST carry a scheme — the backend answers a schemeless URL
  // with a 400. We store it bare, so callers add it back.
  const body: Record<string, unknown> = { website_url: websiteUrl };
  if (options.force) body.force = true;

  const payload = await apiPost<unknown>("/api/website-analyze", body);
  const outcome = startOutcomeFrom(payload);

  if (outcome.kind === "queued") {
    const store = await cookies();
    // `id|startedAt`. The start time is stored because the progress screen
    // paces its step estimate from elapsed time, and a reload must resume
    // where the job is rather than restarting the sequence from zero.
    store.set(JOB_COOKIE, `${outcome.jobId}|${Date.now()}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60, // an hour is far longer than any crawl should take
    });
    return outcome;
  }

  if (outcome.kind === "unknown") {
    console.warn("[analysis-job] could not read the start response; re-reading /latest");
  }
  // A cached result is already stored, so there is no job to watch. Leaving a
  // stale cookie here would make the pages poll a job that never existed.
  await clearJob();
  return outcome;
}

/**
 * Current phase for the three Intelligence screens.
 *
 * Memoised per render: business profile, website audit and GEO all ask during
 * the same request, and each ask is a status round trip.
 */
export const analysisState = cache(async function analysisState(): Promise<AnalysisPhase> {
  const jobId = await currentJobId();
  if (!jobId) return { phase: "idle" };
  return phaseFrom(await readJobProgress(jobId));
});

export async function currentJobId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(JOB_COOKIE)?.value;
  if (!raw) return null;
  // Cookies written before the start time was added carry the bare id, and a
  // job in flight during a deploy must keep working.
  const id = raw.split("|")[0] ?? "";
  return id === "" ? null : id;
}

/**
 * When the running job started, in epoch ms, or null when unknown.
 *
 * Null for a cookie written before the timestamp existed — the caller then
 * treats the job as just-started, which only affects a cosmetic estimate.
 */
export async function currentJobStartedAt(): Promise<number | null> {
  const store = await cookies();
  const stamp = store.get(JOB_COOKIE)?.value.split("|")[1];
  const parsed = Number(stamp);
  return stamp !== undefined && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function clearJob(): Promise<void> {
  const store = await cookies();
  store.delete(JOB_COOKIE);
}

/** Reads a job's progress. Never throws — the poller must keep working. */
async function readJobProgressUncached(jobId: string): Promise<JobProgress> {
  try {
    const payload = await apiGet<unknown>(
      `/api/website-analyze/status/${encodeURIComponent(jobId)}`,
    );
    return parseProgress(payload);
  } catch (error) {
    // A dead session leaves as a redirect to sign in, not as this call's
    // own failure (audit, 2026-09-29).
    if (isRedirectError(error)) throw error;
    console.error(`[analysis-job] status check failed for ${jobId}:`, error);
    return { state: "unknown" };
  }
}

/**
 * `readJobProgress`, asked at most once per job per request.
 *
 * `analysisState()` (the connect banner) and `analysisSectionFailures()` (the
 * audit and GEO screens) both ask about the same job in one render, and each
 * was a separate `/status/{id}` call. Per-request only, so a poll — which is
 * its own request every time — still gets a fresh answer.
 */
export const readJobProgress = cache(readJobProgressUncached);
