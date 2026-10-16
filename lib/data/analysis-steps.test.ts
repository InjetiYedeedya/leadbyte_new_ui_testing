import {
  ANALYSIS_STEPS,
  OVERDUE_MS,
  PACE_MS,
  barPercent,
  formatElapsed,
  isOverdue,
  progressShare,
  stepAt,
} from "@/lib/data/analysis-steps";

describe("ANALYSIS_STEPS", () => {
  it("lists the phases the payload actually contains, in order", () => {
    expect(ANALYSIS_STEPS[0]).toBe("Connecting to website");
    expect(ANALYSIS_STEPS.at(-1)).toBe("Building intelligence profile");
    expect(ANALYSIS_STEPS).toHaveLength(8);
  });
});

describe("progressShare", () => {
  it("is half way along at the pace point", () => {
    expect(progressShare(PACE_MS)).toBeCloseTo(0.5, 5);
  });

  it("never reaches 1, however long the crawl runs", () => {
    // This is the property every honesty rule below rests on: time alone
    // cannot finish the run.
    expect(progressShare(PACE_MS * 1000)).toBeLessThan(1);
    expect(progressShare(Number.MAX_SAFE_INTEGER)).toBeLessThan(1);
  });

  it("is zero before it starts", () => {
    expect(progressShare(0)).toBe(0);
    expect(progressShare(-5000)).toBe(0);
  });
});

describe("stepAt", () => {
  it("starts on the first step", () => {
    expect(stepAt(0)).toBe(0);
    expect(stepAt(-5000)).toBe(0);
  });

  it("keeps moving through a SHORT crawl", () => {
    // A one-page site finishes in about 5 seconds. It should be visibly
    // several steps in by then, not still on step one.
    expect(stepAt(5_000)).toBeGreaterThan(0);
    expect(stepAt(10_000)).toBeGreaterThan(stepAt(5_000));
  });

  it("keeps moving through a LONG crawl", () => {
    // go.chefgaa.com took over 3 minutes. The old fixed estimate ticked every
    // step off inside ten seconds and then sat still for the rest of it, which
    // is what made the screen look frozen.
    expect(stepAt(30_000)).toBeGreaterThan(stepAt(10_000));
    expect(stepAt(60_000)).toBeGreaterThan(stepAt(30_000));
  });

  it("stops one short of the end, however long it runs", () => {
    // "Building intelligence profile" becomes CURRENT and never done. Only the
    // job reporting done can finish the run — the clock never gets to say so.
    expect(stepAt(PACE_MS * 100)).toBe(ANALYSIS_STEPS.length - 1);
    expect(stepAt(PACE_MS * 10_000)).toBe(ANALYSIS_STEPS.length - 1);
  });

  it("handles an empty step list without dividing by zero", () => {
    expect(stepAt(5000, 0)).toBe(0);
  });
});

describe("barPercent", () => {
  it("is empty at the start", () => {
    expect(barPercent(0, false)).toBe(0);
  });

  it("agrees with the step estimate, because both read one curve", () => {
    // A bar at 90% beside step two is the contradiction that makes a whole
    // screen untrustworthy.
    expect(barPercent(PACE_MS, false)).toBe(50);
    expect(stepAt(PACE_MS)).toBe(4);
  });

  it("never fills while the job is still running", () => {
    expect(barPercent(PACE_MS * 500, false)).toBeLessThan(100);
    expect(barPercent(PACE_MS * 500, false)).toBe(99);
  });

  it("fills the moment the job says it is done, not when the clock does", () => {
    expect(barPercent(1000, true)).toBe(100);
  });
});

describe("formatElapsed", () => {
  it("counts seconds, then minutes", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(9_400)).toBe("0:09");
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(600_000)).toBe("10:00");
  });

  it("never shows a negative clock", () => {
    expect(formatElapsed(-5_000)).toBe("0:00");
  });
});

describe("isOverdue", () => {
  it("is false while the wait is still a normal length", () => {
    expect(isOverdue(0)).toBe(false);
    expect(isOverdue(OVERDUE_MS)).toBe(false);
  });

  it("is true once the wait has run long", () => {
    // Past this the subtitle must stop implying the wait is nearly over.
    expect(isOverdue(OVERDUE_MS + 1)).toBe(true);
  });
});
