"use client";

/**
 * Every campaign, every metric — the tab's Data view.
 *
 * ## Why this is not `DataTable`
 *
 * The guide's one ordering rule is that RUNNING campaigns always come first,
 * with the chosen sort applied within each group. `DataTable` sorts by one
 * value in one direction, and no single sort value can hold "active first"
 * while the direction flips — so the ordering lives in `sortCampaigns`
 * (tested), and this renders it: header sort buttons with `aria-sort`, 20 rows
 * a page, rows that open the drawer from a click or the keyboard.
 *
 * Before a column is picked it opens COMPLETED first, latest start date
 * first (`defaultCampaignOrder`, 2026-10-13).
 *
 * Twenty-odd columns cannot fit a slide-in panel, so the table scrolls
 * sideways inside its own box and the campaign name stays pinned on the left,
 * so a row can still be read at column eighteen.
 *
 * It scrolls DOWN inside that box too, with the header row pinned
 * (2026-10-12): a page of twenty rows ran far past the panel, and the column
 * names went with it.
 *
 * Highlight and dividers are on the CELLS, not the row. The pinned name cell
 * has a background of its own (or the cells scrolling under it show through),
 * which painted over the row's divider and switched its hover colour at a
 * different moment from the row's — the highlight arrived in two steps and the
 * lines started a column late (2026-10-12).
 */

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  campaignDay,
  defaultCampaignOrder,
  sortCampaigns,
  type AdCampaign,
  type AdsPlatform,
  type CampaignSortKey,
  type SortDirection,
} from "@/lib/data/dashboard/ads-campaigns";
import { humaniseOr } from "@/lib/data/labels";
import { formatMoney } from "@/lib/format";
import { PLATFORM_COPY, formatFigure, formatPct, formatRoas, statusVariant } from "./ads-copy";

export const PAGE_SIZE = 20;

interface GridColumn {
  key: CampaignSortKey;
  header: string;
  numeric?: boolean;
  cell: (row: AdCampaign) => React.ReactNode;
}

const money = (read: (row: AdCampaign) => number | null) => (row: AdCampaign) => formatMoney(read(row));
const figure = (read: (row: AdCampaign) => number | null) => (row: AdCampaign) => formatFigure(read(row));

const CAMPAIGN: GridColumn = { key: "campaign", header: "Campaign", cell: (row) => row.campaign };
/**
 * The status pill's colour in this table (2026-10-13 design): COMPLETED green
 * — the campaign ran its course — and PAUSED orange — waiting on a decision.
 * Running campaigns keep their green; anything else (removed, archived) keeps
 * the quiet grey `statusVariant` gives it.
 */
const STATUS_PILL = "inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold uppercase";
function statusPill(status: string | null) {
  const word = (status ?? "").trim().toUpperCase();
  const label = humaniseOr(status, "Unknown");
  if (word === "COMPLETED") return <span className={`${STATUS_PILL} bg-good-soft text-good`}>{label}</span>;
  if (word === "PAUSED") return <span className={`${STATUS_PILL} bg-warn-soft text-warn`}>{label}</span>;
  return <Badge variant={statusVariant(status)}>{label}</Badge>;
}

const STATUS: GridColumn = {
  key: "status",
  header: "Status",
  cell: (row) => statusPill(row.status),
};
const DATES: GridColumn[] = [
  { key: "startDate", header: "Start", cell: (row) => campaignDay(row.startDate) },
  { key: "endDate", header: "End", cell: (row) => campaignDay(row.endDate) },
];
const BUDGET: GridColumn[] = [
  { key: "budget", header: "Budget", numeric: true, cell: money((row) => row.budget) },
  {
    key: "budgetType",
    header: "Budget type",
    // Its own colours, apart from the status pill beside it (2026-10-13):
    // daily blue, lifetime violet, anything else the quiet grey.
    cell: (row) =>
      row.budgetType === null ? (
        "—"
      ) : (
        <span
          className={`${STATUS_PILL} ${
            String(row.budgetType).toUpperCase() === "DAILY"
              ? "bg-info-soft text-info"
              : String(row.budgetType).toUpperCase() === "LIFETIME"
                ? "bg-violet-soft text-violet"
                : "bg-surface-raised text-ink-soft"
          }`}
        >
          {row.budgetType}
        </span>
      ),
  },
  { key: "estimatedAmount", header: "Est. amount", numeric: true, cell: money((row) => row.estimatedAmount) },
];
const TAIL: GridColumn[] = [
  { key: "roas", header: "ROAS", numeric: true, cell: (row) => formatRoas(row.roas) },
  { key: "leads", header: "Leads", numeric: true, cell: figure((row) => row.leads) },
  { key: "iosInstalls", header: "iOS installs", numeric: true, cell: figure((row) => row.iosInstalls) },
  { key: "androidInstalls", header: "Android installs", numeric: true, cell: figure((row) => row.androidInstalls) },
];

