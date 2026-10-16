"use client";

/**
 * The dashboard's Auto / Refresh controls and "Last updated".
 *
 * ## Why this earns `"use client"`
 *
 * A timer, the page's visibility, and a remembered on/off choice — none of
 * which a form can express. It never fetches: a refresh is `onRefresh`, which
 * the dashboard panel answers by re-reading ONLY the open tab
 * (`loadAgentDashboard`). It used to be `router.onRefresh()`, which re-ran every
 * read on the Agents page — list, statuses, mailbox — to update one panel.
 *
 * ## The rules (implementation guide §2.7)
 *
 * - Every 120 seconds, and only while the browser tab is VISIBLE — a hidden
 *   tab refreshing is traffic nobody reads.
 * - Once more when the reader comes back to the tab, since the figures may be
 *   minutes old by then.
 * - Auto can be switched off; the choice is kept in this browser
 *   (`localStorage`, inside try/catch — private windows throw).
 */

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";

const REFRESH_MS = 120_000;
const STORAGE_KEY = "leadbyte.dashboard.auto";

const BUTTON =
  "inline-flex min-h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.96] disabled:opacity-70 motion-reduce:transform-none";

function timeOf(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function DashboardRefresh({
  onRefresh,
  refreshing,
  updatedAt,
}: {
  /** Re-reads the open tab. Never called while one is already running. */
  onRefresh: () => void;
  refreshing: boolean;
  /**
   * When the figures on screen were read, or null while none are. Owned by
   * the panel so it moves when the data LANDS, not when a refresh starts.
   */
  updatedAt: number | null;
}) {
  const [auto, setAuto] = useState(true);
  // After mount only: a time rendered on the server would disagree with the
  // browser's clock and fail hydration.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "off") setAuto(false);
    } catch {
      // Storage refused (private window): keep the default.
    }
  }, []);

  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") onRefresh();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") onRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [auto, onRefresh]);

  function toggleAuto() {
    const next = !auto;
    setAuto(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Not remembered, still applied.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={toggleAuto}
        aria-pressed={auto}
        className={BUTTON}
        title={auto ? "Refreshing every 2 minutes while this tab is open" : "Refreshing only when you ask"}
      >
        {auto ? "Auto" : "Manual"}
      </button>
      <button type="button" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing} className={BUTTON}>
        {refreshing && <Spinner />}
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
      <p aria-live="polite" className="text-xs tabular-nums text-ink-soft">
        {mounted && updatedAt !== null && !refreshing ? `Last updated ${timeOf(new Date(updatedAt))}` : null}
      </p>
    </div>
  );
}
