"use client";

/**
 * "Which conversions should this campaign report against?"
 *
 * The conversions this account already has, offered for **every goal**. They
 * arrive at connect time — `save_key` returns them, read on the same trip
 * while the key was in hand — and until 2026-09-21 nothing rendered them and
 * `conversion_event_setting_ids` was never sent, so a leads campaign ran as a
 * clicks campaign and only said so in a reply nobody read.
 *
 * ## Two things this deliberately does NOT do
 *
 * - **It does not create a conversion.** A "name a new one" field and a
 *   `setup_tracking` call were built here and removed the same day: the
 *   customer picks from what exists, and creating one is a different job on a
 *   different screen.
 * - **It does not gate on the objective.** It was briefly shown only for
 *   leads/sales/app, on the reasoning that awareness and traffic have nothing
 *   to optimise for. Reporting and optimising are different things — a traffic
 *   campaign still wants to know whether the visit it bought turned into
 *   anything — so every goal sees the list.
 *
 * ## Why it is a client island at all
 *
 * It is not, really — it holds no state and reads no other field. It stays a
 * `"use client"` file only because it renders inside a form whose other
 * controls are islands; a plain checkbox list would serve equally. If it ever
 * needs to become a Server Component, nothing here prevents it.
 *
 * ## The gate is `events[]`, never `usable`
 *
 * Tracking reports itself unusable until a pixel is both installed AND firing.
 * Eight real, selectable events sit behind that false, so gating the list on it
 * shows "no conversions set up" to an account that has eight.
 *
 * ## `null` is not an empty list, and the difference is the whole state
 *
 * An account with NO conversions and an account whose conversions we could not
 * READ are different facts, and saying "this account has none" about the second
 * is simply false. It happened: `conversion_events` timed out at 8s against an
 * account with eight of them, the caller collapsed the failure into `[]`, and
 * the screen reported none. So `events` is `ConversionEvent[] | null`, and null
 * gets its own message — one that says we could not check and offers a reload,
 * rather than a claim about the account.
 */

import type { ConversionEvent } from "@/lib/data/ads-types";

/** A name worth showing, falling back to the id rather than an empty row. */
function labelFor(event: ConversionEvent): string {
  const name = event.name?.trim();
  if (name) return name;
  const type = event.event_type?.trim();
  if (type) return type;
  return event.id ?? "Unnamed conversion";
}

export function ConversionEventsPicker({ events }: { events: ConversionEvent[] | null }) {
  const usable = (events ?? []).filter((event) => (event.id ?? "").trim() !== "");

  return (
    <div className="mb-5">
      <span className="mb-1.5 block text-sm text-ink">
        Which conversions should this campaign report against?{" "}
        <span className="text-ink-soft">(optional)</span>
      </span>

      {events === null ? (
        // Never "this account has none" — we do not know that. The campaign is
        // still submittable, because a list we could not read is not a reason
        // to stop someone advertising.
        <p className="rounded-md border border-warn/30 bg-warn-soft px-3 py-2.5 text-sm text-ink">
          We could not check which conversions this account has. Reload to try again — the campaign
          can still be set up without them.
        </p>
      ) : usable.length === 0 ? (
        <p className="rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm text-ink-soft">
          This account has no conversions set up yet. The campaign will still run — it optimises for
          clicks instead.
        </p>
      ) : (
        <fieldset className="border-0 p-0">
          <legend className="sr-only">Conversions to report against</legend>
          <div className="space-y-2 rounded-md border border-border bg-surface-raised p-3">
            {usable.map((event) => (
              <label key={event.id} className="flex min-h-11 items-center gap-2.5 text-sm text-ink">
                <input
                  type="checkbox"
                  name="conversionEventIds"
                  value={event.id}
                  // Checkboxes, not radios: a campaign can report against more
                  // than one conversion, and forcing a single choice would mean
                  // two campaigns for one intention.
                  suppressHydrationWarning
                  className="size-4"
                />
                <span>{labelFor(event)}</span>
                {event.event_type && event.name && (
                  <span className="text-xs text-ink-soft">{event.event_type}</span>
                )}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-soft">
            Leave them all unticked and the campaign optimises for clicks instead.
          </p>
        </fieldset>
      )}
    </div>
  );
}
