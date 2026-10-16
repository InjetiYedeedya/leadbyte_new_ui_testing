"use client";

/**
 * Page-level recommendations on the Website audit: every crawled page as a
 * table row, with a text filter, severity tabs, 8 rows a page, sorting by
 * score, and each row's full report opening in place under it.
 *
 * Client because all of that is interaction. The rows and each page's report
 * are rendered on the server and arrive as props; this owns only what is
 * showing. Printing shows every page with its report open, because a PDF has
 * no "next page" or "View" to press (see `use-printing.ts`).
 */

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  CheckCircle,
  Info,
  MagnifyingGlass,
  MinusCircle,
  Warning,
  WarningOctagon,
  type Icon,
} from "@phosphor-icons/react";
import { FILTER_SEVERITIES, type FilterSeverity } from "@/lib/data/audit-view";
import { usePrinting } from "@/lib/use-printing";

export interface AuditPageRow {
  key: string;
  path: string;
  issues: number;
  score: number | null;
  needsAttention: boolean;
  severities: FilterSeverity[];
  /** The page's full report, rendered on the server. */
  detail: React.ReactNode;
}

const PAGE_SIZE = 8;

const TAB_LABEL: Record<FilterSeverity | "all", string> = {
  all: "All",
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/**
 * The status cell: a page's MOST SEVERE problem, not "Needs attention".
 *
 * That label read the same on every row of a real audit (every page had an
 * issue), so the column said nothing a reader could rank by. The worst
 * severity tells the rows apart and says what to look at first. Each one has
 * its own icon as well as its colour, so it reads without colour too.
 */
const STATUS: Record<FilterSeverity | "good", { label: string; icon: Icon; tone: string }> = {
  critical: { label: "Critical", icon: WarningOctagon, tone: "bg-crit-soft text-crit" },
  high: { label: "High", icon: Warning, tone: "bg-warn-soft text-warn" },
  medium: { label: "Medium", icon: Info, tone: "bg-info-soft text-info" },
  low: { label: "Low", icon: MinusCircle, tone: "bg-surface-raised text-ink-soft" },
  good: { label: "Good", icon: CheckCircle, tone: "bg-good-soft text-good" },
};

/** The worst severity on the page (FILTER_SEVERITIES runs worst first), or "good". */
function topStatus(row: AuditPageRow): FilterSeverity | "good" {
  return FILTER_SEVERITIES.find((severity) => row.severities.includes(severity)) ?? (row.issues > 0 ? "low" : "good");
}

/** The same bands for the figure itself. */
function scoreText(score: number): string {
  if (score >= 80) return "text-good";
  if (score >= 50) return "text-warn";
  return "text-crit";
}

/** Same bands as the rest of the app: under 50 crit, under 80 warn. */
function barTone(score: number): string {
  if (score >= 80) return "bg-good";
  if (score >= 50) return "bg-warn";
  return "bg-crit";
}

export function AuditPageTable({ rows }: { rows: AuditPageRow[] }) {
  const printing = usePrinting();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<FilterSeverity | "all">("all");
  const [sort, setSort] = useState<"none" | "asc" | "desc">("none");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // CSS cannot open a <details> reliably across engines, so printing sets the
  // attribute on every closed one and puts them back afterwards.
  useEffect(() => {
    if (!printing || !tableRef.current) return;
    const opened = [...tableRef.current.querySelectorAll("details:not([open])")];
    for (const el of opened) el.setAttribute("open", "");
    return () => {
      for (const el of opened) el.removeAttribute("open");
    };
  }, [printing]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = rows.filter(
      (row) =>
        (needle === "" || row.path.toLowerCase().includes(needle)) &&
        (tab === "all" || row.severities.includes(tab)),
    );
    if (sort === "none") return matched;
    // Unscored pages go last either way: "no score" is not a low score.
    return [...matched].sort((a, b) => {
      if (a.score === null) return b.score === null ? 0 : 1;
      if (b.score === null) return -1;
      return sort === "asc" ? a.score - b.score : b.score - a.score;
    });
  }, [rows, query, tab, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = printing ? filtered : filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const first = filtered.length === 0 ? 0 : current * PAGE_SIZE + 1;
  const last = Math.min(filtered.length, (current + 1) * PAGE_SIZE);

  function changeFilter(update: () => void) {
    update();
    setPage(0);
    setOpen(null);
  }

  // The summary strip, from the rows themselves — nothing here is invented.
  const attention = rows.filter((row) => row.needsAttention).length;
  const scored = rows.filter((row) => row.score !== null);
  const average =
    scored.length > 0
      ? Math.round(scored.reduce((sum, row) => sum + (row.score ?? 0), 0) / scored.length)
      : null;
  const tabCount = (key: FilterSeverity | "all") =>
    key === "all" ? rows.length : rows.filter((row) => row.severities.includes(key)).length;

  return (
    <div>
      {/* At a glance, before the list: how many pages, how many need work,
          and where the site sits on average. */}
      <dl className="flex flex-wrap gap-x-8 gap-y-2 print:hidden">
        <div className="flex items-baseline gap-2">
          <dt className="text-sm text-ink-soft">Pages</dt>
          <dd className="text-lg font-semibold tabular-nums text-ink">{rows.length}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-sm text-ink-soft">Need attention</dt>
          <dd className={`text-lg font-semibold tabular-nums ${attention > 0 ? "text-crit" : "text-good"}`}>
            {attention}
          </dd>
        </div>
        {average !== null && (
          <div className="flex items-baseline gap-2">
            <dt className="text-sm text-ink-soft">Average score</dt>
            <dd className={`text-lg font-semibold tabular-nums ${scoreText(average)}`}>
              {average}
              <span className="text-sm font-normal text-ink-soft">/100</span>
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <label className="relative w-full max-w-xs">
          <span className="sr-only">Filter pages</span>
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => changeFilter(() => setQuery(event.target.value))}
            placeholder="Filter pages..."
            className="w-full rounded-md border border-border bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-soft focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>
        <div
          className="flex flex-wrap rounded-md border border-border bg-surface p-1"
          role="group"
          aria-label="Filter pages by severity"
        >
          {(["all", ...FILTER_SEVERITIES] as const).map((key) => {
            const count = tabCount(key);
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => changeFilter(() => setTab(key))}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                  active ? "bg-accent-soft text-accent-ink" : "text-ink hover:bg-surface-raised"
                }`}
              >
                {TAB_LABEL[key]}
                <span
                  className={`rounded-full px-1.5 text-xs tabular-nums ${
                    active ? "bg-surface text-accent-ink" : "bg-surface-raised text-ink-soft"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div ref={tableRef} className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium text-ink-soft">
              <th scope="col" className="px-3 pb-2.5 font-medium">Page</th>
              <th scope="col" className="px-3 pb-2.5 font-medium">Issues</th>
              <th
                scope="col"
                className="px-3 pb-2.5 font-medium"
                aria-sort={sort === "asc" ? "ascending" : sort === "desc" ? "descending" : "none"}
              >
                <button
                  type="button"
                  onClick={() => setSort(sort === "desc" ? "asc" : "desc")}
                  className="inline-flex items-center gap-1 font-medium transition-colors hover:text-ink print:pointer-events-none"
                >
                  SEO score
                  {sort === "asc" ? <CaretUp size={12} aria-hidden="true" /> : <CaretDown size={12} aria-hidden="true" />}
                </button>
              </th>
              <th scope="col" className="px-3 pb-2.5 font-medium">Top priority</th>
              <th scope="col" className="px-3 pb-2.5 text-right font-medium print:hidden">
                <span className="sr-only">Report</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-ink-soft">
                  No pages match.{" "}
                  {(query !== "" || tab !== "all") && (
                    <button
                      type="button"
                      onClick={() => changeFilter(() => { setQuery(""); setTab("all"); })}
                      className="font-medium text-accent-ink underline underline-offset-2 hover:text-ink"
                    >
                      Clear filters
                    </button>
                  )}
                </td>
              </tr>
            )}
            {visible.map((row) => {
              const expanded = printing || open === row.key;
              const toggle = () => setOpen(open === row.key ? null : row.key);
              return (
                <Fragment key={row.key}>
                  {/* The whole row opens the report for a mouse; the button at
                      its end is the keyboard and screen-reader control. */}
                  <tr
                    onClick={toggle}
                    className={`group cursor-pointer border-b border-border transition-colors print:cursor-auto ${
                      expanded ? "bg-accent-soft/40" : "hover:bg-surface-raised"
                    }`}
                  >
                    <td
                      className={`max-w-[18rem] truncate border-l-2 px-3 py-3 font-mono text-ink transition-colors ${
                        expanded ? "border-accent" : "border-transparent group-hover:border-border"
                      }`}
                      title={row.path}
                    >
                      {row.path}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex min-w-7 justify-center rounded-full bg-surface-raised px-2 py-0.5 text-xs font-semibold tabular-nums text-ink">
                        {row.issues}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {row.score === null ? (
                        <span className="text-xs text-ink-soft">Not scored</span>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className={`w-8 text-right text-base font-semibold tabular-nums ${scoreText(row.score)}`}>
                            {row.score}
                          </span>
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-raised" aria-hidden="true">
                            <div
                              className={`h-full rounded-full ${barTone(row.score)} transition-[width] duration-700 ease-out motion-reduce:transition-none`}
                              style={{ width: `${row.score}%` }}
                            />
                          </div>
                          <span className="sr-only">out of 100</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {(() => {
                        const status = STATUS[topStatus(row)];
                        const StatusIcon = status.icon;
                        return (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${status.tone}`}
                          >
                            <StatusIcon size={14} weight="fill" aria-hidden="true" />
                            {status.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-3 text-right print:hidden">
                      <button
                        type="button"
                        onClick={(event) => {
                          // The row handles a click too; one toggle, not two.
                          event.stopPropagation();
                          toggle();
                        }}
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "Hide" : "View"} the report for ${row.path}`}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                          expanded
                            ? "bg-accent text-white"
                            : "bg-accent-soft text-accent-ink group-hover:bg-accent group-hover:text-white"
                        }`}
                      >
                        {expanded ? "Hide" : "View report"}
                        <ArrowRight
                          size={13}
                          weight="bold"
                          aria-hidden="true"
                          className={`transition-transform duration-300 ease-out motion-reduce:transition-none ${
                            expanded ? "rotate-90" : "group-hover:translate-x-0.5"
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-border bg-surface-raised/50">
                      <td colSpan={5} className="border-l-2 border-accent px-4 py-4">
                        {row.detail}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <p className="text-sm text-ink-soft">
            Showing {first}-{last} of {filtered.length} {filtered.length === 1 ? "page" : "pages"}
          </p>
          {pageCount > 1 && (
            <nav className="flex items-center gap-1.5" aria-label="Pages of results">
              <button
                type="button"
                onClick={() => setPage(current - 1)}
                disabled={current === 0}
                aria-label="Previous page"
                className="flex size-9 items-center justify-center rounded-md border border-border bg-surface text-ink hover:bg-surface-raised disabled:opacity-40"
              >
                <CaretLeft size={14} aria-hidden="true" />
              </button>
              {Array.from({ length: pageCount }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setPage(index)}
                  aria-current={index === current ? "page" : undefined}
                  className={`flex size-9 items-center justify-center rounded-md border text-sm font-medium ${
                    index === current
                      ? "border-accent bg-accent-soft text-accent-ink"
                      : "border-border bg-surface text-ink hover:bg-surface-raised"
                  }`}
                >
                  {index + 1}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPage(current + 1)}
                disabled={current === pageCount - 1}
                aria-label="Next page"
                className="flex size-9 items-center justify-center rounded-md border border-border bg-surface text-ink hover:bg-surface-raised disabled:opacity-40"
              >
                <CaretRight size={14} aria-hidden="true" />
              </button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
