"use client";

/**
 * Sortable, filterable, paginated table.
 *
 * The most reused component in the migration — analytics, campaigns, leads and
 * admin all render one. It is a Client Component because sorting and filtering
 * are interactions; the DATA is still fetched and shaped on the server and
 * passed in as a prop.
 *
 * Deliberately not a generic "smart table": no data fetching, no URL state, no
 * column resizing. Callers own their data and their formatting; this owns
 * presentation and the three interactions above.
 *
 * ## The presentation, and what it used to get wrong
 *
 * - **Headers were 10px monospace, uppercase, wide-tracked.** At that size the
 *   caps are genuinely hard to read, and every table in the app opened with a
 *   row of shouting. They are sentence case at a readable size now.
 * - **Every column carried a faint chevron.** Meant as "sortable", it read as
 *   "this column is sorted descending" — on all four at once. The mark now
 *   appears on the sorted column, and on hover or keyboard focus for the
 *   others, which is where an affordance belongs.
 * - **The sorted column was invisible.** The only piece of state a sortable
 *   table has, and nothing in the rows said which column ordered them. Its
 *   cells now carry the weight.
 * - **Pagination said "Page 1 of 2".** Which rows that meant was left as a
 *   calculation; it names the range instead.
 *
 * A sticky header would help the fifty-row tables and is deliberately absent:
 * the app's own identity band is already `sticky top-0`, so a header pinned to
 * the viewport would slide under it, and pinning it inside its own scroller
 * would nest a scroll region inside the page's.
 */

import { Fragment, useMemo, useState } from "react";
import { usePrinting } from "@/lib/use-printing";
import { countOf } from "@/lib/format";

export interface Column<T> {
  /** Stable key. Also the sort key when `sortValue` is absent. */
  key: string;
  header: string;
  /** How the cell renders. Return a string for plain text. */
  cell: (row: T) => React.ReactNode;
  /** Value to sort on. Omit to make the column unsortable. */
  sortValue?: (row: T) => string | number;
  /** Right-align and use tabular figures. For anything numeric. */
  numeric?: boolean;
  /** Hidden below `sm`. Use for detail columns on wide tables. */
  secondary?: boolean;
}

type Direction = "asc" | "desc";

/**
 * The sort direction, as a chevron.
 *
 * An SVG rather than the triangle text glyphs this used before: those are font
 * dependent, sit off the text baseline, and render at wildly different weights
 * across platforms.
 */
