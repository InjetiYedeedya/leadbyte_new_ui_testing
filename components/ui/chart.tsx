/**
 * Line and bar charts.
 *
 * Server components rendering plain SVG. No charting dependency: the smallest
 * usable library is ~40kB and would land in every analytics route, and what the
 * migration actually needs — a trend line, a ranked bar list, a faint grid — is
 * a few dozen lines of geometry.
 *
 * Deliberately no hover tooltips. That would force a client boundary onto every
 * analytics screen; the value labels are rendered instead, which is also what a
 * screen reader gets.
 */

import { formatCount } from "@/lib/format";

const PAD = { top: 12, right: 12, bottom: 26, left: 44 };

export interface Point {
  /** X label — a date, a day name, a bucket. */
  label: string;
  value: number;
  /**
   * The same day of the PREVIOUS period, drawn as a dashed ghost behind the
   * current line. Null where there is no comparable day; see
   * `lib/data/prior-period.ts` for how the two periods are chosen.
   */
  prior?: number | null;
}

function niceCeiling(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

const GRID_STEPS = [0, 0.25, 0.5, 0.75, 1] as const;

/** Y gridlines + labels, for the bar chart. */
function Grid({
  ceiling,
  width,
  height,
}: {
  ceiling: number;
  width: number;
  height: number;
}) {
  const plotH = height - PAD.top - PAD.bottom;
  return (
    <g aria-hidden="true">
      {GRID_STEPS.map((fraction) => {
        const y = PAD.top + plotH * (1 - fraction);
        return (
          <g key={fraction}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y}
              y2={y}
              className="stroke-border"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={y + 3.5}
              textAnchor="end"
              className="fill-ink-soft text-[9px] tabular-nums"
            >
              {compact(ceiling * fraction)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Every nth label, so a 30-day axis doesn't collapse into mush. */
function xLabelStride(count: number): number {
  if (count <= 8) return 1;
  return Math.ceil(count / 7);
}

const TONES = {
  accent: { line: "stroke-accent", area: "fill-accent/10", dot: "fill-accent", legend: "bg-accent" },
  good: { line: "stroke-good", area: "fill-good/10", dot: "fill-good", legend: "bg-good" },
  warn: { line: "stroke-warn", area: "fill-warn/10", dot: "fill-warn", legend: "bg-warn" },
};

/**
 * The plot's own coordinate space. Arbitrary: the geometry is drawn in it and
 * then stretched to whatever box the chart is given (see `LineChart`).
 */
const PLOT = 1000;

export function LineChart({
  points,
  height = 220,
  caption,
  currentLabel = "This period",
  priorLabel = "Previous period",
  tone = "accent",
  minWidth = 520,
}: {
  points: Point[];
  /** The chart's height in CSS pixels. It does not grow with the width. */
  height?: number;
  caption?: string;
  /**
   * Which channel this chart belongs to.
   *
   * Not decoration: the three channels are colour-coded on the summary cards
   * and in the timeline's lanes, and a search chart drawn in the traffic
   * colour makes the reader check which one they are looking at.
   */
  tone?: keyof typeof TONES;
  /**
   * The narrowest the plot may be drawn before it scrolls sideways.
   *
   * 520 suits a chart with the page to itself. In a three-column row it is
   * wider than the column, so every chart there arrived with its own scrollbar
   * and a squashed axis — hence the override rather than a fixed floor.
   */
  minWidth?: number;
  /** What the solid line is, named in the legend — "Recent 38 days". */
  currentLabel?: string;
  /** What the ghost line is, named in the legend. */
  priorLabel?: string;
}) {
  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const priorValues = points
    .map((p) => p.prior)
    .filter((value): value is number => value !== null && value !== undefined);
  const hasPrior = priorValues.length > 1;

  // The ceiling spans BOTH series. Scaled to the current period alone, a
  // previous period that was twice as big would be drawn off the top of the
  // chart — which reads as no ghost at all, i.e. as no comparison rather than
  // as a fall.
  const ceiling = niceCeiling(Math.max(...values, ...priorValues));
  const plotH = height - PAD.top - PAD.bottom;

  // Fractions of the plot, 0..1. The line is drawn in `PLOT` units and the
  // labels and dot are placed by percentage, so all three agree at any width.
  const fx = (i: number) => i / (points.length - 1);
  const fy = (v: number) => 1 - v / ceiling;
  const pt = (i: number, v: number) => `${(fx(i) * PLOT).toFixed(1)},${(fy(v) * PLOT).toFixed(1)}`;

  const line = points.map((p, i) => pt(i, p.value)).join(" ");
  const area = `0,${PLOT} ${line} ${PLOT},${PLOT}`;
  const priorLine = hasPrior
    ? points
        .map((p, i) => (p.prior === null || p.prior === undefined ? null : pt(i, p.prior)))
        .filter((pair): pair is string => pair !== null)
        .join(" ")
    : null;
  const stride = xLabelStride(points.length);

  /**
   * Which dates get a label. The last one always does — it is the "how recent
   * is this" answer — and any strided label close enough to collide with it is
   * dropped rather than drawn on top of it. Measured at 768px with 38 points:
   * stride 6 labelled index 36, and "13 Sept" sat on "14 Sept".
   */
  const labelled = new Set<number>();
  for (let i = 0; i < points.length; i += stride) labelled.add(i);
  for (const i of [...labelled]) if (points.length - 1 - i < stride / 2) labelled.delete(i);
  labelled.add(points.length - 1);
  const last = points[points.length - 1]!;
  const colour = TONES[tone];
  const pct = (fraction: number) => `${(fraction * 100).toFixed(3)}%`;

  /*
   * ## Why three layers rather than one scaled SVG
   *
   * It was one SVG with a fixed viewBox (720x220) stretched to the card's
   * width, so EVERYTHING scaled with the card: at the full width of a 14"
   * laptop the chart came out nearly twice as tall as designed, axis text
   * included, and filled the screen on its own. Wider screens were worse.
   *
   * Now the height is fixed in CSS pixels and only the line stretches:
   *
   *   - the line, area and ghost are drawn in a `preserveAspectRatio="none"`
   *     SVG that fills the plot box, with `non-scaling-stroke` so a stretch
   *     never thickens or thins a stroke;
   *   - the gridlines and date labels are in an unscaled SVG placed by
   *     percentage, so text stays at its real size;
   *   - the end dot is an HTML dot, because a circle in the stretched layer
   *     would become an ellipse.
   *
   * Still no JavaScript: percentages do what measuring the width would.
   */
  return (
    <div className="overflow-x-auto">
      <div
        role="img"
        aria-label={[
          caption ?? `Line chart, ${points.length} points, latest ${last.value} on ${last.label}`,
          hasPrior ? `Compared against the ${priorLabel.toLowerCase()}.` : "",
        ]
          .filter(Boolean)
          .join(" ")}
        className="flex"
        style={{ minWidth, height }}
      >
        {/* The y-axis values. */}
        <svg aria-hidden="true" width={PAD.left} height={height} className="shrink-0 overflow-visible">
          {GRID_STEPS.map((fraction) => (
            <text
              key={fraction}
              x={PAD.left - 8}
              y={PAD.top + plotH * (1 - fraction) + 3.5}
              textAnchor="end"
              className="fill-ink-soft text-[11px] tabular-nums"
            >
              {compact(ceiling * fraction)}
            </text>
          ))}
        </svg>

        <div className="relative min-w-0 flex-1" style={{ marginRight: PAD.right }}>
          {/* Gridlines and dates: unscaled, positioned by percentage. */}
          <svg aria-hidden="true" className="absolute inset-0 size-full overflow-visible">
            {GRID_STEPS.map((fraction) => {
              const y = PAD.top + plotH * (1 - fraction);
              return (
                <line key={fraction} x1="0" x2="100%" y1={y} y2={y} className="stroke-border" strokeWidth="1" />
              );
            })}
            {points.map((p, i) =>
              labelled.has(i) ? (
                <text
                  key={p.label + i}
                  x={pct(fx(i))}
                  y={height - 8}
                  // The two ends anchor inwards, so neither date hangs off the
                  // plot into the axis or out past the card.
                  textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
                  className="fill-ink-soft text-[11px]"
                >
                  {p.label}
                </text>
              ) : null,
            )}
          </svg>

          {/* The data: stretched to the plot box. */}
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${PLOT} ${PLOT}`}
            preserveAspectRatio="none"
            className="absolute inset-x-0 w-full overflow-visible"
            style={{ top: PAD.top, height: plotH }}
          >
            {/* The ghost goes down FIRST, so the current period is never hidden
                behind its own history. Dashed and unfilled: it is context, and
                two filled areas would fight for the same space. */}
            {priorLine && (
              <polyline
                points={priorLine}
                fill="none"
                className="stroke-ink-soft/50"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}

            <polygon points={area} className={colour.area} />
            <polyline
              points={line}
              fill="none"
              className={colour.line}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <span
            aria-hidden="true"
            className={`absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full ${colour.legend}`}
            style={{ left: pct(fx(points.length - 1)), top: PAD.top + plotH * fy(last.value) }}
          />
        </div>
      </div>

      {/* Only when there is something to disambiguate. A legend over a single
          series names the one thing already named by the panel above it. */}
      {hasPrior && (
        <ul className="mt-2 flex flex-wrap justify-center gap-x-6 gap-y-1">
          <li className="flex items-center gap-2 text-xs text-ink-soft">
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${colour.legend}`} />
            {currentLabel}
          </li>
          <li className="flex items-center gap-2 text-xs text-ink-soft">
            <span
              aria-hidden="true"
              className="h-0 w-5 shrink-0 border-t-2 border-dashed border-ink-soft/60"
            />
            {priorLabel}
          </li>
        </ul>
      )}
    </div>
  );
}

export function BarChart({
  points,
  height = 220,
  width = 720,
  caption,
}: {
  points: Point[];
  height?: number;
  width?: number;
  caption?: string;
}) {
  if (points.length === 0) return null;

  const ceiling = niceCeiling(Math.max(...points.map((p) => p.value)));
  const plotH = height - PAD.top - PAD.bottom;
  const plotW = width - PAD.left - PAD.right;
  const slot = plotW / points.length;
  const barW = Math.max(4, Math.min(48, slot * 0.62));
  const stride = xLabelStride(points.length);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[520px]"
        role="img"
        aria-label={caption ?? `Bar chart, ${points.length} bars`}
      >
        <Grid ceiling={ceiling} width={width} height={height} />

        {points.map((p, i) => {
          const barH = ceiling === 0 ? 0 : (p.value / ceiling) * plotH;
          const cx = PAD.left + slot * i + slot / 2;
          return (
            <g key={p.label + i}>
              <rect
                x={cx - barW / 2}
                y={PAD.top + plotH - barH}
                width={barW}
                height={Math.max(barH, p.value > 0 ? 1 : 0)}
                rx="2"
                className="fill-accent"
              />
              {(i % stride === 0 || points.length <= 12) && (
                <text
                  x={cx}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-ink-soft text-[9px]"
                >
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Ranked horizontal bars — the right form for "top sources", "top countries",
 * "top pages", where the label matters more than the shape.
 */
export function RankedBars({
  items,
  valueLabel,
}: {
  items: { label: string; value: number }[];
  valueLabel?: string;
}) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-3 text-sm">
          <span className="w-40 shrink-0 truncate text-ink-soft" title={item.label}>
            {item.label}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-raised">
            <span
              className="block h-2 rounded-full bg-accent"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
            />
          </span>
          <span className="w-20 shrink-0 text-right tabular-nums text-ink">
            {formatCount(item.value)}
            {valueLabel && <span className="ml-1 text-xs text-ink-soft">{valueLabel}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Proportions of a whole, with the legend as a table.
 *
 * ## Why a donut at all
 *
 * `RankedBars` is the better chart for almost everything — it puts the label
 * beside the value and compares lengths, which people read accurately. A donut
 * is for the one question bars answer badly: what share of the total is this?
 * Devices, channel types, statuses — a small set of parts that add to
 * something meaningful. `RankedBars` shows five bars of a long tail and implies
 * nothing about the whole; this shows the whole, and says how much of it is
 * missing when the parts do not cover it.
 *
 * ## Why the legend is a table
 *
 * A donut alone is unreadable: nobody can tell 18% from 22% by arc length, and
 * matching a colour to a label is work. So the exact numbers sit in rows beside
 * it. The arcs give the shape at a glance and the rows give the answer — which
 * is also why the colour is never the only carrier of which slice is which.
 *
 * ## Why at most six slices
 *
 * Past that the arcs are slivers and the palette runs out of distinguishable
 * hues. The rest are summed into "Other", which is honest and keeps the total
 * correct — dropping them would make the donut add up to less than everything.
 */

/** Tokens, in an order chosen so neighbouring arcs never share a hue family. */
const SLICE_CLASSES = [
  "text-accent",
  "text-good",
  "text-warn",
  "text-info",
  "text-crit",
  "text-ink-soft",
] as const;

const MAX_SLICES = 6;

export function SplitDonut({
  data,
  unitLabel,
  size = 168,
}: {
  // `label`, not the legacy's Recharts-flavoured `name`: `RankedBars`,
  // `NamedCount` and `Point` all use `label`, and one odd name here would mean
  // a `.map()` at every call site to rename a field.
  data: { label: string; value: number }[];
  /** What the numbers are — "sessions", "campaigns". */
  unitLabel?: string;
  size?: number;
}) {
  const positive = data.filter((slice) => slice.value > 0);
  // One slice is not a proportion: a full ring says "100% of it is this", which
  // the reader already knew from the single row beside it.
  if (positive.length < 2) return null;

  const sorted = [...positive].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, MAX_SLICES - 1);
  const tail = sorted.slice(MAX_SLICES - 1);
  const slices =
    tail.length > 0
      ? [...head, { label: "Other", value: tail.reduce((sum, s) => sum + s.value, 0) }]
      : head;

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  // Geometry: one circle per slice, drawn with a dash gap and rotated into
  // place. Cheaper and steadier than arc paths, and it cannot produce the
  // degenerate "single arc covering the full circle" case that breaks
  // large-arc-flag maths.
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="shrink-0"
        role="img"
        aria-label={`Donut chart. ${slices
          .map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`)
          .join(", ")}.`}
      >
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {slices.map((slice, index) => {
            const length = (slice.value / total) * circumference;
            const dash = `${length} ${circumference - length}`;
            const element = (
              <circle
                key={slice.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth="16"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                className={`${SLICE_CLASSES[index % SLICE_CLASSES.length]} stroke-current`}
              />
            );
            offset += length;
            return element;
          })}
        </g>

        {/* The total in the middle: the number the parts are parts OF, which a
            ring of arcs never states. */}
        <text
          x={size / 2}
          y={size / 2 - 2}
          textAnchor="middle"
          className="fill-ink text-[15px] font-semibold tabular-nums"
        >
          {formatCount(total)}
        </text>
        {unitLabel && (
          <text
            x={size / 2}
            y={size / 2 + 13}
            textAnchor="middle"
            className="fill-ink-soft text-[9px]"
          >
            {unitLabel}
          </text>
        )}
      </svg>

      <ul className="w-full min-w-0 flex-1">
        {slices.map((slice, index) => (
          <li
            key={slice.label}
            className="flex items-center gap-3 border-b border-border/60 py-1.5 text-sm last:border-b-0"
          >
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 shrink-0 rounded-sm ${SLICE_CLASSES[index % SLICE_CLASSES.length]} bg-current`}
            />
            <span className="min-w-0 flex-1 truncate text-ink" title={slice.label}>
              {slice.label}
            </span>
            <span className="shrink-0 tabular-nums text-ink">{formatCount(slice.value)}</span>
            <span className="w-10 shrink-0 text-right tabular-nums text-ink-soft">
              {((slice.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
