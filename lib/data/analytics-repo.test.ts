import { describe, expect, it } from "vitest";
import {
  deltaOf,
  rollupDaily,
  mergeNamedCounts,
  mergePageRows,
  sortByDate,
  summarise,
  toDailyMetric,
  toNamedCount,
  toPageRow,
  splitBreakdown,
} from "./analytics-repo";

describe("toDailyMetric", () => {
  it("reads the GA4 field names", () => {
    expect(toDailyMetric({ date: "2026-08-01", sessions: 120, activeUsers: 90, eventCount: 400 }))
      .toEqual({ date: "2026-08-01", sessions: 120, users: 90, events: 400, pageViews: 0 });
  });

  it("accepts the snake_case variants other workflows write", () => {
    // These tables were populated by different n8n workflows over time.
    const row = toDailyMetric({ report_date: "2026-08-01", active_users: 90, event_count: 400 });
    expect(row.date).toBe("2026-08-01");
    expect(row.users).toBe(90);
    expect(row.events).toBe(400);
  });

  it("coerces numbers stored as strings, commas included", () => {
    expect(toDailyMetric({ date: "x", sessions: "1,240" }).sessions).toBe(1240);
  });

  it("never yields NaN from junk", () => {
    const row = toDailyMetric({ date: "x", sessions: "not a number", users: null });
    expect(row.sessions).toBe(0);
    expect(row.users).toBe(0);
  });
});

describe("toPageRow", () => {
  it("prefers a page title, falling back through path variants", () => {
    expect(toPageRow({ pageTitle: "Pricing", views: 10 }).page).toBe("Pricing");
    expect(toPageRow({ page_path: "/pricing", views: 10 }).page).toBe("/pricing");
  });

  it("labels an unidentifiable page rather than showing a blank row", () => {
    expect(toPageRow({ views: 10 }).page).toBe("Not set");
  });

  it("says the same thing about GA4's own placeholder, so the two fold into one row", () => {
    expect(toPageRow({ page_path: "(not set)", views: 10 }).page).toBe("Not set");
  });
});

describe("toNamedCount", () => {
  it("reads the label from the first key that has a value", () => {
    expect(toNamedCount({ session_source: "google", sessions: 40 }, ["source", "session_source"]))
      .toEqual({ label: "google", value: 40 });
  });

  it("falls back to a readable label rather than an empty one", () => {
    expect(toNamedCount({ sessions: 40 }, ["source"]).label).toBe("Not set");
  });

  it("translates GA4's bracketed placeholders and leaves every real value alone", () => {
    // Both spellings have to land on the SAME string or one source's traffic
    // splits across two bars — see `mergeNamedCounts`.
    expect(toNamedCount({ source: "(not set)", sessions: 40 }, ["source"]).label).toBe("Not set");
    expect(toNamedCount({ source: "(direct)", sessions: 40 }, ["source"]).label).toBe("Direct");
    expect(toNamedCount({ source: "google / organic", sessions: 40 }, ["source"]).label).toBe(
      "google / organic",
    );
  });
});

describe("deltaOf", () => {
  it("compares the two halves of a series", () => {
    // 10+10 = 20, then 20+20 = 40 → +100%
    expect(deltaOf([10, 10, 20, 20])).toBe(100);
  });

  it("reports a fall as negative", () => {
    expect(deltaOf([20, 20, 10, 10])).toBe(-50);
  });

  it("returns null when there is no basis for comparison", () => {
    // "0%" claims the metric was measured and did not move — a different
    // statement from "we have no prior period".
    expect(deltaOf([5, 5])).toBeNull();
    expect(deltaOf([])).toBeNull();
    expect(deltaOf([0, 0, 5, 5])).toBeNull();
  });
});

describe("summarise", () => {
  const daily = [
    { date: "2026-08-01", sessions: 10, users: 8, events: 40, pageViews: 0 },
    { date: "2026-08-02", sessions: 10, users: 8, events: 40, pageViews: 0 },
    { date: "2026-08-03", sessions: 20, users: 16, events: 80, pageViews: 0 },
    { date: "2026-08-04", sessions: 20, users: 16, events: 80, pageViews: 0 },
  ];

  it("totals each metric", () => {
    const s = summarise(daily);
    expect(s.sessions).toBe(60);
    expect(s.users).toBe(48);
    expect(s.events).toBe(240);
  });

  it("computes the period-over-period change", () => {
    expect(summarise(daily).sessionsDelta).toBe(100);
  });

  it("handles an empty series without dividing by zero", () => {
    const s = summarise([]);
    expect(s.sessions).toBe(0);
    expect(s.sessionsDelta).toBeNull();
  });
});

describe("rollupDaily", () => {
  /**
   * `google_analytics_daily` is one row per PROPERTY per day, and an account
   * with more than one GA4 property — Firebase creates them unasked — reports
   * every date more than once.
   */
  const TWO_PROPERTIES = [
    { date: "2026-09-02", sessions: 100, users: 80, events: 400, pageViews: 300 },
    { date: "2026-09-02", sessions: 40, users: 30, events: 150, pageViews: 120 },
    { date: "2026-09-01", sessions: 60, users: 50, events: 200, pageViews: 180 },
  ];

  it("collapses a date's properties into one row", () => {
    const out = rollupDaily(TWO_PROPERTIES);

    expect(out).toHaveLength(2);
    expect(out.map((day) => day.date)).toEqual(["2026-09-01", "2026-09-02"]);
  });

  it("sums every metric across the properties", () => {
    const second = rollupDaily(TWO_PROPERTIES).find((day) => day.date === "2026-09-02");

    expect(second).toMatchObject({ sessions: 140, users: 110, events: 550, pageViews: 420 });
  });

  it("gives every row a date the table can key on", () => {
    const dates = rollupDaily(TWO_PROPERTIES).map((day) => day.date);

    expect(new Set(dates).size).toBe(dates.length);
  });

  it("returns oldest first without a separate sort", () => {
    const out = rollupDaily([
      { date: "2026-09-09", sessions: 1, users: 1, events: 1, pageViews: 1 },
      { date: "2026-09-02", sessions: 1, users: 1, events: 1, pageViews: 1 },
    ]);

    expect(out.map((day) => day.date)).toEqual(["2026-09-02", "2026-09-09"]);
  });
});

