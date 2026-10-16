"use client";

/**
 * The Purchases table. `"use client"` only for `DataTable`'s cell renderers;
 * rows arrive mapped from `lib/admin/purchases.ts`.
 */

import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { PurchaseRow } from "@/lib/admin/purchases";

function Subscription({ row }: { row: PurchaseRow }) {
  if (row.subscription === "active") {
    return (
      <Badge variant="purchase-yes">{row.subscriptionEnd ? `Active until ${row.subscriptionEnd}` : "Active"}</Badge>
    );
  }
  if (row.subscription === "expired") {
    return <Badge variant="request-pending">{row.subscriptionEnd ? `Expired ${row.subscriptionEnd}` : "Expired"}</Badge>;
  }
  return <span className="text-ink-soft">Inactive</span>;
}

const COLUMNS: Column<PurchaseRow>[] = [
  {
    key: "company",
    header: "Company",
    cell: (r) => (
      <div>
        <p className="font-medium text-ink">{r.company || "—"}</p>
        {r.name && <p className="text-xs text-ink-soft">{r.name}</p>}
      </div>
    ),
    sortValue: (r) => (r.company || r.name).toLowerCase(),
  },
  { key: "email", header: "Email", cell: (r) => <span className="whitespace-nowrap">{r.email || "—"}</span>, sortValue: (r) => r.email },
  {
    key: "status",
    header: "Status",
    cell: (r) => (
      <Badge variant={r.purchased ? "purchase-yes" : "purchase-no"}>{r.purchased ? "Purchased" : "No purchase"}</Badge>
    ),
    sortValue: (r) => (r.purchased ? 1 : 0),
  },
  {
    key: "agents",
    header: "Agents purchased",
    cell: (r) =>
      r.agents.length === 0 ? (
        <span className="text-ink-soft">None</span>
      ) : (
        <span className="flex flex-wrap gap-1">
          {r.agents.map((agent) => (
            <Badge key={agent} variant="neutral">{agent}</Badge>
          ))}
        </span>
      ),
    sortValue: (r) => r.agents.length,
  },
  { key: "subscription", header: "Subscription", cell: (r) => <Subscription row={r} />, sortValue: (r) => r.subscriptionEndAt ?? 0, secondary: true },
  { key: "joined", header: "Joined (IST)", cell: (r) => <span className="whitespace-nowrap">{r.joinedLabel}</span>, sortValue: (r) => r.joinedAt ?? 0, secondary: true },
];

export function PurchasesTable({ rows, filtered }: { rows: PurchaseRow[]; filtered: boolean }) {
  return (
    <DataTable
      rows={rows}
      columns={COLUMNS}
      rowKey={(r) => r.key}
      searchText={(r) => `${r.company} ${r.email} ${r.name}`}
      searchPlaceholder="Search by company, email or name…"
      initialSort={{ key: "joined", direction: "desc" }}
      caption="Purchase overview"
      empty={
        <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-ink-soft">
          {filtered ? "No users match this filter." : "No users found."}
        </p>
      }
    />
  );
}
