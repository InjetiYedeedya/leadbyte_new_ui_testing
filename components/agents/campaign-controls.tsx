"use client";

/**
 * Pause, resume and cancel the running Lead Qualification outreach.
 *
 * ## Why it earns `"use client"`
 *
 * Three things a `<form action={serverAction}>` cannot express:
 *
 * - **Cancel needs confirming.** It stops a run that cannot be restarted, and
 *   an accidental click on a live outreach campaign is not recoverable.
 * - **Each control reports its own outcome.** The backend can refuse — an
 *   unknown job, a finished run — and that answer belongs beside the button
 *   that asked, not in a redirect.
 * - **Pending state per button.** These calls reach n8n; two seconds of a
 *   button that looks untouched is what makes people click it twice.
 */

import { useState, useTransition } from "react";
import type { CampaignAction, ControlResult } from "@/lib/data/campaign-controls";
import type { CampaignState } from "@/lib/data/campaign-job";
import { Spinner } from "@/components/ui/spinner";
import { useHydrated } from "@/lib/use-hydrated";

export function CampaignControls({
  state,
  startedAt,
  onControl,
}: {
  state: CampaignState;
  /** Epoch ms, from the server, so "started" survives a reload. */
  startedAt: number;
  onControl: (action: CampaignAction) => Promise<ControlResult>;
}) {
  const [result, setResult] = useState<ControlResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<CampaignAction | null>(null);

  function run(action: CampaignAction) {
    setBusy(action);
    setConfirming(false);
    startTransition(async () => {
      setResult(await onControl(action));
      setBusy(null);
    });
  }

  const paused = state === "paused";
  const started = new Date(startedAt);
  // The time of day is the viewer's own, so it is printed only once the
  // browser renders — see `useHydrated`. Until then, the date alone (UTC).
  const hydrated = useHydrated();

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-ink">
            {paused ? "Outreach is paused" : "Outreach is running"}
          </p>
          <p className="mt-0.5 text-sm text-ink-soft">
            Started{" "}
            {hydrated
              ? started.toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : started.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}
            {paused ? " · no new emails are being sent" : " · emails are going out now"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(paused ? "resume" : "pause")}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium text-ink transition hover:bg-surface-raised disabled:opacity-60"
          >
            {(busy === "pause" || busy === "resume") && <Spinner />}
            {busy === "pause"
              ? "Pausing…"
              : busy === "resume"
                ? "Resuming…"
                : paused
                  ? "Resume outreach"
                  : "Pause outreach"}
          </button>

          {confirming ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => run("cancel")}
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-crit px-4 text-sm font-medium text-surface transition disabled:opacity-60"
              >
                {busy === "cancel" && <Spinner />}
                {busy === "cancel" ? "Cancelling…" : "Yes, cancel it"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="min-h-11 rounded-md px-3 text-sm text-ink-soft transition hover:bg-surface-raised"
              >
                Keep running
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(true)}
              className="min-h-11 rounded-md border border-crit/40 px-4 text-sm font-medium text-crit transition hover:bg-crit-soft disabled:opacity-60"
            >
              Cancel campaign
            </button>
          )}
        </div>
      </div>

      {/* Said in words, not implied by a colour: cancelling cannot be undone. */}
      {confirming && (
        <p className="mt-3 rounded-lg bg-crit-soft px-3 py-2 text-sm text-crit">
          Cancelling stops this run for everyone who has not been emailed yet. It cannot be
          restarted — you would need to upload the leads again.
        </p>
      )}

      {result && (
        <p
          role="status"
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            result.ok ? "bg-good-soft text-good" : "bg-crit-soft text-crit"
          }`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
