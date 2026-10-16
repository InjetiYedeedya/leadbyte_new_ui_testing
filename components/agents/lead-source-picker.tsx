"use client";

/**
 * Where the leads file comes from: a picked file, or the account's own
 * ad-captured leads.
 *
 * ## Why this earns `"use client"`
 *
 * Switching sources changes which input the form even has — a plain radio
 * input alone cannot swap a file input for a summary and a link.
 *
 * ## Why picking leads is a link, not a checklist here
 *
 * An account can have hundreds of ad-captured leads, and this component
 * renders inside a 36rem popup or a setup form — neither has room for that
 * many checkboxes. Picking happens on its own page,
 * `/agents/[agentId]/leads`, which `AdsLeadsSelector` owns; this component
 * only shows how many are currently selected and links there. The count
 * comes from the server as `adsSummary` (computed by `adsLeadsSummary`) —
 * no client fetch, because both the leads table and the saved selection are
 * cookie/session reads that only the server can do.
 *
 * ## Why an empty result still lets the form submit
 *
 * The account may genuinely have no ads leads yet, and the Server Action
 * already answers that case with its own honest message
 * ("No leads found from your ad campaigns yet…") if someone submits anyway.
 * Disabling the button here would duplicate that check in two places and
 * risk them disagreeing about what "empty" means.
 */

import { CheckedFileInput } from "@/components/ui/checked-file-input";
import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "@/components/ui/app-link";

export type LeadSource = "upload" | "ads";

export function LeadSourcePicker({
  disabled = false,
  adsSummary,
}: {
  disabled?: boolean;
  /** How many of the account's ad-captured leads exist, and how many are
      currently selected to actually be qualified. */
  adsSummary: { total: number; selected: number };
}) {
  const [source, setSource] = useState<LeadSource>("upload");
  const pathname = usePathname();
  // On `/agents` this renders inside the "Configure" popup, which is plain
  // component state — gone the moment the page navigates to the leads picker
  // and back. Asking to return with `?configure=lead-qualification` is what
  // reopens it; see the doc comment on `LeadQualificationConfigure`. The
  // detail-page setup form has no popup to reopen, so it just returns to
  // itself.
  const returnTo = pathname === "/agents" ? "/agents?configure=lead-qualification" : pathname;
  const adsLeadsHref = `/agents/lead-qualification/leads?from=${encodeURIComponent(returnTo)}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["upload", "Upload a file"],
            ["ads", "Use my ads leads"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm ${
              source === value ? "text-ink" : "text-ink-soft"
            }`}
          >
            <input
              type="radio"
              name="leadSource"
              value={value}
              checked={source === value}
              disabled={disabled}
              onChange={() => setSource(value)}
              suppressHydrationWarning
            />
            {label}
          </label>
        ))}
      </div>

      {source === "upload" ? (
        <label className="block">
          <span className="mb-1 block text-sm text-ink">
            Lead database <span className="text-ink-soft">(.csv, .xlsx or .xls)</span>
          </span>
          {/* Checked on pick, by name AND content (`file-check.ts`). */}
          <CheckedFileInput
            name="leadDatabase"
            kind="lead-database"
            required
            disabled={disabled}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-surface-raised file:px-3 file:py-1 file:text-sm file:text-ink disabled:opacity-50"
          />
        </label>
      ) : adsSummary.total === 0 ? (
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <p className="text-sm text-ink-soft">
            No leads found from your ad campaigns yet. Switch to &quot;Upload a file&quot;
            instead.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised p-4">
          <p className="text-sm text-ink">
            {adsSummary.selected} of {adsSummary.total} leads selected
            {adsSummary.selected === 0 && (
              <span className="ml-2 text-warn">— pick at least one</span>
            )}
          </p>
          <Link
            href={adsLeadsHref}
            className="text-sm font-medium text-accent hover:text-accent-ink"
          >
            Choose leads →
          </Link>
        </div>
      )}
    </div>
  );
}
