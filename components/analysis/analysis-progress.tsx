"use client";

/**
 * The screen someone watches while their website is being analysed.
 *
 * ## Why this earns `"use client"`
 *
 * Two things no server render can do: ask "is it done yet?" on a timer, and
 * move a clock. It polls the same `analysisProgress()` Server Action the audit
 * page uses, so the job is still read on the server with the session's own
 * token.
 *
 * ## What it does and does not claim
 *
 * The eight steps are the real phases, in the order the payload contains them.
 * Which one is current is ESTIMATED from elapsed time, because the backend
 * emits no counters — and the screen says "estimated" in words rather than
 * printing a percentage or a page count it cannot stand behind. There is
 * deliberately no "24 pages scanned · 63% complete" here: those numbers have
 * no source until the crawler streams progress.
 *
 * Two rules keep the estimate honest:
 *
 * - **The last step never ticks itself off.** `stepAt` holds one short of the
 *   end, so only the job reporting `done` can complete the run.
 * - **The bar never fills on time alone.** It approaches 99 and stops; the job
 *   finishing is what takes it to 100. A full bar over continuing work is the
 *   failure mode CLAUDE.md calls out.
 *
 * On failure it says so and offers a retry, rather than spinning forever — the
 * previous behaviour for a failed job on this path was an empty dashboard.
 */

import Link from "@/components/ui/app-link";
import { useEffect, useRef, useState } from "react";
import { analysisWaitState, startAnalysisIfIdle, type WaitState } from "@/app/analysing/actions";
import { pollDelay, whenVisible } from "@/lib/poll-pacing";
import {
  ANALYSIS_STEPS,
  barPercent,
  formatElapsed,
  isOverdue,
  stepAt,
} from "@/lib/data/analysis-steps";

/**
 * Fast enough to feel live, slow enough not to hammer the Lambda.
 *
 * 1.5s, not 4s: a measured run finishes in about five seconds, so a 4-second
 * gap meant up to 4 of those were spent sitting on an answer we already had.
 * Safe at this rate because the poll is a self-scheduling chain — the next
 * request is only sent once the previous one has returned, so a slow call
 * cannot stack requests on top of itself.
 */
const POLL_MS = 1500;
/** The clock that paces the step estimate. */
const TICK_MS = 500;
/** Where the wait ends. */
const DESTINATION = "/overview";

