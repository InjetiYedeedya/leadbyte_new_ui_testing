"use client";

import { CheckedFileInput } from "@/components/ui/checked-file-input";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { AGENT_ROW_ACTION } from "@/components/agents/row-action";
import { MailboxNote } from "@/components/agents/mailbox-note";
import { EmailGateNotice } from "@/components/agents/email-gate-notice";
import type { ConnectedMailbox } from "@/lib/data/email-callback";

/**
 * "Configure" — Lead Qualification's setup and run, in a popup on the agents
 * list. A client island: it is open/close state plus a form whose result is
 * shown in place, so it never navigates away (unlike the detail-page form,
 * which redirects to the activity view).
 *
 * It collects the same three things the detail-page form does — a leads file,
 * an optional product document, and an optional outreach template — and hands
 * them to `configureLeadQualification`, which uploads server-side and triggers
 * the agent. The files never leave the browser except through that Server
 * Action's presigned upload; nothing is stored client-side.
 *
 * The `<dialog>` + `showModal()` approach is the house pattern
 * (`connect-google.tsx`, `connect-email.tsx`) — it gives focus trapping,
 * Escape-to-close and the backdrop for free.
 *
 * ## Reopening after "Choose leads"
 *
 * Picking ads leads happens on its own page (`lead-source-picker.tsx`), which
 * means leaving this popup and coming back — and the popup's open/closed
 * state is plain `useState`, gone the moment the page navigates away. So the
 * "leads" page's Server Action sends the browser back to
 * `/agents?configure=lead-qualification` rather than bare `/agents`, and
 * `autoOpen` (read from that query param by the server page) reopens this
 * dialog on arrival — the same `?created=1`-on-mount pattern
 * `campaign-created-dialog.tsx` uses, including scrubbing the query param
 * straight after so a refresh does not reopen it a second time.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  configureLeadQualification,
  writeOutreachTemplate,
  templateToHtml,
  type LeadQualResult,
} from "@/app/(app)/agents/[agentId]/actions";
import { LeadSourcePicker } from "@/components/agents/lead-source-picker";
import { TemplateWriter } from "@/components/agents/template-writer";
import { TemplateHtml } from "@/components/agents/template-html";
import { Spinner } from "@/components/ui/spinner";

export function LeadQualificationConfigure({
  mailbox,
  adsSummary,
  autoOpen = false,
  label = "Set up",
  className = AGENT_ROW_ACTION,
  icon,
}: {
  /** The row's verb, from `agent-row-status.ts`: "Set up" or "Open". */
  label?: string;
  /**
   * The mailbox outreach goes out from, or null when none is connected.
   *
   * A type-only import, so `email-callback.ts` (which reads cookies) never
   * follows this island into the browser bundle.
   */
  mailbox: ConnectedMailbox | null;
  /** How many ad-captured leads exist and how many are currently selected —
      see `lib/data/lead-selection.ts`. */
  adsSummary: { total: number; selected: number };
  /** True when the page was reached with `?configure=lead-qualification` —
      see the doc comment above for why that happens. */
  autoOpen?: boolean;
  /** The trigger's classes. Defaults to the Agents row's action style; the
      dashboard header passes its own so the SAME dialog opens from both. */
  className?: string;
  /** Rendered before the label on the trigger. */
  icon?: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<LeadQualResult | null>(null);
  // Controlled, so "Write it for me" can fill it in — an uncontrolled textarea
  // cannot be written to from outside without reaching into the DOM.
  const [template, setTemplate] = useState("");
  // The HTML version, when the customer has formatted it. While set, this is
  // what leads receive; any edit to the plain text below drops it as stale.
  const [htmlTemplate, setHtmlTemplate] = useState<string | null>(null);

  // A plain-text edit invalidates any HTML formatted from the old text — the
  // two would otherwise disagree about what actually sends.
  function editTemplate(next: string) {
    setTemplate(next);
    setHtmlTemplate(null);
  }

  // The page behind a modal must not scroll; see the hook for what
  // `showModal()` does and does not give us.
  useScrollLock(open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Drop `?configure=lead-qualification` once it has done its job — a
  // refresh or the back button must not reopen this a second time.
  // On `autoOpen` rather than on mount (2026-10-14): the top menu's Run agent
  // sends `?configure=` while the Agents page may already be on screen, and
  // then this island is not mounted again — it only gets the new prop.
  useEffect(() => {
    if (!autoOpen) return;
    setOpen(true);
    router.replace(window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  // Every open starts clean — a previous run's success or error should not be
  // waiting behind the button.
  function openDialog() {
    setResult(null);
    setTemplate("");
    setHtmlTemplate(null);
    setOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult(null);
    const formData = new FormData(event.currentTarget);
    // When the template has been formatted, the HTML is the email — send it in
    // place of the plain text the textarea carries.
    if (htmlTemplate) formData.set("emailTemplate", htmlTemplate);
    try {
      const outcome = await configureLeadQualification(formData);
      setResult(outcome);
    } catch {
      // A thrown error here is our plumbing, not the agent — a network drop
      // mid-upload. The run may or may not have started; say so plainly.
      setResult({
        ok: false,
        message: "We couldn't complete that just now. Please try again.",
      });
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
        aria-labelledby="lead-qual-configure-title"
        className="w-[min(36rem,calc(100vw-2rem))] rounded-lg border border-border bg-ground p-0 text-ink shadow-lg backdrop:bg-ink/50"
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="lead-qual-configure-title" className="text-base font-bold text-ink">
                Configure Lead Qualification
              </h2>
              <p className="mt-0.5 text-sm text-ink-soft">
                Give it your leads and it scores them against your closed-won pattern. Company name,
                website and business type come from your profile.
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
              {/* What the mail service flagged about this run — a lead list cut
                  short, say. It reported these for days with nobody shown them. */}
              {result.warnings && result.warnings.length > 0 && (
                <div className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-ink">
                  <p className="font-medium text-warn">Worth checking</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-soft">
                    {result.warnings.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
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
              <EmailGateNotice agentName="Lead Qualification" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <LeadSourcePicker disabled={pending} adsSummary={adsSummary} />

                <label className="block">
                  <span className="mb-1 block text-sm text-ink">
                    Product or service document{" "}
                    <span className="text-ink-soft">(optional, .pdf — helps it qualify accurately)</span>
                  </span>
                  <CheckedFileInput
                    name="companyDoc"
                    kind="pdf-document"
                    disabled={pending}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-surface-raised file:px-3 file:py-1 file:text-sm file:text-ink disabled:opacity-50"
                  />
                </label>
              </div>

              {/* Which mailbox the outreach goes out from. This agent really
                  does email the leads it scores, so "Sends from" is a fact
                  here — and having no mailbox genuinely stops it. */}
              <MailboxNote
                mailbox={mailbox}
                label="Sends from"
                missing="No mailbox connected — the agent can only score these leads, not email them."
              />

              <label className="block">
                <span className="mb-1 block text-sm text-ink">Outreach email template</span>
                <textarea
                  name="emailTemplate"
                  rows={3}
                  value={template}
                  onChange={(event) => editTemplate(event.target.value)}
                  disabled={pending}
                  placeholder="Leave blank and the agent writes one. Use {{name}} and {{company}} for the lead's details."
                  suppressHydrationWarning
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent disabled:opacity-50"
                />
              </label>

              {/* Document mode is deliberately not offered: it needs a file
                  already uploaded, and the product document in this form has
                  not been sent anywhere yet when this button is pressed. */}
              <TemplateWriter
                disabled={pending}
                onWrite={writeOutreachTemplate}
                onGenerated={editTemplate}
              />

              {/* Optional: turn the plain text into an HTML email and preview
                  it. Formatting makes the HTML what leads receive; editing the
                  text above drops it, so the two can never disagree. */}
              <TemplateHtml
                template={template}
                html={htmlTemplate}
                disabled={pending}
                onFormat={templateToHtml}
                onHtml={setHtmlTemplate}
              />

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
                  {pending ? "Starting…" : "Qualify these leads"}
                </button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
