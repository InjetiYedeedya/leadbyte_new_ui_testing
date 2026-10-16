"use client";

/**
 * Sources, countries and devices — one panel, not three cards.
 *
 * ## Why a client island
 *
 * These three breakdowns were three side-by-side cards, each a `RankedBars`
 * list with its own header. Same treatment three times, a third of the page
 * spent, and the comparison anyone actually makes — is this country's share
 * bigger than that source's? — needs them read one after another anyway.
 *
 * One panel with a segmented control shows the same information in a third of
 * the space, and switching is a genuine interaction: state plus a moving
 * indicator, which is exactly what a `<form action={serverAction}>` cannot
 * express. Rows arrive as props; nothing here fetches.
 *
 * ## Why bars stay bars, and why they animate their width
 *
 * A ranked bar list is the right form when the label matters more than the
 * shape, and these are all "top N of a long tail". The bars re-measure when the
 * view changes because the row a bar belongs to changes with it — motion here
 * shows the same track being re-scaled to a different question, not decoration.
 * The rows themselves crossfade rather than sliding: they are a replacement in
 * place, not a move.
 *
 * ## Why the shares are computed here
 *
 * Against the largest row rather than the total. These lists are top-N slices
 * of a longer tail, so the visible rows do not add to 100% — drawing them as
 * though they did would be a quiet lie about coverage. The percentage of the
 * total is written on the row instead, where it can be qualified.
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useId, useState } from "react";
import { formatCount, countOf } from "@/lib/format";

export interface BreakdownView {
  id: string;
  /** The control's label. */
  label: string;
  /** What the rows are, in the interface's own words. */
  caption: string;
  rows: { label: string; value: number }[];
}

export function BreakdownPanel({ views }: { views: BreakdownView[] }) {
  const reduce = useReducedMotion();
  const uid = useId();
  const withRows = views.filter((view) => view.rows.length > 0);
  const [activeId, setActiveId] = useState(withRows[0]?.id ?? "");

  // Every breakdown empty means the panel has nothing to say, and an empty
  // panel with a working set of tabs is worse than no panel: it invites three
  // clicks that each show the same nothing.
  if (withRows.length === 0) return null;

  const active = withRows.find((view) => view.id === activeId) ?? withRows[0]!;
  const max = Math.max(...active.rows.map((row) => row.value), 1);
  const total = active.rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink">Visitor breakdown</h2>
          <p className="mt-0.5 text-xs text-ink-soft">Understand where your visitors come from.</p>
        </div>

        {/* One control, only when there is more than one thing to switch
            between. A single-option segmented control is a button that does
            nothing. */}
        {withRows.length > 1 && (
          /* A toggle group, not a tablist.
             This declared `role="tablist"` with `role="tab"` children and none
             of what that promises: a tablist owes arrow-key navigation and a
             roving tabindex, so a screen reader user was told to press the
             arrow keys and nothing happened. The honest alternatives were to
             implement the contract or to stop claiming it, and this control is
             three buttons that swap one region — which `aria-pressed` plus
             `aria-controls` describes exactly, with no keyboard contract to
             owe. `SourceExplorer` is a real tablist and implements the whole
             thing, because its tabs are the page's primary navigation. */
          <div role="group" aria-label="Breakdown" className="flex gap-0.5 rounded-lg bg-ground p-0.5">
            {withRows.map((view) => {
              const selected = view.id === active.id;
              return (
                <button
                  key={view.id}
                  type="button"
                  aria-pressed={selected}
                  aria-controls={`${uid}-rows`}
                  onClick={() => setActiveId(view.id)}
                  suppressHydrationWarning
                  // See the note in `source-explorer.tsx`: a 44px hit area
                  // where there are fingers, its natural size where there are
                  // not.
                  className={`relative min-h-11 rounded-md px-2.5 text-xs font-medium transition-colors sm:min-h-0 sm:py-1 ${
                    selected ? "text-ink" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {/* Travels between segments rather than blinking out here and
                      in again there — the indicator IS the answer to the click,
                      so reduced motion moves it instantly rather than removing
                      it. */}
                  {selected && (
                    <motion.span
                      layoutId="breakdown-segment"
                      aria-hidden="true"
                      className="absolute inset-0 rounded-md bg-surface shadow-sm"
                      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className="relative">{view.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-4 py-4" id={`${uid}-rows`}>
        {/* No `mode="wait"`. It ran the exit to completion before starting
            the enter, so switching segments cost 280ms with an EMPTY panel in
            the middle — read as a flash, not a crossfade. The two now overlap,
            and a 2px blur during the handover blends them into one perceived
            change rather than two stacked lists.
            (Animation review, 2026-09-20.) */}
        <AnimatePresence initial={false}>
          <motion.div
            key={active.id}
            initial={reduce ? { opacity: 1 } : { opacity: 0, filter: "blur(2px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 1 } : { opacity: 0, filter: "blur(2px)" }}
            transition={{ duration: reduce ? 0 : 0.14, ease: [0.23, 1, 0.32, 1] }}
          >
            <p className="mb-3 text-xs text-ink-soft">{active.caption}</p>

            <ul className="flex flex-col gap-2.5">
              {active.rows.map((row) => (
                <li key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                  <span className="truncate text-sm text-ink" title={row.label}>
                    {row.label}
                  </span>
                  <span className="text-sm tabular-nums text-ink">
                    {formatCount(row.value)}
                    {/* A real space, not just the margin: separated only by
                        `ml`, a screen reader runs the two together and reads
                        "5,210 46%" as one number. */}
                    <span className="ml-1.5 text-xs text-ink-soft">
                      {total > 0 ? ` ${((row.value / total) * 100).toFixed(0)}%` : ""}
                    </span>
                  </span>

                  <span className="col-span-2 mt-1 h-1.5 overflow-hidden rounded-full bg-ground">
                    <motion.span
                      className="block h-1.5 rounded-full bg-accent"
                      // Full `transform` string, not the `scaleX` shorthand
                      // Motion applies per frame from JS. 250ms, not 400ms.
                      initial={reduce ? false : { transform: "scaleX(0)" }}
                      animate={{ transform: "scaleX(1)" }}
                      transition={reduce ? { duration: 0 } : { duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                      // Scaled from the left so the bar grows out of the axis
                      // rather than out of its own middle.
                      style={{
                        transformOrigin: "left",
                        width: `${Math.max(1.5, (row.value / max) * 100)}%`,
                      }}
                    />
                  </span>
                </li>
              ))}
            </ul>

            {/* Said plainly rather than implied by bars that don't reach 100%:
                these are the top rows, not the whole picture. */}
            <p className="mt-3 text-[11px] text-ink-soft">
              Shares are of the {countOf(active.rows.length, "row")} shown, which are the largest
              — not of all traffic.
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