export function AnalysisProgress({
  site,
  startedAt,
  needsStart = false,
}: {
  /** The site being analysed, for the heading. */
  site: string;
  /** When the job started, in epoch ms — from the server, so a reload keeps its place. */
  startedAt: number;
  /**
   * Start the crawl on mount.
   *
   * True when arriving from the entry form, which deliberately does not start
   * it — that call took 18 seconds and belongs on this screen, where someone
   * can see it happening, rather than on the page they just left.
   */
  needsStart?: boolean;
}) {
  const [elapsed, setElapsed] = useState(() => Math.max(Date.now() - startedAt, 0));
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Until the job exists there is nothing to poll, and "no job" must not be
  // read as "finished".
  const [starting, setStarting] = useState(needsStart);
  const started = useRef(false);
  // Guards against the redirect firing twice if a poll lands during it.
  const leaving = useRef(false);

  // The clock. Reads from `startedAt` rather than counting up, so a reload or a
  // backgrounded tab resumes where the job actually is.
  useEffect(() => {
    if (finished || error) return;
    const id = setInterval(() => setElapsed(Math.max(Date.now() - startedAt, 0)), TICK_MS);
    return () => clearInterval(id);
  }, [finished, error, startedAt]);

  // Start the crawl, once. `startAnalysisIfIdle` is idempotent, but strict
  // mode mounts this twice in dev and a second crawl is a real cost, so the
  // ref guard stays.
  //
  // There is deliberately NO `cancelled` flag here, and no cleanup. With both,
  // the two guards cancelled each other out and the screen hung forever:
  // strict mode mounts, unmounts and remounts, so the first pass started the
  // request and then had its cleanup set `cancelled = true`, while the second
  // pass saw `started.current` and returned without starting anything. The
  // reply to the only request in flight was therefore discarded, `starting`
  // stayed true, and the poll below — which waits on it — never ran once. The
  // steps still animated, because those are just a clock, so it looked like a
  // slow backend rather than a screen that had stopped asking.
  //
  // Dropping the flag is safe: strict mode re-runs effects on the SAME
  // component instance, so these setters still belong to the live screen, and
  // setting state after an unmount is a no-op in React 18+, not a leak.
  useEffect(() => {
    if (!needsStart || started.current) return;
    started.current = true;

    startAnalysisIfIdle()
      .then((result) => {
        if (!result.started) {
          setError("We couldn't start the analysis. Please try again.");
        }
        setStarting(false);
      })
      .catch(() => {
        setError("We couldn't start the analysis. Please try again.");
        setStarting(false);
      });
  }, [needsStart]);

  // The truth. Everything above is decoration until this says otherwise.
  //
  // A self-scheduling chain, not `setInterval`: this call can take up to 25
  // seconds right after a crawl, and a 4-second interval simply stacked
  // overlapping requests on top of a backend that was already struggling to
  // answer the first one. The next poll is scheduled when the previous one
  // returns.
  useEffect(() => {
    if (error || starting) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pollingSince = Date.now();

    async function poll() {
      // Never from a hidden tab, and slower the longer it runs (Error 1102,
      // `lib/poll-pacing.ts`).
      await whenVisible();
      if (cancelled || leaving.current) return;
      let result: WaitState;
      try {
        result = await analysisWaitState();
      } catch {
        // A dropped request is not an answer. Try again rather than declaring
        // a failure the backend never reported.
        result = { state: "running" };
      }
      if (cancelled || leaving.current) return;

      if (result.state === "failed") {
        setError(result.message ?? "The analysis failed. Please try again.");
        return;
      }

      if (result.state === "running") {
        timer = setTimeout(poll, pollDelay(POLL_MS, Date.now() - pollingSince));
        return;
      }

      // Ready — the analysis is in our hands, not merely finished. Fill the bar
      // and tick the last step before leaving, so the screen resolves rather
      // than vanishing mid-sentence.
      setFinished(true);
      leaving.current = true;

      // A FULL page load, and deliberately not `router.replace` — even inside a
      // transition. `/analysing` sits outside the `(app)` route group, so a
      // client navigation has to tear down one layout tree and build another;
      // React cannot hold the old screen across that, and it showed as several
      // seconds of empty grey with the URL still reading `/analysing`.
      //
      // A real navigation keeps this screen on the customer's monitor until the
      // browser has painted the next document — and the profile route now has
      // its own `loading.tsx`, so what it paints first is a skeleton rather
      // than nothing. It also guarantees fresh data, with no client router
      // cache in the way.
      timer = setTimeout(() => {
        window.location.assign(DESTINATION);
      }, 700);
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [error, starting]);

  const current = finished ? ANALYSIS_STEPS.length : stepAt(elapsed);
  const percent = barPercent(elapsed, finished);
  const elapsedLabel = formatElapsed(elapsed);
  const overdue = isOverdue(elapsed);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-lg font-bold text-ink">We couldn&apos;t analyse {site}</h1>
        <p role="alert" className="mt-2 rounded-lg bg-crit-soft px-3 py-2 text-sm text-crit">
          {error}
        </p>
        <div className="mt-4 flex gap-3">
          <Link
            href="/?setup=1"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
          >
            Try again
          </Link>
          <Link
            href="/overview"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-raised"
          >
            Go to the dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10"
        >
          <span
            className={`h-3 w-3 rounded-sm bg-accent ${finished ? "" : "animate-pulse motion-reduce:animate-none"}`}
          />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-ink">
            {finished ? `Analysed ${site}` : `Analysing ${site}`}
          </h1>
          {/* Where the fake "24 pages scanned · 63% complete" would go. This
              says what we actually know: roughly how long it takes, and that
              the steps are an estimate. */}
          {/* Where the fake "24 pages scanned · 63% complete" would go. The
              elapsed clock is the one number here that is measured rather than
              estimated — and it is the thing that keeps this screen from
              looking frozen once all eight steps are ticked but the crawl is
              still going. That silence is what made people reload, which
              started a second crawl. */}
          <p className="font-mono text-xs text-ink-soft">
            {finished
              ? "Complete · opening your profile"
              : overdue
                ? `${elapsedLabel} · larger sites take longer — this keeps running if you leave`
                : `${elapsedLabel} · usually a few seconds · steps are estimated`}
          </p>
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`Analysing ${site}`}
        className="mt-5 h-1 w-full overflow-hidden rounded-full bg-surface-raised"
      >
        {/* `scaleX`, not `width`: a width transition re-lays-out the bar every
            frame, a transform does not. `origin-left` keeps it growing from
            the left. The 500ms stays — it is bridging a 1.5s poll interval, so
            it is smoothing real data rather than decorating a control, and a
            shorter one leaves the bar visibly still between polls.
            (Animation review, 2026-09-20.) */}
        <div
          className="h-full w-full origin-left rounded-full bg-accent transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </div>

      <ol className="mt-6">
        {ANALYSIS_STEPS.map((label, i) => {
          const done = i < current;
          const active = i === current;

          return (
            <li
              key={label}
              aria-current={active ? "step" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-300 motion-reduce:transition-none ${
                active ? "bg-accent/10" : ""
              }`}
            >
              {done ? (
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-good text-[11px] text-surface"
                >
                  ✓
                </span>
              ) : active ? (
                <span
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 rounded-full bg-accent motion-reduce:animate-none animate-pulse"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 rounded-full border border-border"
                />
              )}

              <span
                className={
                  active
                    ? "font-medium text-ink"
                    : done
                      ? "text-ink"
                      : "text-ink-soft"
                }
              >
                {label}
              </span>

              {/* The state in words, for anyone not reading colour and shape. */}
              <span className="sr-only">
                {done ? "(done)" : active ? "(in progress)" : "(not started)"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
