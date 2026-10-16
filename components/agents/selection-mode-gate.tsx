"use client";

/**
 * The last question the setup form asks: how much may the agent do on its own?
 *
 * ## Why it is a dialog and not another field
 *
 * It is not part of the campaign brief — every other field on that form
 * describes WHAT to advertise, and this one grants authority. Sitting it among
 * the budget and audience fields would make "how much should this thing spend"
 * and "may it spend without asking me" the same kind of question, answered with
 * the same weight, three screens' worth of scrolling apart. Asked on submit, it
 * is the last thing the customer reads before anything is sent.
 *
 * ## Why it earns `"use client"`
 *
 * A modal is open/close state and focus management, and the choice has to be
 * held before it can be written into the form. The submit itself is still the
 * form's own Server Action — this intercepts the click, collects one answer,
 * writes it into a hidden field and lets the form go.
 *
 * ## The submit path, and why `requestSubmit`
 *
 * `form.submit()` would bypass React and the Server Action entirely — a plain
 * browser POST to nowhere. `requestSubmit()` fires the same submit event a
 * click on the button does, which is what the action is attached to.
 */

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { SELECTION_MODES, type SelectionMode } from "@/lib/data/selection-mode";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { Spinner } from "@/components/ui/spinner";

export function SelectionModeGate({ label = "Create campaign" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SelectionMode | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const { pending } = useFormStatus();

  useScrollLock(open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function confirm() {
    if (!mode) return;
    const input = hiddenRef.current;
    if (!input) return;
    input.value = mode;
    setOpen(false);
    // The form this button lives in — its Server Action does the rest.
    input.form?.requestSubmit();
  }

  return (
    <>
      {/* Written by the dialog, read by the Server Action. Empty until a
          choice is made, and `readSelectionMode` treats empty as "ask". */}
      <input ref={hiddenRef} type="hidden" name="selectionMode" defaultValue="" />

      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        suppressHydrationWarning
        className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-50 transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
      >
        {pending && <Spinner />}
        {pending ? "Creating…" : label}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) setOpen(false);
        }}
        aria-labelledby="selection-mode-title"
        className="w-[min(34rem,calc(100vw-2rem))] rounded-lg border border-border bg-ground p-0 text-ink shadow-lg backdrop:bg-ink/50"
      >
        <div className="p-4">
          <h2 id="selection-mode-title" className="text-base font-bold text-ink">
            Suggestion delivery mode
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            Choose how the agent should handle this campaign. This is required to continue.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {SELECTION_MODES.map((option) => (
              <label
                key={option.value}
                className="cursor-pointer rounded-lg border border-border p-4 transition-colors hover:bg-surface-raised has-[:checked]:border-accent has-[:checked]:bg-accent/5"
              >
                <input
                  type="radio"
                  // NOT `selectionMode`: that name belongs to the hidden field
                  // this dialog writes. Two inputs sharing it would post two
                  // values, and the loser would be decided by DOM order.
                  name="selectionModeChoice"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => setMode(option.value)}
                  suppressHydrationWarning
                  className="mr-2 accent-accent"
                />
                <span className="text-sm font-medium text-ink">{option.label}</span>
                <span className="mt-1 block text-sm text-ink-soft">{option.description}</span>
              </label>
            ))}
          </div>

          <p className="mt-4 rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
            {mode === "auto"
              ? "The agent will build and create the campaign from here. You will not be asked again."
              : mode === "ask"
                ? "You will see the agent's plan next, and nothing runs until you approve it."
                : "Pick one to continue."}
          </p>

          <div className="mt-5 flex items-center justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              suppressHydrationWarning
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-raised"
            >
              Back
            </button>
            <button
              type="button"
              onClick={confirm}
              // Not a submit button: the dialog lives inside the form, and a
              // submit here would post without the check that a mode was
              // chosen at all.
              disabled={mode === null || pending}
              suppressHydrationWarning
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-50 transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
            >
              {pending && <Spinner />}
              {pending ? "Creating…" : "Create campaign"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
