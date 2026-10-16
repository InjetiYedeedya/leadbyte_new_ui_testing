"use client";

/**
 * "Run analysis" control, and the poller that watches a running job.
 *
 * A client island. It earns `"use client"` because polling is inherently
 * client-side: something has to ask "is it done yet?" on a timer and refresh
 * the page when the answer changes. A Server Component cannot do that.
 *
 * It holds no application data — only "is a job running" and how far along.
 * The results themselves are fetched and rendered on the server as usual.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { analysisProgress, runAnalysis } from "@/app/(app)/overview/website-audit/actions";
import type { JobState } from "@/lib/data/analysis-job";
import { pollDelay, whenVisible } from "@/lib/poll-pacing";
import { Spinner } from "@/components/ui/spinner";

const POLL_MS = 4000;

export function RunAnalysis({ jobRunning }: { jobRunning: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(jobRunning);
  const [state, setState] = useState<JobState>(jobRunning ? "running" : "unknown");
  const [crawled, setCrawled] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Poll only while a job is actually running.
  useEffect(() => {
    if (!running) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pollingSince = Date.now();

    // A self-scheduling chain (it was a `setInterval`, which stacked calls
    // when one was slow), never from a hidden tab, and slower the longer it
    // runs — Error 1102, `lib/poll-pacing.ts`.
    async function tick() {
      await whenVisible();
      if (cancelled) return;
      let progress: Awaited<ReturnType<typeof analysisProgress>>;
      try {
        progress = await analysisProgress();
      } catch {
        if (!cancelled) timer = setTimeout(tick, pollDelay(POLL_MS, Date.now() - pollingSince));
        return;
      }
      if (cancelled) return;

      setState(progress.state);
      setCrawled(progress.pagesCrawled ?? null);
      setTotal(progress.totalPages ?? null);

      if (progress.finished) {
        setRunning(false);
        if (progress.state === "failed") {
          setError(progress.error ?? "The analysis failed. Please try again.");
        } else {
          // Pull in the results the server has now stored.
          router.refresh();
        }
        return;
      }
      timer = setTimeout(tick, pollDelay(POLL_MS, Date.now() - pollingSince));
    }

    void tick(); // don't wait a full interval for the first answer
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [running, router]);

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await runAnalysis();
      if (!result.ok) {
        setError(result.message ?? "Couldn't start the analysis.");
        return;
      }
      setState("queued");
      setRunning(true);
    });
  }

  if (running) {
    // The backend does not report progress counters (confirmed 2026-08-28), so
    // this is an indeterminate state by design. Rendering a percentage from
    // absent data would mean inventing a number and stalling it at 0%.
    const label =
      crawled !== null && total !== null && total > 0
        ? `Analysing your site — ${crawled} of ${total} pages`
        : state === "queued"
          ? "Queued — starting shortly"
          : "Analysing your site";

    const percent = crawled !== null && total ? Math.min(100, (crawled / total) * 100) : null;

    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center gap-3">
          <span
            className="h-3 w-3 animate-pulse rounded-full bg-accent motion-reduce:animate-none"
            aria-hidden="true"
          />
          <p role="status" className="text-sm font-medium text-ink">
            {label}
          </p>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded bg-surface-raised">
          {/* Was `transition-all` on a width — two faults in one class:
              `all` animates whatever else happens to change, and `width`
              re-lays-out every frame. Now one named transform property.
              (Animation review, 2026-09-20.) */}
          <div
            className={
              percent === null
                ? "h-1.5 w-1/3 animate-pulse rounded bg-accent motion-reduce:animate-none"
                : "h-1.5 w-full origin-left rounded bg-accent transition-transform duration-500 ease-out motion-reduce:transition-none"
            }
            style={percent === null ? undefined : { transform: `scaleX(${percent / 100})` }}
          />
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          This usually takes a few minutes, and longer on a large site. You can leave this page —
          it keeps running, and the results appear here when it finishes.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">Run a website analysis</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            Crawls your site and fills in both the audit and GEO scores.
          </p>
        </div>
        <button
          type="button"
          onClick={start}
          disabled={pending}
          suppressHydrationWarning
          className="inline-flex shrink-0 items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition disabled:opacity-50 hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
        >
          {pending && <Spinner />}
          {pending ? "Starting…" : "Run analysis"}
        </button>
      </div>
      {error !== null && (
        <p role="alert" className="mt-3 rounded-lg bg-crit-soft px-3 py-2 text-sm text-crit">
          {error}
        </p>
      )}
    </div>
  );
}
