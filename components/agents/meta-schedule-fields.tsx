"use client";

/**
 * An ad campaign's dates, delivery hours and budget type — Meta's, and since
 * 2026-10-02 Google's too (`variant`).
 *
 * ## Why this earns `"use client"`
 *
 * Several answers here move with other answers given a moment ago, which a form
 * POST cannot express:
 *
 *   - The end date's earliest day is the day after the start the customer
 *     just picked, and moving the start onto or past the end clears the end
 *     (the same rule as `semi-date-range.tsx`).
 *   - The hour lists depend on the date: a campaign starting today can only
 *     start from the next full hour, and the end lists only hours after the
 *     start. Both stay snapped to an hour that is actually listed.
 *   - Meta only: turning custom timing ON switches the budget to lifetime and
 *     disables daily, because Meta schedules delivery only under a lifetime
 *     budget. Turning it off does not switch back — the customer's budget is
 *     theirs to change, and silently flipping it twice is how a total becomes a
 *     per-day spend.
 *
 * The two variants differ where the platforms do:
 *
 *   - **meta** — hours 6 AM to 11 PM behind a "Custom timing schedule" toggle,
 *     both required once it is on, and the lifetime lock above.
 *   - **google** — hours 12 AM to 11 PM, always shown, both OPTIONAL with
 *     "Any time" (an empty value) first; no toggle and no lifetime lock. The
 *     hours sit in `.ads-schedule-hours`, which `globals.css` hides for the
 *     goals Google allows none for, showing the matching explanation instead.
 *
 * "Today" is the BROWSER's day, never the server's: the customer's calendar is
 * the one that matters. `validateMetaAds` / `validateGoogleAds` re-check every
 * rule on the server. Every input keeps its `name`, so `FormDraft` can save and
 * restore it through real input events.
 */

import { useState, type ReactNode } from "react";
import { dayAfter } from "@/components/agents/semi-date-range";
import { ANY_TIME, BUDGET_TYPES, BUDGET_TYPE_LABELS, GOOGLE_HOURS, clockHourOf } from "@/lib/data/google-ads-setup";
import { META_BUDGET_TYPES, META_HOURS } from "@/lib/data/meta-ads-setup";

const INPUT = "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-ink-soft";

export type ScheduleVariant = "meta" | "google";

/** `YYYY-MM-DD` of a date in the browser's own time zone. */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The hours a schedule can START on. On today, only from the next full hour.
 * Meta: the last hour is never a start, as nothing would be left to end on.
 * Google: every hour can start, because the end is optional.
 */
export function startHours(
  startDate: string,
  today: string,
  nowHour: number,
  variant: ScheduleVariant = "meta",
): string[] {
  const starts = variant === "meta" ? META_HOURS.slice(0, -1) : [...GOOGLE_HOURS];
  return startDate !== "" && startDate === today ? starts.filter((h) => clockHourOf(h) > nowHour) : starts;
}

/**
 * The hours a schedule can END on: every listed hour after the start.
 *
 * Meta: nothing without a start. Google: with "Any time" as the start, every
 * hour after `floor` — the current hour when the campaign starts today, so the
 * list never offers an end that has already passed.
 */
export function endHours(start: string, variant: ScheduleVariant = "meta", floor = -1): string[] {
  const from = clockHourOf(start);
  if (variant === "meta") return from === -1 ? [] : META_HOURS.filter((h) => clockHourOf(h) > from);
  const after = from === -1 ? floor : Math.max(from, floor);
  return GOOGLE_HOURS.filter((h) => clockHourOf(h) > after);
}

/** `wanted` when it is listed, otherwise the first listed hour (or none). */
function snap(wanted: string, options: readonly string[]): string {
  return options.includes(wanted) ? wanted : (options[0] ?? "");
}

function Label({ text, required, note }: { text: string; required?: boolean; note?: string }) {
  return (
    <span className="mb-1 block text-sm text-ink">
      {text}
      {note && <span className="font-normal text-ink-soft"> {note}</span>}
      {required && (
        <span className="text-crit" aria-hidden="true">
          {" *"}
        </span>
      )}
    </span>
  );
}

/** Why a Google goal has no hours. Shown by `globals.css` for the matching goal only. */
function NoHoursNote({ kind, title, body }: { kind: "local" | "app"; title: string; body: string }) {
  return (
    <div className={`ads-schedule-note-${kind} hidden rounded-md bg-info-soft px-3 py-2 text-sm text-ink`}>
      <p className="font-medium">{title}</p>
      <p className="mt-0.5">{body}</p>
    </div>
  );
}