function SortMark({
  direction,
  className,
}: {
  direction: Direction;
  className: string;
}) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`h-3 w-3 shrink-0 ${className}`}
      fill="none"
    >
      <path
        d={direction === "asc" ? "M3 7.5L6 4.5L9 7.5" : "M3 4.5L6 7.5L9 4.5"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  /** Stable identity per row. */
  rowKey: (row: T) => string;
  /** Shown instead of the table when there are no rows at all. */
  empty?: React.ReactNode;
  /** Enables the filter box. The text searched per row. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  /** The starting page size. 0 disables pagination entirely. */
  pageSize?: number;
  /**
   * Sizes offered in the page-size selector.
   *
   * The legacy dashboard had one and we did not, which meant a 132-campaign
   * table could only ever be read 25 rows at a time — six clicks to see the
   * whole thing, and no way to scan it. Set to an empty array to hide the
   * selector on a table where every page size is the same.
   */
  pageSizes?: number[];
  /** Column key to sort by initially. */
  initialSort?: { key: string; direction: Direction };
  onRowClick?: (row: T) => void;
  caption?: string;
  /**
   * A detail panel that opens IN PLACE under its row, from a View/Hide button
   * in a trailing column.
   *
   * For a row whose detail belongs beside the others — the admin Clients table
   * shows a user's record and their agent configurations this way, so an admin
   * can compare two clients without losing their place. One row opens at a
   * time; opening another closes the first. A dialog is the other pattern here
   * (`onRowClick`), for detail big enough to deserve the screen.
   */
  expandable?: {
    render: (row: T) => React.ReactNode;
    /** Header of the button column. Default "Details". */
    header?: string;
    /** What the row is called, for the button's accessible name. */
    rowLabel?: (row: T) => string;
  };
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  empty,
  searchText,
  searchPlaceholder = "Filter…",
  pageSize: initialPageSize = 25,
  pageSizes = [25, 50, 100],
  initialSort,
  onRowClick,
  caption,
  expandable,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const printing = usePrinting();
  const [sortKey, setSortKey] = useState<string | null>(
    initialSort?.key ?? null,
  );
  const [direction, setDirection] = useState<Direction>(
    initialSort?.direction ?? "desc",
  );
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!searchText || query.trim() === "") return rows;
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => searchText(row).toLowerCase().includes(needle));
  }, [rows, query, searchText]);

  const sorted = useMemo(() => {
    if (sortKey === null) return filtered;
    const column = columns.find((c) => c.key === sortKey);
    if (!column?.sortValue) return filtered;
    const read = column.sortValue;

    // Copy before sorting — mutating the caller's array would be a surprise.
    return [...filtered].sort((a, b) => {
      const av = read(a);
      const bv = read(b);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return direction === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, direction, columns]);

  const pageCount =
    pageSize > 0 ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  // Whether changing the page size could change what is on screen at all.
  const canResize =
    pageSizes.length > 0 && pageSizes.some((size) => size < sorted.length);
  // Filtering can shrink the list past the current page.
  const safePage = Math.min(page, pageCount - 1);
  // A printed table has no "next page" button, so paging it means the PDF
  // carries rows 1-25 and silently drops the rest. On paper the whole table
  // prints — sorted and filtered as the reader left it, because that IS what
  // they asked to see, but never truncated to a page they cannot turn.
  const visible =
    printing || pageSize <= 0
      ? sorted
      : sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function toggleSort(column: Column<T>) {
    if (!column.sortValue) return;
    if (sortKey === column.key) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(column.key);
      setDirection(column.numeric ? "desc" : "asc");
    }
    setPage(0);
  }

  if (rows.length === 0 && empty) {
    return <>{empty}</>;
  }

  return (
    <div className="flex flex-col gap-3">
      {searchText && (
        <div className="flex items-center justify-between gap-3 print:hidden">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            suppressHydrationWarning
            className="w-full max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent"
          />
          <span className="shrink-0 text-xs tabular-nums text-ink-soft">
            {sorted.length === rows.length
              ? countOf(rows.length, "row")
              : `${sorted.length} of ${rows.length}`}
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border scroll-x-hint">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sortKey === column.key;
                const sortable = Boolean(column.sortValue);
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      active
                        ? direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className={[
                      "whitespace-nowrap border-b border-border px-4 py-2",
                      "text-xs font-medium text-ink-soft",
                      column.numeric ? "w-24 text-right" : "text-left",
                      column.secondary ? "hidden sm:table-cell" : "",
                    ].join(" ")}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        suppressHydrationWarning
                        className={`group inline-flex items-center gap-1 rounded transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                          active ? "text-ink" : ""
                        }`}
                      >
                        {column.header}
                        {/* On the sorted column always; on the others only
                            under the pointer or keyboard focus. */}
                        <SortMark
                          direction={direction}
                          className={
                            active
                              ? "opacity-100"
                              : "opacity-0 transition-opacity group-hover:opacity-40 group-focus-visible:opacity-40"
                          }
                        />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
              {expandable && (
                <th
                  scope="col"
                  className="whitespace-nowrap border-b border-border px-4 py-2 text-right text-xs font-medium text-ink-soft"
                >
                  {expandable.header ?? "Details"}
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (expandable ? 1 : 0)}
                  className="px-4 py-6 text-center text-ink-soft"
                >
                  Nothing matches &ldquo;{query}&rdquo;.
                </td>
              </tr>
            )}

            {visible.map((row) => {
              const key = rowKey(row);
              const open = expandable !== undefined && openKey === key;
              const panelId = `row-detail-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
              return (
              <Fragment key={key}>
              <tr
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                // A clickable row has to be reachable without a mouse. It keeps
                // its row semantics rather than taking `role="button"` — that
                // would hide the cells from a screen reader, which is most of
                // what the row IS — so it is focusable with a key handler
                // instead, and `aria-haspopup` says what Enter will do.
                tabIndex={onRowClick ? 0 : undefined}
                aria-haspopup={onRowClick ? "dialog" : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        // Space scrolls the page by default, which is not what
                        // pressing a focused row should do.
                        event.preventDefault();
                        onRowClick(row);
                      }
                    : undefined
                }
                // Rows highlight on hover whether or not they are clickable:
                // on a wide table that is what keeps the eye on one row across
                // four columns. The cursor is what says "this does something".
                //
                // The press is a background rather than the buttons' scale: a
                // shrinking table row drags every column in with it.
                className={`border-b border-border/60 transition-colors last:border-b-0 hover:bg-surface-raised/60 ${
                  onRowClick
                    ? "cursor-pointer active:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                    : ""
                }`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={[
                      "px-4 py-2 text-ink",
                      column.numeric ? "w-24 text-right tabular-nums" : "",
                      column.secondary ? "hidden sm:table-cell" : "",
                      // Which column ordered these rows, said in the rows
                      // themselves and not only in the header.
                      sortKey === column.key ? "font-medium" : "",
                    ].join(" ")}
                  >
                    {column.cell(row)}
                  </td>
                ))}
                {expandable && (
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={(event) => {
                        // A row can be clickable AND expandable; the button
                        // must not also fire the row's own click.
                        event.stopPropagation();
                        setOpenKey(open ? null : key);
                      }}
                      aria-expanded={open}
                      aria-controls={open ? panelId : undefined}
                      aria-label={`${open ? "Hide" : "View"} details${
                        expandable.rowLabel ? ` for ${expandable.rowLabel(row)}` : ""
                      }`}
                      suppressHydrationWarning
                      className="rounded-md border border-border px-3 py-1 text-xs font-medium text-ink transition hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {open ? "Hide" : "View"}
                    </button>
                  </td>
                )}
              </tr>
              {open && (
                <tr className="border-b border-border/60 bg-ground/60">
                  <td id={panelId} colSpan={columns.length + 1} className="px-4 py-4">
                    {expandable.render(row)}
                  </td>
                </tr>
              )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* The footer outlives the buttons.
          Gating the whole thing on `pageCount > 1` meant choosing "50" on a
          30-row table hid the selector along with the arrows — the size was
          then unchangeable, with no way back to 25. So the footer shows
          whenever a size choice is meaningful, and only the arrows depend on
          there being another page. */}
      {/* The pager is a control, and on paper every row is already there —
          "Showing 1-25 of 132" beneath a table of 132 rows would be a lie. */}
      {pageSize > 0 && (pageCount > 1 || canResize) && (
        <div className="flex items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-3">
            {/* The rows on screen, not the page's ordinal — "Page 2 of 3" left
                working out which rows those are to the reader. */}
            <span className="text-xs tabular-nums text-ink-soft">
              {safePage * pageSize + 1}–
              {Math.min(sorted.length, (safePage + 1) * pageSize)} of{" "}
              {sorted.length}
            </span>

            {/* Offered only when some size would actually show fewer rows than
                there are. On a 20-row table every option shows all 20, so the
                control could not change anything. */}
            {canResize && (
              <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                <span className="sr-only sm:not-sr-only">Rows</span>
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    // Back to the first page: page 5 of a 25-row view does not
                    // exist in a 100-row one, and landing on a blank page reads
                    // as the filter having eaten the data.
                    setPage(0);
                  }}
                  suppressHydrationWarning
                  className="rounded-md border border-border bg-surface px-1.5 py-1 text-xs text-ink outline-none transition-colors focus:border-accent"
                >
                  {pageSizes.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="flex gap-2">
            {pageCount > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setPage(safePage - 1)}
                  disabled={safePage === 0}
                  suppressHydrationWarning
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-ink transition hover:bg-surface-raised disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage(safePage + 1)}
                  disabled={safePage >= pageCount - 1}
                  suppressHydrationWarning
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-ink transition hover:bg-surface-raised disabled:opacity-40"
                >
                  Next
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
