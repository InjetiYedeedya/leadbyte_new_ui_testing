import { buildSiteAnalytics, dailyTotals, isoDay, readRange } from "./site-analytics";

/** `n` days of GA rows from 1 July, with active users 1, 2, 3 … */
function days(n: number) {
  const start = Date.UTC(2026, 6, 1);
  return Array.from({ length: n }, (_, i) => ({
    metric_dates: new Date(start + i * 86_400_000).toISOString().slice(0, 10).replace(/-/g, ""),
    active_users: i + 1,
    new_users: 1,
    page_views: 2,
    sessions: 3,
  }));
}

describe("isoDay", () => {
  it("accepts GA's YYYYMMDD, ISO dates and timestamps", () => {
    expect(isoDay("20260705")).toBe("2026-07-05");
    expect(isoDay("2026-07-05")).toBe("2026-07-05");
    expect(isoDay("2026-07-05T12:00:00Z")).toBe("2026-07-05");
    expect(isoDay("nonsense")).toBe("");
    expect(isoDay(null)).toBe("");
  });
});

describe("dailyTotals", () => {
  it("sums several rows for the same day instead of showing one of them", () => {
    const totals = dailyTotals([
      { metric_dates: "20260702", active_users: 5 },
      { metric_dates: "2026-07-01", active_users: 1 },
      { metric_dates: "20260701", active_users: 2 },
    ]);
    expect(totals.map((d) => [d.date, d.activeUsers])).toEqual([
      ["2026-07-01", 3],
      ["2026-07-02", 5],
    ]);
  });
});

describe("buildSiteAnalytics", () => {
  const input = { sessionPerSource: [], sourceByCountry: [], region: "all" };

  it("compares a window with the one before it", () => {
    const data = buildSiteAnalytics({ ...input, daily: days(14), range: "7" });
    const active = data.tiles.find((t) => t.metric === "activeUsers")!;
    // Days 8-14 sum to 77; days 1-7 sum to 28.
    expect(active.value).toBe(77);
    expect(Math.round(active.delta!)).toBe(175);
    expect(data.trend[0]).toEqual({ label: "8 Jul", value: 8, prior: 1 });
    expect(data.comparisonDays).toBe(7);
  });

  it("has no comparison for all time, and none without a prior window", () => {
    expect(buildSiteAnalytics({ ...input, daily: days(10), range: "all" }).tiles[0]!.delta).toBeNull();
    expect(buildSiteAnalytics({ ...input, daily: days(5), range: "7" }).comparisonDays).toBeNull();
    // Ten days is a full current week but only three days before it.
    expect(buildSiteAnalytics({ ...input, daily: days(10), range: "7" }).tiles[0]!.delta).toBeNull();
  });

  it("switches to weekly totals past ten weeks, losing no visitors", () => {
    const data = buildSiteAnalytics({ ...input, daily: days(80), range: "all" });
    expect(data.granularity).toBe("weekly");
    expect(data.trend.length).toBeLessThan(15);
    expect(data.trend.reduce((sum, week) => sum + week.value, 0)).toBe((80 * 81) / 2);
  });

  it("ranks sources and countries, offers the top five as regions, and filters by one", () => {
    const data = buildSiteAnalytics({
      daily: days(3),
      range: "all",
      sessionPerSource: [
        { session_source: "google", sessions: 5 },
        { session_source: "google", sessions: 5 },
        { session_source: "", sessions: 1 },
      ],
      sourceByCountry: ["A", "B", "C", "D", "E", "F"].map((country, i) => ({ country, active_users: 10 - i })),
      region: "C",
    });
    expect(data.sources).toEqual([
      { label: "google", value: 10 },
      { label: "Unknown", value: 1 },
    ]);
    expect(data.regions).toEqual(["A", "B", "C", "D", "E"]);
    expect(data.countries).toEqual([{ label: "C", value: 8 }]);
    expect(data.countryCount).toBe(6);
  });

  it("ignores a region that is not on offer", () => {
    expect(buildSiteAnalytics({ ...input, daily: [], range: readRange("bogus"), region: "Mars" }).region).toBe("all");
  });
});

describe("isoDay — day-first dates", () => {
  it("reads 06-07-2026 as 6 July, not 7 June", async () => {
    const { isoDay } = await import("./site-analytics");
    expect(isoDay("06-07-2026")).toBe("2026-07-06");
    expect(isoDay("6/7/2026")).toBe("2026-07-06");
    expect(isoDay("20260706")).toBe("2026-07-06");
  });
});
