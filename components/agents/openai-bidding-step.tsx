"use client";

/**
 * Step 2 of the OpenAI Ads setup: goal, objective, bid strategy, bid amount.
 *
 * ## Why it earns `"use client"`
 *
 * Three things here depend on each other as they are chosen: the objective
 * follows from the goal, the strategies offered follow from the objective, and
 * the bid field exists only for some strategies. A server-rendered form cannot
 * re-render on a change without a round trip that would discard the rest of a
 * half-filled setup.
 *
 * ## The objective is shown, never asked
 *
 * It is derived (`openai-bidding.ts`) and displayed read-only, so the customer
 * can see what their goal means without being able to contradict it. Nothing
 * is posted for it — the service derives it from the goal at its end too.
 */

import { useState } from "react";
import { ADS_GOALS, CONVERSION_GOALS } from "@/lib/data/chatgpt-ads-setup";
import type { AdsGoal } from "@/lib/data/ads-types";
import {
  lowBidWarning,
  objectiveForGoal,
  objectiveLabel,
  strategiesForGoal,
} from "@/lib/data/openai-bidding";

export function OpenAiBiddingStep({
  defaultGoal = "leads",
  conversionGoals = true,
}: {
  defaultGoal?: AdsGoal;
  /**
   * False when the account has no conversion events: Leads and App installs
   * optimise for one, so they stay in the list greyed out (disabled, with the
   * reason in their label) rather than vanishing, and the server refuses them.
   */
  conversionGoals?: boolean;
}) {
  const isLocked = (id: AdsGoal) => !conversionGoals && CONVERSION_GOALS.includes(id);
  const startGoal = isLocked(defaultGoal)
    ? (ADS_GOALS.find((g) => !isLocked(g.id))?.id ?? "traffic")
    : defaultGoal;
  const [goal, setGoal] = useState<AdsGoal>(startGoal);
  const offered = strategiesForGoal(goal);
  // The first offered strategy is what the radios show selected, so it is also
  // what an untouched form means — the same value `strategyForGoal` falls back
  // to on the server.
  const [strategyId, setStrategyId] = useState(offered[0]!.id);
  const [amount, setAmount] = useState("");

  const strategy = offered.find((s) => s.id === strategyId) ?? offered[0]!;
  const warning = lowBidWarning(strategy, Number(amount) || 0);

  // Changing the goal changes the objective, and an objective does not offer
  // the previous objective's strategies. Reset rather than carry a choice that
  // is no longer on screen.
  function chooseGoal(next: AdsGoal) {
    setGoal(next);
    const first = strategiesForGoal(next)[0]!;
    setStrategyId(first.id);
    if (!first.requiresBid) setAmount("");
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="mb-1.5 block text-sm text-ink">Goal</span>
        <select
          name="goal"
          value={goal}
          onChange={(e) => chooseGoal(e.target.value as AdsGoal)}
          suppressHydrationWarning
          className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
        >
          {ADS_GOALS.map((g) => (
            <option key={g.id} value={g.id} disabled={isLocked(g.id)}>
              {isLocked(g.id) ? `${g.label} (needs a conversion event)` : g.label}
            </option>
          ))}
        </select>
      </label>

      {/* Derived, not chosen. Shown so the goal's consequence is visible. */}
      <p className="rounded-lg bg-info-soft px-3 py-2.5 text-sm text-info">
        This runs as a <span className="font-medium">{objectiveLabel(objectiveForGoal(goal))}</span>{" "}
        campaign.
      </p>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-1 text-sm text-ink">Bid strategy</legend>
        {offered.map((s) => (
          <label
            key={s.id}
            className={`flex cursor-pointer items-start gap-3 rounded-md border px-4 py-2.5 text-sm transition-colors ${
              strategyId === s.id
                ? "border-accent bg-surface-raised"
                : "border-border bg-surface hover:bg-surface-raised"
            }`}
          >
            <input
              type="radio"
              name="bidStrategy"
              value={s.id}
              checked={strategyId === s.id}
              onChange={() => {
                setStrategyId(s.id);
                if (!s.requiresBid) setAmount("");
              }}
              suppressHydrationWarning
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            <span className="min-w-0">
              <span className="block font-medium text-ink">{s.label}</span>
              <span className="block text-xs text-ink-soft">{s.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {/* Only the manual strategies ask. An amount beside "Maximize results"
          would be a number the platform is never told. */}
      {strategy.requiresBid && (
        <div>
          <label htmlFor="openai-bid-amount" className="mb-1.5 block text-sm text-ink">
            Bid amount <span className="text-crit">*</span>
          </label>
          <input
            id="openai-bid-amount"
            name="bidAmount"
            type="number"
            min={0}
            // The service refuses an over-cap bid with a 409 AFTER the campaign
            // exists, and `create` is never retried — so the customer is left
            // with an orphan and no way back through the flow. The browser
            // stopping it here costs nothing; `validateAdsSetup` re-checks it,
            // because a number input is a suggestion and a form POST is not.
            max={strategy.cap}
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10"
            suppressHydrationWarning
            className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
          />
          {/* The ceiling, said before it is hit rather than after. */}
          {strategy.cap !== undefined && (
            <p className="mt-1.5 text-xs text-ink-soft">
              {strategy.id === "max_cpm"
                ? `Per 1,000 views. The most this strategy accepts is ${strategy.cap}.`
                : `Per click. The most this strategy accepts is ${strategy.cap}.`}
            </p>
          )}
          {/* A caution, never a block: the customer may know their market
              better than a constant does. CPM only — on a CPC campaign, whose
              ceiling is 5, it fired at every legal value. */}
          {warning && (
            <p role="status" className="mt-1.5 text-xs text-warn">
              {warning}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
