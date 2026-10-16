import { rollupByDate, sumOf, weightedMean } from "./daily-rollup";

interface Row {
  date: string;
  clicks: number;
  impressions: number;
  position: number;
}

const ROWS: Row[] = [
  // Two properties reporting the same day — the shape that produced duplicate
  // React keys and a zig-zagging chart.
  { date: "2026-09-02", clicks: 5, impressions: 300, position: 4 },
  { date: "2026-09-02", clicks: 3, impressions: 100, position: 8 },
  { date: "2026-09-01", clicks: 2, impressions: 50, position: 12 },
];

function combine(group: Row[], date: string) {
  return {
    date,
    clicks: sumOf(group, (row) => row.clicks),
    impressions: sumOf(group, (row) => row.impressions),
    position: weightedMean(
      group,
      (row) => row.position,
      (row) => row.impressions,
    ),
  };
}

describe("rollupByDate", () => {
  it("collapses several rows for one date into one", () => {
    const out = rollupByDate(ROWS, combine);

    expect(out).toHaveLength(2);
    expect(out.map((day) => day.date)).toEqual(["2026-09-01", "2026-09-02"]);
  });

  it("gives every returned row a date the table can key on", () => {
    // The symptom this was found by.
    const dates = rollupByDate(ROWS, combine).map((day) => day.date);

    expect(new Set(dates).size).toBe(dates.length);
  });

  it("returns oldest first, so a chart reads left to right in time", () => {
    const out = rollupByDate(
      [
        { date: "2026-09-09", clicks: 1, impressions: 1, position: 1 },
        { date: "2026-09-02", clicks: 1, impressions: 1, position: 1 },
        { date: "2026-09-05", clicks: 1, impressions: 1, position: 1 },
      ],
      combine,
    );

    expect(out.map((day) => day.date)).toEqual(["2026-09-02", "2026-09-05", "2026-09-09"]);
  });

  it("drops a row with no date rather than charting it at the epoch", () => {
    const out = rollupByDate(
      [
        { date: "", clicks: 9, impressions: 9, position: 9 },
        { date: "2026-09-01", clicks: 2, impressions: 50, position: 12 },
      ],
      combine,
    );

    expect(out).toHaveLength(1);
    expect(out[0]?.clicks).toBe(2);
  });

  it("returns nothing for no rows", () => {
    expect(rollupByDate([], combine)).toEqual([]);
  });
});

describe("sumOf", () => {
  it("adds the field across a day's rows", () => {
    const out = rollupByDate(ROWS, combine);
    const second = out.find((day) => day.date === "2026-09-02");

    expect(second?.clicks).toBe(8);
    expect(second?.impressions).toBe(400);
  });

  it("is zero for an empty group", () => {
    expect(sumOf([], (row: Row) => row.clicks)).toBe(0);
  });
});

describe("weightedMean", () => {
  it("weights by the second field rather than averaging plainly", () => {
    // (4x300 + 8x100) / 400 = 5, not the plain mean of 6.
    const out = rollupByDate(ROWS, combine);

    expect(out.find((day) => day.date === "2026-09-02")?.position).toBeCloseTo(5);
  });

  /**
   * The reason the caller reduces a whole group rather than folding pairwise:
   * averaging is not associative, so a pairwise fold of three equal-weight
   * rows gives ((a+b)/2 + c)/2 — here 2.75 — instead of 3.
   */
  it("averages three equal-weight rows correctly, not pairwise", () => {
    const rows = [
      { date: "d", clicks: 0, impressions: 0, position: 2 },
      { date: "d", clicks: 0, impressions: 0, position: 3 },
      { date: "d", clicks: 0, impressions: 0, position: 4 },
    ];

    expect(
      weightedMean(
        rows,
        (row) => row.position,
        (row) => row.impressions,
      ),
    ).toBeCloseTo(3);
  });

  it("falls back to a plain mean when every weight is zero", () => {
    const rows = [
      { date: "d", clicks: 1, impressions: 0, position: 10 },
      { date: "d", clicks: 1, impressions: 0, position: 20 },
    ];

    expect(
      weightedMean(
        rows,
        (row) => row.position,
        (row) => row.impressions,
      ),
    ).toBeCloseTo(15);
  });

  it("returns null rather than zero when there is nothing to average", () => {
    // Position zero is the best rank there is; rendered, it reads as one.
    const rows = [{ date: "d", clicks: 0, impressions: 0, position: 0 }];

    expect(
      weightedMean(
        rows,
        (row) => row.position,
        (row) => row.impressions,
      ),
    ).toBeNull();
  });
});
