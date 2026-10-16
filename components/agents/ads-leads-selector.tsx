"use client";

/**
 * The full-page checklist for `/agents/[agentId]/leads` — picking which
 * ad-captured leads the Lead Qualification agent should qualify and email.
 *
 * ## Why this is its own page, not part of the "Configure" popup
 *
 * The popup and the detail-page setup form both top out around 36rem wide
 * and a few hundred pixels tall; an account can have hundreds of ad leads,
 * and a five-row preview inside a modal cannot be how someone actually
 * chooses who gets emailed. This page has the room a checklist that size
 * needs, and it is reachable from both places via `LeadSourcePicker`'s
 * "Choose leads" link.
 *
 * ## Why this earns `"use client"`
 *
 * Checking and unchecking rows, plus "Select all" / "Clear", are per-row
 * state a plain form cannot express on its own — but the SAVE itself is a
 * real `<form action={action}>` to a Server Action, because saving means
 * leaving this page (back to wherever `from` points), and a Server Action
 * with `redirect()` is exactly what that is.
 */

import { useState } from "react";
import Link from "@/components/ui/app-link";
import { SubmitButton } from "@/components/ui/submit-button";
import { PendingLink } from "@/components/ui/pending-link";

export interface SelectableLead {
  id: string;
  name: string;
  email: string;
}

export function AdsLeadsSelector({
  leads,
  initiallySelected,
  from,
  action,
}: {
  leads: SelectableLead[];
  /** Ids already saved from a previous visit, or every id when nothing has
      been saved yet — see `lib/data/lead-selection.ts` for why those two
      cases must be told apart before this component ever sees them. */
  initiallySelected: string[];
  from: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initiallySelected));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 text-sm text-ink-soft">
        No leads found from your ad campaigns yet.{" "}
        <Link href={from} className="font-medium text-accent hover:text-accent-ink">
          Go back
        </Link>{" "}
        and upload a file instead.
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="from" value={from} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <p className="text-sm text-ink">
          {selected.size} of {leads.length} selected
        </p>
        <div className="flex gap-4 text-sm font-medium text-accent">
          <button
            type="button"
            onClick={() => setSelected(new Set(leads.map((lead) => lead.id)))}
            className="hover:text-accent-ink"
          >
            Select all
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="hover:text-accent-ink">
            Clear
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
          {leads.map((lead) => (
            <li key={lead.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-4 text-sm text-ink hover:bg-surface-raised">
                <input
                  type="checkbox"
                  name="leadIds"
                  value={lead.id}
                  checked={selected.has(lead.id)}
                  onChange={() => toggle(lead.id)}
                />
                <span className="truncate">
                  {lead.name || lead.email}
                  {lead.name && ` · ${lead.email}`}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      {selected.size === 0 && (
        <p className="text-sm text-warn">
          Nothing is selected — the agent will have no leads to qualify until you pick at least
          one.
        </p>
      )}

      <div className="flex justify-end gap-3">
        <PendingLink
          href={from}
          className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-raised active:scale-[0.98] motion-reduce:transform-none"
        >
          Cancel
        </PendingLink>
        <SubmitButton
          pendingLabel="Saving…"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink"
        >
          Use these leads
        </SubmitButton>
      </div>
    </form>
  );
}
