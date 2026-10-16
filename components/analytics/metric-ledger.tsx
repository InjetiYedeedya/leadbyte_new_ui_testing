import { Sparkline } from "@/components/ui/sparkline";

/**
 * The headline numbers, as one row.
 *
 * ## Why this replaced twelve stat cards
 *
 * The screen used three `StatGrid`s of four `StatCard`s — twelve bordered,
 * shadowed, identically-sized tiles down one page, each with a monospace
 * all-caps label. Two things go wrong with that:
 *
 * - **Nothing has a rank.** Sessions, "days of data" and average search
 *   position were rendered at the same size in the same box, so the screen
 *   asserted they matter equally. One of those is a metric and one is metadata
 *   about our own import.
 * - **The card is doing no work.** A border and a shadow around a number
 *   separate it from a neighbour that a column of whitespace already separated.
 *   Twelve of them is the look of a dashboard assembled from a component kit
 *   rather than designed.
 *
 * So: one row, hairline dividers, numbers at a size that reads as the page's
 * subject. Each entry names where it came from, because a figure with no
 * provenance on a screen fed by three different accounts is a guess.
 *
 * ## Why the source label and not an eyebrow
 *
 * `Google Analytics` under `Sessions` is information — it says which connection
 * to go and check when the number looks wrong. That is the test for a label:
 * it earns its place by being actionable, not by decorating the number above
 * it.
 */

export interface LedgerEntry {
  label: string;
  /** Pre-formatted. Null renders as an em dash — never as zero. */
  value: string | null;
  /** Where the figure came from, so a wrong number leads somewhere. */
  source: string;
  /** Change against the previous period, as a fraction. */
  deltaPercent?: number | null;
  /** Which direction is a good outcome. A falling cost is good; falling sessions are not. */
  goodDirection?: "up" | "down" | "neutral";
  /**
   * Recent daily values, oldest first, drawn as an inline sparkline.
   *
   * A delta says how much it moved; the sparkline says HOW — a steady climb
   * and a spike that has already collapsed give the same +8%, and only one of
   * them is good news. Optional because several ledger entries are ratios with
   * no daily series behind them (a click-through rate, a return on ad spend).
   */
  series?: number[];
}

function deltaClass(delta: number, goodDirection: "up" | "down" | "neutral"): string {
  // Under a tenth of a percent is noise, not a movement, and colouring it
  // green or red asserts a trend that a single visitor could reverse.
  if (Math.abs(delta) < 0.1 || goodDirection === "neutral") return "text-ink-soft";
  const isGood = goodDirection === "up" ? delta > 0 : delta < 0;
  return isGood ? "text-good" : "text-crit";
}

/**
 * Columns for a given number of entries.
 *
 * A fixed five-column grid leaves empty cells in any shorter row, and an empty
 * cell in a ledger is a hole in the middle of the page's headline row. The
 * counts here divide evenly at every breakpoint they apply to.
 *
 * Written out rather than interpolated because Tailwind scans source for class
 * strings, and `lg:grid-cols-${n}` is not a string it can find.
 */
const COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-1 sm:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
};

export function MetricLedger({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) return null;

  // Beyond the map, two rows of three is better than seven cramped columns.
  const columns = COLUMNS[entries.length] ?? "grid-cols-2 sm:grid-cols-3";

  return (
    <dl
      className={`grid ${columns} overflow-hidden rounded-lg border border-border bg-surface`}
    >
      {entries.map((entry) => {
        const delta = entry.deltaPercent;

        return (
          // Each cell rings itself. Neighbouring outlines land on the same
          // pixel, so every divider is one hairline with no doubled edge and no
          // `last:` exception at any breakpoint — and unlike a grid gap over a
          // coloured background, nothing is painted where a cell is absent.
          <div
            key={entry.label}
            className="px-4 py-3 outline outline-1 -outline-offset-[0.5px] outline-border"
          >
            <dt className="text-xs leading-5 text-ink-soft">{entry.label}</dt>
            <dd className="mt-1 flex flex-wrap items-baseline gap-1.5">
              <span className="text-[1.375rem] font-semibold leading-7 tabular-nums tracking-tight text-ink">
                {entry.value ?? "—"}
              </span>
              {delta !== null && delta !== undefined && (
                <span
                  className={`text-xs font-medium tabular-nums ${deltaClass(delta, entry.goodDirection ?? "up")}`}
                >
                  {/* The sign carries the direction for anyone who cannot see
                      the colour; the arrow is for everyone else. */}
                  <span aria-hidden="true">{delta > 0 ? "↑" : delta < 0 ? "↓" : "→"}</span>{" "}
                  {delta > 0 ? "+" : delta < 0 ? "−" : ""}
                  {Math.abs(delta).toFixed(1)}%
                </span>
              )}
            </dd>
            <dd className="mt-1 text-xs leading-5 text-ink-soft">{entry.source}</dd>

            {/* Two points is a line segment, not a trend. */}
            {entry.series && entry.series.length > 2 && (
              <dd className="mt-2">
                <Sparkline values={entry.series} />
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}
