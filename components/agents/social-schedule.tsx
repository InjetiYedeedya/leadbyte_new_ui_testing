"use client";

/**
 * When the agent posts: every day, or on dates the customer chooses.
 *
 * ## Why this earns `"use client"`
 *
 * Chosen dates are a list that grows and shrinks — add one, remove one — and
 * the date box only matters once "Chosen dates" is picked. Both are state.
 *
 * Legacy drew its own month calendar. This uses the browser's date input
 * instead, whose earliest day is tomorrow (legacy disabled today and the
 * past): it already works with a keyboard, a screen reader and a phone's own
 * picker. Each date posts as a `postDates` input; `validateSocial` repeats the
 * after-today rule on the server.
 */

import { useId, useState } from "react";
import { SOCIAL_INPUT, type SocialSchedule } from "@/lib/data/social-media-setup";

const CONTROL = "rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-ink";
const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-raised disabled:opacity-60";

/** `YYYY-MM-DD` for the day after `today`, in local time. */
export function dayAfterToday(today: Date = new Date()): string {
  const next = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

function spoken(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function SocialSchedule({ defaultSchedule }: { defaultSchedule: SocialSchedule }) {
  const [kind, setKind] = useState<SocialSchedule["kind"]>(defaultSchedule.kind);
  const [dates, setDates] = useState<string[]>(defaultSchedule.kind === "dates" ? defaultSchedule.dates : []);
  const [draft, setDraft] = useState("");
  const id = useId();
  const earliest = dayAfterToday();

  function add() {
    if (!draft || draft < earliest) return;
    setDates((list) => (list.includes(draft) ? list : [...list, draft].sort()));
    setDraft("");
  }

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-ink">When to post</legend>
      <div className="flex flex-wrap gap-2">
        {(["everyday", "dates"] as const).map((value) => (
          <label
            key={value}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm text-ink has-[:checked]:border-accent has-[:checked]:bg-accent/5"
          >
            <input
              type="radio"
              name={SOCIAL_INPUT.scheduleKind}
              value={value}
              checked={kind === value}
              onChange={() => setKind(value)}
              className="accent-accent"
            />
            {value === "everyday" ? "Every day" : "Chosen dates"}
          </label>
        ))}
      </div>

      {kind === "dates" && (
        <div className="mt-3">
          <label htmlFor={`${id}-date`} className="mb-1 block text-sm text-ink">
            Add a date
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id={`${id}-date`}
              type="date"
              min={earliest}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add();
                }
              }}
              className={CONTROL}
            />
            <button type="button" onClick={add} disabled={!draft || draft < earliest} className={BUTTON}>
              Add date
            </button>
          </div>
          <p className="mt-1 text-xs text-ink-soft">Dates start from tomorrow.</p>

          {dates.length > 0 ? (
            <ul aria-label="Posting dates" className="mt-2 flex flex-wrap gap-2">
              {dates.map((date) => (
                <li
                  key={date}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised pl-3 text-sm text-ink"
                >
                  {spoken(date)}
                  <input type="hidden" name={SOCIAL_INPUT.postDates} value={date} />
                  <button
                    type="button"
                    onClick={() => setDates((list) => list.filter((d) => d !== date))}
                    aria-label={`Remove ${spoken(date)}`}
                    className="inline-flex size-11 items-center justify-center rounded-md text-ink-soft hover:bg-surface hover:text-ink"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">No dates added yet.</p>
          )}
        </div>
      )}
    </fieldset>
  );
}
