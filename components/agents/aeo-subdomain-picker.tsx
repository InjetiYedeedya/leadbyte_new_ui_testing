"use client";

/**
 * The subdomain choice, before any audit has started.
 *
 * ## Why it is a modal over the form, not a page of its own
 *
 * Nothing has been committed at this point. The service found some hostnames
 * and started nothing — the whole reason that response is separate is that the
 * customer gets to decide first. A navigation would make a discovery feel like
 * a step already taken; a modal over the form they just filled in is what it
 * actually is.
 *
 * ## Why it earns `"use client"`
 *
 * Open/close state, a set of checkboxes held before it can be submitted, and
 * the focus and Escape handling that `showModal()` provides. The submit itself
 * is still the form's own Server Action — this collects an answer, writes it
 * into a hidden field and lets the form go. `requestSubmit()` and not
 * `form.submit()`, which would bypass React and the action entirely.
 *
 * ## Three rules from the integration contract, all visible here
 *
 * - **Nothing is pre-checked.** The default is the main site alone.
 * - **The main domain is never a checkbox.** It is always audited; offering it
 *   would imply it could be left out.
 * - **Continue is always enabled.** An empty selection is a real answer, not
 *   an unfinished form, so there is no separate "skip" — it would be a second
 *   button meaning the same thing.
 */

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/ui/spinner";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { confirmAeoSelectionAction } from "@/app/(app)/agents/aeo/actions";

export function AeoSubdomainPicker({
  domain,
  subdomains,
  autoOpen = false,
}: {
  /** The site the customer asked about, for the title. */
  domain: string;
  /** What the service found. Never includes the main domain. */
  subdomains: string[];
  /** Opened straight away when the form reloads carrying a discovery. */
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [picked, setPicked] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);

  useScrollLock(open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function toggle(host: string) {
    setPicked((current) =>
      current.includes(host) ? current.filter((h) => h !== host) : [...current, host],
    );
  }

  function confirm() {
    const input = hiddenRef.current;
    if (!input) return;
    // A comma-joined list: hostnames cannot contain one, and a single hidden
    // field keeps the dialog's state and the form's field from disagreeing.
    input.value = picked.join(",");
    setSubmitting(true);
    setOpen(false);
    input.form?.requestSubmit();
  }

  const count = subdomains.length;

  return (
    <form action={confirmAeoSelectionAction}>
      <input ref={hiddenRef} type="hidden" name="selected" defaultValue="" />
      <SubmitEnded onEnd={() => setSubmitting(false)} />

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-base font-semibold text-ink">
          We found {count} {count === 1 ? "subdomain" : "subdomains"} on {domain}
        </h2>
        <p className="mt-1 max-w-prose text-sm text-ink-soft">
          Nothing has been audited yet. Choose which of them to include — {domain} itself is
          always audited.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={submitting}
          suppressHydrationWarning
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-ground transition hover:bg-accent-ink disabled:opacity-50 motion-reduce:transition-none"
        >
          {submitting && <Spinner />}
          {submitting ? "Starting…" : "Choose subdomains"}
        </button>
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) setOpen(false);
        }}
        aria-labelledby="aeo-subdomains-title"
        className="w-[min(34rem,calc(100vw-2rem))] rounded-lg border border-border bg-ground p-0 text-ink shadow-lg backdrop:bg-ink/50"
      >
        <div className="p-4">
          <h2 id="aeo-subdomains-title" className="text-base font-bold text-ink">
            We found {count} {count === 1 ? "subdomain" : "subdomains"} on {domain}
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            Each one you pick is audited as a site of its own, with its own score. {domain} is
            always included.
          </p>

          <ul className="mt-4 max-h-[50vh] divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface">
            {subdomains.map((host) => (
              <li key={host}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-raised motion-reduce:transition-none">
                  <input
                    type="checkbox"
                    // Not `selected`: that name belongs to the hidden field
                    // this dialog writes, and two inputs sharing a name post
                    // two values with the winner decided by DOM order.
                    name="subdomainChoice"
                    value={host}
                    checked={picked.includes(host)}
                    onChange={() => toggle(host)}
                    suppressHydrationWarning
                    className="size-4 shrink-0 accent-accent"
                  />
                  <span className="min-w-0 break-all text-sm text-ink">{host}</span>
                </label>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-sm text-ink-soft">
            {picked.length === 0
              ? `Nothing selected — we'll audit ${domain} on its own.`
              : `${picked.length + 1} sites will be audited, each on its own.`}
          </p>

          <div className="mt-5 flex items-center justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              suppressHydrationWarning
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-raised motion-reduce:transition-none"
            >
              Back
            </button>
            <button
              type="button"
              onClick={confirm}
              // Never disabled on an empty selection: picking nothing is a
              // choice, and the copy above already says what it means.
              disabled={submitting}
              suppressHydrationWarning
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-ground transition hover:bg-accent-ink disabled:opacity-50 motion-reduce:transition-none"
            >
              {submitting && <Spinner />}
              {submitting ? "Starting…" : "Run audit"}
            </button>
          </div>
        </div>
      </dialog>
    </form>
  );
}

/**
 * Tells the picker when its form's submit has finished. `submitting` was set
 * on confirm and never cleared, so when the action sent the customer back to
 * this same form with a problem, both buttons stayed on "Starting…" and
 * disabled for good (audit, 2026-09-29). `useFormStatus` must be read from
 * INSIDE the form, which is why this is its own component.
 */
function SubmitEnded({ onEnd }: { onEnd: () => void }) {
  const { pending } = useFormStatus();
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !pending) onEnd();
    was.current = pending;
  }, [pending, onEnd]);
  return null;
}
