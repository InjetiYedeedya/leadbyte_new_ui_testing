import { rollupByDate, sumOf } from "@/lib/data/daily-rollup";
import { shortDay } from "@/lib/data/analytics-timeline";
import { pick, pickNumber, pickString, type Row } from "./fields";

/**
 * LeadByte's own website traffic — the admin Website Analytics screen.
 *
 * The same GA-export tables a customer's dashboard reads, for the company's
 * own account. Everything here is pure so the date handling, which the legacy
 * screen got wrong twice, is tested rather than eyeballed.
 */

export type RangeId = "7" | "14" | "30" | "all";

export const RANGES: readonly { id: RangeId; label: string; days: number | null }[] = [
  { id: "7", label: "7 days", days: 7 },
  { id: "14", label: "14 days", days: 14 },
  { id: "30", label: "30 days", days: 30 },
  { id: "all", label: "All time", days: null },
];

export function readRange(value: string | undefined): RangeId {
  return RANGES.some((range) => range.id === value) ? (value as RangeId) : "all";
}

/**
 * A metric date as ISO `yyyy-mm-dd`, or "" when it is not a date.
 *
 * The table holds GA's `YYYYMMDD`, ISO dates AND full timestamps. The legacy
 * parser accepted only the first, so the others fell back to their raw text
 * and the axis mixed "06-07-2026" with "2026-07-05".
 */
