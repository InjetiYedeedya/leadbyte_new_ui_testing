"use client";

/**
 * The LinkedIn campaign goal, and the ad format that goes with it, as a linked
 * pair.
 *
 * ## Why this earns `"use client"`
 *
 * The format list depends on the goal. It used to be one select listing EVERY
 * goal's formats under headings, with the goal preset to Lead generation — so
 * the customer scrolled past six other goals' formats to find theirs, and could
 * pick one LinkedIn rejects for the goal (product owner 2026-10-08). Now the
 * goal starts unanswered, and the format list shows only that goal's formats.
 *
 * Still plain form fields: both submit as `goal` and `adFormat`, the names
 * `readLinkedInAdsForm` reads — and it re-checks the pairing, because nothing
 * the browser sends is trusted to follow the UI's rules.
 */

import { useState } from "react";

const INPUT =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-60";

export function LinkedInGoalFields({
  goals,
  goalFormats,
  initialGoal = "",
  initialFormat = "",
}: {
  goals: readonly { id: string; label: string }[];
  goalFormats: Readonly<Record<string, readonly string[]>>;
  /** The answers the form was sent back with, if any. */
  initialGoal?: string;
  initialFormat?: string;
}) {
  const [goal, setGoal] = useState(initialGoal);
  const [format, setFormat] = useState(initialFormat);
  const formats = goalFormats[goal] ?? [];

  return (
    <>
      <label className="mb-3 block">
        <span className="mb-1 block text-sm text-ink">What should the campaign do?</span>
        <select
          name="goal"
          value={goal}
          onChange={(event) => {
            setGoal(event.target.value);
            // A format from the old goal may not belong to the new one.
            setFormat("");
          }}
          required
          data-draft="skip"
          className={INPUT}
        >
          <option value="" disabled>
            Select a goal
          </option>
          {goals.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="mb-3 block">
        <span className="mb-1 block text-sm text-ink">Ad format</span>
        <select
          name="adFormat"
          value={format}
          onChange={(event) => setFormat(event.target.value)}
          required
          disabled={goal === ""}
          data-draft="skip"
          className={INPUT}
        >
          <option value="" disabled>
            {goal === "" ? "Select a goal first" : "Select a format"}
          </option>
          {formats.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
