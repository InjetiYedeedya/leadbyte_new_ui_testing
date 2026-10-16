/**
 * The previous period, aligned under the current one.
 *
 * ## What this is for
 *
 * The legacy dashboard's charts drew the current period as a filled area and
 * the period before it as a dashed "ghost" line behind it. That one idiom is
 * what turns a chart from "here is a shape" into "here is whether it is
 * better than last time" — and it is the question a dashboard exists to
 * answer. Ours drew a single series, so a busy month and a collapsing one
 * looked identical.
 *
 * ## How the two periods are chosen
 *
 * The series is split in half: the newer half is the current period, the older
 * half is what it is compared against. So a 60-day window charts the last 30
 * days against the 30 before them, and the x-axis is the current period's
 * dates.
 *
 * That is the only honest split available. The rows carry no notion of a
 * reporting period, and picking a fixed 30 days would compare a 14-day
 * account's fortnight against two empty weeks and report a collapse.
 *
 * ## Why an odd day is dropped, and from the OLDER half
 *
 * The halves have to be the same length or the comparison is between a longer
 * period and a shorter one, which favours whichever got the extra day. With an
 * odd number of days the extra one is dropped from the older half — never the
 * newer — because the current period is what the reader came to look at and
 * silently hiding its most recent day would be the worse error.
 *
 * ## Why a short series gets no comparison at all
 *
 * Under `MIN_DAYS` there is not enough on either side for a difference to mean
 * anything, so `prior` is null throughout and the chart draws one line. A ghost
 * built from two days is noise presented as a trend.
 */

/** Below this, a split produces two periods too short to compare. */
const MIN_DAYS = 6;

/**
 * Deliberately the same shape as the chart's `Point`: `value` is the current
 * period and `prior` is the ghost. Calling it `current` read better here and
 * meant every caller mapping one field name to another on the way into
 * `LineChart` — four chances to get it wrong for one word of prose.
 */
export interface PriorPoint {
  label: string;
  value: number;
  /** The matching day of the previous period, or null when there is none. */
  prior: number | null;
}

export interface PriorSeries {
  points: PriorPoint[];
  /** True when a previous period was found and `prior` is populated. */
  hasPrior: boolean;
  /** How many days each period covers, for the caption. */
  periodDays: number;
}

/**
 * Splits a daily series into the current period and the one before it.
 *
 * Input must be oldest-first, which is what every mapper in `lib/data`
 * already returns.
 */
export function withPriorPeriod(
  rows: readonly { label: string; value: number }[],
): PriorSeries {
  if (rows.length < MIN_DAYS) {
    return {
      points: rows.map((row) => ({ label: row.label, value: row.value, prior: null })),
      hasPrior: false,
      periodDays: rows.length,
    };
  }

  // Rounded DOWN so both halves are the same length; the odd day falls off the
  // old end, which `rows.slice` below does by starting the prior window late.
  const half = Math.floor(rows.length / 2);
  const current = rows.slice(rows.length - half);
  const prior = rows.slice(rows.length - half * 2, rows.length - half);

  return {
    points: current.map((row, index) => ({
      label: row.label,
      value: row.value,
      prior: prior[index]?.value ?? null,
    })),
    hasPrior: true,
    periodDays: half,
  };
}

/**
 * How the current period compares with the previous one, as a fraction.
 *
 * Totals, not a mean of daily differences: a quiet day with one lucky visitor
 * must not weigh as much as a busy one. Null when there is no previous period,
 * or when it was empty — dividing by zero would report an infinite improvement
 * for a site that simply had no traffic before.
 */
export function periodDelta(series: PriorSeries): number | null {
  if (!series.hasPrior) return null;

  const current = series.points.reduce((sum, point) => sum + point.value, 0);
  const prior = series.points.reduce((sum, point) => sum + (point.prior ?? 0), 0);

  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}
