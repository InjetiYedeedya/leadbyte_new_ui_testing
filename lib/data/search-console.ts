import { cache } from "react";
import { getConnectedData, tableRows } from "@/lib/data/connected-data";
import { isBackendConfigured } from "@/lib/api/config";
import { readTable, type SourceOutcome } from "@/lib/api/read-cascade";
import { dayOf, rollupByDate, sumOf, weightedMean } from "@/lib/data/daily-rollup";

/**
 * Google Search Console — the queries this site already ranks for.
 *
 * ## Where the data comes from
 *
 * n8n holds the Google authorisation and writes two DynamoDB tables:
 *
 *   search_console_daily      one row per property per day
 *   search_console_breakdown  dimension rollups; each row has a `type`
 *                             (query | page | country | device) and a `value`
 *
 * The `type: "query"` rows ARE the ranking keywords. Confirmed from the legacy
 * app's `searchConsoleService.js`, which is the production reference.
 *
 * ## Two caveats
 *
 * These tables are NOT in the backend's alias map, so they are addressed by
 * raw name. The older Lambda passed unknown names through unchanged;
 * `leadbyte-api_v1` is a different codebase and has not been verified. A read
 * that fails returns [] and logs — the screen then shows the connect prompt,
 * which is the honest outcome either way.
 *
 * Field names are read defensively: the legacy service's own comment marks them
 * "unconfirmed — read defensively in the component".
 */

const BREAKDOWN_TABLE = "search_console_breakdown";

/** Keep one account's history from flooding a page. */
const MAX_QUERIES = 100;