/** The guide's column lists, in its order. */
export const COLUMNS: Record<AdsPlatform, GridColumn[]> = {
  google: [
    CAMPAIGN,
    STATUS,
    { key: "channelType", header: "Channel type", cell: (row) => row.channelType ?? "—" },
    ...DATES,
    ...BUDGET,
    { key: "spend", header: PLATFORM_COPY.google.spend, numeric: true, cell: money((row) => row.spend) },
    { key: "impressions", header: "Impr.", numeric: true, cell: figure((row) => row.impressions) },
    { key: "clicks", header: "Clicks", numeric: true, cell: figure((row) => row.clicks) },
    { key: "ctrPct", header: "CTR", numeric: true, cell: (row) => formatPct(row.ctrPct) },
    { key: "cpc", header: "Avg CPC", numeric: true, cell: money((row) => row.cpc) },
    { key: "conversions", header: PLATFORM_COPY.google.resultsShort, numeric: true, cell: figure((row) => row.conversions) },
    { key: "costPerConversion", header: PLATFORM_COPY.google.costPerResult, numeric: true, cell: money((row) => row.costPerConversion) },
    { key: "convValue", header: "Conv. value", numeric: true, cell: money((row) => row.convValue) },
    ...TAIL,
  ],
  meta: [
    CAMPAIGN,
    STATUS,
    { key: "objective", header: "Objective", cell: (row) => humaniseOr(row.objective) },
    ...DATES,
    ...BUDGET,
    { key: "spend", header: PLATFORM_COPY.meta.spend, numeric: true, cell: money((row) => row.spend) },
    { key: "reach", header: "Reach", numeric: true, cell: figure((row) => row.reach) },
    { key: "impressions", header: "Impr.", numeric: true, cell: figure((row) => row.impressions) },
    { key: "frequency", header: "Freq.", numeric: true, cell: (row) => (row.frequency === null ? "—" : row.frequency.toFixed(2)) },
    { key: "clicks", header: "Clicks", numeric: true, cell: figure((row) => row.clicks) },
    { key: "ctrPct", header: "CTR", numeric: true, cell: (row) => formatPct(row.ctrPct) },
    { key: "cpc", header: "CPC", numeric: true, cell: money((row) => row.cpc) },
    { key: "cpm", header: "CPM", numeric: true, cell: money((row) => row.cpm) },
    { key: "conversions", header: PLATFORM_COPY.meta.resultsShort, numeric: true, cell: figure((row) => row.conversions) },
    { key: "costPerConversion", header: PLATFORM_COPY.meta.costPerResult, numeric: true, cell: money((row) => row.costPerConversion) },
    ...TAIL,
  ],
};

