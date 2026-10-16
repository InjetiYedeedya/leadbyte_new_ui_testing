import { cache } from "react";
import { dayOf, rollupByDate, sumOf } from "@/lib/data/daily-rollup";
export { dayOf } from "@/lib/data/daily-rollup";
import { isBackendConfigured } from "@/lib/api/config";
import { GA_TABLES, getConnectedData, tableRows } from "@/lib/data/connected-data";
import { dimensionLabel } from "@/lib/data/labels";

/**
 * Google Analytics and traffic data.
 *
 * PORTED from the live app's `dashboardService.js` / `analyticsService.js`,
 * which read these tables directly through the generic data API. Table aliases
 * confirmed from the Lambda's TABLE_ALIASES map.
 *
 * Every table here is keyed by **email**, read via `/api/query/{alias}/{email}`.
 *
 * The row shapes are read defensively. The live service accepts several
 * spellings per field because the tables were populated by different n8n
 * workflows over time — dropping that tolerance would silently blank columns
 * for older accounts.
 */

export const ANALYTICS_TABLES = {
  daily: "t420f1a403", // google_analytics_daily
  breakdown: "t3b8dbd49d", // google_analytics_breakdown
  dailyMetrics: "tabecbb80a", // daily_metrics_30days
  pageTraffic: "t0c569f2c1", // page_traffic
  sessionPerSource: "t4c8ed46fc", // session_per_source
  sourceByCountry: "t1d3dcc308", // source_by_country
  firstUser: "t01259f8e1", // session_for_first_user
} as const;

export interface DailyMetric {
  date: string;
  sessions: number;
  users: number;
  events: number;
  /**
   * `screenPageViews`. Carried because the live daily table has no event count
   * at all, so a screen built only on `events` shows a permanent zero.
   */
  pageViews: number;
}

export interface PageRow {
  page: string;
  views: number;
  activeUsers: number;
  events: number;
  /**
   * GA4 `conversions`. Shown in place of events, which the live breakdown rows
   * do not carry — a column of zeroes reads as a broken table, not as "this
   * metric is unavailable".
   */
  conversions: number;
}

export interface NamedCount {
  label: string;
  value: number;
}

export interface AnalyticsSummary {
  sessions: number;
  users: number;
  events: number;
  pageViews: number;
  /** Percentage change vs the previous equal-length window. Null if unknown. */
  sessionsDelta: number | null;
  usersDelta: number | null;
}

export interface AnalyticsData {
  summary: AnalyticsSummary;
  daily: DailyMetric[];
  pages: PageRow[];
  sources: NamedCount[];
  countries: NamedCount[];
  /** GA4's device category — the breakdown table carries it and nothing read it. */
  devices: NamedCount[];
}

