import type { PresenceNode } from "@/lib/data/overview-summary";

/**
 * An account's digital presence, drawn as one signal running left to right.
 *
 * ## What it is, and what it deliberately is not
 *
 * A single hairline path through four points. Each point carries a label and,
 * where one exists, a figure. Between the points the line rises and falls by
 * the value at each node, so the connector is data drawing rather than a
 * decorative swoosh.
 *
 * There is **no `<rect>` in this component**, and the test asserts that. The
 * intro it replaced was a picture of floating stacked cards, which is the
 * motif the design brief banned most explicitly: it read as a stock SaaS
 * illustration and said nothing about the account looking at it. This is flat
 * on the page like a figure in a printed article, with exactly one accent
 * element — the furthest node that has data, the frontier of what this
 * account has actually reached.
 *
 * ## Fixed viewBox, and why that is load-bearing
 *
 * `ScrollStack` measures where the cards below this intro sit, and its
 * `ResizeObserver` watches the stack container and its children — never
 * anything above them. So an intro that changes height after mount shifts
 * every card's landing point with no re-measure and quietly breaks the
 * pinning. A fixed `viewBox` has its rendered height at first paint and
 * cannot do that.
 *
 * The same reasoning is why every label is an SVG `<text>` inside the
 * viewBox rather than HTML positioned beside it: HTML labels reflow on font
 * metrics and line-wrapping, which is exactly the late height change the
 * measurement cannot survive. If the labels ever feel too small, change the
 * density or the viewBox — do not move them into the DOM.
 *
 * ## Accessibility
 *
 * One `aria-label` sentence for the whole drawing, with the text group
 * hidden, so a screen reader gets a sentence rather than eight orphan words.
 * Passing no `label` makes it decoration instead.
 */

const DENSITY = {
  /** Beside the copy on a wide screen: labels above, figures below. */
  full: { width: 440, height: 232, baseline: 150, amplitude: 26, labelSize: 12, valueSize: 11 },
  /** A compact strip for narrow columns, where `full` labels fall under 9px. */
  rail: { width: 360, height: 84, baseline: 46, amplitude: 12, labelSize: 11, valueSize: 10 },
} as const;

export function PresenceFlow({
  nodes,
  density = "full",
  label,
  className = "",
}: {
  nodes: PresenceNode[];
  density?: keyof typeof DENSITY;
  /** A sentence describing the whole drawing. Omit to make it decoration. */
  label?: string;
  className?: string;
}) {
  // A single point is not a flow, and a flow of none is not a drawing.
  if (nodes.length < 2) return null;

  const d = DENSITY[density];
  const insetX = 34;
  const step = (d.width - insetX * 2) / (nodes.length - 1);

  const last = nodes.length - 1;
  const points = nodes.map((node, i) => ({
    node,
    x: insetX + step * i,
    /*
     * The outer labels anchor inward. Centred text on the first and last
     * nodes overflows the viewBox as soon as a value is wide — "99
     * conversions" under the final node was clipped by the right edge, which
     * is a truncated figure, not a styling nit. Anchoring outward-safe keeps
     * every label inside the box whatever the value turns out to be.
     */
    anchor: i === 0 ? ("start" as const) : i === last ? ("end" as const) : ("middle" as const),
    // A few pixels back from the dot so the anchored text still reads as
    // belonging to it rather than starting at it.
    textX: i === 0 ? insetX + step * i - 6 : i === last ? insetX + step * i + 6 : insetX + step * i,
    // A dormant node sits ON the baseline: nothing known, nothing raised.
    y: d.baseline - d.amplitude * (node.state === "dormant" ? 0 : node.strength),
  }));

  /*
   * The path is emitted as one segment per gap rather than as a single `d`,
   * because a gap ENDING at a dormant node is dashed and the others are not.
   * That dash is the honest "not known yet" mark, and it is what makes the
   * picture differ between two accounts instead of asserting the same funnel
   * for everyone.
   *
   * Horizontal control handles at the midpoint give a signal trace rather
   * than a zigzag.
   */
  const segments = points.slice(1).map((to, i) => {
    const from = points[i]!;
    const mid = (from.x + to.x) / 2;
    return {
      key: `${from.node.id}-${to.node.id}`,
      d: `M ${from.x} ${from.y} C ${mid} ${from.y}, ${mid} ${to.y}, ${to.x} ${to.y}`,
      dormant: to.node.state === "dormant",
    };
  });

  // The furthest node with real data: the one place accent is spent.
  const frontier = [...points].reverse().find((p) => p.node.state === "active")?.node.id ?? null;

  return (
    <svg
      viewBox={`0 0 ${d.width} ${d.height}`}
      className={className}
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {segments.map((segment) => (
        <path
          key={segment.key}
          d={segment.d}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={1.5}
          strokeLinecap="round"
          // `non-scaling-stroke` so the hairline stays a hairline at every
          // render width and never thickens into something that reads as UI.
          vectorEffect="non-scaling-stroke"
          strokeDasharray={segment.dormant ? "2 6" : undefined}
          // Normalises this segment's length to 1 unit so `.flow-draw`'s
          // dash wipe works with one duration whatever the segment measures.
          // It is an SVG attribute, not a CSS property.
          pathLength={segment.dormant ? undefined : 1}
          className={segment.dormant ? undefined : "flow-draw"}
        />
      ))}

      <g aria-hidden="true">
        {points.map(({ node, x, y, anchor, textX }) => {
          const isFrontier = node.id === frontier;
          const dot =
            node.state === "dormant"
              ? { r: 3, fill: "var(--color-surface)", stroke: "var(--color-border)" }
              : node.state === "pending"
                ? { r: 4.5, fill: "var(--color-surface)", stroke: "var(--color-ink-soft)" }
                : {
                    r: 4.5,
                    fill: isFrontier ? "var(--color-accent)" : "var(--color-ink-soft)",
                    stroke: isFrontier ? "var(--color-accent)" : "var(--color-ink-soft)",
                  };

          return (
            <g key={node.id}>
              <circle
                cx={x}
                cy={y}
                r={dot.r}
                fill={dot.fill}
                stroke={dot.stroke}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={textX}
                y={y - 16}
                textAnchor={anchor}
                fontSize={d.labelSize}
                fill={node.state === "dormant" ? "var(--color-ink-soft)" : "var(--color-ink)"}
                fontWeight={500}
              >
                {node.label}
              </text>
              {/* No figure at all rather than a nought: a node that has not
                  lit up has nothing to report, and "0" reads as a measured
                  result. */}
              {node.value && (
                <text
                  x={textX}
                  y={y + 24}
                  textAnchor={anchor}
                  fontSize={d.valueSize}
                  fill="var(--color-ink-soft)"
                >
                  {node.value}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
