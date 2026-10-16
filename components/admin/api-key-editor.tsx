"use client";

/**
 * "Set key" / "Change key" on one API-key card.
 *
 * ## Why this earns `"use client"`
 *
 * Open or closed: the password field only appears once someone asks to change
 * the key, and Cancel has to put it away without submitting. The save itself
 * is an ordinary `<form action={saveApiKey}>` — the value goes to the Server
 * Action and on to the Lambda, and nothing here keeps it.
 */

import { useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveApiKey } from "@/app/(app)/admin/(panel)/actions";

export function ApiKeyEditor({ keyName, label, hasValue }: { keyName: string; label: string; hasValue: boolean }) {
  const [open, setOpen] = useState(false);
  const inputId = `api-key-${keyName}`;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        suppressHydrationWarning
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-raised"
      >
        {hasValue ? "Change key" : "Set key"}
      </button>
    );
  }

  return (
    <form action={saveApiKey} className="flex w-full flex-col gap-2">
      <input type="hidden" name="keyName" value={keyName} />
      <label htmlFor={inputId} className="text-xs font-medium text-ink-soft">
        New {label}
      </label>
      <input
        id={inputId}
        name="keyValue"
        type="password"
        required
        autoFocus
        autoComplete="off"
        spellCheck={false}
        suppressHydrationWarning
        className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-ink outline-none transition-colors focus:border-accent"
      />
      <div className="flex gap-2">
        <SubmitButton
          pendingLabel="Saving…"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface transition hover:bg-accent-ink"
        >
          Save &amp; sync
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-raised"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