// ---------------------------------------------------------------- parsing --

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function num(...candidates: unknown[]): number {
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string" && candidate.trim() !== "") {
      const parsed = Number(candidate.replace(/,/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

/**
 * What an unlabelled row is called.
 *
 * Deliberately the same words `dimensionLabel` gives GA4's own `(not set)`:
 * a row Google labelled that way and a row carrying no label at all are the
 * same thing to a reader, and they must fold into ONE bar rather than two.
 */
const NOT_SET = "Not set";

function text(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate.trim();
  }
  return "";
}

export function toDailyMetric(raw: unknown): DailyMetric {
  const r = record(raw);
  return {
    date: dayOf(r.date, r.Date, r.day, r.report_date, r.metric_date),
    sessions: num(r.sessions, r.Sessions, r.session_count),
    users: num(r.activeUsers, r.active_users, r.users, r.Users),
    events: num(r.eventCount, r.event_count, r.events, r.Events),
    pageViews: num(r.screenPageViews, r.screen_page_views, r.pageViews, r.page_views, r.views),
  };
}

export function toPageRow(raw: unknown): PageRow {
  const r = record(raw);
  return {
    page:
      dimensionLabel(
        text(r.pageTitle, r.page_title, r.pagePath, r.page_path, r.page, r.url, r.value),
      ) || NOT_SET,
    views: num(r.views, r.Views, r.screenPageViews, r.pageviews),
    activeUsers: num(r.activeUsers, r.active_users, r.users),
    events: num(r.eventCount, r.event_count, r.events),
    conversions: num(r.conversions, r.Conversions, r.conversion_count),
  };
}

export function toNamedCount(raw: unknown, labelKeys: string[]): NamedCount {
  const r = record(raw);
  return {
    label: dimensionLabel(text(...labelKeys.map((k) => r[k]))) || NOT_SET,
    value: num(r.sessions, r.Sessions, r.activeUsers, r.users, r.count, r.value),
  };
}

/**
 * Folds rows that share a label into one, summing their values.
 *
 * GA4 returns a row per dimension combination, so the same label legitimately
 * appears more than once — `facebook` arrives as both `facebook / referral` and
 * `facebook / cpc`, and every row missing the dimension collapses onto the same
 * `(not set)` fallback. Rendering those as separate bars was wrong twice over:
 * React saw duplicate keys, and the top-10 slice split one source's traffic
 * across two rows, under-reporting it against sources that happened to arrive
 * whole.
 *
 * First appearance sets the position; the caller sorts afterwards anyway.
 */
export function mergeNamedCounts(items: NamedCount[]): NamedCount[] {
  const merged = new Map<string, NamedCount>();

  for (const item of items) {
    const existing = merged.get(item.label);
    if (existing) {
      existing.value += item.value;
    } else {
      merged.set(item.label, { ...item });
    }
  }

  return [...merged.values()];
}

/**
 * The same folding for page rows.
 *
 * `toPageRow` prefers the page TITLE over the path, so two URLs sharing a title
 * arrive as two rows the table renders identically — and the table shows only
 * the title, so "Home · 120" above "Home · 80" reads as a rendering fault.
 * Summed, they say what the customer actually wants to know.
 */
export function mergePageRows(rows: PageRow[]): PageRow[] {
  const merged = new Map<string, PageRow>();

  for (const row of rows) {
    const existing = merged.get(row.page);
    if (existing) {
      existing.views += row.views;
      existing.activeUsers += row.activeUsers;
      existing.events += row.events;
      existing.conversions += row.conversions;
    } else {
      merged.set(row.page, { ...row });
    }
  }

  return [...merged.values()];
}

/**
 * Splits a `*_breakdown` table into its dimensions.
 *
 * These tables hold every dimension in ONE table, each row tagged with what it
 * is — the same design as `search_console_breakdown`. The tag is spelled
 * differently across the n8n flows that wrote it, and so are the dimension
 * names, so both are matched loosely: anything containing "source" or "medium"
 * is a source, "countr" a country, "page" or "path" a page.
 *
 * Exported and pure because this is the part most likely to need adjusting when
 * a new dimension appears, and it must be adjustable without a live account.
 */
export function splitBreakdown(rows: unknown[]): {
  sources: unknown[];
  countries: unknown[];
  pages: unknown[];
  devices: unknown[];
} {
  const sources: unknown[] = [];
  const countries: unknown[] = [];
  const pages: unknown[] = [];
  const devices: unknown[] = [];

  for (const row of rows) {
    const r = record(row);
    const kind = text(r.type, r.Type, r.dimension, r.Dimension, r.breakdown_type).toLowerCase();
    if (kind.includes("countr")) countries.push(row);
    else if (kind.includes("device")) devices.push(row);
    else if (kind.includes("page") || kind.includes("path")) pages.push(row);
    else if (kind.includes("source") || kind.includes("medium") || kind.includes("channel")) {
      sources.push(row);
    }
  }

  return { sources, countries, pages, devices };
}

/**
 * Percentage change between the two halves of a series.
 *
 * Returns null rather than 0 when there is no basis for comparison — a delta
 * of "0%" claims the metric was measured and did not move, which is a
 * different statement from "we have no prior period".
 */
export function deltaOf(values: number[]): number | null {
  if (values.length < 4) return null;
  const mid = Math.floor(values.length / 2);
  const previous = values.slice(0, mid).reduce((a, b) => a + b, 0);
  const current = values.slice(mid).reduce((a, b) => a + b, 0);
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function summarise(daily: DailyMetric[]): AnalyticsSummary {
  return {
    sessions: daily.reduce((sum, d) => sum + d.sessions, 0),
    users: daily.reduce((sum, d) => sum + d.users, 0),
    events: daily.reduce((sum, d) => sum + d.events, 0),
    pageViews: daily.reduce((sum, d) => sum + d.pageViews, 0),
    sessionsDelta: deltaOf(daily.map((d) => d.sessions)),
    usersDelta: deltaOf(daily.map((d) => d.users)),
  };
}

/** Oldest first, so charts read left-to-right in time. */
export function sortByDate(rows: DailyMetric[]): DailyMetric[] {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * One row per day, out of a table that holds one per property per day.
 *
 * `google_analytics_daily` is keyed by property as well as by date, and an
 * account with more than one GA4 property — which is common, Firebase creates
 * them unasked — therefore reports every date more than once. Nothing
 * collapsed them, so the daily table showed each date repeatedly (React
 * reported duplicate keys), the sessions chart drew two points at the same x,
 * and `deltaOf` compared halves of a list whose length had nothing to do with
 * the number of days in it.
 *
 * Every field is additive, so a day is the sum of its rows. Sorting is the
 * rollup's own job, which is why this replaces `sortByDate` at the call site
 * rather than running before it.
 */
export function rollupDaily(rows: DailyMetric[]): DailyMetric[] {
  return rollupByDate(rows, (group, date) => ({
    date,
    sessions: sumOf(group, (row) => row.sessions),
    users: sumOf(group, (row) => row.users),
    events: sumOf(group, (row) => row.events),
    pageViews: sumOf(group, (row) => row.pageViews),
  }));
}

// ------------------------------------------------------------------ repo ---

export interface AnalyticsRepo {
  get(businessId: string): Promise<AnalyticsData | null>;
}

const MOCK: AnalyticsData = {
  summary: {
    sessions: 18420,
    users: 12980,
    events: 64310,
    pageViews: 41200,
    sessionsDelta: 12.4,
    usersDelta: 8.1,
  },
  daily: Array.from({ length: 14 }, (_, i) => ({
    date: `2026-08-${String(i + 14).padStart(2, "0")}`,
    sessions: 1100 + Math.round(Math.sin(i / 2) * 300) + i * 20,
    users: 800 + Math.round(Math.cos(i / 2) * 200) + i * 12,
    events: 4200 + i * 60,
    pageViews: 2600 + i * 40,
  })),
  pages: [
    { page: "/", views: 5210, activeUsers: 3980, events: 12400, conversions: 0 },
    { page: "/pricing", views: 2140, activeUsers: 1760, events: 5100, conversions: 0 },
    { page: "/blog/seo-automation", views: 1890, activeUsers: 1520, events: 3900, conversions: 0 },
    { page: "/demo", views: 1240, activeUsers: 1080, events: 4600, conversions: 0 },
    { page: "/about", views: 610, activeUsers: 540, events: 900, conversions: 0 },
  ],
  sources: [
    { label: "google / organic", value: 7420 },
    { label: "direct / none", value: 4310 },
    { label: "google / cpc", value: 3180 },
    { label: "linkedin / referral", value: 1890 },
    { label: "newsletter / email", value: 1620 },
  ],
  countries: [
    { label: "India", value: 8210 },
    { label: "United States", value: 4630 },
    { label: "United Kingdom", value: 2140 },
    { label: "Germany", value: 1180 },
    { label: "Australia", value: 870 },
  ],
  devices: [
    { label: "mobile", value: 10240 },
    { label: "desktop", value: 7180 },
    { label: "tablet", value: 1000 },
  ],
};

class MockAnalyticsRepo implements AnalyticsRepo {
  async get(businessId: string): Promise<AnalyticsData | null> {
    return businessId === "novaflow" ? MOCK : null;
  }
}

/** First list that has anything in it. */
function firstNonEmpty(...lists: unknown[][]): unknown[] {
  return lists.find((list) => list.length > 0) ?? [];
}

class HttpAnalyticsRepo implements AnalyticsRepo {
  async get(businessId: string): Promise<AnalyticsData | null> {
    // One call for every table, keyed off the JWT's email by the backend.
    const bundle = await getConnectedData();

    // The breakdown table carries source/country/page rows together; the
    // dedicated tables carry one dimension each. Which of the two an account
    // has depends on when its n8n flow was set up, so both are read and the
    // populated one wins. The backend's own test account had rows ONLY in
    // `google_analytics_daily` and `google_analytics_breakdown` — reading just
    // the four dedicated tables, as this repo used to, showed that account an
    // empty dashboard while its data sat one table over.
    const breakdown = splitBreakdown(tableRows(bundle, "google_analytics_breakdown"));

    // The first table that still has DATED rows once read — not merely any
    // row. A 30-day table whose rows carried no readable date used to win and
    // leave Sessions at 0 while `google_analytics_daily` had the real series.
    const dailyRaw = firstNonEmpty(
      ...[tableRows(bundle, "daily_metrics_30days"), tableRows(bundle, "google_analytics_daily")].map(
        (rows) => (rows.some((row) => toDailyMetric(row).date !== "") ? rows : []),
      ),
    );
    const pagesRaw = firstNonEmpty(tableRows(bundle, "page_traffic"), breakdown.pages);
    const sourcesRaw = firstNonEmpty(tableRows(bundle, "session_per_source"), breakdown.sources);
    const countriesRaw = firstNonEmpty(tableRows(bundle, "source_by_country"), breakdown.countries);

    // Nothing anywhere means Analytics has no data for this account yet — a
    // genuine empty state, not a dashboard of zeroes.
    //
    // Logged with the per-table counts, because "connected but blank" and "the
    // rows are under a different email" look identical on screen and are
    // different problems. The backend flagged the second as a live risk: the
    // tables are keyed by email, and the Google account's email need not be the
    // login email.
    if (
      dailyRaw.length === 0 &&
      pagesRaw.length === 0 &&
      sourcesRaw.length === 0 &&
      countriesRaw.length === 0
    ) {
      console.log(
        `[analytics] no rows for ${businessId} — ` +
          GA_TABLES.map((t) => `${t}=${tableRows(bundle, t).length}`).join(" "),
      );
      return null;
    }

    const daily = rollupDaily(dailyRaw.map(toDailyMetric).filter((d) => d.date !== ""));

    return {
      summary: summarise(daily),
      daily,
      pages: mergePageRows(pagesRaw.map(toPageRow))
        .sort((a, b) => b.views - a.views)
        .slice(0, 50),
      // Merged BEFORE the slice: splitting one source across two rows would
      // otherwise push it down the top ten, or off it entirely.
      sources: mergeNamedCounts(
        sourcesRaw.map((r) =>
          toNamedCount(r, [
            "source",
            "Source",
            "sessionSource",
            "session_source",
            "medium",
            "value",
          ]),
        ),
      )
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
      countries: mergeNamedCounts(
        countriesRaw.map((r) =>
          toNamedCount(r, ["country", "Country", "countryId", "country_name", "value"]),
        ),
      )
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
      devices: mergeNamedCounts(
        breakdown.devices.map((r) =>
          toNamedCount(r, ["device", "deviceCategory", "device_category", "value"]),
        ),
      ).sort((a, b) => b.value - a.value),
    };
  }
}

let instance: AnalyticsRepo | null = null;

export function getAnalyticsRepo(): AnalyticsRepo {
  if (!instance) {
    instance = isBackendConfigured() ? new HttpAnalyticsRepo() : new MockAnalyticsRepo();
  }
  return instance;
}

/** Memoised per render — the nav badge and the page both ask. */
export const getAnalytics = cache(async function getAnalytics(businessId: string) {
  return getAnalyticsRepo().get(businessId);
});
