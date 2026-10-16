import {
  BID_STRATEGIES,
  GOAL_OBJECTIVE,
  LOW_BID,
  bidAmountFor,
  bidAmountProblem,
  lowBidWarning,
  objectiveForGoal,
  strategiesForGoal,
  strategyForGoal,
} from "./openai-bidding";
import { ADS_GOALS } from "./chatgpt-ads-setup";

describe("goal to objective", () => {
  it("maps each goal the way the backend does", () => {
    expect(objectiveForGoal("awareness")).toBe("reach");
    expect(objectiveForGoal("traffic")).toBe("clicks");
    expect(objectiveForGoal("leads")).toBe("conversions");
    expect(objectiveForGoal("sales")).toBe("conversions");
    expect(objectiveForGoal("app")).toBe("conversions");
  });

  it("covers every goal the form offers", () => {
    // A goal with no objective would render a step with nothing to choose.
    for (const goal of ADS_GOALS) {
      expect(GOAL_OBJECTIVE[goal.id], `no objective for ${goal.id}`).toBeDefined();
    }
  });

  it("does not offer engagement", () => {
    // Dropped rather than mapped — there is no objective behind it.
    expect(ADS_GOALS.some((g) => g.id === ("engagement" as string))).toBe(false);
  });
});

describe("bid strategies per objective", () => {
  it("gives Reach exactly one, a CPM bid that needs an amount", () => {
    const reach = BID_STRATEGIES.reach;
    expect(reach).toHaveLength(1);
    expect(reach[0]!.id).toBe("max_cpm");
    expect(reach[0]!.requiresBid).toBe(true);
  });

  it("gives Conversions an automatic and a manual option", () => {
    const ids = BID_STRATEGIES.conversions.map((s) => s.id);
    expect(ids).toEqual(["maximize_results", "max_cpc"]);
    expect(BID_STRATEGIES.conversions.find((s) => s.id === "maximize_results")!.requiresBid).toBe(
      false,
    );
    expect(BID_STRATEGIES.conversions.find((s) => s.id === "max_cpc")!.requiresBid).toBe(true);
  });

  it("gives Clicks a CPC bid and an automatic option", () => {
    const ids = BID_STRATEGIES.clicks.map((s) => s.id);
    expect(ids).toEqual(["max_cpc", "maximize_results"]);
    expect(BID_STRATEGIES.clicks.find((s) => s.id === "max_cpc")!.requiresBid).toBe(true);
  });

  it("reaches the right list from a goal", () => {
    expect(strategiesForGoal("sales").map((s) => s.id)).toEqual([
      "maximize_results",
      "max_cpc",
    ]);
    expect(strategiesForGoal("awareness").map((s) => s.id)).toEqual(["max_cpm"]);
  });

  it("falls back to the first offered strategy for an unknown id", () => {
    // A stale tab or a hand-edited post must not select a strategy that this
    // objective does not offer.
    expect(strategyForGoal("awareness", "maximize_results").id).toBe("max_cpm");
    expect(strategyForGoal("traffic", "nonsense").id).toBe("max_cpc");
  });

  /**
   * Every strategy has a wire name, and that is the fix. Conversions' manual
   * option was a `manual_max` of our own invention with none — so that whole
   * branch sent `bid_amount` with no `bid_strategy`, indistinguishable from
   * automatic bidding. The service takes three names and Conversions uses the
   * same one as Clicks, because it is billed per click either way.
   */
  it("names the wire strategy for every option it offers", () => {
    expect(strategyForGoal("awareness", "max_cpm").wire).toBe("max_cpm");
    expect(strategyForGoal("traffic", "max_cpc").wire).toBe("max_cpc");
    expect(strategyForGoal("traffic", "maximize_results").wire).toBe("maximize_results");
    expect(strategyForGoal("sales", "max_cpc").wire).toBe("max_cpc");
    for (const list of Object.values(BID_STRATEGIES)) {
      for (const strategy of list) expect(strategy.wire).toBeDefined();
    }
  });

  /**
   * Over the cap is a 409 AFTER the campaign exists, and `create` is never
   * retried — so the customer is left with an orphan. CPM is per thousand
   * impressions, which is why its ceiling is three orders of magnitude higher.
   */
  it("carries the ceiling the service enforces", () => {
    expect(strategyForGoal("awareness", "max_cpm").cap).toBe(5000);
    expect(strategyForGoal("traffic", "max_cpc").cap).toBe(5);
    expect(strategyForGoal("sales", "max_cpc").cap).toBe(5);
    // Automatic bidding takes no amount, so it has no ceiling to name.
    expect(strategyForGoal("traffic", "maximize_results").cap).toBeUndefined();
  });

  it("blocks an over-cap bid and an absent one", () => {
    const cpc = strategyForGoal("traffic", "max_cpc");
    expect(bidAmountProblem(cpc, 6)).toMatch(/most this strategy accepts is 5/);
    expect(bidAmountProblem(cpc, 5)).toBeNull();
    expect(bidAmountProblem(cpc, 0)).toMatch(/name the most you will pay/i);
    expect(bidAmountProblem(strategyForGoal("traffic", "maximize_results"), 0)).toBeNull();
  });
});

describe("the bid amount", () => {
  const manual = strategyForGoal("traffic", "max_cpc");
  const automatic = strategyForGoal("traffic", "maximize_results");

  it("is null for an automatic strategy, never zero", () => {
    // `ads-types.ts` is explicit: a zero is a bid, and bidding nothing is not
    // what "Maximize results" means.
    expect(bidAmountFor(automatic, 0)).toBeNull();
    expect(bidAmountFor(automatic, 12)).toBeNull();
  });

  it("passes a real manual bid through, and nulls an unset one", () => {
    expect(bidAmountFor(manual, 12)).toBe(12);
    expect(bidAmountFor(manual, 0)).toBeNull();
  });

  /**
   * CPM only. The "2 to 4 dollars" guidance behind it was about impressions,
   * and applying it to CPC — whose ceiling is 5 — fired at every legal value
   * and went quiet only at the maximum, telling people to bid above the cap.
   */
  it("warns a CPM bid under the delivery threshold, and never a CPC one", () => {
    const cpm = strategyForGoal("awareness", "max_cpm");
    expect(lowBidWarning(cpm, 3)).toMatch(/may not be delivered/);
    expect(lowBidWarning(cpm, LOW_BID)).toBeNull();
    expect(lowBidWarning(cpm, 20)).toBeNull();
    expect(lowBidWarning(manual, 3)).toBeNull();
  });

  it("says nothing at all when no amount is asked for", () => {
    expect(lowBidWarning(automatic, 1)).toBeNull();
  });

  it("does not warn about an amount that has not been typed yet", () => {
    expect(lowBidWarning(manual, 0)).toBeNull();
  });
});