export interface SearchQuery {
  query: string;
  clicks: number;
  impressions: number;
  /** Stored as a fraction (0.044 = 4.4%). */
  ctr: number;
  /** Average position. Lower is better. */
  position: number;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * CTR arrives either as a fraction (0.044) or as a percentage (4.4) depending
 * on the row. Anything above 1 is treated as a percentage — a genuine
 * click-through rate cannot exceed 100%, so >1 can only mean the other scale.
 */
function ctrFraction(value: unknown): number {
  const raw = num(value);
  return raw > 1 ? raw / 100 : raw;
}

/**
 * Rolls the breakdown rows up into one row per query.
 *
 * ## Why this has to aggregate
 *
 * `search_console_breakdown` is a rollup PER DAY, so a query the site has
 * ranked for over a fortnight arrives as fourteen rows — one `type: "query"`
 * row per day, each carrying that day's clicks. The first version of this
 * mapper treated every row as a query and did not combine them, which was
 * wrong twice over:
 *
 * - **The numbers were a single day's**, presented as the total. A query with
 *   3 clicks a day for two weeks showed 3.
 * - **The query appeared once per day** in the table. React reported it as
 *   duplicate keys (`Encountered two children with the same key, 'leadbyte'`),
 *   which is what surfaced the bug — the wrong numbers looked plausible and
 *   would not have.
 *
 * ## The two derived columns are recomputed, never averaged
 *
 * Same rule as `summariseSearch`, for the same reason: a mean of daily CTRs
 * gives a quiet day with one lucky click the same weight as a busy one. CTR
 * comes back from the summed totals, and position is weighted by impressions.
 *
 * Both fall back to a plain mean of the rows' own stated values when a query
 * has no impressions recorded against it — a real shape in this data, and
 * dividing by zero impressions would report a query at position 0 (the best
 * rank there is) with a CTR of 0.0%, discarding figures the rows supplied.
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function mapTopQueries(rows: unknown): SearchQuery[] {
  if (!Array.isArray(rows)) return [];

  const totals = new Map<
    string,
    {
      query: string;
      clicks: number;
      impressions: number;
      weighted: number;
      /** Stated per-row values, used only when there are no impressions to weight by. */
      positions: number[];
      ctrs: number[];
    }
  >();

  for (const raw of rows) {
    const r = record(raw);
    // Every spelling the GA breakdown reader already accepts; only `type` was
    // read here, so rows labelled `Type` or `dimension` gave no keywords at
    // all (audit, 2026-09-29).
    const kind = (str(r.type) || str(r.Type) || str(r.dimension) || str(r.breakdown_type)).toLowerCase();
    if (kind !== "query") continue;

    const query = (str(r.value) || str(r.query) || str(r.Query) || str(r.keyword) || str(r.Keyword)).trim();
    if (query === "") continue;

    // Case-insensitively the same search is the same search, but the label
    // shown is the first spelling seen rather than a lowercased one — Search
    // Console reports queries as typed and "iphone 15" is not how anyone
    // wants their brand name rendered.
    const key = query.toLowerCase();
    const entry = totals.get(key) ?? {
      query,
      clicks: 0,
      impressions: 0,
      weighted: 0,
      positions: [],
      ctrs: [],
    };

    const impressions = num(r.impressions ?? r.Impressions);
    const position = num(r.position ?? r.Position ?? r.avg_position ?? r.avgPosition);

    entry.clicks += num(r.clicks ?? r.Clicks);
    entry.impressions += impressions;
    entry.weighted += position * impressions;
    if (position > 0) entry.positions.push(position);

    const ctr = ctrFraction(r.ctr);
    if (ctr > 0) entry.ctrs.push(ctr);

    totals.set(key, entry);
  }

  return [...totals.values()]
    .map((t) => ({
      query: t.query,
      clicks: t.clicks,
      impressions: t.impressions,
      ctr: t.impressions > 0 ? t.clicks / t.impressions : mean(t.ctrs),
      position: t.impressions > 0 ? t.weighted / t.impressions : mean(t.positions),
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, MAX_QUERIES);
}

/**
 * Reads this account's ranking queries.
 *
 * The rows come from the shared `/api/connected-data` bundle, so the audit
 * page, the keyword table and the connect prompt cost one call between them.
 *
 * This used to address `search_console_breakdown` by raw table name and fall
 * back from `/api/scan` to `/api/query` because the tables were not reliably
 * keyed on email. The backend now does that lookup from the JWT, which removes
 * both the guesswork and our need to know the table's name.
 *
 * An empty list still means one of two things — not connected, or connected
 * with no data yet. The caller cannot distinguish them and should not pretend
 * to.
 */
export const getTopQueries = cache(async function getTopQueries(): Promise<SearchQuery[]> {
  const bundle = await getConnectedData();
  return mapTopQueries(tableRows(bundle, "search_console_breakdown"));
});

/**
 * The ranking keywords for one account, from their own table alone.
 *
 * For a screen that shows the keywords and nothing else of the
 * connected-data bundle (Website audit). `getTopQueries` reads them out of
 * the whole bundle — right for `/analytics`, which loads that bundle anyway,
 * and wrong for a page that would download every connected table to use one
 * ("Error 1102", 2026-10-05). By email only: the uid route returns ONE record.
 */
export const readTopQueries = cache(async function readTopQueries(email: string): Promise<SearchQuery[]> {
  if (!isBackendConfigured()) return [];
  const outcome = await readTable(BREAKDOWN_TABLE, { email });
  return mapTopQueries(outcome.rows);
});

/**
 * Whether one table read says Search Console data has arrived.
 *
 * A FAILED read counts as yes. The only caller is the "connect Search
 * Console" banner, and a read that could not answer is no reason to ask
 * someone to connect an account that may well be connected.
 */
export function searchConsoleHasData(outcome: Pick<SourceOutcome, "ok" | "rows">): boolean {
  return !outcome.ok || outcome.rows.length > 0;
}

/**
 * Has any Search Console data arrived for this account? One small table.
 *
 * The banner used to answer this with `getTopQueries()`, which downloads
 * `/api/connected-data/all` — every connected table, Search Console's
 * per-query-per-day rows included, with no date limit — on EVERY page for
 * every account without Search Console. On Cloudflare that read is big enough
 * to push a request past the Worker's memory limit ("Error 1102",
 * 2026-10-05). `search_console_daily` is one row per property per day, and
 * any row at all answers the question.
 */
export const hasSearchConsoleRows = cache(async function hasSearchConsoleRows(
  email: string,
): Promise<boolean> {
  if (!isBackendConfigured()) return false;
  // By email only: these tables are email-keyed, and the uid route would be
  // one more call before the one that answers.
  return searchConsoleHasData(await readTable("search_console_daily", { email }));
});

/** A day of Search Console totals. */
export interface SearchDay {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/**
 * The daily totals behind the queries.
 *
 * ## One row per day, out of a table that holds several
 *
 * `search_console_daily` is one row per PROPERTY per day, as the note at the
 * top of this file says — and an account routinely has more than one property
 * for the same site (an http one, an https one, a domain one). This did not
 * collapse them, so a fortnight came back as twenty-eight rows, the chart drew
 * two points at every x, and the table React keyed on the date reported
 * duplicate keys. Same bug as `mapTopQueries` had, one layer up.
 *
 * CTR is recomputed from the day's summed totals and position is weighted by
 * impressions, for the reason `summariseSearch` gives: a property with three
 * impressions must not pull the day's average as hard as one with three
 * thousand.
 */
export function mapDaily(rows: unknown): SearchDay[] {
  if (!Array.isArray(rows)) return [];

  const mapped = rows.map(record).map((r) => ({
    date: dayOf(r.date, r.Date, r.day, r.report_date),
    clicks: num(r.clicks ?? r.Clicks),
    impressions: num(r.impressions ?? r.Impressions),
    ctr: ctrFraction(r.ctr ?? r.CTR),
    position: num(r.position ?? r.Position ?? r.avg_position ?? r.avgPosition),
  }));

  return rollupByDate(mapped, (group, date) => {
    const clicks = sumOf(group, (row) => row.clicks);
    const impressions = sumOf(group, (row) => row.impressions);

    return {
      date,
      clicks,
      impressions,
      // From the totals, never a mean of the rows' own rates.
      ctr:
        impressions > 0
          ? clicks / impressions
          : (weightedMean(group, (row) => row.ctr, (row) => row.impressions) ?? 0),
      // Zero, not null, because `SearchDay.position` is a number and the
      // `position` cell format already renders a non-positive rank as an em
      // dash rather than as rank zero.
      position: weightedMean(group, (row) => row.position, (row) => row.impressions) ?? 0,
    };
  });
}

/** Daily Search Console totals for this account, oldest first. */
export const getSearchDays = cache(async function getSearchDays(): Promise<SearchDay[]> {
  const bundle = await getConnectedData();
  return mapDaily(tableRows(bundle, "search_console_daily"));
});

export interface SearchSummary {
  clicks: number;
  impressions: number;
  /** Overall CTR as a fraction — clicks ÷ impressions, not a mean of means. */
  ctr: number;
  /** Impression-weighted average position. Null when nothing was impressed. */
  position: number | null;
}

/**
 * Totals across the daily rows.
 *
 * Two deliberate choices, both because the naive version lies:
 *
 * - CTR is recomputed from the totals, never averaged. Averaging daily CTRs
 *   gives a quiet day with one lucky click the same weight as a busy one.
 * - Position is weighted by impressions, for the same reason, and is null when
 *   there are no impressions at all — "0.0" would read as rank zero, the best
 *   possible position, when it actually means we know nothing.
 */
export function summariseSearch(days: SearchDay[]): SearchSummary {
  const clicks = days.reduce((sum, d) => sum + d.clicks, 0);
  const impressions = days.reduce((sum, d) => sum + d.impressions, 0);
  const weighted = days.reduce((sum, d) => sum + d.position * d.impressions, 0);

  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weighted / impressions : null,
  };
}
