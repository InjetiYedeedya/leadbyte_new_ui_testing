"use client";

/**
 * One source at a time, seen either as a picture or as the numbers.
 *
 * ## Why the sources are separated
 *
 * Analytics, Search Console and the ad platforms were three stacked sections,
 * so reading any one of them meant scrolling past the other two. They answer
 * different questions and are checked at different times — "is traffic up" is
 * not the same errand as "what are we ranking for" — and the page is shorter
 * than the sum of them because only one is ever being read.
 *
 * The combined timeline above this stays whole. It is the one view that is
 * about all three at once, and splitting it by source would be splitting the
 * only comparison the page can make.
 *
 * ## Why a mode switch and not one right answer
 *
 * A chart answers "is this going up"; a table answers "what exactly was
 * Tuesday". Both questions are asked of the same numbers by the same person on
 * different days, and picking one for them means the other question needs an
 * export. The two modes render the same rows.
 *
 * ## Why every panel is rendered on the server
 *
 * Both modes of every source arrive as already-rendered elements in props.
 * Nothing here fetches, and switching costs no round trip — the panel is
 * already in the page, hidden. That is the same rule the rest of the app
 * follows (`lib/api/client.ts` reads httpOnly cookies and cannot be imported
 * from a client module), and it is what makes the toggle instant.
 *
 * The cost is real and worth naming: every hidden panel is in the HTML
 * payload. It is affordable because these are at most a few hundred table
 * rows, all of which the page was already sending.
 *
 * ## Why the panels are hidden rather than unmounted
 *
 * `hidden` keeps a panel's own state — a table's sort column, its filter text,
 * which page of rows you were on. Unmounting resets all three, so glancing at
 * the chart and coming back would silently undo the sort you set. It also
 * means the content is in the DOM for in-page find.
 */

import { motion, useReducedMotion } from "framer-motion";
import { useId, useRef, useState } from "react";

export interface ExplorerSource {
  id: string;
  label: string;
  /** One line on what this source answers, shown under the controls. */
  summary: string;
  chart: React.ReactNode;
  table: React.ReactNode;
}

type Mode = "chart" | "table";

const MODES: { id: Mode; label: string }[] = [
  { id: "chart", label: "Chart" },
  { id: "table", label: "Table" },
];

function ChartIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5" fill="none">
      <path d="M2 13h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M3 10.5l3.5-4L9.5 9 13 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5" fill="none">
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 6.5h11M6.5 6.5V13" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function SourceExplorer({
  sources,
  initialSourceId,
}: {
  sources: ExplorerSource[];
  /** The channel named by `?source=` on the page that rendered this. */
  initialSourceId?: string;
}) {
  const reduce = useReducedMotion();
  const uid = useId();
  const tabsRef = useRef<HTMLDivElement>(null);
  // Which channel to show. The choice arrives as `?source=` on the URL and is
  // resolved by the page, so this only remembers a later in-page switch.
  const [sourceId, setSourceId] = useState(initialSourceId ?? sources[0]?.id ?? "");
  const [mode, setMode] = useState<Mode>("chart");

  if (sources.length === 0) return null;
  const active = sources.find((source) => source.id === sourceId) ?? sources[0]!;

  /**
   * Arrow keys move between tabs, as a tablist is required to.
   *
   * Without this every tab is its own tab stop, so reaching the panel from the
   * first source means pressing Tab once per source. The roving `tabIndex`
   * below is the other half of the same contract.
   */
  function onTabKeyDown(event: React.KeyboardEvent) {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();

    const index = sources.findIndex((source) => source.id === sourceId);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? sources.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + sources.length) % sources.length;

    const target = sources[next];
    if (!target) return;
    setSourceId(target.id);
    // Focus follows selection, so the panel a screen reader announces is the
    // one the arrow key just chose.
    tabsRef.current?.querySelectorAll("button")[next]?.focus();
  }

  return (
    <section
      id="explore"
      aria-label="Explore your performance"
      className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface"
    >
      {/* The sources, as the design draws them: a plain underlined row, not a
          pill group. A pill group reads as a filter over one thing; these are
          three different subjects. */}
      {/* The card carries its own heading, with the mode switch beside it and
          the sources on their own row beneath — the arrangement the design
          draws, and the one that keeps "which channel" and "how to show it"
          from reading as one control. */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 px-4 pt-5 sm:px-6 sm:pt-6">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/8 text-accent"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight text-ink">
              Explore your performance
            </h2>
            <p className="mt-0.5 text-sm leading-6 text-ink-soft">
              Dive deeper into your data with detailed charts, breakdowns and tables.
            </p>
          </div>
        </div>
        <div
          role="group"
          aria-label="How to show it"
          className="flex shrink-0 gap-0.5 rounded-lg bg-ground p-0.5"
        >
          {MODES.map((option) => {
            const selected = option.id === mode;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setMode(option.id)}
                suppressHydrationWarning
                className={`relative flex min-h-11 items-center justify-center gap-1.5 rounded-md px-4 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  selected ? "text-surface" : "text-ink-soft hover:text-ink"
                }`}
              >
                {selected && (
                  <motion.span
                    layoutId="explorer-mode"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-md bg-accent shadow-sm"
                    transition={
                      reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }
                    }
                  />
                )}
                <span className="relative flex items-center gap-1.5">
                  {option.id === "chart" ? <ChartIcon /> : <TableIcon />}
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 border-b border-border px-4 sm:px-6">
        <div
          ref={tabsRef}
          role="tablist"
          aria-label="Data source"
          onKeyDown={onTabKeyDown}
          className="-mb-px flex max-w-full flex-wrap gap-x-6"
        >
          {sources.map((source) => {
            const selected = source.id === active.id;
            return (
              <button
                key={source.id}
                type="button"
                role="tab"
                // Stable rather than `uid`-scoped: this id is the anchor the
                // channel cards above link to (`#explore-analytics`), so it
                // has to be predictable from outside this component.
                id={`explore-${source.id}`}
                aria-selected={selected}
                aria-controls={`${uid}-panel-${source.id}`}
                // Roving tabindex: one stop for the whole tablist.
                tabIndex={selected ? 0 : -1}
                onClick={() => setSourceId(source.id)}
                suppressHydrationWarning
                // 44px tall on a touch screen — the control is small on
                // purpose and the FINGER is not.
                className={`relative min-h-11 pb-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  selected ? "text-accent" : "text-ink-soft hover:text-ink"
                }`}
              >
                <span className="relative">{source.label}</span>
                {/* One element tracked across tabs, so the underline travels
                    instead of blinking out here and in again there. Reduced
                    motion moves it instantly rather than removing it — the
                    indicator is information, not decoration. */}
                {selected && (
                  <motion.span
                    layoutId="explorer-source"
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-accent"
                    transition={
                      reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }
                    }
                  />
                )}
              </button>
            );
          })}
        </div>

      </div>

      <div className="p-4">
        <p className="mb-4 text-sm text-ink-soft">{active.summary}</p>

        {/* Every panel stays mounted; only the chosen one is shown. See the
            note above on why `hidden` rather than unmounting. */}
        {sources.map((source) => (
          <div
            key={source.id}
            // Only a real tablist gets tabpanel semantics. With one source
            // there is no tab to be labelled by, and claiming the role anyway
            // describes a structure that is not on the page.
            {...(sources.length > 1
              ? {
                  role: "tabpanel",
                  id: `${uid}-panel-${source.id}`,
                  "aria-labelledby": `explore-${source.id}`,
                }
              : {})}
            hidden={source.id !== active.id}
            // A panel is reachable by Tab from its tab, which is how a
            // keyboard user gets from choosing a source to reading it.
            tabIndex={source.id === active.id ? 0 : -1}
            className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            <div hidden={mode !== "chart"}>{source.chart}</div>
            <div hidden={mode !== "table"}>{source.table}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
