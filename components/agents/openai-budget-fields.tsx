"use client";

/**
 * The OpenAI form's budget amount and budget type, with the platform's floor
 * checked as the customer types.
 *
 * ## Why this earns `"use client"`
 *
 * Which minimum applies depends on the type chosen a moment ago — $25 a day or
 * $100 lifetime on USD — and saying so in red beside the amount, before the
 * wizard moves on, is state a form post cannot express. The message is also
 * set as the input's custom validity, so `SetupWizard`'s Next refuses to
 * leave the step with it showing. `validateAdsSetup` repeats the rule on the
 * server, because a browser check is a suggestion.
 *
 * The type starts on "Select type" (2026-10-03): a preselected "Daily" read as
 * a choice already made, and the customer never looked at it.
 */

import { useEffect, useRef, useState } from "react";
import type { AdsBudgetType } from "@/lib/data/ads-types";

const INPUT =
  "w-full rounded-md border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent";

export function OpenAiBudgetFields({
  currency,
  minimums,
}: {
  currency: string;
  /** Each type's floor, already formatted ("$25"), or null when none is published. */
  minimums: Record<AdsBudgetType, { amount: number; label: string } | null>;
}) {
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<AdsBudgetType | "">("");
  const amountRef = useRef<HTMLInputElement>(null);

  const value = Number(amount);
  const floor = type === "" ? null : minimums[type];
  const tooLow = floor !== null && amount !== "" && value < floor.amount;
  const message = tooLow
    ? `${type === "lifetime" ? "Lifetime" : "Daily"} budget must be at least ${floor.label}.`
    : "";

  useEffect(() => {
    amountRef.current?.setCustomValidity(message);
  }, [message]);

  return (
    <div className="mb-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-ink">
            Budget <span className="text-ink-soft">(in {currency})</span>
          </span>
          <input
            ref={amountRef}
            name="budgetAmount"
            type="number"
            min={1}
            step="1"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={tooLow || undefined}
            aria-describedby="budget-minimum"
            suppressHydrationWarning
            className={`${INPUT} ${tooLow ? "border-crit" : "border-border"}`}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-ink">Budget type</span>
          <select
            name="budgetType"
            required
            value={type}
            onChange={(e) => setType(e.target.value as AdsBudgetType | "")}
            suppressHydrationWarning
            autoComplete="off"
            className={`${INPUT} border-border`}
          >
            <option value="">Select type</option>
            <option value="daily">Daily budget</option>
            <option value="lifetime">Lifetime budget</option>
          </select>
        </label>
      </div>
      <p id="budget-minimum" role={tooLow ? "alert" : undefined} className={`mt-2 text-sm ${tooLow ? "text-crit" : "text-ink-soft"}`}>
        {tooLow ? message : <MinimumNote currency={currency} minimums={minimums} />}
      </p>
    </div>
  );
}

function MinimumNote({
  currency,
  minimums,
}: {
  currency: string;
  minimums: Record<AdsBudgetType, { amount: number; label: string } | null>;
}) {
  const { daily, lifetime } = minimums;
  return (
    <>
      Entered in your ad account&rsquo;s currency ({currency}).
      {daily && lifetime ? ` Minimum ${daily.label} daily, ${lifetime.label} lifetime.` : ""}
    </>
  );
}
