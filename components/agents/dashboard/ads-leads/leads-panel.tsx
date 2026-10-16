"use client";

/**
 * The "Leads (N)" panel: every ad-captured lead, with search, sort, paging
 * and a CSV export.
 *
 * ## Why this earns `"use client"`
 *
 * Two reasons, both interactions a form cannot express. `DataTable`'s cell
 * renderers are functions, which cannot cross the server boundary — the same
 * reason every other `DataTable` wrapper here is a client file. And the export
 * builds a file in the browser from rows already on screen, so downloading
 * does not cost a second backend read.
 *
 * ## Why CSV and not the legacy .xlsx
 *
 * No spreadsheet library is installed and adding one for a download was ruled
 * out. A CSV opens in Excel, Sheets and Numbers alike; the BOM in front of it
 * is what makes Excel read an accented name as UTF-8 rather than mojibake.
 *
 * The columns are built on the server from the rows (`buildLeadsTable`); this
 * only draws them. A missing value is "-", per the guide.
 */

import { useMemo } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { Panel } from "@/components/agents/dashboard/parts";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  leadsTableToCsv,
  type LeadRow,
  type LeadsTable,
} from "@/lib/data/dashboard/ads-leads-table";
import { formatCount } from "@/lib/format";

const SECONDARY_BUTTON =
  "inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 " +
  "text-sm font-medium text-ink transition hover:bg-surface-raised " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-accent active:scale-[0.98] motion-reduce:transform-none " +
  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface disabled:active:scale-100";

function download(table: LeadsTable) {
  const blob = new Blob(["﻿", leadsTableToCsv(table)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ads-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // After the click has been handed to the browser, not before it.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function LeadsPanel({ table }: { table: LeadsTable }) {
  const columns = useMemo<Column<LeadRow>[]>(
    () =>
      table.columns.map((column) => ({
        key: column.key,
        header: column.label,
        cell: (row) => (
          // Wraps at a readable width rather than stretching one column across
          // the panel; the table scrolls sideways inside its own box.
          <span className="block max-w-xs break-words">{row.cells[column.key] ?? "-"}</span>
        ),
        sortValue: (row) => row.cells[column.key] ?? "",
      })),
    [table.columns],
  );

  return (
    <Panel
      title={`Leads (${formatCount(table.rows.length)})`}
      hint="Every response your ad forms collected, newest first"
      action={
        // With no rows there is nothing to export but a header line — the
        // same rule as the lead board's export.
        <button
          type="button"
          onClick={() => download(table)}
          disabled={table.rows.length === 0}
          className={SECONDARY_BUTTON}
        >
          <DownloadSimple size={16} weight="bold" aria-hidden="true" />
          Export CSV
        </button>
      }
    >
      <DataTable
        rows={table.rows}
        columns={columns}
        rowKey={(row) => row.id}
        searchText={(row) => Object.values(row.cells).join(" ")}
        searchPlaceholder="Search leads…"
        caption="Leads from your ad campaigns"
      />
    </Panel>
  );
}
