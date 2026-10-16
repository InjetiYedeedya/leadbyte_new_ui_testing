"use client";

/**
 * A submit button that asks first.
 *
 * ## Why this earns `"use client"`
 *
 * A confirmation is a dialog — open/closed state, focus, Escape — sitting
 * between a click and a Server Action. The action itself is untouched: this
 * renders inside the `<form action={…}>` and, on confirm, calls the form's
 * `requestSubmit()`, which runs React's submit path exactly as the button
 * would have. `form.submit()` would skip it, and the Server Action with it.
 *
 * For removals and revocations only. The legacy panel used `window.confirm`,
 * which cannot be styled, names no consequence and blocks the whole tab.
 */

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { Spinner } from "@/components/ui/spinner";

export function ConfirmSubmit({
  children,
  title,
  body,
  confirmLabel,
  pendingLabel,
  className = "",
  tone = "crit",
}: {
  children: React.ReactNode;
  title: string;
  body: string;
  confirmLabel: string;
  pendingLabel: string;
  className?: string;
  tone?: "crit" | "accent";
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const { pending } = useFormStatus();
  const titleId = useId();

  useScrollLock(open);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  function confirm() {
    setOpen(false);
    trigger.current?.form?.requestSubmit();
  }

  const confirmStyle =
    tone === "crit" ? "bg-crit text-surface hover:opacity-90" : "bg-accent text-surface hover:bg-accent-ink";

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        aria-busy={pending}
        suppressHydrationWarning
        className={`inline-flex items-center gap-2 transition disabled:opacity-70 ${className}`}
      >
        {pending && <Spinner />}
        {pending ? pendingLabel : children}
      </button>

      <dialog
        ref={dialog}
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === dialog.current) setOpen(false);
        }}
        aria-labelledby={titleId}
        className="w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-ground p-0 text-ink shadow-lg backdrop:bg-ink/50"
      >
        <div className="p-4 text-left">
          <h2 id={titleId} className="text-base font-bold text-ink">
            {title}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">{body}</p>
          <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              autoFocus
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-raised"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              className={`rounded-md px-4 py-2 text-sm font-medium transition active:scale-[0.98] motion-reduce:transform-none ${confirmStyle}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
