import type { AdsBidStrategy, AdsGoal } from "./ads-types";

/**
 * OpenAI Ads: goal → objective → bid strategy.
 *
 * Step 2 of the setup, and the only step where a wrong answer spends money in
 * a way the customer did not choose. No model is involved: this is a fixed
 * table the backend team gave us (2026-09-15), and it is written out in full
 * rather than derived, because every entry is a product decision.
 *
 * ## The objective is DERIVED, never asked
 *
 * The customer picks a goal; the objective follows from it. Asking for both
 * would let them disagree, and there is no answer for what a "Reach" objective
 * on a "Sales" goal should do.
 *
 * ## Why `wire` is optional
 *
 * `AdsCampaignRequest` has no `bid_strategy` field — `ads-types.ts` records
 * that the service DERIVES objective and strategy from the goal and returns
 * them on `prepare`. What it does take is `bid_amount`, and its presence is
 * what separates a manual bid from an automatic one. So the wire value is sent
 * only as a cross-check where the service's own vocabulary has a name for it;
 * Conversions' manual bid has none we have seen, and inventing one would be
 * guessing at a contract. `prepare` answers with the strategy it actually
 * chose — compare, never assume.
 */

export const OPENAI_OBJECTIVES = [
  { id: "reach", label: "Reach" },
  { id: "clicks", label: "Clicks" },
  { id: "conversions", label: "Conversions" },
] as const;

export type OpenAiObjectiveId = (typeof OPENAI_OBJECTIVES)[number]["id"];

/**
 * Which objective each goal runs as.
 *
 * `engagement` is deliberately absent: it was dropped from the goal list
 * (backend team, 2026-09-15) rather than mapped, because there is no objective
 * behind it. If it reappears in `OPENAI_GOALS` this map stops compiling, which
 * is the point.
 */
export const GOAL_OBJECTIVE: Record<AdsGoal, OpenAiObjectiveId> = {
  awareness: "reach",
  traffic: "clicks",
  leads: "conversions",
  sales: "conversions",
  app: "conversions",
};

export interface BidStrategy {
  id: string;
  label: string;
  /** One line under the label, saying what the money buys. */
  hint: string;
  /** True when the customer must name an amount. */
  requiresBid: boolean;
  /**
   * The service's own name for this strategy, where it has one. Sent as a
   * cross-check only — see the note at the top.
   */
  wire?: AdsBidStrategy;
  /**
   * The most the service will accept, in account currency.
   *
   * Enforced here because an over-cap bid is refused with a **409 after the
   * campaign exists**, and `create` is never retried — so the customer is left
   * with an orphaned campaign and no way back through the flow. A number in an
   * input is the cheapest place to stop that.
   *
   * CPM is per thousand impressions, which is why its ceiling is three orders
   * of magnitude above CPC's. Absent on automatic strategies, which take no
   * amount at all.
   */
  cap?: number;
}

const MAXIMIZE: BidStrategy = {
  id: "maximize_results",
  label: "Maximize results",
  hint: "The platform bids for you, to get the most it can for your budget.",
  requiresBid: false,
  wire: "maximize_results",
};

/**
 * The strategies each objective offers, in the order they are shown.
 *
 * Reach has exactly one. That is not an oversight to be "fixed" by adding
 * Maximize results for symmetry — a reach campaign is bought per thousand
 * views, and the CPM bid is the only lever.
 */
export const BID_STRATEGIES: Record<OpenAiObjectiveId, readonly BidStrategy[]> = {
  reach: [
    {
      id: "max_cpm",
      label: "Maximum CPM bid",
      hint: "The most you'll pay for every 1,000 views.",
      requiresBid: true,
      wire: "max_cpm",
      cap: 5000,
    },
  ],
  conversions: [
    MAXIMIZE,
    {
      // `max_cpc`, not a `manual_max` of our own invention. Conversions
      // campaigns OPTIMISE for conversions but are still BILLED per click, so
      // the platform takes the same strategy and the same cap as Clicks. The
      // made-up id had no `wire`, so this whole branch sent `bid_amount` with
      // no `bid_strategy` at all — indistinguishable from automatic bidding
      // (found 2026-09-21).
      id: "max_cpc",
      label: "Manual: maximum CPC bid",
      hint: "The most you'll pay for one click. Billed per click even though it optimises for conversions.",
      requiresBid: true,
      wire: "max_cpc",
      cap: 5,
    },
  ],
  clicks: [
    {
      id: "max_cpc",
      label: "Maximum CPC bid",
      hint: "The most you'll pay for one click.",
      requiresBid: true,
      wire: "max_cpc",
      cap: 5,
    },
    MAXIMIZE,
  ],
};

export function objectiveForGoal(goal: AdsGoal): OpenAiObjectiveId {
  return GOAL_OBJECTIVE[goal];
}

export function objectiveLabel(id: OpenAiObjectiveId): string {
  return OPENAI_OBJECTIVES.find((o) => o.id === id)?.label ?? id;
}

export function strategiesForGoal(goal: AdsGoal): readonly BidStrategy[] {
  return BID_STRATEGIES[objectiveForGoal(goal)];
}

/**
 * The chosen strategy, or the objective's first when the id is unknown.
 *
 * Falling back rather than returning null: an unrecognised id comes from a
 * stale tab or a hand-edited post, and the first strategy is the one the form
 * shows selected, so the fallback matches what the customer was looking at.
 */
export function strategyForGoal(goal: AdsGoal, strategyId: string): BidStrategy {
  const offered = strategiesForGoal(goal);
  return offered.find((s) => s.id === strategyId) ?? offered[0]!;
}

/**
 * Below this, a CPM ad may simply not be delivered.
 *
 * **CPM only, and that restriction is the fix.** The backend team's "2 to 4
 * dollars" example was about impressions, and this warning was applied to
 * every manual strategy — so on a CPC campaign, whose ceiling is 5, it fired
 * at every legal value and went quiet only at the maximum. Telling someone to
 * bid higher than the cap is worse than saying nothing.
 */
export const LOW_BID = 5;

/** A caution to show beside the amount, or null when there is nothing to say. */
export function lowBidWarning(strategy: BidStrategy, amount: number): string | null {
  if (!strategy.requiresBid) return null;
  if (strategy.id !== "max_cpm") return null;
  if (!(amount > 0) || amount >= LOW_BID) return null;
  return "That bid is low — the ad may not be delivered to your audience.";
}

/**
 * What is wrong with this amount, or null when nothing is.
 *
 * Over the cap is a 409 AFTER the campaign exists, so this is a block rather
 * than a caution — the only error here that costs something to discover late.
 */
export function bidAmountProblem(strategy: BidStrategy, amount: number): string | null {
  if (!strategy.requiresBid) return null;
  if (!(amount > 0)) return "Name the most you will pay — this campaign has no automatic bidding.";
  if (strategy.cap !== undefined && amount > strategy.cap) {
    return `The most this strategy accepts is ${strategy.cap}. A higher bid is refused after the campaign is created.`;
  }
  return null;
}

/**
 * What to send as `bid_amount`.
 *
 * Null, never zero, for an automatic strategy: `ads-types.ts` is explicit that
 * a zero is a bid, and bidding nothing is not what "Maximize results" means.
 */
export function bidAmountFor(strategy: BidStrategy, amount: number): number | null {
  if (!strategy.requiresBid) return null;
  return amount > 0 ? amount : null;
}
