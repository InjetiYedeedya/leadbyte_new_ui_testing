"use client";

/**
 * "Where should the ads run?" — for as many places as the customer names.
 *
 * The live `metaads` body targets several at once
 * (`Kanchipuram, Alagāpuram > Tamil Nadu > India | Anantapur > …`), and a
 * single city box could only ever describe one of them. Each row here is one
 * place, narrowed country → state → city; `campaign-locations.ts` turns the
 * rows into the four strings the workflow reads.
 *
 * ## Why this is a client island
 *
 * Two reasons, either of which would be enough. The lists depend on a choice
 * made a moment ago, which no server render can anticipate; and rows are added
 * and removed, which is state. It still never talks to a third party itself —
 * it asks `/api/locations`, and that handler owns the upstream services.
 * Countries are the exception: that list never changes, so it arrives as a
 * prop already fetched on the server.
 *
 ## How precise each place is, is the customer's answer
 *
 * Every row opens with the segmented chooser the campaign-details form's old
 * `LocationTarget` used (replaced by `location-picker.tsx`, 2026-10-01) —
 * Country / State / City / Zip code — and shows only
 * the levels down to the one chosen. That is the whole point: one campaign
 * targets a country, the next a single postcode, and a form that always shows
 * four boxes both asks for answers nobody has and quietly narrows a campaign
 * further than it was meant to go. It was three always-visible boxes before,
 * so a state-level campaign still had an empty City sitting under it, and the
 * postcode row was worse — anything typed there REPLACED the state and city in
 * the request, whether or not that was the intent.
 *
 * ## Two more decisions worth keeping
 *
 * - **The postcode level is opt-in.** None of the four labels the n8n payload
 *   carries has anywhere to put a postcode, so offering one there would
 *   collect an answer we then drop. The OpenAI Ads request DOES have a
 *   `postal_code` slot, so that form passes `withPostcode`.
 * - **The last row cannot be removed.** A campaign has to run somewhere, and a
 *   form that can reach zero locations hands the customer a validation error
 *   they had no reason to expect.
 *
 * Each row owns its own cascade state, keyed by a stable id, so adding a
 * second place cannot disturb the first — and the input NAMES come from the
 * row's position, so removing one closes the gap it leaves.
 */

import { useId, useState } from "react";
import {
  KEY,
  LEVELS,
  LevelField,
  useLocationCascade,
  type Level,
} from "@/components/agents/location-target";
import { LOCATION_INPUT_PREFIX } from "@/lib/data/campaign-locations";

/** The depths on offer. The postcode only where a payload can carry one. */
const OFFERED: Level[] = LEVELS.slice(0, 3) as Level[];
const OFFERED_WITH_ZIP: Level[] = LEVELS.slice(0, 4) as Level[];

/** What each depth is called on the chooser — the VALUE stays the agent's. */
const CHOICE: Record<Level, string> = {
  Country: "Country",
  State: "State",
  City: "City",
  "Zip Code": "Zip code",
};

