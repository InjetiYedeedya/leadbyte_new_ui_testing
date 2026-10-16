"use client";

/**
 * Three data sources, three lanes, one date axis.
 *
 * ## Why one chart and not three
 *
 * Sessions, search clicks and ad spend arrive in the same call and are all
 * daily series, and the screen used to render each as its own line chart in its
 * own card, hundreds of pixels apart. So the question the page exists to answer
 * — did the paid half buy anything the free half wasn't already getting — could
 * not be asked, because the two answers were never on screen together.
 *
 * ## Why lanes rather than three lines on one axis
 *
 * Because the magnitudes are incompatible. Sessions run in the hundreds, spend
 * in the thousands, impressions in the tens of thousands. Three lines on one
 * y-axis flattens two of them into the baseline; normalising all three to a
 * shared 0-100 makes them comparable by drawing a scale that does not exist,
 * and someone reading "spend crossed above sessions" would be reading an
 * artefact of the transform.
 *
 * Stacked lanes keep each series on its own honest scale, labelled with its own
 * peak, and stack them so a shared x-position is a shared date. Co-movement is
 * still legible — that is what vertical alignment is for — without any claim
 * that the y-values are commensurable. It is also the shape that makes the
 * missing-data case readable: a lane simply starts late.
 *
 * ## Why a client island
 *
 * `components/ui/chart.tsx` is a server component and its doc comment says
 * tooltips were declined on purpose, to keep a client boundary off every
 * analytics screen. That trade was right for a single-series card where the
 * value labels can be drawn. It is wrong here: three lanes over thirty days is
 * ninety values, and reading co-movement means asking "what were all three on
 * the 14th?" — a question only a crosshair answers. So this component takes the
 * boundary and earns it with:
 *
 * - a crosshair spanning all three lanes with one readout for the date,
 * - keyboard access to that readout (arrow keys), because a hover-only value is
 *   unreachable for anyone not using a mouse,
 * - the reveal, which is the page's one piece of non-user-triggered motion.
 *
 * The data is fetched on the server and arrives as a prop. Nothing here loads.
 */

import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { shortDay, type Timeline } from "@/lib/data/analytics-timeline";
import { formatCount, formatMoney } from "@/lib/format";

/**
 * Lane geometry, in CSS pixels — and the SVG's viewBox units are the same
 * pixels, which is the point.
 *
 * The chart stretches horizontally (`preserveAspectRatio="none"`) at a FIXED
 * height. That has one cost and buys two things. The cost: the curves are
 * stretched horizontally, which is what every fluid-width line chart does and
 * does not change which day is higher than which. What it buys: strokes stay
 * hairlines (`vectorEffect`), and every piece of text can live in the DOM at a
 * known pixel offset instead of inside the viewBox, where uniform scaling
 * would size a label off the chart's width — 8px on a phone and 13px on a wide
 * monitor, for the same label.
 *
 * `LABEL_H` is the strip at the top of each lane that the curve is kept out
 * of. The lane's name has to sit somewhere, and drawing it over the plot means
 * it is legible right up until a peak day arrives underneath it.
 */
const LANE_H = 74;
const LABEL_H = 18;
const LANE_GAP = 12;
const LEFT = 0;
const WIDTH = 1000;

interface LaneStyle {
  stroke: string;
  fill: string;
  text: string;
  /** Present only on lanes that need shape as well as colour. */
  dash?: string;
}

/**
 * Each lane's colour, from the semantic tokens.
 *
 * `accent` for the site's own numbers, `good` for what search brings in for
 * free, `warn` for money going out — a reading of the three that holds without
 * anyone being told it.
 *
 * `info` was the obvious first choice for the search lane and is wrong here:
 * `accent` is #2563eb and `info` is #0369a1, both blue, and stacked directly
 * above one another they were not tellable apart. Semantic tokens are chosen
 * for meaning, and two tokens can mean different things while looking the same.
 *
 * Colour is never the only carrier regardless: every lane is NAMED inside its
 * own lane, and spend is dashed as well as amber.
 */
const LANE_STYLE: Record<string, LaneStyle> = {
  sessions: { stroke: "stroke-accent", fill: "fill-accent/12", text: "text-accent" },
  search: { stroke: "stroke-good", fill: "fill-good/12", text: "text-good" },
  spend: { stroke: "stroke-warn", fill: "fill-warn/12", text: "text-warn", dash: "5 3" },
};

