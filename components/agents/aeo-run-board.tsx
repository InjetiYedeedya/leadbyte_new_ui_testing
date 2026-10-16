"use client";

/**
 * The audits in flight, one card each.
 *
 * ## Why it earns `"use client"`
 *
 * It is the poller. Only the browser can ask "is it done yet" on a timer, and
 * the answer changes what each card says. It fetches nothing of its own — the
 * timer calls a Server Action, and every finished report on this page was
 * rendered on the server and handed down as a prop.
 *
 * ## One poller for every job, not one per card
 *
 * The jobs are independent — none waits on another, and one finishing says
 * nothing about the rest — but the browser's request budget is shared. Three
 * cards each running their own timer is three times the traffic to answer one
 * question, so a single action returns the whole set.
 *
 * ## A self-scheduling timeout, not an interval
 *
 * `setInterval` fires whether or not the last call came back, so a slow
 * service ends up with overlapping requests stacked on it — exactly when it
 * can least afford them. The chain below starts the next wait only once an
 * answer has landed. The same reasoning is written into
 * `analysis-progress.tsx`, where the call can take 25 seconds.
 *
 * ## No percentage, ever
 *
 * The payload carries no progress counter of any kind. The service reports a
 * named stage and nothing else, so this shows which of three stages is running
 * and a measured elapsed clock. A bar filling at a rate we invented would be
 * the one thing on the screen that is not a measurement.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AEO_STAGES,
  type AeoJobView,
  isAeoFinished,
  isAeoReportReady,
} from "@/lib/data/aeo-stages";
import { formatElapsed } from "@/lib/data/analysis-steps";
import { pollAeoRunAction } from "@/app/(app)/agents/aeo/actions";
import { pollDelay, whenVisible } from "@/lib/poll-pacing";

/**
 * 1.5 seconds, the service's own reference cadence. Four seconds spent most of
 * a short audit holding an answer we could already have had.
 */
const POLL_MS = 1500;

/**
 * The moments worth a server re-render, once each: a job's report first
 * becoming drawable (the score has landed), and the job finishing (the fixes
 * are all written). Re-rendering on every poll in between would re-send a
 * report of 100KB+ every 1.5 seconds to show the same thing.
 */
function renderMoments(job: AeoJobView): string[] {
  const moments: string[] = [];
  if (isAeoReportReady(job)) moments.push(`${job.id}:ready`);
  if (isAeoFinished(job.state)) moments.push(`${job.id}:done`);
  return moments;
}

/** The elapsed clock, which is the only measured number on a running card. */
const TICK_MS = 1000;

function stageIndex(job: AeoJobView): number {
  const found = AEO_STAGES.findIndex((stage) => stage === job.stage);
  if (found >= 0) return found;
  // A stage we do not recognise, or none yet: the job is running, so it is at
  // least at the first step. Never past one we have not been told about.
  return 0;
}

function RunningCard({ job, elapsed }: { job: AeoJobView; elapsed: number }) {
  const current = stageIndex(job);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="min-w-0 break-all text-base font-semibold text-ink">{job.url}</h2>
        <p className="text-xs tabular-nums text-ink-soft" aria-live="off">
          {formatElapsed(elapsed)}
        </p>
      </div>

      <ol className="mt-3 space-y-2" aria-live="polite">
        {AEO_STAGES.map((stage, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={stage} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${
                  done ? "bg-accent" : active ? "animate-pulse bg-accent motion-reduce:animate-none" : "bg-border"
                }`}
              />
              <span className={active ? "font-medium text-ink" : "text-ink-soft"}>{stage}</span>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-xs text-ink-soft">
        {/* Honest about the estimate, and about the fact that leaving does not
            stop it — the two questions someone asks at a wait screen. */}
        Steps are the service&apos;s own, not a timer. This keeps running if you leave.
      </p>
    </div>
  );
}

export function AeoRunBoard({
  initial,
  startedAt,
  reports,
}: {
  /** Every job in the run, as the server last saw them. */
  initial: AeoJobView[];
  /** When the run started, for the elapsed clock. */
  startedAt: number;
  /**
   * The finished reports, server-rendered and keyed by job id.
   *
   * A finished job whose report is not here yet means the server has not
   * re-rendered since it landed; that is what the refresh below is for.
   */
  reports: Record<string, React.ReactNode>;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState<AeoJobView[]>(initial);
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);
  // Which render moments the server has already drawn. Without it, every tick
  // after a job lands would fire another refresh.
  const refreshed = useRef(new Set(initial.flatMap(renderMoments)));

  // The server is the source of truth for the list itself: a retry swaps one
  // job id for another, and the poll must not keep the old one alive.
  useEffect(() => {
    setJobs(initial);
  }, [initial]);

  const allFinished = jobs.length > 0 && jobs.every((job) => isAeoFinished(job.state));

  useEffect(() => {
    if (allFinished) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt), TICK_MS);
    return () => clearInterval(id);
  }, [allFinished, startedAt]);

  const poll = useCallback(async () => {
    try {
      return await pollAeoRunAction();
    } catch {
      // A dropped request is not an answer. Keep whatever we had.
      return null;
    }
  }, []);

  useEffect(() => {
    if (allFinished) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pollingSince = Date.now();

    async function tick() {
      // Never from a hidden tab, and slower the longer it runs (Error 1102,
      // `lib/poll-pacing.ts`).
      await whenVisible();
      if (cancelled) return;
      const next = await poll();
      if (cancelled) return;

      if (next && next.length > 0) {
        setJobs(next);

        // Ask the server to re-render for anything that has just reached a
        // new moment — once per moment, not once per tick.
        const fresh = next.flatMap(renderMoments).filter((m) => !refreshed.current.has(m));
        if (fresh.length > 0) {
          for (const moment of fresh) refreshed.current.add(moment);
          router.refresh();
        }

        if (next.every((job) => isAeoFinished(job.state))) return;
      }

      timer = setTimeout(tick, pollDelay(POLL_MS, Date.now() - pollingSince));
    }

    timer = setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [allFinished, poll, router]);

  return (
    <div className="flex flex-col gap-6">
      {jobs.map((job) => {
        const report = reports[job.id];
        if (report) return <div key={job.id}>{report}</div>;
        // Finished, but the server has not caught up yet. A moment, and saying
        // "still working" is truer than showing an empty slot.
        return <RunningCard key={job.id} job={job} elapsed={elapsed} />;
      })}
    </div>
  );
}
