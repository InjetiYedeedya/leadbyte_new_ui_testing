import { beginAction } from "./action-guard";

describe("beginAction", () => {
  it("refuses a second start while the first is running", () => {
    const first = beginAction("a@x.com", "launch-1", { staleAfterMs: 60_000 }, 1_000);
    expect(first.ok).toBe(true);
    expect(beginAction("a@x.com", "launch-1", { staleAfterMs: 60_000 }, 2_000)).toEqual({
      ok: false,
      reason: "running",
    });
  });

  it("allows it again once released, unless it is too soon", () => {
    const first = beginAction("a@x.com", "crawl-1", { staleAfterMs: 60_000, minIntervalMs: 30_000 }, 1_000);
    if (first.ok) first.release();
    expect(beginAction("a@x.com", "crawl-1", { staleAfterMs: 60_000, minIntervalMs: 30_000 }, 5_000)).toEqual({
      ok: false,
      reason: "too-soon",
    });
    expect(beginAction("a@x.com", "crawl-1", { staleAfterMs: 60_000, minIntervalMs: 30_000 }, 40_000).ok).toBe(true);
  });

  it("stops blocking once a run is stale — a crashed action cannot wedge an account", () => {
    beginAction("a@x.com", "stale-1", { staleAfterMs: 10_000 }, 1_000);
    expect(beginAction("a@x.com", "stale-1", { staleAfterMs: 10_000 }, 20_000).ok).toBe(true);
  });

  it("keeps accounts apart", () => {
    beginAction("a@x.com", "iso-1", { staleAfterMs: 60_000 }, 1_000);
    expect(beginAction("b@x.com", "iso-1", { staleAfterMs: 60_000 }, 1_000).ok).toBe(true);
  });
});
