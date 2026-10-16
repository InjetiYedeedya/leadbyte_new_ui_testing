"use client";

/**
 * The page-traffic table.
 *
 * A thin client wrapper: it exists only to declare columns and hand them to
 * `DataTable`, which owns the sorting and filtering. The rows are fetched and
 * shaped on the server and arrive as a prop — no data fetching happens here.
 */

import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import type { PageRow } from "@/lib/data/analytics-repo";
import { formatCount } from "@/lib/format";

const COLUMNS: Column<PageRow>[] = [
  {
    key: "page",
    header: "Page",
    cell: (row) => (
      <span className="block max-w-[22rem] truncate" title={row.page}>
        {row.page}
      </span>
    ),
    sortValue: (row) => row.page,
  },
  {
    key: "views",
    header: "Views",
    cell: (row) => formatCount(row.views),
    sortValue: (row) => row.views,
    numeric: true,
  },
  {
    key: "users",
    header: "Active users",
    cell: (row) => formatCount(row.activeUsers),
    sortValue: (row) => row.activeUsers,
    numeric: true,
  },
  {
    // Conversions, not events: the live `google_analytics_breakdown` rows carry
    // no event count, so an Events column rendered a zero on every row of every
    // real account.
    key: "conversions",
    header: "Conversions",
    cell: (row) => formatCount(row.conversions),
    sortValue: (row) => row.conversions,
    numeric: true,
    secondary: true,
  },
];

export function PageTable({ rows }: { rows: PageRow[] }) {
  return (
    <DataTable
      rows={rows}
      columns={COLUMNS}
      rowKey={(row) => row.page}
      searchText={(row) => row.page}
      searchPlaceholder="Filter pages…"
      initialSort={{ key: "views", direction: "desc" }}
      caption="Page traffic"
      empty={
        <EmptyState
          title="No page data yet"
          description="Once Google Analytics has traffic to report, your pages appear here."
        />
      }
    />
  );
}
