import { mapDaily, mapTopQueries, searchConsoleHasData, summariseSearch } from "./search-console";

/**
 * Row shape from `search_console_breakdown`, per the legacy service's own
 * comment: each row carries a `type` (query | page | country | device) and a
 * `value`, plus clicks / impressions / ctr / position.
 *
 * The legacy comment marks the field names "unconfirmed — read defensively in
 * the component", so these cases pin the defensive behaviour rather than
 * assuming one spelling.
 */
const ROWS = [
  { type: "query", value: "smart flight booking", clicks: 142, impressions: 3201, ctr: 0.044, position: 8.2 },
  { type: "query", value: "book flights online", clicks: 98, impressions: 2110, ctr: 0.046, position: 11.7 },
  { type: "page", value: "/", clicks: 500, impressions: 9000, ctr: 0.05, position: 3 },
  { type: "country", value: "ind", clicks: 300, impressions: 4000, ctr: 0.07, position: 5 },
];

describe("mapTopQueries", () => {
  it("keeps only query rows — pages and countries are a different report", () => {
    const out = mapTopQueries(ROWS);

    expect(out.map((q) => q.query)).toEqual(["smart flight booking", "book flights online"]);
  });

  it("sorts by clicks, highest first", () => {
    const out = mapTopQueries([
      { type: "query", value: "low", clicks: 3 },
      { type: "query", value: "high", clicks: 90 },
      { type: "query", value: "mid", clicks: 40 },
    ]);

    expect(out.map((q) => q.query)).toEqual(["high", "mid", "low"]);
  });

  it("carries the metrics through", () => {
    const [first] = mapTopQueries(ROWS);

    expect(first).toMatchObject({
      query: "smart flight booking",
      clicks: 142,
      impressions: 3201,
      position: 8.2,
    });
  });

  /**
   * The bug that produced these: `search_console_breakdown` is a per-DAY
   * rollup, so one query arrives as many rows. Without combining them the
   * table showed one day's clicks as the total and listed the query once per
   * day, which React reported as duplicate keys.
   */
  describe("one row per query, summed across days", () => {
    const DAYS = [
      { type: "query", value: "leadbyte", clicks: 3, impressions: 100, position: 8, date: "2026-09-01" },
      { type: "query", value: "leadbyte", clicks: 5, impressions: 300, position: 4, date: "2026-09-02" },
      { type: "query", value: "leadbyte login", clicks: 1, impressions: 50, position: 12, date: "2026-09-01" },
    ];

    it("collapses a query's days into a single row", () => {
      const out = mapTopQueries(DAYS);

      expect(out).toHaveLength(2);
      expect(out.map((q) => q.query)).toEqual(["leadbyte", "leadbyte login"]);
    });

    it("sums clicks and impressions rather than showing one day's", () => {
      const [first] = mapTopQueries(DAYS);

      expect(first?.clicks).toBe(8);
      expect(first?.impressions).toBe(400);
    });

    it("recomputes ctr from the totals, not as a mean of daily rates", () => {
      // Each day's own ctr is 3% and 1.67%; the mean of those is 2.3%, but the
      // true rate is 8/400 = 2%. A quiet day must not weigh as much as a busy one.
      const [first] = mapTopQueries(DAYS);

      expect(first?.ctr).toBeCloseTo(0.02);
    });

    it("weights position by impressions", () => {
      // (8x100 + 4x300) / 400 = 5, not the plain mean of 6.
      const [first] = mapTopQueries(DAYS);

      expect(first?.position).toBeCloseTo(5);
    });

    it("treats the same query in different casing as one query", () => {
      const out = mapTopQueries([
        { type: "query", value: "LeadByte", clicks: 2, impressions: 10 },
        { type: "query", value: "leadbyte", clicks: 3, impressions: 20 },
      ]);

      expect(out).toHaveLength(1);
      expect(out[0]?.clicks).toBe(5);
    });

    it("keeps the query as first written rather than lowercasing it", () => {
      const out = mapTopQueries([
        { type: "query", value: "LeadByte", clicks: 2, impressions: 10 },
        { type: "query", value: "leadbyte", clicks: 3, impressions: 20 },
      ]);

      expect(out[0]?.query).toBe("LeadByte");
    });

    it("gives every row a key the table can tell apart", () => {
      // The symptom this was found by: DataTable keys rows on the query.
      const keys = mapTopQueries(DAYS).map((q) => q.query);

      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  it("reads ctr as a fraction and stores it as one", () => {
    const [first] = mapTopQueries([
      { type: "query", value: "a", clicks: 1, ctr: 0.044 },
    ]);

    expect(first?.ctr).toBeCloseTo(0.044);
  });

  it("accepts a percentage-style ctr without reporting 4400%", () => {
    // Some rows arrive as 4.4 meaning 4.4%, not 440%.
    const [first] = mapTopQueries([{ type: "query", value: "a", clicks: 1, ctr: 4.4 }]);

    expect(first?.ctr).toBeCloseTo(0.044);
  });

  it("accepts the alternative field spellings a row might use", () => {
    const out = mapTopQueries([
      { type: "QUERY", query: "spelled-query", clicks: "12", impressions: "300", avg_position: "4.5" },
    ]);

    expect(out[0]).toMatchObject({
      query: "spelled-query",
      clicks: 12,
      impressions: 300,
      position: 4.5,
    });
  });

  it("drops rows with no query text rather than rendering blank lines", () => {
    expect(mapTopQueries([{ type: "query", value: "   ", clicks: 5 }])).toEqual([]);
  });

  it("returns an empty list for anything that is not an array", () => {
    expect(mapTopQueries(null)).toEqual([]);
    expect(mapTopQueries({})).toEqual([]);
    expect(mapTopQueries(undefined)).toEqual([]);
  });

  it("caps the list so one huge account cannot flood the page", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({
      type: "query",
      value: `q${i}`,
      clicks: i,
    }));

    expect(mapTopQueries(many).length).toBeLessThanOrEqual(100);
  });
});

describe("mapDaily · rolling properties up", () => {
  /**
   * `search_console_daily` is one row per PROPERTY per day, and an account
   * routinely has several for one site (http, https, domain). Uncollapsed, the
   * daily table showed each date repeatedly — React reported duplicate keys —
   * and the chart drew two points at the same x.
   */
  describe("one row per day, across properties", () => {
    const TWO_PROPERTIES = [
      { date: "2026-09-02", clicks: 5, impressions: 300, position: 4 },
      { date: "2026-09-02", clicks: 3, impressions: 100, position: 8 },
      { date: "2026-09-01", clicks: 2, impressions: 50, position: 12 },
    ];

    it("collapses a date's properties into one row", () => {
      const out = mapDaily(TWO_PROPERTIES);

      expect(out).toHaveLength(2);
      expect(out.map((day) => day.date)).toEqual(["2026-09-01", "2026-09-02"]);
    });

    it("gives every row a date the table can key on", () => {
      const dates = mapDaily(TWO_PROPERTIES).map((day) => day.date);

      expect(new Set(dates).size).toBe(dates.length);
    });

    it("sums clicks and impressions across the properties", () => {
      const second = mapDaily(TWO_PROPERTIES).find((day) => day.date === "2026-09-02");

      expect(second?.clicks).toBe(8);
      expect(second?.impressions).toBe(400);
    });

    it("recomputes ctr from the day's totals, not as a mean of the rows", () => {
      // 8 / 400 = 2%.
      const second = mapDaily(TWO_PROPERTIES).find((day) => day.date === "2026-09-02");

      expect(second?.ctr).toBeCloseTo(0.02);
    });

    it("weights average position by impressions", () => {
      // (4x300 + 8x100) / 400 = 5, not the plain mean of 6.
      const second = mapDaily(TWO_PROPERTIES).find((day) => day.date === "2026-09-02");

      expect(second?.position).toBeCloseTo(5);
    });
  });
});

describe("mapDaily", () => {
  it("reads a day row and sorts oldest first", () => {
    const days = mapDaily([
      { date: "2026-09-02", clicks: 5, impressions: 100, ctr: 0.05, position: 12 },
      { date: "2026-09-01", clicks: 3, impressions: 50, ctr: 6, position: 9 },
    ]);

    expect(days.map((d) => d.date)).toEqual(["2026-09-01", "2026-09-02"]);
    // 6 can only be a percentage — a CTR above 100% is not a thing.
    expect(days[0]!.ctr).toBeCloseTo(0.06);
    expect(days[1]!.ctr).toBeCloseTo(0.05);
  });

  it("drops rows with no date rather than charting them at the epoch", () => {
    expect(mapDaily([{ clicks: 1 }])).toEqual([]);
  });

  it("returns empty for anything that is not a list", () => {
    expect(mapDaily(null)).toEqual([]);
  });
});

describe("summariseSearch", () => {
  it("recomputes CTR from the totals instead of averaging the days", () => {
    const summary = summariseSearch([
      { date: "d1", clicks: 1, impressions: 1, ctr: 1, position: 1 },
      { date: "d2", clicks: 1, impressions: 99, ctr: 0.01, position: 1 },
    ]);

    // Averaging the two daily CTRs would claim ~50%. The truth is 2/100.
    expect(summary.ctr).toBeCloseTo(0.02);
  });

  it("weights position by impressions", () => {
    const summary = summariseSearch([
      { date: "d1", clicks: 0, impressions: 90, ctr: 0, position: 10 },
      { date: "d2", clicks: 0, impressions: 10, ctr: 0, position: 100 },
    ]);

    expect(summary.position).toBeCloseTo(19);
  });

  it("reports an unknown position as null, never as zero", () => {
    // Position 0 would render as the best possible rank.
    expect(summariseSearch([]).position).toBeNull();
  });
});

describe("searchConsoleHasData", () => {
  it("is true once any row has arrived", () => {
    expect(searchConsoleHasData({ ok: true, rows: [{ date: "2026-10-01" }] })).toBe(true);
  });

  it("is false for a read that answered with no rows", () => {
    expect(searchConsoleHasData({ ok: true, rows: [] })).toBe(false);
  });

  it("is true for a failed read — never ask someone to connect over a read error", () => {
    expect(searchConsoleHasData({ ok: false, rows: [] })).toBe(true);
  });
});