function SortMark({ direction }: { direction: SortDirection }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3 shrink-0" fill="none">
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

export function AdsCampaignGrid({
  rows,
  platform,
  onOpen,
}: {
  /** Already filtered. */
  rows: readonly AdCampaign[];
  platform: AdsPlatform;
  onOpen: (row: AdCampaign) => void;
}) {
  const columns = COLUMNS[platform];
  // `null` until a column is picked: the table opens in its own order —
  // completed campaigns first, latest start date first (`defaultCampaignOrder`,
  // 2026-10-13). Picking a header sorts by that column, as before.
  const [sort, setSort] = useState<{ key: CampaignSortKey; direction: SortDirection } | null>(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(
    () => (sort === null ? defaultCampaignOrder(rows) : sortCampaigns(rows, sort.key, sort.direction)),
    [rows, sort],
  );
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  // Filtering can shrink the list past the page being read.
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function toggle(column: GridColumn) {
    setSort((current) =>
      current?.key === column.key
        ? { key: column.key, direction: current.direction === "asc" ? "desc" : "asc" }
        : // Numbers open biggest-first, words A–Z: the first click answers
          // "which is largest" or "where is it alphabetically".
          { key: column.key, direction: column.numeric ? "desc" : "asc" },
    );
    setPage(0);
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* `isolate`: the pinned Campaign column's z-index stays INSIDE the
          table. Without it the column's header cell (z-10) painted over the
          panel's sticky title bar (also z-10, earlier in the page) as the
          table scrolled up beneath it (2026-10-12). */}
      <div className="isolate max-h-[min(36rem,65vh)] overflow-auto overscroll-contain rounded-lg border border-border scroll-x-hint">
        {/* `border-separate`: a collapsed border belongs to the table, not the
            cell, and does not travel with a sticky cell. */}
        <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
          <caption className="sr-only">
            {PLATFORM_COPY[platform].name} campaigns. Running campaigns are listed first. Select a row for its details.
          </caption>
          <thead>
            <tr>
              {columns.map((column, index) => {
                const active = sort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active && sort ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                    className={[
                      // Pinned to the top of the box; the name's header to the
                      // left as well, above everything else.
                      // A tinted header row with a line between columns
                      // (2026-10-13 design). Solid, not translucent: rows
                      // scroll under it.
                      "sticky top-0 whitespace-nowrap border-b border-r border-border bg-[color-mix(in_srgb,var(--color-accent-soft)_75%,var(--color-surface))] px-3 py-2.5 text-xs font-semibold text-accent-ink last:border-r-0",
                      column.numeric ? "text-right" : "text-left",
                      index === 0 ? "left-0 z-[3]" : "z-[2]",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(column)}
                      suppressHydrationWarning
                      // Numbers: the arrow on the LEFT, so the label ends where
                      // the figures below it end. On the right, its reserved
                      // space left every number column's label short of its
                      // figures.
                      className={`group inline-flex items-center gap-1 rounded transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                        column.numeric ? "flex-row-reverse" : ""
                      } ${active ? "font-semibold text-ink" : ""}`}
                    >
                      {column.header}
                      <span
                        className={
                          active
                            ? "opacity-100"
                            : "opacity-0 transition-opacity group-hover:opacity-40 group-focus-visible:opacity-40"
                        }
                      >
                        <SortMark direction={active && sort ? sort.direction : "desc"} />
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.key}
                data-row-key={row.key}
                onClick={() => onOpen(row)}
                // Focusable with a key handler rather than `role="button"`,
                // which would hide the cells from a screen reader — the same
                // choice `DataTable` makes.
                tabIndex={0}
                aria-haspopup="dialog"
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onOpen(row);
                }}
                className="group cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                {columns.map((column, index) => (
                  <td
                    key={column.key}
                    className={[
                      // Every cell takes the row's highlight at the same
                      // moment, and carries its own divider.
                      "whitespace-nowrap border-b border-r border-border/60 px-3 py-2.5 text-ink last:border-r-0 group-last:border-b-0 group-hover:bg-surface-raised group-active:bg-surface-raised",
                      column.numeric ? "text-right tabular-nums" : "",
                      // The column it is sorted by, in bold — the figures
                      // being compared stand out.
                      sort?.key === column.key ? "font-semibold" : "",
                      // The pinned name needs its own background, or the
                      // cells scrolling under it show through.
                      index === 0 ? "sticky left-0 z-[1] max-w-[14rem] truncate bg-surface font-medium" : "",
                    ].join(" ")}
                    title={index === 0 ? row.campaign : undefined}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs tabular-nums text-ink-soft">
            {safePage * PAGE_SIZE + 1}–{Math.min(sorted.length, (safePage + 1) * PAGE_SIZE)} of {sorted.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(safePage - 1)}
              disabled={safePage === 0}
              suppressHydrationWarning
              className="min-h-9 rounded-md border border-border px-3 text-sm text-ink transition hover:bg-surface-raised disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= pageCount - 1}
              suppressHydrationWarning
              className="min-h-9 rounded-md border border-border px-3 text-sm text-ink transition hover:bg-surface-raised disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