function LocationRow({
  position,
  countries,
  withPostcode,
  onRemove,
}: {
  position: number;
  countries: string[];
  /** Whether this form's request has a `postal_code` slot to put it in. */
  withPostcode?: boolean;
  /** Absent for the only row: there is nothing to remove it to. */
  onRemove?: () => void;
}) {
  const { value, setValue, list, loading } = useLocationCascade(countries);
  const titleId = useId();
  const offered = withPostcode ? OFFERED_WITH_ZIP : OFFERED;
  // Country, not the deepest: the least assumption about a campaign nobody has
  // described yet, and every other depth is one click away.
  const [depth, setDepth] = useState<Level>("Country");
  const levels = offered.slice(0, offered.indexOf(depth) + 1);

  return (
    <fieldset
      className="border-0 p-0"
      // A group per place, so a screen reader announces "Location 2" before
      // reading another country field rather than three unexplained repeats.
      aria-labelledby={titleId}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <legend id={titleId} className="p-0 text-sm text-ink">
          Location {position + 1}
        </legend>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="min-h-11 rounded-md px-2 text-xs text-ink-soft underline hover:text-ink"
          >
            Remove
          </button>
        )}
      </div>

      {/* A fieldset with a legend, so a screen reader reads the question before
          the options rather than three or four bare words. */}
      <fieldset className="mb-3 border-0 p-0">
        <legend className="mb-1.5 block p-0 text-xs text-ink-soft">
          How precisely should this place be targeted?
        </legend>
        {/* `flex-wrap` rather than a scroller: four short words fit two rows on
            a 375px screen, and a row that scrolls hides options nobody finds. */}
        <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-surface-raised p-1">
        {offered.map((level) => {
          const selected = level === depth;
          return (
            <label
              key={level}
              className={`inline-flex min-h-11 cursor-pointer items-center rounded-md px-4 text-sm transition-colors duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                selected
                  ? "bg-accent font-medium text-surface"
                  : "text-ink-soft hover:bg-surface hover:text-ink"
              }`}
            >
              {/* Not posted — the DEPTH is carried by which fields have values,
                  and a second spelling of it could disagree with them. The
                  radio is real so arrow keys move between the options. */}
              <input
                type="radio"
                name={`${LOCATION_INPUT_PREFIX}${position}_level`}
                value={level}
                checked={selected}
                onChange={() => setDepth(level)}
                suppressHydrationWarning
                className="sr-only"
              />
              {CHOICE[level]}
            </label>
          );
        })}
        </div>
      </fieldset>

      <div className={`grid gap-3 ${levels.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {levels.map((level, index) => (
          <LevelField
            key={level}
            level={level}
            name={`${LOCATION_INPUT_PREFIX}${position}_${KEY[level]}`}
            value={value[level]}
            options={list[level]}
            loading={loading === level}
            // The first unanswered level above this one is what it waits for.
            waitingOn={levels.slice(0, index).find((l) => value[l] === "") ?? null}
            // Every level shown is one the customer asked for, so every one is
            // required — a half-filled City row targets its state instead,
            // silently and more broadly than intended.
            required
            onChange={setValue[level]}
          />
        ))}
      </div>

      {/* Said here rather than in a tooltip, because it changes what the state
          and city above DO: they find the postcode list, and then the request
          carries the postcode instead of them. */}
      {depth === "Zip Code" && (
        <p className="mt-2 text-xs text-ink-soft">
          The state and city narrow the postcode list. Only the postcode is targeted.
        </p>
      )}
    </fieldset>
  );
}

export function LocationTargets({
  countries,
  withPostcode,
}: {
  countries: string[];
  /** Opt-in: only a request with a `postal_code` field should ask for one. */
  withPostcode?: boolean;
}) {
  // Ids, not indices: a row's cascade state has to follow the row when one
  // above it is removed. The NAMES still come from position.
  const [ids, setIds] = useState<number[]>([0]);
  const [nextId, setNextId] = useState(1);

  return (
    <div className="mb-5">
      <span className="mb-1.5 block text-sm text-ink">Where should the ads run?</span>
      <p className="mb-2 text-xs text-ink-soft">
        Target as broadly or as narrowly as the campaign needs — a whole country, or one postcode.
      </p>

      <div className="space-y-4 rounded-lg border border-border bg-surface-raised p-4">
        {ids.map((id, position) => (
          <LocationRow
            key={id}
            position={position}
            countries={countries}
            withPostcode={withPostcode}
            onRemove={
              ids.length > 1 ? () => setIds((current) => current.filter((it) => it !== id)) : undefined
            }
          />
        ))}

        <button
          type="button"
          onClick={() => {
            setIds((current) => [...current, nextId]);
            setNextId((current) => current + 1);
          }}
          className="min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-ink hover:bg-surface-raised"
        >
          + Add another location
        </button>
      </div>
    </div>
  );
}