/** For a lane added later without a style of its own — legible, not invisible. */
const FALLBACK_STYLE: LaneStyle = {
  stroke: "stroke-ink-soft",
  fill: "fill-ink-soft/10",
  text: "text-ink-soft",
};

function styleFor(key: string): LaneStyle {
  return LANE_STYLE[key] ?? FALLBACK_STYLE;
}

/**
 * A run of consecutive days a lane actually covers.
 *
 * Nulls break the line rather than being bridged. A straight segment across a
 * fortnight an ad account did not exist is a drawn assertion about spend that
 * never happened — the same reason `buildTimeline` keeps null distinct from
 * zero. Each run is its own path, so the gap stays a gap.
 */
interface Run {
  start: number;
  values: number[];
}

function runsOf(values: (number | null)[]): Run[] {
  const runs: Run[] = [];
  let current: Run | null = null;

  values.forEach((value, index) => {
    if (value === null) {
      current = null;
      return;
    }
    if (current === null) {
      current = { start: index, values: [] };
      runs.push(current);
    }
    current.values.push(value);
  });

  return runs;
}

export function TimelineBands({ timeline }: { timeline: Timeline }) {
  const reduce = useReducedMotion();
  const svgRef = useRef<SVGSVGElement>(null);
  const uid = useId();
  const [active, setActive] = useState<number | null>(null);

  const { dates, bands } = timeline;
  const count = dates.length;
  // No trailing gap: the last lane's baseline is the bottom of the chart.
  const height = bands.length * (LANE_H + LANE_GAP) - LANE_GAP;

  /** Date index → x. A single day sits mid-chart rather than at x=0. */
  const xOf = useCallback(
    (index: number) => (count <= 1 ? WIDTH / 2 : LEFT + (index / (count - 1)) * WIDTH),
    [count],
  );

  /** Nearest date index to a clientX, so the crosshair snaps to real data. */
  const indexFromPointer = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg || count === 0) return null;
      const box = svg.getBoundingClientRect();
      if (box.width === 0) return null;
      const fraction = (clientX - box.left) / box.width;
      return Math.min(count - 1, Math.max(0, Math.round(fraction * (count - 1))));
    },
    [count],
  );

  const lanes = useMemo(
    () =>
      bands.map((band, laneIndex) => {
        const top = laneIndex * (LANE_H + LANE_GAP);
        const base = top + LANE_H;
        const plotH = LANE_H - LABEL_H;
        const scale = band.peak && band.peak > 0 ? band.peak : 1;
        // A one-pixel floor so a genuine zero still draws on the baseline
        // instead of vanishing — the lane has to show the day was covered.
        const yOf = (value: number) => base - Math.max(1, (value / scale) * (plotH - 2));

        return {
          band,
          top,
          yOf,
          runs: runsOf(band.values).map((run) => {
            const line = run.values
              .map((value, i) => `${xOf(run.start + i).toFixed(1)},${yOf(value).toFixed(1)}`)
              .join(" ");
            const x0 = xOf(run.start).toFixed(1);
            const x1 = xOf(run.start + run.values.length - 1).toFixed(1);

            return {
              key: `${band.key}-${run.start}`,
              line,
              // A single-day run has no line to fill under, so no area.
              area: run.values.length > 1 ? `${x0},${base} ${line} ${x1},${base}` : null,
              single:
                run.values.length === 1 ? { x: x0, y: yOf(run.values[0]!).toFixed(1) } : null,
            };
          }),
        };
      }),
    [bands, xOf],
  );

  if (count === 0 || bands.length === 0) return null;

  const activeDate = active === null ? null : (dates[active] ?? null);
  /** Every nth date label, so a long window does not turn the axis to mush. */
  const stride = count <= 8 ? 1 : Math.ceil(count / 6);

  return (
    <figure className="m-0">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/8 text-accent"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path d="M4 18v-5M10 18V7M16 18v-8M22 18V4" strokeLinecap="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <figcaption className="text-base font-semibold tracking-tight text-ink">
              Cross-channel timeline
            </figcaption>
            <p className="mt-0.5 text-sm leading-6 text-ink-soft">
              Sessions, search clicks and ad spend on the same dates.
            </p>
          </div>
        </div>
        {/* Said before the lanes rather than under them: three different
            y-scales is the one thing about this chart that has to be known in
            advance, and a note below it is read after the confusion. */}
        <p className="flex items-center gap-2 rounded-lg bg-ground px-3 py-1.5 text-xs text-ink-soft">
          <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3.5 w-3.5">
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 7.5V11M8 5.2v.6" strokeLinecap="round" />
          </svg>
          Separate scales; inspect a date across all three channels.
        </p>
      </div>

      {/* Holds its height whether or not a day is active, so pointing at the
          chart does not shift it down the page.

          The values track the crosshair directly rather than through
          AnimatePresence: keyed on the date it would remount on every pointer
          move, and `mode="wait"` would queue an exit before each enter, so the
          numbers would trail the finger. A readout's whole job is to be exactly
          where the pointer is. The only motion is the swap between the idle
          hint and the numbers.

          `min-h` rather than a fixed height: at 375px both the hint and the
          three values wrap to two lines, and a fixed 20px with `overflow-hidden`
          cut the second line off. Reserving the height was meant to stop the
          chart jumping when a day becomes active — worth keeping where it can
          be had, but not at the cost of hiding the sentence that explains how
          to use the chart. */}
      <div className="mt-2.5 flex min-h-5 items-center">
        <motion.div
          key={activeDate === null ? "idle" : "reading"}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduce ? 0 : 0.15 }}
        >
          {activeDate !== null && active !== null ? (
            <span className="flex flex-wrap items-baseline gap-x-4" aria-hidden="true">
              <span className="text-xs font-medium text-ink">{longDate(activeDate)}</span>
              {bands.map((band) => (
                <span key={band.key} className="text-xs text-ink-soft">
                  {band.label}{" "}
                  <span className={`font-medium tabular-nums ${styleFor(band.key).text}`}>
                    {readValue(band.values[active] ?? null, band.format)}
                  </span>
                </span>
              ))}
            </span>
          ) : (
            <span className="text-xs text-ink-soft">
              Point at the chart, or focus it and use the arrow keys, to read a day.
            </span>
          )}
        </motion.div>
      </div>

      {/* The same readout, spoken. The visual one is aria-hidden: a value that
          exists only as a hover tooltip is unreachable by keyboard and silent
          to a screen reader. */}
      <p aria-live="polite" className="sr-only">
        {activeDate !== null && active !== null
          ? `${longDate(activeDate)}: ${bands
              .map((band) => `${band.label} ${readValue(band.values[active] ?? null, band.format)}`)
              .join(", ")}`
          : ""}
      </p>

      {/* Fixed height, fluid width. The lane labels and the date axis are DOM
          siblings positioned against the SAME pixel geometry the SVG uses, so
          they cannot drift out of line with what they name. */}
      <div className="mt-2 overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="relative" style={{ height }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${WIDTH} ${height}`}
              width="100%"
              height={height}
              preserveAspectRatio="none"
              className="block touch-none rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              role="img"
              aria-label={chartSummary(timeline)}
              tabIndex={0}
              onPointerMove={(event) => setActive(indexFromPointer(event.clientX))}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive((current) => current ?? count - 1)}
              onBlur={() => setActive(null)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  const step = event.key === "ArrowRight" ? 1 : -1;
                  setActive((current) =>
                    Math.min(count - 1, Math.max(0, (current ?? count - 1) + step)),
                  );
                }
                if (event.key === "Home") setActive(0);
                if (event.key === "End") setActive(count - 1);
                if (event.key === "Escape") setActive(null);
              }}
            >
              {lanes.map(({ band, top, runs }, laneIndex) => {
                const style = styleFor(band.key);
                const maskId = `${uid}-lane-${laneIndex}`;

                return (
                  <g key={band.key}>
                    {/* The reveal is a wipe, not a fade: the x-axis is time, so
                        uncovering left to right is the data arriving in the
                        order it happened. A mask animates one rect per lane
                        rather than one per path, and unlike `pathLength` it
                        covers the filled areas too. */}
                    <mask id={maskId} maskUnits="userSpaceOnUse">
                      {/* A plain rect with the `.lane-wipe` class — see
                          `globals.css` for why this is CSS and not Motion,
                          and why it scales instead of animating `width`.
                          60ms between lanes, inside the 30-80ms band. */}
                      <rect
                        className="lane-wipe"
                        style={{ "--delay": `${laneIndex * 60}ms` } as CSSProperties}
                        x={LEFT}
                        y={top}
                        width={WIDTH}
                        height={LANE_H}
                        fill="white"
                      />
                    </mask>

                    {/* Baseline, always drawn — so an empty lane reads as a
                        lane holding nothing rather than as blank space. */}
                    <line
                      x1={LEFT}
                      x2={WIDTH}
                      y1={top + LANE_H}
                      y2={top + LANE_H}
                      className="stroke-border"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />

                    <g mask={`url(#${maskId})`}>
                      {runs.map((run) => (
                        <g key={run.key}>
                          {run.area && <polygon points={run.area} className={style.fill} />}
                          {run.line && (
                            <polyline
                              points={run.line}
                              fill="none"
                              className={style.stroke}
                              strokeWidth="1.75"
                              strokeDasharray={style.dash}
                              strokeLinejoin="round"
                              strokeLinecap="round"
                              vectorEffect="non-scaling-stroke"
                            />
                          )}
                          {run.single && (
                            <circle
                              cx={run.single.x}
                              cy={run.single.y}
                              r="2.5"
                              className={style.stroke.replace("stroke-", "fill-")}
                            />
                          )}
                        </g>
                      ))}
                    </g>
                  </g>
                );
              })}

              {/* The crosshair, across every lane at once — that shared x is
                  the whole reason the lanes are stacked. */}
              {active !== null && (
                <g aria-hidden="true">
                  <line
                    x1={xOf(active)}
                    x2={xOf(active)}
                    y1={0}
                    y2={height}
                    className="stroke-ink/30"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                  {lanes.map(({ band, yOf }) => {
                    const value = band.values[active];
                    if (value === null || value === undefined) return null;
                    return (
                      <circle
                        key={band.key}
                        cx={xOf(active)}
                        cy={yOf(value)}
                        r="3.5"
                        className={`${styleFor(band.key).stroke.replace("stroke-", "fill-")} stroke-ground`}
                        strokeWidth="1.5"
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}
                </g>
              )}
            </svg>

            {/* Each lane says its own name, in its own lane, in the strip the
                curve is kept out of.

                This is what replaced a legend under the chart. A legend asks
                the reader to hold three colours in mind and look back down for
                the key, and it is the only thing that makes colour
                load-bearing. Named in place, the hue is reinforcement instead.

                The peak comes with the name because the peak IS that lane's
                y-scale — without it, a lane's height means nothing. */}
            {lanes.map(({ band, top }) => (
              <div
                key={band.key}
                aria-hidden="true"
                className="pointer-events-none absolute left-0 flex items-baseline gap-2"
                style={{ top }}
              >
                <span className={`text-[11px] font-medium leading-4 ${styleFor(band.key).text}`}>
                  {band.label}
                </span>
                <span className="text-[11px] leading-4 tabular-nums text-ink-soft">
                  {band.peakLabel === null ? "no data yet" : `peak ${band.peakLabel}`}
                </span>
              </div>
            ))}
          </div>

          {/* The date axis, in the DOM — inside a stretched viewBox this text
              would be stretched with it. */}
          <div className="relative mt-1.5 h-4">
            {dates.map((date, index) =>
              index % stride === 0 || index === count - 1 ? (
                <span
                  key={date}
                  className="absolute top-0 whitespace-nowrap text-[11px] leading-4 tabular-nums text-ink-soft"
                  style={{
                    left: `${(xOf(index) / WIDTH) * 100}%`,
                    // The ends align inward so neither runs off the chart.
                    transform:
                      index === 0
                        ? "none"
                        : index === count - 1
                          ? "translateX(-100%)"
                          : "translateX(-50%)",
                  }}
                >
                  {shortDate(date)}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>
    </figure>
  );
}

/**
 * A value in the readout, or an em dash for a day the series does not cover.
 *
 * `formatMoney` handles both — it renders null as the em dash itself, and keeps
 * two decimals under ten, which a day of ad spend routinely is.
 */
function readValue(value: number | null, format: "count" | "amount"): string {
  if (format === "amount") return formatMoney(value);
  return value === null ? "—" : formatCount(value);
}

function shortDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return shortDay(iso);
}

function longDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    // A calendar day parsed as UTC midnight: read it back in UTC, or it shows
    // the day before west of UTC and differs between server and browser.
    timeZone: "UTC",
  });
}

/**
 * What a screen reader is told the chart is.
 *
 * Each lane's peak rather than "a chart with three series": a summary naming
 * the shape is the accessible equivalent of glancing at it, and a label saying
 * only what kind of graphic it is conveys nothing anyone can use.
 */
function chartSummary(timeline: Timeline): string {
  const days = timeline.dates.length;
  const lanes = timeline.bands
    .map((band) =>
      band.peakLabel === null ? `${band.label}: no data` : `${band.label}: peak ${band.peakLabel}`,
    )
    .join("; ");
  return `Daily chart over ${days} ${days === 1 ? "day" : "days"}. ${lanes}.`;
}
