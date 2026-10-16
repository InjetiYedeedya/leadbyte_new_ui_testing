/**
 * Inline trend line. Hand-rolled SVG rather than a charting dependency —
 * a sparkline is a polyline, and the smallest chart library is ~40kB.
 *
 * Server component: it renders from data with no interaction.
 */

export function Sparkline({
  values,
  width = 120,
  height = 28,
  /** Emphasises the final point, which is the one people actually read. */
  markEnd = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  markEnd?: boolean;
}) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pad = 2;
  const usableH = height - pad * 2;

  // A flat series has no span to scale against; draw it down the middle
  // rather than dividing by zero and putting it on the baseline.
  const y = (v: number) =>
    span === 0 ? height / 2 : pad + usableH - ((v - min) / span) * usableH;
  const x = (i: number) => (i / (values.length - 1)) * width;

  const line = values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const area = `${line} ${width},${height} 0,${height}`;

  const lastIndex = values.length - 1;
  const lastValue = values[lastIndex]!;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Trend, ${values.length} points, ending at ${lastValue}`}
      className="w-full"
    >
      <polygon points={area} className="fill-accent/10" />
      <polyline
        points={line}
        fill="none"
        className="stroke-accent"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {markEnd && (
        <circle
          cx={x(lastIndex)}
          cy={y(lastValue)}
          r="2.5"
          className="fill-accent"
        />
      )}
    </svg>
  );
}