describe("sortByDate", () => {
  it("puts oldest first so charts read left-to-right in time", () => {
    const sorted = sortByDate([
      { date: "2026-08-03", sessions: 0, users: 0, events: 0, pageViews: 0 },
      { date: "2026-08-01", sessions: 0, users: 0, events: 0, pageViews: 0 },
    ]);
    expect(sorted.map((d) => d.date)).toEqual(["2026-08-01", "2026-08-03"]);
  });

  it("does not mutate the input", () => {
    const input = [
      { date: "2026-08-03", sessions: 0, users: 0, events: 0, pageViews: 0 },
      { date: "2026-08-01", sessions: 0, users: 0, events: 0, pageViews: 0 },
    ];
    sortByDate(input);
    expect(input[0]!.date).toBe("2026-08-03");
  });
});

describe("mergeNamedCounts", () => {
  it("sums rows sharing a label, which GA4 returns routinely", () => {
    // `facebook / referral` and `facebook / cpc` both label as "facebook".
    const merged = mergeNamedCounts([
      { label: "facebook", value: 120 },
      { label: "google", value: 300 },
      { label: "facebook", value: 80 },
    ]);

    expect(merged).toEqual([
      { label: "facebook", value: 200 },
      { label: "google", value: 300 },
    ]);
  });

  it("folds every unlabelled row onto one (not set), not several", () => {
    const merged = mergeNamedCounts([
      { label: "(not set)", value: 5 },
      { label: "(not set)", value: 3 },
    ]);

    expect(merged).toEqual([{ label: "(not set)", value: 8 }]);
  });

  it("does not mutate the rows it was given", () => {
    const items = [
      { label: "a", value: 1 },
      { label: "a", value: 2 },
    ];
    mergeNamedCounts(items);

    expect(items[0]).toEqual({ label: "a", value: 1 });
  });

  it("leaves an already-unique list alone", () => {
    const items = [
      { label: "a", value: 1 },
      { label: "b", value: 2 },
    ];

    expect(mergeNamedCounts(items)).toEqual(items);
  });
});

describe("mergePageRows", () => {
  it("sums every metric for rows sharing a page label", () => {
    const merged = mergePageRows([
      { page: "Home", views: 10, activeUsers: 4, events: 20, conversions: 0 },
      { page: "Pricing", views: 5, activeUsers: 3, events: 9, conversions: 0 },
      { page: "Home", views: 7, activeUsers: 2, events: 11, conversions: 0 },
    ]);

    expect(merged).toEqual([
      { page: "Home", views: 17, activeUsers: 6, events: 31, conversions: 0 },
      { page: "Pricing", views: 5, activeUsers: 3, events: 9, conversions: 0 },
    ]);
  });
});

/**
 * These cover the shapes the live `google_analytics_*` tables actually return,
 * read off a real account on 2026-09-03. The dedicated per-dimension tables
 * (`page_traffic`, `session_per_source`, `source_by_country`,
 * `daily_metrics_30days`) were all EMPTY for that account — everything arrives
 * in `google_analytics_daily` plus `google_analytics_breakdown`.
 */
describe("the live google_analytics_* shapes", () => {
  const BREAKDOWN_ROW = {
    value: "AI Assistant",
    type: "channel",
    sessions: 6,
    activeUsers: 5,
    screenPageViews: 7,
  };

  it("splits every dimension the breakdown table actually carries", () => {
    const rows = [
      BREAKDOWN_ROW,
      { value: "ind", type: "country", sessions: 298 },
      { value: "/pricing", type: "page", screenPageViews: 120 },
      { value: "mobile", type: "device", sessions: 40 },
    ];
    const split = splitBreakdown(rows);

    expect(split.sources).toHaveLength(1);
    expect(split.countries).toHaveLength(1);
    expect(split.pages).toHaveLength(1);
    expect(split.devices).toHaveLength(1);
  });

  it("labels a breakdown page from `value`, which is where the name lives", () => {
    // Every page row collapsed onto one "(not set)" line before this: the
    // mapper looked for pageTitle/pagePath/url and the table has none of them.
    const row = toPageRow({ value: "/pricing", type: "page", screenPageViews: 120 });
    expect(row.page).toBe("/pricing");
    expect(row.views).toBe(120);
  });

  it("reads page views from a daily row, which carries no event count", () => {
    const daily = toDailyMetric({
      date: "2026-08-05",
      sessions: 20,
      activeUsers: 11,
      screenPageViews: 171,
    });

    expect(daily.sessions).toBe(20);
    expect(daily.users).toBe(11);
    expect(daily.pageViews).toBe(171);
    // No eventCount in the live table — reporting 0 events is honest, but the
    // screen shows page views instead of a column that is always zero.
    expect(daily.events).toBe(0);
  });
});

describe("dayOf", () => {
  it("reads GA's compact dates, as a string or a number", async () => {
    const { dayOf } = await import("./analytics-repo");
    expect(dayOf("20260914")).toBe("2026-09-14");
    expect(dayOf(20260914)).toBe("2026-09-14");
    expect(dayOf("2026-09-14")).toBe("2026-09-14");
    expect(dayOf(undefined, "", "2026-09-01")).toBe("2026-09-01");
  });
});
