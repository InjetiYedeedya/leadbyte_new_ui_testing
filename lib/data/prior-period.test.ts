import { periodDelta, withPriorPeriod } from "./prior-period";

/** Oldest first, which is what every mapper in `lib/data` returns. */
function series(values: number[]) {
  return values.map((value, index) => ({ label: `d${index + 1}`, value }));
}

describe("withPriorPeriod", () => {
  it("charts the newer half and compares it against the older half", () => {
    const out = withPriorPeriod(series([1, 2, 3, 10, 20, 30]));

    expect(out.hasPrior).toBe(true);
    expect(out.periodDays).toBe(3);
    expect(out.points).toEqual([
      { label: "d4", value: 10, prior: 1 },
      { label: "d5", value: 20, prior: 2 },
      { label: "d6", value: 30, prior: 3 },
    ]);
  });

  it("labels the x-axis with the CURRENT period's days", () => {
    // The reader is looking at now; the ghost is context behind it.
    const out = withPriorPeriod(series([1, 2, 3, 4, 5, 6]));

    expect(out.points.map((point) => point.label)).toEqual(["d4", "d5", "d6"]);
  });

  /**
   * The halves must be the same length or the comparison favours whichever
   * period got the extra day. The odd day comes off the OLDER end — hiding the
   * newest day of the current period would be the worse error.
   */
  it("drops the odd day from the older half, never the newer", () => {
    const out = withPriorPeriod(series([99, 1, 2, 3, 10, 20, 30]));

    expect(out.periodDays).toBe(3);
    expect(out.points.map((point) => point.value)).toEqual([10, 20, 30]);
    // 99 is the dropped day; the prior window starts at 1.
    expect(out.points.map((point) => point.prior)).toEqual([1, 2, 3]);
  });

  it("gives a short series no comparison rather than a two-day trend", () => {
    const out = withPriorPeriod(series([5, 6, 7]));

    expect(out.hasPrior).toBe(false);
    expect(out.points.every((point) => point.prior === null)).toBe(true);
  });

  it("still charts the whole short series as current", () => {
    const out = withPriorPeriod(series([5, 6, 7]));

    expect(out.points.map((point) => point.value)).toEqual([5, 6, 7]);
  });

  it("handles an empty series", () => {
    expect(withPriorPeriod([])).toEqual({ points: [], hasPrior: false, periodDays: 0 });
  });
});

describe("periodDelta", () => {
  it("compares the totals, not a mean of daily differences", () => {
    // current 60, prior 6 → +900%. A mean of per-day ratios would give
    // something else entirely and let one quiet day dominate.
    const out = withPriorPeriod(series([1, 2, 3, 10, 20, 30]));

    expect(periodDelta(out)).toBeCloseTo(900);
  });

  it("reports a fall as negative", () => {
    const out = withPriorPeriod(series([10, 20, 30, 1, 2, 3]));

    expect(periodDelta(out)).toBeCloseTo(-90);
  });

  it("is null when there is no previous period to compare against", () => {
    expect(periodDelta(withPriorPeriod(series([1, 2, 3])))).toBeNull();
  });

  it("is null rather than infinite when the previous period was empty", () => {
    // A site with no traffic before has not improved infinitely.
    const out = withPriorPeriod(series([0, 0, 0, 5, 6, 7]));

    expect(periodDelta(out)).toBeNull();
  });

  it("is zero for two identical periods", () => {
    const out = withPriorPeriod(series([4, 5, 6, 4, 5, 6]));

    expect(periodDelta(out)).toBeCloseTo(0);
  });
});
