import { Sparkline } from "./sparkline";

/**
 * A single metric tile. The unit of every dashboard in the migration.
 *
 * Two rules encoded here, both learned from wiring the advertising repo:
 *
 * 1. A missing value renders as an em dash, never as 0. "No conversions yet"
 *    and "a CPA of 0" mean opposite things to someone deciding where to spend.
 * 2. Direction is not assumed. A falling cost is good; falling sessions are
 *    not — so the caller states whether up is good via `goodDirection`.
 */

export type Trend = "up" | "down" | "flat";

export interface StatCardProps {
  label: string;
  /** Pre-formatted. Pass null when there is genuinely no value. */
  value: string | null;
  /** Small line under the value — a comparison, a target, a source. */
  note?: string;
  /** Percentage change against the previous period. */
  deltaPercent?: number | null;
  /** Which direction is a good outcome for this metric. Default: up. */
  goodDirection?: "up" | "down" | "neutral";
  /** Recent values, oldest first, for the inline sparkline. */
  series?: number[];
}

function trendOf(delta: number): Trend {
  if (delta > 0.05) return "up";
  if (delta < -0.05) return "down";
  return "flat";
}

function deltaClass(trend: Trend, goodDirection: "up" | "down" | "neutral"): string {
  if (trend === "flat" || goodDirection === "neutral") return "text-ink-soft";
  const isGood = goodDirection === "up" ? trend === "up" : trend === "down";
  return isGood ? "text-good" : "text-crit";
}

export function StatCard({
  label,
  value,
  note,
  deltaPercent = null,
  goodDirection = "up",
  series,
}: StatCardProps) {
  const trend = deltaPercent === null ? null : trendOf(deltaPercent);

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
      <span className="text-xs font-medium text-ink-soft">{label}</span>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums tracking-tight text-ink">
          {value ?? "—"}
        </span>
        {trend !== null && deltaPercent !== null && (
          <span
            className={`text-xs font-medium tabular-nums ${deltaClass(trend, goodDirection)}`}
            aria-label={`${deltaPercent > 0 ? "up" : deltaPercent < 0 ? "down" : "unchanged"} ${Math.abs(deltaPercent).toFixed(1)} percent`}
          >
            {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}{" "}
            {Math.abs(deltaPercent).toFixed(1)}%
          </span>
        )}
      </div>

      {note && <span className="text-xs text-ink-soft">{note}</span>}

      {series && series.length > 1 && (
        <div className="mt-2">
          <Sparkline values={series} />
        </div>
      )}
    </div>
  );
}

/** Responsive grid the dashboards lay their tiles out on. */
export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
  );
}
