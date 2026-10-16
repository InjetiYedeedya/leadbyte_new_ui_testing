/**
 * One row per day, out of tables that hold several.
 *
 * ## The bug this exists for
 *
 * Every daily table the app reads is keyed by day AND by something else —
 * `google_analytics_daily` and `search_console_daily` are documented as one row
 * per PROPERTY per day, and the ad tables are one row per account per day. An
 * account with two GA4 properties, or an http and an https Search Console
 * property for the same site, therefore gets two rows for every date.
 *
 * Nothing collapsed them, which was wrong three ways at once:
 *
 * - **React reported duplicate keys.** The daily tables key rows on the date,
 *   and that is what surfaced this — the numbers looked plausible and would
 *   not have.
 * - **Every figure was one property's**, presented as the site's. A date shown
 *   twice with different numbers is not a table anyone can read.
 * - **The line charts zig-zagged**, drawing two points at the same x.
 *
 * `mapTopQueries` had the identical bug for the same reason, one layer down.
 *
 * ## Why the caller reduces a whole group, not two rows at a time
 *
 * A pairwise `merge(a, b)` is the obvious shape and it is a trap: averaging is
 * not associative, so folding three rows pairwise gives `((a+b)/2 + c)/2`
 * rather than `(a+b+c)/3`. Search Console's average position is exactly that
 * kind of field. Handing the caller every row for one date makes the honest
 * reduction the easy one to write.
 */

export function rollupByDate<T extends { date: string }, R extends { date: string }>(
  rows: readonly T[],
  combine: (group: T[], date: string) => R,
): R[] {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    // A row with no date cannot be placed on a time axis, and charting it at
    // the epoch would put it decades before everything else.
    if (row.date === "") continue;
    const existing = groups.get(row.date);
    if (existing === undefined) groups.set(row.date, [row]);
    else existing.push(row);
  }

  return [...groups.entries()]
    .map(([date, group]) => combine(group, date))
    // Oldest first, so charts read left to right in time. ISO dates sort
    // lexically, which is why they are kept as strings until they are shown.
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Sums one field across a day's rows. */
export function sumOf<T>(group: readonly T[], read: (row: T) => number): number {
  return group.reduce((total, row) => total + read(row), 0);
}

/**
 * An average weighted by another field, for a day's rows.
 *
 * Search Console's average position and click-through rate are both of this
 * kind: a property with three impressions must not pull the site's average
 * as hard as one with three thousand.
 *
 * Falls back to a plain mean when every weight is zero — a real shape in this
 * data — and to null when there is nothing to average at all. Never zero:
 * position zero is the best rank there is, and would be read as one.
 */
export function weightedMean<T>(
  group: readonly T[],
  read: (row: T) => number,
  weight: (row: T) => number,
): number | null {
  const totalWeight = sumOf(group, weight);

  if (totalWeight > 0) {
    return sumOf(group, (row) => read(row) * weight(row)) / totalWeight;
  }

  const present = group.map(read).filter((value) => value > 0);
  if (present.length === 0) return null;
  return present.reduce((total, value) => total + value, 0) / present.length;
}

/**
 * A day as `YYYY-MM-DD`, from any spelling GA has been seen to use.
 *
 * GA4 itself reports a date as `20260914` — a string, or a NUMBER once a
 * sheet or a workflow has touched it. Only non-empty strings were read, so a
 * numeric date dropped every row and Sessions read 0 with no chart while the
 * data was there (audit, 2026-09-29).
 */
export function dayOf(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const raw = typeof candidate === "number" && Number.isFinite(candidate) ? String(candidate) : candidate;
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const value = raw.trim();
    const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
    if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
    return value;
  }
  return "";
}
