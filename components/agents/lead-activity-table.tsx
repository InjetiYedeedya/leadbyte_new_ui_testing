"use client";

/**
 * The Lead Qualification dashboard: what the agent did, per lead.
 *
 * A thin client wrapper declaring `DataTable`'s columns — the rows are fetched
 * on the server from `leadbyte_lead_activity` and arrive as a prop. Same shape
 * as `page-table.tsx` and `campaign-table.tsx`.
 *
 * This is the first agent whose activity is real rather than fixture data. The
 * empty state says which silence it is: an account that has never run it, and
 * one whose rows simply have not landed, are different situations.
 *
 * ## Stopping one recipient
 *
 * When a campaign is running, each row gets a Stop control
 * (`/api/campaigns/{job}/recipients/cancel`). It is per row rather than a bulk
 * selection because the reason to use it is always about one person — a bad
 * address, a customer who asked to be left alone — and because it cannot be
 * undone for that recipient.
 *
 * The column is absent entirely when nothing is running: a Stop button beside a
 * finished send is an offer we cannot honour.
 */

import { useState, useTransition } from "react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatCount } from "@/lib/format";
import type { ControlResult } from "@/lib/data/campaign-controls";
import type { LeadActivity } from "@/lib/data/lead-qualification";
import { Spinner } from "@/components/ui/spinner";
import { humaniseOr } from "@/lib/data/labels";

/** The marker a successful stop leaves in `stopped`; any other value is a refusal's reason. */
const STOPPED = "__stopped__";

const COLUMNS: Column<LeadActivity>[] = [
  {
    key: "leadEmail",
    header: "Lead",
    cell: (row) => (
      <span className="block max-w-[18rem] truncate" title={row.leadEmail}>
        {row.leadEmail}
      </span>
    ),
    sortValue: (row) => row.leadEmail,
  },
  {
    key: "status",
    header: "Status",
    // A failed send is the one thing worth colouring: it is the row someone has
    // to do something about. Every other value is whatever the outreach log
    // wrote — `EMAIL_SENT`, `in_progress` — so it is labelled, not printed.
    cell: (row) =>
      row.failed ? (
        <Badge variant="connection-not-connected">failed</Badge>
      ) : (
        <span className="text-ink">{humaniseOr(row.status)}</span>
      ),
    sortValue: (row) => (row.failed ? "zzz-failed" : row.status),
  },
  {
    key: "opens",
    header: "Opens",
    cell: (row) => formatCount(row.opens),
    sortValue: (row) => row.opens,
    numeric: true,
  },
  {
    key: "updatedAt",
    header: "Last activity",
    cell: (row) => row.updatedAt.slice(0, 10) || "—",
    sortValue: (row) => row.updatedAt,
    secondary: true,
  },
];

export function LeadActivityTable({
  rows,
  onStopRecipient,
}: {
  rows: LeadActivity[];
  /** Absent when no campaign is running — the Stop column is then not shown. */
  onStopRecipient?: (emails: string[]) => Promise<ControlResult>;
}) {
  const [stopped, setStopped] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const columns: Column<LeadActivity>[] = onStopRecipient
    ? [
        ...COLUMNS,
        {
          key: "stop",
          header: "",
          // Not sortable: it is a control, not a value.
          cell: (row) => {
            // Only a stop that worked replaces the button. A refusal keeps it,
            // with the reason beside it, so it can be pressed again — a grey
            // "couldn't stop" in place of the control was a dead end.
            if (stopped[row.leadEmail] === STOPPED) {
              return <span className="text-xs text-ink-soft">stopped</span>;
            }
            const failure = stopped[row.leadEmail];

            return (
              <span className="inline-flex items-center gap-2">
                {failure && (
                  <span role="status" className="text-xs text-crit">
                    {failure}
                  </span>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setBusy(row.leadEmail);
                    startTransition(async () => {
                      const result = await onStopRecipient([row.leadEmail]);
                      setStopped((current) => ({
                        ...current,
                        [row.leadEmail]: result.ok
                          ? STOPPED
                          : result.message || "Couldn't stop. Try again.",
                      }));
                      setBusy(null);
                    });
                  }}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-ink-soft transition-colors hover:bg-surface-raised hover:text-crit active:scale-[0.98] disabled:opacity-60 motion-reduce:transform-none"
                >
                  {busy === row.leadEmail && <Spinner />}
                  {busy === row.leadEmail ? "Stopping…" : failure ? "Try again" : "Stop"}
                </button>
              </span>
            );
          },
        },
      ]
    : COLUMNS;

  return (
    <DataTable
      rows={rows}
      columns={columns}
      // Not the email alone: one lead can be in two campaigns, and duplicate
      // keys made an expanded row open the wrong one (audit, 2026-09-29).
      rowKey={(row) => row.rowId}
      // Both spellings: the screen says "Email sent" and the row says
      // `EMAIL_SENT`, and someone typing either should find it.
      searchText={(row) => `${row.leadEmail} ${row.status} ${humaniseOr(row.status)}`}
      searchPlaceholder="Filter leads…"
      initialSort={{ key: "updatedAt", direction: "desc" }}
      caption="Per-lead outreach activity"
      empty={
        <EmptyState
          title="No outreach yet"
          description="Once the agent has worked through your leads, every send, open and failure appears here."
        />
      }
    />
  );
}
