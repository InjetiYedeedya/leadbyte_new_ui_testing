/**
 * The phases the website analysis goes through, and where it has probably got
 * to.
 *
 * ## Why "probably"
 *
 * The backend reports a job as `queued`, `running`, `done` or `failed` and
 * nothing else. It emits no counters — confirmed with the backend team, and the
 * reason `JobProgress` keeps its count fields optional (see CLAUDE.md). So
 * there is no measured percentage to show and no per-step detail to fill in.
 *
 * What IS true is the ORDER. The stored payload contains exactly these phases —
 * a crawl, then the business reading, then products, brand, SEO, GEO, and the
 * assembled profile — so listing them in order tells the customer what is
 * happening rather than leaving them on a bare spinner.
 *
 * Which step is current is therefore estimated from elapsed time, and the
 * screen says so in words rather than printing a number it cannot stand
 * behind. The estimate never outruns reality: the last step stays current
 * until the job actually reports `done`, and nothing is marked finished
 * because time passed alone.
 */
export const ANALYSIS_STEPS = [
  "Connecting to website",
  "Crawling pages & sitemap",
  "Understanding the business",
  "Detecting products & services",
  "Reading brand identity",
  "Auditing technical SEO",
  "Measuring GEO presence",
  "Building intelligence profile",
] as const;

/**
 * How fast the estimate moves, as the point where it is half way along.
 *
 * ## Why a curve and not a duration
 *
 * A crawl takes anywhere from 5 seconds (a one-page site, measured against the
 * live backend) to over 3 minutes (go.chefgaa.com, measured 2026-09-07). No
 * single duration fits both: pace the eight steps across 3 minutes and a small
 * site sits on step one long after its profile is ready; pace them across 5
 * seconds and a real site ticks everything off in ten seconds and then shows
 * nothing moving for the rest of the crawl. Both were shipped, in that order,
 * and both read as a frozen screen.
 *
 * So the steps follow an ASYMPTOTIC curve instead: quick at the start, slower
 * as it goes, and it never runs out. There is always a step left to reach,
 * whether the crawl takes ten seconds or five minutes.
 *
 * 15 seconds is the half-way point — at 15s elapsed the estimate is half done.
 * That puts a short crawl a few steps in before it finishes, and walks a long
 * one through the whole list.
 */
export const PACE_MS = 15_000;

/**
 * How far along the estimate is, 0 to just under 1.
 *
 * The single source for both the step and the bar, so they can never disagree
 * on screen — a bar at 90% beside step two is the kind of contradiction that
 * makes the whole screen untrustworthy.
 *
 * Approaches 1 and never reaches it. That is the property the honesty rules
 * below rest on: time alone cannot finish this.
 */
export function progressShare(elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return elapsedMs / (elapsedMs + PACE_MS);
}

/**
 * Past this, the screen stops claiming the wait is nearly over.
 *
 * 45 seconds, which is where the estimate reaches the second-to-last step: by
 * then "usually a few seconds" has been false for a while, and a screen that
 * is wrong about the small claim is not believed about the big one.
 */
export const OVERDUE_MS = 45_000;

/**
 * The step the run has probably reached, as an index.
 *
 * Held at the last index however long it takes: "Building intelligence
 * profile" becomes CURRENT, never done, because claiming that finished before
 * the job says so would be the screen lying about the only thing it is here to
 * report.
 */
export function stepAt(elapsedMs: number, stepCount: number = ANALYSIS_STEPS.length): number {
  if (stepCount <= 0) return 0;

  const step = Math.floor(progressShare(elapsedMs) * stepCount);
  return Math.min(step, stepCount - 1);
}

/**
 * How far to fill the bar, 0-100.
 *
 * Approaches but never reaches 100 while the job is running, so it cannot sit
 * full while work continues — the failure mode CLAUDE.md warns about. It is
 * the job finishing that fills it, not the clock.
 */
export function barPercent(elapsedMs: number, finished: boolean): number {
  if (finished) return 100;
  return Math.min(Math.round(progressShare(elapsedMs) * 100), 99);
}

/**
 * Elapsed time as `m:ss`, for the wait screen's subtitle.
 *
 * The single most useful thing on a screen someone suspects is frozen: a
 * number that changes every second. The eight steps can all be ticked off
 * inside the estimate while a real crawl keeps going, and at that point the
 * screen has nothing moving on it at all — which is exactly when people decide
 * the app is broken and reload, starting a second crawl.
 */
export function formatElapsed(elapsedMs: number): string {
  const total = Math.max(Math.floor(elapsedMs / 1000), 0);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Has this run outlasted its own estimate?
 *
 * Past this point the subtitle must stop saying "usually a few seconds" — a
 * minute into a crawl that sentence is simply false, and a screen that is
 * wrong about the small thing is not believed about the big one.
 */
export function isOverdue(elapsedMs: number): boolean {
  return elapsedMs > OVERDUE_MS;
}
