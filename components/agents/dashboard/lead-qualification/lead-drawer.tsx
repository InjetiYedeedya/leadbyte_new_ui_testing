"use client";

/**
 * One lead, opened from its row's View button.
 *
 * ## Why this earns `"use client"`
 *
 * It is a modal: `<dialog>` + `showModal()` for the top layer, the backdrop,
 * the focus trap and Escape, and `useScrollLock` because `showModal()` does not
 * hold the page still underneath (the reasoning is in `lib/use-scroll-lock.ts`).
 * The same shape as `components/analytics/campaign-drawer.tsx`. It never
 * fetches — the lead arrives whole, as a prop.
 *
 * ## Why a dialog and not a page
 *
 * A lead's detail is a follow-up question about a row you are already looking
 * at; navigating away to answer it would lose the filters and the scroll that
 * got you there. Focus goes back to the row's View button when it closes —
 * the parent owns that, because it owns the button.
 */

import { useEffect, useRef } from "react";
import { CaretRight, CheckCircle, Circle } from "@phosphor-icons/react";
import { useScrollLock } from "@/lib/use-scroll-lock";
import type { Lead } from "@/lib/data/dashboard/lead-pipeline";
import { webHref } from "@/lib/data/profile-display";
import { formatCount } from "@/lib/format";
import { ScorePill, StatusPill } from "./lead-pills";

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums text-ink">
        {value === null ? "—" : formatCount(value)}
      </dd>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink">{children || "—"}</dd>
    </div>
  );
}

interface Step {
  label: string;
  value: string;
  done: boolean;
}

/** How far this lead has come: picked up, scored, emailed, answered, handed to sales. */
function stepsFor(lead: Lead): Step[] {
  return [
    // A row exists only for a lead the agent has picked up.
    { label: "Agent", value: lead.agentName || "Picked up", done: true },
    {
      label: "Score",
      value: lead.score === null ? "Not yet" : String(Math.round(lead.score)),
      done: lead.score !== null,
    },
    {
      label: "Last sent",
      value: lead.lastSentLabel || (lead.contacted ? "Sent" : "Not yet"),
      done: lead.contacted || lead.lastSentAt !== null,
    },
    {
      label: "Last reply",
      value: lead.lastReplyLabel || (lead.replied ? "Replied" : "No reply"),
      done: lead.replied,
    },
    { label: "Sales", value: lead.sentToSales ? "Sent to sales" : "Not yet", done: lead.sentToSales },
  ];
}

export function LeadDrawer({
  lead,
  onClose,
}: {
  /** Null closes the dialog. */
  lead: Lead | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const open = lead !== null;

  useScrollLock(open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const attachment = webHref(lead?.attachmentUrl);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      // A click on the element itself is a click on its backdrop.
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      aria-labelledby="lead-drawer-title"
      className="max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-ground p-0 text-ink shadow-lg backdrop:bg-ink/50"
    >
      {lead && (
        <div className="flex flex-col gap-5 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="lead-drawer-title" className="truncate text-base font-bold text-ink" title={lead.name || lead.email}>
                {lead.name || lead.email}
              </h2>
              {lead.name && lead.email && (
                <p className="mt-0.5 truncate text-sm text-ink-soft" title={lead.email}>
                  {lead.email}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <StatusPill status={lead.status} />
                <ScorePill score={lead.score} group={lead.scoreGroup} />
              </div>
            </div>
            {/* 40px hit area, not the 24px the icon alone would give. */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-2 flex size-10 shrink-0 items-center justify-center rounded-md text-ink-soft transition hover:bg-surface-raised hover:text-ink"
            >
              <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <ol aria-label="Progress" className="flex flex-wrap items-start gap-x-1 gap-y-2">
            {stepsFor(lead).map((step, index) => (
              <li key={step.label} className="flex items-start gap-1">
                {index > 0 && <CaretRight size={12} aria-hidden="true" className="mt-1 shrink-0 text-ink-soft" />}
                <div className="flex items-start gap-1.5 rounded-md px-1.5 py-0.5">
                  {step.done ? (
                    <CheckCircle size={16} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0 text-good" />
                  ) : (
                    <Circle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-soft" />
                  )}
                  <div>
                    <p className="text-xs font-medium text-ink">
                      {step.label}
                      <span className="sr-only">{step.done ? ", done" : ", not yet"}</span>
                    </p>
                    <p className="text-xs tabular-nums text-ink-soft">{step.value}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          {lead.scoreReason && (
            <section>
              <h3 className="text-sm font-medium text-ink">Why this score</h3>
              <p className="mt-1 text-sm text-ink-soft">{lead.scoreReason}</p>
            </section>
          )}

          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Emails sent" value={lead.emailsSent} />
            <Stat label="Opens" value={lead.opens} />
            <Stat label="Clicks" value={lead.clicks} />
            <Stat label="Messages" value={lead.messages} />
          </dl>

          <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
            <Detail label="Reply status">{lead.replied ? "Replied" : "No reply yet"}</Detail>
            <Detail label="Reply from">{lead.lastReplyFrom}</Detail>
            <Detail label="Last subject">{lead.lastSentSubject}</Detail>
            <Detail label="Template">{lead.template}</Detail>
            <Detail label="Attachment">
              {attachment ? (
                <a
                  href={attachment}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accent-ink underline-offset-2 hover:underline"
                >
                  Open attachment
                </a>
              ) : (
                lead.attachmentUrl
              )}
            </Detail>
            <Detail label="Job ID">
              {lead.jobId && <span className="font-mono text-xs">{lead.jobId}</span>}
            </Detail>
          </dl>

          {lead.lastReplyText && (
            <section>
              <h3 className="text-sm font-medium text-ink">Their reply</h3>
              <p className="mt-1 whitespace-pre-wrap break-words rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink">
                {lead.lastReplyText}
              </p>
            </section>
          )}
        </div>
      )}
    </dialog>
  );
}
