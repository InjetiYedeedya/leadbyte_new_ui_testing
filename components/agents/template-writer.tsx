"use client";

/**
 * "Write it for me" — the assistant beside the outreach template box.
 *
 * ## Why it earns `"use client"`
 *
 * It writes into a textarea that is part of a form the customer is still
 * filling in. A `<form action={serverAction}>` would submit and re-render the
 * whole popup, losing the leads file they had already chosen.
 *
 * ## Why the generated text is never written silently
 *
 * `readGeneratedTemplate` returns null for an unreadable reply precisely so a
 * failure cannot blank a draft. This keeps that promise on the other side: the
 * box is only replaced when there is something to replace it with, and the
 * customer keeps whatever they had otherwise.
 *
 * Instructions mode asks for its instructions inline rather than in a second
 * dialog — a modal on top of a modal to type one sentence is a worse trade
 * than a field that appears.
 */

import { useState, useTransition } from "react";
import { Spinner } from "@/components/ui/spinner";
import {
  MODE_HINTS,
  MODE_LABELS,
  TEMPLATE_MODES,
  type TemplateMode,
} from "@/lib/data/email-template";

export function TemplateWriter({
  disabled = false,
  onWrite,
  onGenerated,
}: {
  disabled?: boolean;
  /** The Server Action. Returns the template, or a message saying why not. */
  onWrite: (
    mode: TemplateMode,
    instructions: string,
  ) => Promise<{ template: string | null; message?: string }>;
  /** Called with the generated text, so the parent can fill its textarea. */
  onGenerated: (template: string) => void;
}) {
  const [mode, setMode] = useState<TemplateMode>("business");
  const [instructions, setInstructions] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Document mode needs an uploaded file the popup does not have yet, so it is
  // offered only where that exists — see the note in the parent.
  const modes = TEMPLATE_MODES.filter((m) => m !== "document");

  function write() {
    setNote(null);
    start(async () => {
      const result = await onWrite(mode, instructions.trim());
      if (result.template) {
        onGenerated(result.template);
        setNote("Written. Edit it however you like.");
      } else {
        setNote(result.message ?? "We couldn't write a template just now.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-center gap-2">
        {modes.map((m) => (
          <label
            key={m}
            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm ${
              mode === m ? "text-ink" : "text-ink-soft"
            }`}
          >
            <input
              type="radio"
              name="templateMode"
              value={m}
              checked={mode === m}
              disabled={disabled || pending}
              onChange={() => setMode(m)}
              suppressHydrationWarning
            />
            {MODE_LABELS[m]}
          </label>
        ))}

        <button
          type="button"
          disabled={disabled || pending || (mode === "instructions" && instructions.trim() === "")}
          onClick={write}
          suppressHydrationWarning
          className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-surface transition disabled:cursor-not-allowed disabled:opacity-60 hover:bg-accent-ink disabled:hover:bg-accent active:scale-[0.98] disabled:active:scale-100 motion-reduce:transform-none"
        >
          {pending && <Spinner />}
          {pending ? "Writing…" : "Write it for me"}
        </button>
      </div>

      <p className="mt-1 px-2 text-xs text-ink-soft">{MODE_HINTS[mode]}</p>

      {mode === "instructions" && (
        <textarea
          rows={2}
          value={instructions}
          disabled={disabled || pending}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder="A friendly cold email introducing our offer, with a booking link."
          suppressHydrationWarning
          className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent disabled:opacity-50"
        />
      )}

      {note && (
        <p role="status" className="mt-2 px-2 text-xs text-ink-soft">
          {note}
        </p>
      )}
    </div>
  );
}
