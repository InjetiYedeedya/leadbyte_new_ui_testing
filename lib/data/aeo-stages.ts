/**
 * The AEO pieces the BROWSER needs: stage names and two pure status checks.
 *
 * Split out of `aeo-audit.ts` (2026-09-25) because the progress board, a
 * client component, imported them from there — and that module imports the
 * AEO client, which reads server configuration. Nothing leaked, since only
 * `NEXT_PUBLIC_` values reach the browser, but a client bundle must never
 * reach server-only code at all.
 */

/**
 * `unknown` is ours, not the service's. It means we could not read a state —
 * a dropped poll, or a word we do not recognise — and it is deliberately NOT
 * a finished state, so the board keeps asking.
 */
export type AeoJobState = "queued" | "running" | "done" | "blocked" | "error" | "unknown";

/** The three stages a plain (non-CRM) audit reports, in order. */
export const AEO_STAGES = [
  "Fetching the site as an AI crawler sees it",
  "Writing the fixes",
  "Working out how they would ship",
] as const;

/** A state that will never change again, so the board stops asking. */
export function isAeoFinished(state: AeoJobState): boolean {
  return state === "done" || state === "blocked" || state === "error";
}

/**
 * A job as the progress board sees it — everything except the audit.
 *
 * The board polls every few seconds and only needs to know whether each job
 * is still going. A finished result runs to well over 100KB of areas, gaps,
 * per-page findings and generated fixes, and sending that down a poll would
 * ship the whole report to the browser repeatedly to decide one boolean. The
 * server renders the report once, when the board says everything has landed.
 */
export interface AeoJobView {
  id: string;
  url: string;
  state: AeoJobState;
  stage: string;
  error: string;
  vendor: string;
  /**
   * Whether the audit itself has landed, which happens BEFORE the job is
   * finished: the score is final once the crawl ends, and the fixes go on
   * being written for tens of seconds after. Waiting for `done` made a
   * finished audit sit on the wait screen looking stuck.
   */
  hasResult: boolean;
}


/**
 * Whether a report can be drawn for this job yet.
 *
 * Any job carrying a result, finished or not — except a blocked or failed
 * one, which has its own card and is never drawn as a score.
 */
export function isAeoReportReady(job: { state: AeoJobState; hasResult: boolean }): boolean {
  return job.hasResult && job.state !== "blocked" && job.state !== "error";
}
