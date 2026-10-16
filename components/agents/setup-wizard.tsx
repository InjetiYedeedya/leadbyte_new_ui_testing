"use client";

/**
 * A one-question-at-a-time wrapper for a setup form.
 *
 * ## Why it earns `"use client"`
 *
 * Which step is showing is state, and Back/Next are event handlers. Nothing
 * else here is interactive — the fields themselves are server-rendered and
 * passed in as children, so this component knows nothing about them.
 *
 * ## Every step stays MOUNTED
 *
 * Hidden with the `hidden` attribute, never unmounted. A `<form>` submits the
 * inputs that are in the DOM, so unmounting step one on the way to step two
 * would quietly drop everything typed there — and the server would report the
 * fields as missing, which reads as a validation bug rather than a lost page.
 * Hiding costs nothing: a hidden input still posts.
 *
 * ## Next checks the step it is leaving
 *
 * It used not to, and that made the last button dead: a `required` field left
 * empty on an earlier step is `hidden` by the time Launch is pressed, and the
 * browser refuses to submit a form whose invalid field it cannot focus —
 * silently, with no message at all (audit, 2026-09-29). So Next reports the
 * current step's problems with the browser's own message, and a submit that
 * still finds one jumps back to that field's step and shows it there. The
 * server still validates the whole form on submit.
 */

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { SubmitButton } from "@/components/ui/submit-button";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** The first control in `root` that fails the browser's own constraints. */
function firstInvalid(root: HTMLElement | null): Field | null {
  if (!root) return null;
  const fields = root.querySelectorAll<Field>("input, select, textarea");
  for (const field of fields) {
    if (!field.disabled && !field.checkValidity()) return field;
  }
  return null;
}

export function SetupWizard({
  labels,
  submitLabel,
  children,
}: {
  /** One per step, in order. Must match the number of children. */
  labels: readonly string[];
  submitLabel: string;
  children: ReactNode;
}) {
  const steps = Children.toArray(children);
  const [current, setCurrent] = useState(0);
  const last = steps.length - 1;
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  /** A field to show its message once its step is visible again. */
  const reportAfterShow = useRef<Field | null>(null);

  useEffect(() => {
    const field = reportAfterShow.current;
    if (field) {
      reportAfterShow.current = null;
      field.reportValidity();
    }
  }, [current]);

  const goNext = () => {
    const problem = firstInvalid(stepRefs.current[current] ?? null);
    if (problem) {
      problem.reportValidity();
      return;
    }
    setCurrent((n) => Math.min(last, n + 1));
  };

  return (
    <div
      className="flex flex-col gap-5"
      // A submit that finds an invalid field on a hidden step: go there and
      // show it. `invalid` does not bubble, so this listens in the capture phase.
      onInvalidCapture={(event) => {
        const target = event.target as Field;
        const step = stepRefs.current.findIndex((node) => node?.contains(target));
        if (step >= 0 && step !== current) {
          reportAfterShow.current = target;
          setCurrent(step);
        }
      }}
    >
      <div>
        <p className="text-xs font-medium text-ink-soft">
          Step {current + 1} of {steps.length}
        </p>
        <h3 className="mt-0.5 text-base font-bold text-ink">{labels[current]}</h3>
      </div>

      {/* A thin strip rather than a second row of labels: the page already has
          the flow's own step bar above it, and two competing strips make it
          unclear which one is being walked. */}
      <div className="flex gap-1.5" aria-hidden="true">
        {steps.map((_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= current ? "bg-accent" : "bg-border"
            }`}
          />
        ))}
      </div>

      {steps.map((step, i) => (
        // `hidden`, not unmounted — see the note above.
        <div
          key={i}
          hidden={i !== current}
          ref={(node) => {
            stepRefs.current[i] = node;
          }}
        >
          {step}
        </div>
      ))}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setCurrent((n) => Math.max(0, n - 1))}
          disabled={current === 0}
          suppressHydrationWarning
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-raised disabled:opacity-40"
        >
          Back
        </button>

        {current < last ? (
          // `type="button"`, or Enter on any field would submit a form the
          // customer has not finished.
          <button
            type="button"
            onClick={goNext}
            suppressHydrationWarning
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition-transform active:scale-[0.98] motion-reduce:transform-none"
          >
            Next
          </button>
        ) : (
          // A SubmitButton: the launch is a slow agent call, and a plain
          // submit gave no sign anything had happened.
          <SubmitButton
            pendingLabel="Asking the agent…"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition-transform active:scale-[0.98] motion-reduce:transform-none"
          >
            {submitLabel}
          </SubmitButton>
        )}
      </div>
    </div>
  );
}