export function MetaScheduleFields({
  budgetAmount,
  variant = "meta",
  defaultStartTime = variant === "meta" ? "9:00 AM" : "",
  defaultEndTime = variant === "meta" ? "9:00 PM" : "",
}: {
  /** The budget amount field, server-rendered; this owns the type beside it. */
  budgetAmount: ReactNode;
  /** Whose rules: Meta's (the default) or Google's. */
  variant?: ScheduleVariant;
  /** Google: empty means "Any time". */
  defaultStartTime?: string;
  defaultEndTime?: string;
}) {
  const google = variant === "google";
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [customTiming, setCustomTiming] = useState(false);
  // Nothing chosen until the customer chooses: a pre-picked "Daily" was
  // submitted by people who never looked at it (2026-10-02).
  const [budgetType, setBudgetType] = useState<string>("");
  const [wantedStart, setWantedStart] = useState(defaultStartTime);
  const [wantedEnd, setWantedEnd] = useState(defaultEndTime);
  // Fixed ids, not `useId()`: on the agent page the server and the browser
  // numbered `useId` differently (a hydration mismatch, 2026-10-02). There is
  // one of these per form.
  const prefix = google ? "google-schedule" : "meta-schedule";
  const timingNoteId = `${prefix}-timing-note`;
  const budgetNoteId = `${prefix}-budget-note`;
  const endHintId = `${prefix}-end-hint`;

  const now = new Date();
  const today = localDay(now);
  const nowHour = now.getHours();
  const starts = startHours(startDate, today, nowHour, variant);
  // Google's lists lead with "Any time", posted empty.
  const startChoices = google ? ["", ...starts] : starts;
  const scheduleStart = snap(wantedStart, startChoices);
  const ends = endHours(scheduleStart, variant, google && startDate === today ? nowHour : -1);
  const endChoices = google ? ["", ...ends] : ends;
  const scheduleEnd = snap(wantedEnd, endChoices);
  // Daily cannot be the answer while a Meta schedule is on, whatever was
  // restored or typed into the select.
  const lifetimeLock = !google && customTiming;
  const budget = lifetimeLock ? "lifetime" : budgetType;
  const budgetTypes = google ? BUDGET_TYPES : META_BUDGET_TYPES;
  const showHours = google || customTiming;

  const hourOption = (h: string) => (
    <option key={h || "any"} value={h}>
      {h === "" ? ANY_TIME : h}
    </option>
  );

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <Label text="Start date" required />
          <input
            type="date"
            name="startDate"
            value={startDate}
            min={today}
            required
            onChange={(event) => {
              const next = event.target.value;
              setStartDate(next);
              // An end that is no longer after the start is cleared, not kept.
              if (endDate !== "" && next !== "" && endDate <= next) setEndDate("");
            }}
            suppressHydrationWarning
            className={INPUT}
          />
        </label>
        <label className="block">
          <Label text="End date" required />
          <input
            type="date"
            name="endDate"
            value={endDate}
            min={dayAfter(startDate) || dayAfter(today)}
            required
            disabled={startDate === ""}
            onChange={(event) => setEndDate(event.target.value)}
            aria-describedby={endHintId}
            suppressHydrationWarning
            className={INPUT}
          />
          <span id={endHintId} className="mt-1 block text-xs text-ink-soft">
            {startDate === "" ? "Choose a start date first." : "Must be after the start date."}
          </span>
        </label>
      </div>

      {!google && (
        <div>
          <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="customTiming"
              value="on"
              checked={customTiming}
              onChange={(event) => {
                const on = event.target.checked;
                setCustomTiming(on);
                if (on) setBudgetType("lifetime");
              }}
              aria-describedby={timingNoteId}
              className="accent-accent"
            />
            Custom timing schedule
          </label>
          <p id={timingNoteId} className="text-xs text-ink-soft">
            {customTiming ? "Ads run only between the hours below, every day." : "Run ads all day."}
          </p>
        </div>
      )}

      {showHours && (
        <div className={google ? "ads-schedule-hours" : undefined}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <Label text="Start time" required={!google} note={google ? "(optional)" : undefined} />
              <select
                name="scheduleStart"
                value={scheduleStart}
                required={!google}
                disabled={!google && starts.length === 0}
                onChange={(event) => setWantedStart(event.target.value)}
                className={INPUT}
              >
                {startChoices.map(hourOption)}
              </select>
            </label>
            <label className="block">
              <Label text="End time" required={!google} note={google ? "(optional)" : undefined} />
              <select
                name="scheduleEnd"
                value={scheduleEnd}
                required={!google}
                disabled={!google && ends.length === 0}
                onChange={(event) => setWantedEnd(event.target.value)}
                className={INPUT}
              >
                {endChoices.map(hourOption)}
              </select>
            </label>
          </div>
          {google && (
            <p className="mt-1 text-xs text-ink-soft">Leave both on Any time to run your ads all day.</p>
          )}
          {!google && starts.length === 0 && (
            <p role="status" className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-sm text-ink">
              There are no delivery hours left today. Choose a later start date, or turn off custom timing.
            </p>
          )}
        </div>
      )}

      {google && (
        <>
          <NoHoursNote
            kind="local"
            title="Ad scheduling isn't available for local store and visit campaigns"
            body="Local store and visit campaigns run as Performance Max / Local campaigns, which Google Ads runs continuously — a custom ad schedule can't be added. Your ads will run all day."
          />
          <NoHoursNote
            kind="app"
            title="Ad scheduling isn't available for app campaigns"
            body="App campaigns are optimized and delivered automatically by Google Ads, so a custom ad schedule can't be added. Your ads will run all day."
          />
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {budgetAmount}
        <label className="block">
          <Label text="Budget type" required />
          <select
            name="budgetType"
            value={budget}
            required
            autoComplete="off"
            onChange={(event) => setBudgetType(event.target.value)}
            aria-describedby={lifetimeLock ? budgetNoteId : undefined}
            className={INPUT}
          >
            <option value="" disabled>
              Select type
            </option>
            {budgetTypes.map((type) => (
              <option key={type} value={type} disabled={lifetimeLock && type === "daily"}>
                {BUDGET_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {lifetimeLock && (
        <p id={budgetNoteId} className="rounded-md bg-info-soft px-3 py-2 text-sm text-ink">
          Meta requires a lifetime budget for scheduled ad delivery. Daily budgets are not supported with custom
          timing schedules.
        </p>
      )}
    </>
  );
}

/** The same island under a platform-neutral name, for the Google form. */
