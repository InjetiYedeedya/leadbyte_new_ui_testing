"use client";

/**
 * The Activity Log table. `"use client"` only for `DataTable`'s cell renderers;
 * rows arrive mapped and formatted from `lib/admin/activity.ts`.
 */

import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { ActivityEntry } from "@/lib/admin/activity";

const COLUMNS: Column<ActivityEntry>[] = [
  { key: "email", header: "User email", cell: (e) => <span className="whitespace-nowrap">{e.email || "—"}</span>, sortValue: (e) => e.email },
  {
    key: "action",
    header: "Action",
    cell: (e) =>
      e.action === "admin" ? (
        <span className="flex flex-col gap-0.5">
          <Badge variant="neutral">Admin change</Badge>
          {e.detail && <span className="text-xs text-ink-soft">{e.detail}</span>}
        </span>
      ) : e.action === "other" ? (
        <Badge variant="neutral">Other</Badge>
      ) : (
        <Badge variant={e.action === "login" ? "activity-login" : "activity-logout"}>
          {e.action === "login" ? "Login" : "Logout"}
        </Badge>
      ),
    sortValue: (e) => e.action,
  },
  { key: "browser", header: "Browser", cell: (e) => e.browser, sortValue: (e) => e.browser, secondary: true },
  { key: "at", header: "Time (IST)", cell: (e) => <span className="whitespace-nowrap tabular-nums">{e.atLabel}</span>, sortValue: (e) => e.at ?? 0 },
];

export function ActivityTable({ entries, filtered }: { entries: ActivityEntry[]; filtered: boolean }) {
  return (
    <DataTable
      rows={entries}
      columns={COLUMNS}
      rowKey={(e) => e.id}
      searchText={(e) => `${e.email} ${e.detail}`}
      searchPlaceholder="Search by email…"
      initialSort={{ key: "at", direction: "desc" }}
      caption="Activity log"
      empty={
        <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-ink-soft">
          {filtered ? "No entries match this filter." : "No activity logged yet."}
        </p>
      }
    />
  );
}
