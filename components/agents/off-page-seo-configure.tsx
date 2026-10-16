"use client";

import { CheckedFileInput } from "@/components/ui/checked-file-input";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { AGENT_ROW_ACTION } from "@/components/agents/row-action";
import { MailboxNote } from "@/components/agents/mailbox-note";
import { EmailGateNotice } from "@/components/agents/email-gate-notice";
import type { ConnectedMailbox } from "@/lib/data/email-callback";

/**
 * "Configure" — Off-Page SEO's setup and run, in a popup on the agents list.
 *
 * A client island: open/close state plus a form whose result shows in place, so
 * it never navigates away. It collects one optional thing — a product/service
 * document — and hands it to `configureOffPageSeo`, which uploads it
 * server-side and triggers the agent. Everything else (company, website, type)
 * rides along from the profile.
 *
 * The `<dialog>` + `showModal()` approach is the house pattern.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import {
  configureOffPageSeo,
  type AgentConfigureResult,
} from "@/app/(app)/agents/[agentId]/actions";

export function OffPageSeoConfigure({
  mailbox,
  autoOpen = false,
  label = "Set up",
  className = AGENT_ROW_ACTION,
  icon,
}: {
  mailbox: ConnectedMailbox | null;
  /** True when the page was reached with `?configure=` naming this agent
      (the top menu's Run agent button): opens the popup on arrival. */
  autoOpen?: boolean;
  /** The row's verb, from `agent-row-status.ts`: "Set up" or "Open". */
  label?: string;
  /** The trigger's classes; the row picks one from its state. */
  className?: string;
  /** Rendered before the label on the trigger. */
  icon?: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AgentConfigureResult | null>(null);

  // The page behind a modal must not scroll; see the hook for what
  // `showModal()` does and does not give us.
  useScrollLock(open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function openDialog() {
    setResult(null);
    setOpen(true);
  }

  // Opened from the top menu (`?configure=`): open on arrival, then drop the
  // parameter so a refresh does not reopen it. On `autoOpen`, not on mount,
  // so it also opens when the menu is used from the Agents page itself.
  useEffect(() => {
    if (!autoOpen) return;
    openDialog();
    router.replace(window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult(null);
    const formData = new FormData(event.currentTarget);
    try {
      setResult(await configureOffPageSeo(formData));
    } catch {
      setResult({ ok: false, message: "We couldn't complete that just now. Please try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        suppressHydrationWarning
        className={className}
      >
        {icon}
        {label}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        // While a run is in flight the popup holds still: closing it would
        // hide the only sign the run is happening, and its answer would land
        // on a closed dialog that the next open wipes.
        onCancel={(e) => {
          if (pending && e.target === e.currentTarget) e.preventDefault();
        }}
        onClick={(e) => {
          if (!pending && e.target === dialogRef.current) setOpen(false);
        }}
        aria-labelledby="off-page-seo-title"
        className="w-[min(34rem,calc(100vw-2rem))] rounded-lg border border-border bg-ground p-0 text-ink shadow-lg backdrop:bg-ink/50"
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="off-page-seo-title" className="text-base font-bold text-ink">
                Configure Off-Page SEO
              </h2>
              <p className="mt-0.5 text-sm text-ink-soft">
                It earns category citations and monitors branded mentions. Add a product or service
                document if you have one — everything else comes from your profile.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              aria-label="Close"
              suppressHydrationWarning
              className="-mr-2 -mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-soft transition hover:bg-surface-raised hover:text-ink disabled:pointer-events-none disabled:opacity-50"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {result?.ok ? (
            <div className="mt-5 flex flex-col gap-4">
              <div className="rounded-lg bg-good-soft px-4 py-3 text-sm text-good" role="status">
                <span className="font-medium">Agent started.</span> {result.message}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  suppressHydrationWarning
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
                >
                  Done
                </button>
              </div>
            </div>
          ) : mailbox === null ? (
            /* The Server Action refuses this agent without a mailbox, so the
               form is not offered at all. Leaving it usable would invite
               someone to fill it in and upload a file before being told no. */
            <div className="mt-5">
              <EmailGateNotice agentName="Off-Page SEO" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
              <label className="block">
                <span className="mb-1 block text-sm text-ink">
                  Product / Service document{" "}
                  <span className="text-ink-soft">(optional, .pdf)</span>
                </span>
                <CheckedFileInput
                  name="companyDoc"
                  kind="pdf-document"
                  disabled={pending}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-surface-raised file:px-3 file:py-1 file:text-sm file:text-ink disabled:opacity-50"
                />
              </label>

              <MailboxNote mailbox={mailbox} label="Connected mailbox:" />

              {result && !result.ok && (
                <p role="alert" className="rounded-lg bg-crit-soft px-3 py-2 text-sm text-crit">
                  {result.message}
                </p>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  suppressHydrationWarning
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-raised disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  suppressHydrationWarning
                  aria-busy={pending}
                  className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition disabled:opacity-50 hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
                >
                  {pending && <Spinner />}
                  {pending ? "Starting…" : "Run Off-Page SEO"}
                </button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
