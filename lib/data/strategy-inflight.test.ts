import { beginTurn, endTurn, isTurnInFlight } from "@/lib/data/strategy-inflight";

describe("one turn at a time, per business", () => {
  // The agent is stateful per sessionId. Five concurrent turns on one session
  // is not five copies of an answer — it is five interleaved messages in one
  // conversation, and five paid agent runs. Observed live: a customer pressed
  // an unresponsive button and n8n ran the same turn more than five times.

  it("lets the first turn through", () => {
    expect(beginTurn("b-first")).toBe(true);
    expect(isTurnInFlight("b-first")).toBe(true);
  });

  it("refuses a second turn while the first is still running", () => {
    beginTurn("b-busy");
    expect(beginTurn("b-busy")).toBe(false);
  });

  it("lets the next turn through once the first finishes", () => {
    beginTurn("b-seq");
    endTurn("b-seq");
    expect(isTurnInFlight("b-seq")).toBe(false);
    expect(beginTurn("b-seq")).toBe(true);
  });

  it("does not block a DIFFERENT business", () => {
    // The guard is per account. One customer's slow turn must not stop another.
    beginTurn("b-one");
    expect(beginTurn("b-two")).toBe(true);
  });

  it("releases a turn that has been stuck far too long", () => {
    // A turn whose action died — a crash, a redeploy — must not lock the
    // conversation forever. The agent's own budget is 120s, so anything past
    // that is not still running.
    // Well past the budget, not on the boundary — the exact threshold is an
    // implementation detail, "still running after five minutes" is not.
    beginTurn("b-stale", 1_000);
    expect(beginTurn("b-stale", 1_000 + 300_000)).toBe(true);
  });

  it("still blocks a turn that is merely slow", () => {
    beginTurn("b-slow", 1_000);
    expect(beginTurn("b-slow", 1_000 + 30_000)).toBe(false);
  });

  it("endTurn on a business with nothing running is harmless", () => {
    expect(() => endTurn("b-none")).not.toThrow();
  });
});
