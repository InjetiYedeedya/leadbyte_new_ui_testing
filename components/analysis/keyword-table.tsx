"use client";

/**
 * Search Console queries this site ranks for.
 *
 * A thin `"use client"` wrapper whose only job is to declare `DataTable`'s
 * columns — JSX cell renderers cannot cross the server boundary. The rows are
 * fetched and shaped on the server and arrive as a prop; nothing is fetched
 * here. Same shape as `components/analytics/page-table.tsx`.
 */

import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import type { SearchQuery } from "@/lib/data/search-console";
import { formatCount } from "@/lib/format";

const COLUMNS: Column<SearchQuery>[] = [
  {
    key: "query",
    header: "Query",
    cell: (row) => (
      <span className="block max-w-[24rem] truncate" title={row.query}>
        {row.query}
      </span>
    ),
    sortValue: (row) => row.query,
  },
  {
    key: "clicks",
    header: "Clicks",
    cell: (row) => formatCount(row.clicks),
    sortValue: (row) => row.clicks,
    numeric: true,
  },
  {
    key: "impressions",
    header: "Impressions",
    cell: (row) => formatCount(row.impressions),
    sortValue: (row) => row.impressions,
    numeric: true,
  },
  {
    key: "ctr",
    header: "CTR",
    cell: (row) => `${(row.ctr * 100).toFixed(1)}%`,
    sortValue: (row) => row.ctr,
    numeric: true,
    secondary: true,
  },
  {
    key: "position",
    header: "Avg. position",
    // Lower is better, so this is the one column where a small number is good.
    cell: (row) => (row.position > 0 ? row.position.toFixed(1) : "—"),
    sortValue: (row) => row.position,
    numeric: true,
  },
];

export function KeywordTable({ queries }: { queries: SearchQuery[] }) {
  return (
    <DataTable
      rows={queries}
      columns={COLUMNS}
      rowKey={(row) => row.query}
      // `DataTable` only substitutes an empty state when it is given one, so
      // without this a connected account with no ranking queries rendered a
      // full header row — Query / Clicks / Impressions / CTR / Avg. position —
      // over an empty body. Reachable on the Dashboard, because `hasSearch` is
      // an OR: Search Console can have daily rows and no queries.
      empty={
        <EmptyState
          title="No ranking queries yet"
          description="Search Console has no queries for this property in the selected period. It usually starts reporting within a few days of a site being indexed."
        />
      }
      searchText={(row) => row.query}
      searchPlaceholder="Filter queries…"
      initialSort={{ key: "clicks", direction: "desc" }}
      caption="Search queries this site ranks for, from Google Search Console"
    />
  );
}
