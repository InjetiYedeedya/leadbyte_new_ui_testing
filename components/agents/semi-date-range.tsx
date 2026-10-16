"use client";

/**
 * The campaign's start and end dates, as a pair that cannot run backwards.
 *
 * ## Why this earns `"use client"`
 *
 * The end date's earliest allowed day IS the start date the customer picked a
 * moment ago — a limit that moves with another field. Two independent
 * `type="date"` inputs let someone start on 2 October and end on 30 September
 * (reported 2026-09-30), and the ad platform refuses that campaign only after
 * we have said it is being created. `semiFormProblems` makes the same check on
 * the server; this makes it impossible to pick in the first place.
 *
 * The rules, from the legacy flow: the start is today or later, and the end is
 * AFTER the start. Moving the start past the end clears the end rather than
 * leaving an invalid pair on screen.
 */

import { useState } from "react";
import type { SemiField } from "@/lib/data/semi-form";

const INPUT = "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink";

function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The day after `day` (YYYY-MM-DD), or "" when there is no day. */
export function dayAfter(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return isoDay(new Date(y, m - 1, d + 1));
}

function Label({ field }: { field: SemiField }) {
  return (
    <span className="mb-1 block text-sm text-ink">
      {field.label}
      {field.required && <span className="text-crit"> *</span>}
    </span>
  );
}

export function SemiDateRange({
  start,
  end,
  startName,
  endName,
}: {
  start: SemiField;
  end: SemiField;
  startName: string;
  endName: string;
}) {
  const [from, setFrom] = useState(start.defaultValue);
  const [to, setTo] = useState(end.defaultValue);
  // The browser's own today: a campaign cannot start in the past.
  const today = isoDay(new Date());
  const earliestEnd = dayAfter(from) || dayAfter(today);

  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2">
      <label className="block">
        <Label field={start} />
        <input
          type="date"
          name={startName}
          value={from}
          min={today}
          required={start.required}
          onChange={(event) => {
            const next = event.target.value;
            setFrom(next);
            // An end that is no longer after the start is cleared, not kept.
            if (to !== "" && next !== "" && to <= next) setTo("");
          }}
          suppressHydrationWarning
          className={INPUT}
        />
      </label>
      <label className="block">
        <Label field={end} />
        <input
          type="date"
          name={endName}
          value={to}
          min={earliestEnd}
          required={end.required}
          onChange={(event) => setTo(event.target.value)}
          aria-describedby={`${endName}-hint`}
          suppressHydrationWarning
          className={INPUT}
        />
        <span id={`${endName}-hint`} className="mt-1 block text-xs text-ink-soft">
          Must be after the start date.
        </span>
      </label>
    </div>
  );
}