export function isoDay(raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  const text = String(raw).trim();
  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  // `06-07-2026` is DAY first — it sits between 5 and 7 July in this table.
  // `new Date` reads it month first (7 June), which scattered the axis across
  // the year: "6 Jan to 9 Dec", dates still in the future (seen live,
  // 2026-09-29).
  const dayFirst = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (dayFirst) {
    const [, day, month, year] = dayFirst;
    return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

export interface DayTotals {
  date: string;
  activeUsers: number;
  newUsers: number;
  pageViews: number;
  sessions: number;
}

/**
 * One row per day. The export can hold several rows for one date (one per
 * property — rule 6 in CLAUDE.md), and showing only one of them would present
 * a single property's figures as the whole site's.
 */
export function dailyTotals(rows: readonly Row[]): DayTotals[] {
  const dated = rows.map((row) => ({ date: isoDay(pick(row, "metric_dates", "date")), row }));
  return rollupByDate(dated, (group, date) => ({
    date,
    activeUsers: sumOf(group, (g) => pickNumber(g.row, "active_users") ?? 0),
    newUsers: sumOf(group, (g) => pickNumber(g.row, "new_users") ?? 0),
    pageViews: sumOf(group, (g) => pickNumber(g.row, "page_views") ?? 0),
    sessions: sumOf(group, (g) => pickNumber(g.row, "sessions") ?? 0),
  }));
}

type Metric = "activeUsers" | "newUsers" | "pageViews" | "sessions";

function total(days: readonly DayTotals[], metric: Metric): number {
  return days.reduce((sum, day) => sum + day[metric], 0);
}

/** Change against the prior window as a percentage; null when there is no base. */
function deltaPercent(now: number, before: number): number | null {
  if (before <= 0) return null;
  return ((now - before) / before) * 100;
}

/** Past ten weeks a daily line is a picket fence; it is summed into weeks. */
export const WEEKLY_ABOVE = 70;

/** The Sunday starting the week that holds `iso`, as ISO. */
function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

export interface SiteAnalytics {
  range: RangeId;
  days: DayTotals[];
  firstDay: string;
  lastDay: string;
  tiles: {
    metric: Metric;
    label: string;
    value: number;
    delta: number | null;
    series: number[];
  }[];
  countryCount: number;
  granularity: "daily" | "weekly";
  trend: { label: string; value: number; prior: number | null }[];
  peak: { label: string; value: number } | null;
  averagePerDay: number | null;
  /** How long the comparison window is, when there is one. */
  comparisonDays: number | null;
  sources: { label: string; value: number }[];
  countries: { label: string; value: number }[];
  /** The top five countries, offered as region chips. */
  regions: string[];
  region: string;
}

function ranked(
  rows: readonly Row[],
  label: (row: Row) => string,
  value: (row: Row) => number,
): { label: string; value: number }[] {
  // Summed by label first: the breakdown tables, like the daily one, can hold
  // one row per property for the same source or country.
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = label(row) || "Unknown";
    totals.set(key, (totals.get(key) ?? 0) + value(row));
  }
  return [...totals.entries()]
    .map(([name, amount]) => ({ label: name, value: amount }))
    .sort((a, b) => b.value - a.value);
}

export function buildSiteAnalytics(input: {
  daily: readonly Row[];
  sessionPerSource: readonly Row[];
  sourceByCountry: readonly Row[];
  range: RangeId;
  region: string;
}): SiteAnalytics {
  const all = dailyTotals(input.daily);
  const days = RANGES.find((range) => range.id === input.range)?.days ?? null;
  const current = days === null ? all : all.slice(-days);
  // "All time" has nothing before it to compare with, so no change figures.
  // The previous window must be as long as the current one, or the change
  // figure compares seven days with three and favours whichever got more
  // (the same rule `prior-period.ts` follows). Short of that, no comparison.
  const prior =
    days === null || all.length < days * 2 ? [] : all.slice(all.length - days * 2, all.length - days);
  const hasPrior = prior.length > 0;

  const tile = (metric: Metric, label: string) => ({
    metric,
    label,
    value: total(current, metric),
    delta: hasPrior ? deltaPercent(total(current, metric), total(prior, metric)) : null,
    series: current.map((day) => day[metric]),
  });

  const weekly = current.length > WEEKLY_ABOVE;
  let trend: SiteAnalytics["trend"];
  if (weekly) {
    const weeks = new Map<string, number>();
    for (const day of current) {
      const key = weekStart(day.date);
      weeks.set(key, (weeks.get(key) ?? 0) + day.activeUsers);
    }
    trend = [...weeks.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, value]) => ({ label: shortDay(week), value, prior: null }));
  } else {
    // Index-aligned, so the dashed line answers "where were we last time?".
    trend = current.map((day, index) => ({
      label: shortDay(day.date),
      value: day.activeUsers,
      prior: hasPrior ? (prior[index]?.activeUsers ?? null) : null,
    }));
  }

  const peakDay = current.reduce<DayTotals | null>(
    (best, day) => (best === null || day.activeUsers > best.activeUsers ? day : best),
    null,
  );

  const countriesAll = ranked(
    input.sourceByCountry,
    (row) => pickString(row, "country"),
    (row) => pickNumber(row, "active_users") ?? 0,
  );
  const regions = countriesAll
    .map((country) => country.label)
    .filter((name) => name !== "Unknown")
    .slice(0, 5);
  const region = regions.includes(input.region) ? input.region : "all";

  return {
    range: input.range,
    days: current,
    firstDay: current[0]?.date ?? "",
    lastDay: current[current.length - 1]?.date ?? "",
    tiles: [
      tile("activeUsers", "Active visitors"),
      tile("newUsers", "New visitors"),
      tile("pageViews", "Page views"),
      tile("sessions", "Sessions"),
    ],
    countryCount: countriesAll.length,
    granularity: weekly ? "weekly" : "daily",
    trend,
    peak: peakDay && peakDay.activeUsers > 0
      ? { label: shortDay(peakDay.date), value: peakDay.activeUsers }
      : null,
    averagePerDay: current.length > 0 ? total(current, "activeUsers") / current.length : null,
    comparisonDays: hasPrior ? days : null,
    sources: ranked(
      input.sessionPerSource,
      (row) => pickString(row, "session_source", "source"),
      (row) => pickNumber(row, "sessions") ?? 0,
    ).slice(0, 8),
    countries: (region === "all"
      ? countriesAll
      : countriesAll.filter((country) => country.label === region)
    ).slice(0, 8),
    regions,
    region,
  };
}
