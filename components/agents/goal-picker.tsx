"use client";

/**
 * The campaign goal, and the one detail some goals need, as a linked pair.
 *
 * ## Why this earns `"use client"`
 *
 * The second question depends on the first. It used to be a plain select
 * listing EVERY goal's options under headings, starting on "Not applicable" —
 * while the goal above started on Leads, which requires one. So the untouched
 * form was invalid, and every customer who left the defaults got "Choose what
 * the leads goal should drive" after submitting (reported 2026-09-27). Now the
 * second question lists only the chosen goal's options, starts on the first of
 * them, and is gone for goals that have none — the default is always valid.
 *
 * Still a plain form field: both values submit with the form as `goal` and
 * `subGoal`, exactly the names the Server Action already reads.
 */

import { useState } from "react";

const INPUT = "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink";

export interface GoalOption {
  id: string;
  label: string;
  subGoals: readonly string[];
}

export function GoalPicker({
  goals,
  defaultGoal,
  onGoalChange,
  onChange,
  startEmpty = false,
}: {
  goals: readonly GoalOption[];
  defaultGoal: string;
  /** For a parent whose later questions depend on the goal (`meta-goal-fields.tsx`). */
  onGoalChange?: (goalId: string) => void;
  /** Both answers, whenever either changes — for questions that follow the detail too. */
  onChange?: (goalId: string, subGoal: string) => void;
  /**
   * Nothing chosen to begin with, and a "Choose…" prompt in both questions
   * (Meta Ads, product owner 2026-10-06): the customer picks the goal rather
   * than inheriting one. Both stay `required`, so the browser will not submit
   * the form until they have — and the server checks again.
   */
  startEmpty?: boolean;
}) {
  const [goalId, setGoalId] = useState(defaultGoal);
  const subGoals = goals.find((goal) => goal.id === goalId)?.subGoals ?? [];
  const [subGoal, setSubGoal] = useState<string>(startEmpty ? "" : (subGoals[0] ?? ""));

  return (
    <>
      <label className="mb-3 block">
        <span className="mb-1 block text-sm text-ink">What should the campaign do?</span>
        <select
          name="goal"
          value={goalId}
          onChange={(event) => {
            const next = event.target.value;
            setGoalId(next);
            onGoalChange?.(next);
            // The new goal's first detail, never a stale one from the old goal
            // — or, starting empty, nothing until the customer picks.
            const firstSub = startEmpty ? "" : (goals.find((goal) => goal.id === next)?.subGoals[0] ?? "");
            setSubGoal(firstSub);
            onChange?.(next, firstSub);
          }}
          required={startEmpty}
          // Starting empty means EVERY time: never refilled from a saved draft.
          data-draft={startEmpty ? "skip" : undefined}
          className={INPUT}
        >
          {startEmpty && (
            <option value="" disabled>
              Choose a goal
            </option>
          )}
          {goals.map((goal) => (
            <option key={goal.id} value={goal.id}>
              {goal.label}
            </option>
          ))}
        </select>
      </label>

      {subGoals.length > 0 && (
        <label className="mb-3 block">
          <span className="mb-1 block text-sm text-ink">And specifically?</span>
          <select
            name="subGoal"
            value={subGoal}
            onChange={(event) => {
              setSubGoal(event.target.value);
              onChange?.(goalId, event.target.value);
            }}
            required
            data-draft={startEmpty ? "skip" : undefined}
            className={INPUT}
          >
            {startEmpty && (
              <option value="" disabled>
                Choose one
              </option>
            )}
            {subGoals.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}
