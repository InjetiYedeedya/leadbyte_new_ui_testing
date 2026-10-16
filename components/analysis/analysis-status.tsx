"use client";

/**
 * Watches a running analysis and refreshes the page when it finishes.
 *
 * A client island. It earns `"use client"` for the same reason `RunAnalysis`
 * does: polling is inherently client-side — something has to ask "is it done
 * yet?" on a timer and refresh when the answer changes. A Server Component
 * cannot.
 *
 * Unlike `RunAnalysis` this renders no control of its own. It is dropped into
 * the three Intelligence screens (business profile, website audit, GEO) so all
 * of them come alive the moment the single job that feeds them completes. It
 * holds no application data — the sections themselves are server-rendered.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { analysisProgress } from "@/app/(app)/overview/website-audit/actions";
import { pollDelay, whenVisible } from "@/lib/poll-pacing";

/** The backend's contract recommends ~5s; there are no progress counters to poll for. */
const POLL_MS = 5000;

export function AnalysisStatus({ running }: { running: boolean }) {
  const router = useRouter();
  // Survives re-renders without restarting the timer, and stops a refresh
  // firing after the component has gone.
  const cancelled = useRef(false);

  useEffect(() => {
    if (!running) return;

    cancelled.current = false;
    let timer: ReturnType<typeof setTimeout>;
    const pollingSince = Date.now();

    async function tick() {
      // Never from a hidden tab, and slower the longer it runs (Error 1102,
      // `lib/poll-pacing.ts`).
      await whenVisible();
      if (cancelled.current) return;
      let finished = false;
      try {
        finished = (await analysisProgress()).finished;
      } catch {
        // A failed status check is not a failed job — the action already logs
        // it server-side. Keep polling rather than stranding the page.
      }
      if (cancelled.current) return;

      if (finished) {
        // The server action has already revalidated the affected routes; this
        // pulls the fresh render in.
        router.refresh();
        return;
      }
      timer = setTimeout(tick, pollDelay(POLL_MS, Date.now() - pollingSince));
    }

    timer = setTimeout(tick, POLL_MS);

    return () => {
      cancelled.current = true;
      clearTimeout(timer);
    };
  }, [running, router]);

  return null;
}
