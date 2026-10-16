import { buildTimeline, shortDay, shortDayYear, timelineWindow } from "./analytics-timeline";

const SESSIONS = {
  key: "sessions",
  label: "Sessions",
  format: "count" as const,
  rows: [
    { date: "2026-09-01", value: 120 },
    { date: "2026-09-02", value: 340 },
    { date: "2026-09-03", value: 210 },
  ],
};

// Starts a day later than sessions: an ad account connected mid-window, which
// is the normal case and the reason the axis is a union.
const SPEND = {
  key: "spend",
  label: "Ad spend",
  format: "amount" as const,
  rows: [
    { date: "2026-09-02", value: 1200 },
    { date: "2026-09-03", value: 900 },
  ],
};

describe("buildTimeline", () => {
  it("uses the union of every series' dates", () => {
    const { dates } = buildTimeline([SESSIONS, SPEND]);

    expect(dates).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });

  it("sorts the axis ascending regardless of input order", () => {
    const { dates } = buildTimeline([
      {
        key: "a",
        label: "A",
        format: "count",
        rows: [
          { date: "2026-09-09", value: 1 },
          { date: "2026-09-02", value: 1 },
          { date: "2026-09-05", value: 1 },
        ],
      },
    ]);

    expect(dates).toEqual(["2026-09-02", "2026-09-05", "2026-09-09"]);
  });

  /**
   * The distinction this module exists for. Drawn as zero, the days before an
   * ad account was connected read as a campaign that spent nothing — which is
   * a claim about a campaign that did not exist.
   */
  it("marks a day a series does not cover as null, not zero", () => {
    const { bands } = buildTimeline([SESSIONS, SPEND]);
    const spend = bands.find((band) => band.key === "spend");

    expect(spend?.values).toEqual([null, 1200, 900]);
    expect(spend?.values[0]).not.toBe(0);
  });

  it("keeps a genuine zero as zero", () => {
    const { bands } = buildTimeline([
      {
        key: "spend",
        label: "Ad spend",
        format: "amount",
        rows: [
          { date: "2026-09-01", value: 0 },
          { date: "2026-09-02", value: 50 },
        ],
      },
    ]);

    expect(bands[0]?.values).toEqual([0, 50]);
  });

  it("sums two rows for the same date", () => {
    // Both ad platforms feed one spend band and both report the same day.
    const { bands } = buildTimeline([
      {
        key: "spend",
        label: "Ad spend",
        format: "amount",
        rows: [
          { date: "2026-09-01", value: 300 },
          { date: "2026-09-01", value: 700 },
        ],
      },
    ]);

    expect(bands[0]?.values).toEqual([1000]);
  });

  it("scales each band by its own peak", () => {
    const { bands } = buildTimeline([SESSIONS, SPEND]);

    expect(bands.find((b) => b.key === "sessions")?.peak).toBe(340);
    expect(bands.find((b) => b.key === "spend")?.peak).toBe(1200);
  });

  it("reports a null peak for a band with no data rather than zero", () => {
    const { bands } = buildTimeline([
      SESSIONS,
      { key: "spend", label: "Ad spend", format: "amount", rows: [] },
    ]);
    const spend = bands.find((b) => b.key === "spend");

    expect(spend?.peak).toBeNull();
    expect(spend?.peakLabel).toBeNull();
  });

  it("keeps an empty band instead of dropping it", () => {
    // An unconnected account and a connected quiet one must not look alike.
    const { bands } = buildTimeline([
      SESSIONS,
      { key: "spend", label: "Ad spend", format: "amount", rows: [] },
    ]);

    expect(bands).toHaveLength(2);
    expect(bands[1]?.values).toEqual([null, null, null]);
  });

  it("returns an empty timeline for no inputs", () => {
    expect(buildTimeline([])).toEqual({ dates: [], bands: [] });
  });

  describe("peak labels", () => {
    function peakFor(value: number, format: "count" | "amount") {
      return buildTimeline([
        { key: "k", label: "L", format, rows: [{ date: "2026-09-01", value }] },
      ])[
        "bands"
      ][0]?.peakLabel;
    }

    it("leaves hundreds unabbreviated", () => {
      // 840 as "0.8k" throws away a digit to save one character.
      expect(peakFor(840, "count")).toBe("840");
    });

    it("abbreviates thousands and millions", () => {
      expect(peakFor(3201, "count")).toBe("3.2k");
      expect(peakFor(1_500_000, "count")).toBe("1.5M");
    });

    it("keeps two decimals on small money", () => {
      // A cost per click of 0.38 rounded to whole units reads as free.
      expect(peakFor(0.38, "amount")).toBe("0.38");
    });
  });
});

describe("timelineWindow", () => {
  it("names both ends of a range", () => {
    expect(timelineWindow(["2026-08-25", "2026-09-08"])).toBe("25 Aug – 8 Sep 2026");
  });

  it("drops the repeated month when both ends share it", () => {
    expect(timelineWindow(["2026-09-01", "2026-09-08"])).toBe("1 – 8 Sep 2026");
  });

  it("names both months across a year boundary", () => {
    // Same month number, different year — not the same month.
    expect(timelineWindow(["2025-09-01", "2026-09-08"])).toBe("1 Sep – 8 Sep 2026");
  });

  it("shows a single day as one date", () => {
    expect(timelineWindow(["2026-09-08"])).toBe("8 Sep 2026");
  });

  it("returns null with no dates rather than a range with no ends", () => {
    expect(timelineWindow([])).toBeNull();
  });
});

describe("shortDay / shortDayYear", () => {
  it("spells September with three letters, like every other month", () => {
    expect(shortDay("2026-09-14")).toBe("14 Sep");
    expect(shortDayYear("2026-09-14")).toBe("14 Sep 2026");
  });

  it("returns an unreadable date as it came", () => {
    expect(shortDayYear("not a date")).toBe("not a date");
  });
});
