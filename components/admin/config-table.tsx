"use client";

/**
 * One agent's configurations, on the admin Agents screen.
 *
 * Its columns are not known until the rows are read — each agent stores its
 * own fields — so the server picks them (`configColumns`) and hands over plain
 * text. `"use client"` only because `DataTable`'s cell renderers are JSX.
 */

import { DataTable, type Column } from "@/components/ui/data-table";
import type { ConfigRow } from "@/lib/admin/clients";

export function ConfigTable({
  agent,
  columns,
  rows,
}: {
  agent: string;
  columns: { key: string; header: string }[];
  rows: ConfigRow[];
}) {
  const tableColumns: Column<ConfigRow>[] = columns.map((column) => ({
    key: column.key,
    header: column.header,
    cell: (row) => (
      <span className="block max-w-72 truncate" title={row.cells[column.key]}>
        {row.cells[column.key] ?? "—"}
      </span>
    ),
    sortValue: (row) => row.cells[column.key] ?? "",
  }));

  return (
    <DataTable
      rows={rows}
      columns={tableColumns}
      rowKey={(row) => row.key}
      searchText={(row) => row.email}
      searchPlaceholder="Search by email…"
      caption={`${agent} configurations`}
      empty={
        <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-ink-soft">
          No {agent} configurations yet.
        </p>
      }
    />
  );
}
