"use client";

/**
 * What the customer sees when a campaign has actually been sent to the
 * executor — the end of the flow, after the plan, the automation-mode dialog
 * and the details form.
 *
 * It was briefly shown straight after the setup form, on the path where "Act
 * without asking" skipped the plan. That path is gone: skipping the plan also
 * skipped the automation-mode dialog, which is a separate question. So this
 * now marks the real end, where a campaign genuinely is being built.
 *
 * ## Why it earns `"use client"`
 *
 * A dialog: open/close state, Escape, focus. It opens on mount because the
 * Server Action has already redirected here with `?created=1` — the work is
 * done by the time this renders.
 *
 * ## What it is careful NOT to claim
 *
 * "Being created", not "created". We posted the brief to the agent and it
 * accepted it; the campaign is assembled downstream, and the platform is the
 * only thing that knows whether it went live. Telling someone their ad is live
 * when it may not be is the one sentence here that could cost them money on a
 * false premise — hence the pointer to the ads portal, which is where the
 * truth is.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useScrollLock } from "@/lib/use-scroll-lock";
import type { SummaryRow } from "@/lib/data/launch-summary";

export function CampaignCreatedDialog({
  platform,
  summary = [],
}: {
  platform: string;
  /** What THIS campaign is, from the customer's own answers (`launch-summary.ts`). */
  summary?: readonly SummaryRow[];
}) {
  const [open, setOpen] = useState(true);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useScrollLock(open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function dismiss() {
    setOpen(false);
    // Drop `?launched=1` so a refresh — or the back button — does not announce
    // the same campaign a second time.
    router.replace(window.location.pathname);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={dismiss}
      onClick={(event) => {
        if (event.target === dialogRef.current) dismiss();
      }}
      aria-labelledby="campaign-created-title"
      className="w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-border bg-ground p-0 text-ink shadow-lg backdrop:bg-ink/50"
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-good-soft text-good"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-5">
              <path
                d="m5 10.5 3.5 3.5L15 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <h2 id="campaign-created-title" className="text-base font-bold text-ink">
              We are creating your {platform} campaign
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              It will appear in your {platform} portal shortly, and you can check its status
              there.
            </p>
          </div>
        </div>

        {/* Which campaign this is — one generic sentence read as a placeholder
            (LBS-1147 d). Only the customer's own answers; an empty list hides
            the block rather than inventing rows. */}
        {summary.length > 0 && (
          <dl className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface text-sm">
            {summary.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[6rem_1fr] gap-3 px-4 py-2">
                <dt className="text-ink-soft">{label}</dt>
                <dd className="break-words font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Only what is confirmed. It promised an email and dashboard figures
            "within the hour", and neither is guaranteed by the backend
            (audit, 2026-09-25) — a promise about money that may not keep. */}
        <p className="mt-4 rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
          Performance appears on your dashboard once {platform} starts reporting it.
        </p>

        <div className="mt-5 flex justify-end border-t border-border pt-4">
          <button
            type="button"
            onClick={dismiss}
            suppressHydrationWarning
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
          >
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}
