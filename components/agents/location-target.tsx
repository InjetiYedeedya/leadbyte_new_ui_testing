"use client";

/**
 * The location cascade's shared pieces: the four levels, one level's field
 * (a dropdown when there is a list, a text box when there is not), the
 * country → state → city → postcode cascade hook, and the `/api/locations`
 * reader.
 *
 * The details form's single-place `LocationTarget` used to live here too. It
 * was replaced on 2026-10-01 by `location-picker.tsx`, which holds any number
 * of places at any mix of levels; what remains is used by the OpenAI setup
 * form's rows (`location-targets.tsx`) and by the picker (`loadOptions`,
 * `SETTLE_MS`).
 *
 * ## Every level degrades to a text box
 *
 * An empty list means "type it": the upstream service is down, or has no data
 * for this place. Zippopotam covers about sixty countries, so for most of the
 * world the postcode step is a text box by design, not by failure. A campaign
 * must stay submittable either way.
 *
 * ## Accessibility notes
 *
 * Each level announces loading through `aria-busy`, and a level waiting on the
 * one above says what it is waiting for instead of sitting there empty and
 * disabled with no explanation.
 */

import { useEffect, useId, useState } from "react";

/** The four levels, deepest last. The agent's own option labels are the keys. */
export const LEVELS = ["Country", "State", "City", "Zip Code"] as const;
export type Level = (typeof LEVELS)[number];

const FIELD =
  "w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-ink disabled:bg-surface-raised disabled:text-ink-soft";

export const COPY: Record<Level, { label: string; placeholder: string; autoComplete: string }> = {
  Country: { label: "Country", placeholder: "United States", autoComplete: "country-name" },
  State: { label: "State or region", placeholder: "New Jersey", autoComplete: "address-level1" },
  City: { label: "City", placeholder: "Newark", autoComplete: "address-level2" },
  "Zip Code": { label: "Postal or zip code", placeholder: "07102", autoComplete: "postal-code" },
};

/** The payload key each level posts under. */
export const KEY: Record<Level, string> = {
  Country: "country",
  State: "state",
  City: "city",
  "Zip Code": "zip",
};

/**
 * How long to wait before asking for the next level's list.
 *
 * A level that fell back to a text box changes on every keystroke, and each
 * change is a reason to reload the level below it. Without this, typing
 * "Newark" fired six postcode lookups and only the last one mattered — the
 * dev log for a single session showed `city=s`, `city=sa`, `city=sac`. Long
 * enough to swallow typing, short enough that picking from a dropdown still
 * feels immediate.
 */
export const SETTLE_MS = 400;

export async function loadOptions(query: Record<string, string>): Promise<string[]> {
  try {
    const response = await fetch(`/api/locations?${new URLSearchParams(query)}`);
    if (!response.ok) return [];
    const body = (await response.json()) as { options?: unknown };
    return Array.isArray(body.options) ? (body.options as string[]) : [];
  } catch {
    // A dropped connection is one more reason to show a text box, not an error.
    return [];
  }
}

function Required() {
  return (
    <span className="text-crit" aria-hidden="true">
      {" *"}
    </span>
  );
}

/** One level: a dropdown when we have a list, a text box when we do not. */
export function LevelField({
  level,
  name,
  value,
  options,
  loading,
  waitingOn,
  required,
  onChange,
}: {
  level: Level;
  name: string;
  value: string;
  options: string[];
  loading: boolean;
  /** The level above that has not been answered yet, if any. */
  waitingOn: Level | null;
  required: boolean;
  onChange: (value: string) => void;
}) {
  const hintId = useId();
  const copy = COPY[level];
  const blocked = waitingOn !== null;
  const asList = !blocked && !loading && options.length > 0;

  const hint = blocked
    ? `Choose a ${COPY[waitingOn].label.toLowerCase()} first.`
    : loading
      ? "Loading…"
      : asList
        ? ""
        : `No list for this ${level === "Zip Code" ? "city" : "place"} — type it in.`;

  return (
    <label className="block">
      <span className="mb-1 block text-sm text-ink">
        {copy.label}
        {required && <Required />}
      </span>

      {asList ? (
        <select
          name={name}
          value={value}
          required={required}
          autoComplete={copy.autoComplete}
          onChange={(event) => onChange(event.target.value)}
          suppressHydrationWarning
          className={FIELD}
        >
          {/* Blank first, unlike the agent's own dropdowns: those carry a
              default it chose on purpose, this must not quietly pick the first
              country for someone who skipped the field. */}
          <option value="">Select {copy.label.toLowerCase()}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          name={name}
          value={value}
          required={required}
          disabled={blocked}
          placeholder={blocked ? "" : copy.placeholder}
          autoComplete={copy.autoComplete}
          inputMode={level === "Zip Code" ? "numeric" : undefined}
          aria-busy={loading}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => onChange(event.target.value)}
          suppressHydrationWarning
          className={FIELD}
        />
      )}

      {/* Persistent, not a placeholder — why a level is empty is exactly the
          thing people need to still read once they start typing. */}
      {hint && (
        <span id={hintId} className="mt-1 block text-xs text-ink-soft" aria-live="polite">
          {hint}
        </span>
      )}
    </label>
  );
}

/**
 * The cascade itself: four answers, and the list each one chooses from.
 *
 * Extracted so the single control on the campaign-details form and the
 * repeatable one on the setup form share it — the narrowing rules, the settle
 * delay and the empty-list fallback are one question asked in two places, and
 * a second copy would drift.
 */
export function useLocationCascade(countries: string[]) {
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");

  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [zips, setZips] = useState<string[]>([]);
  const [loading, setLoading] = useState<Level | null>(null);

  // Each effect clears what sits below it. Keeping "New Jersey" after the
  // country changes to France would post a place that does not exist.
  useEffect(() => {
    setState("");
    setCity("");
    setZip("");
    setCities([]);
    setZips([]);
    if (!country) {
      setStates([]);
      return;
    }
    let live = true;
    setLoading("State");
    const timer = setTimeout(() => {
      loadOptions({ kind: "states", country }).then((next) => {
        if (!live) return;
        setStates(next);
        setLoading(null);
      });
    }, SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [country]);

  useEffect(() => {
    setCity("");
    setZip("");
    setZips([]);
    if (!country || !state) {
      setCities([]);
      return;
    }
    let live = true;
    setLoading("City");
    const timer = setTimeout(() => {
      loadOptions({ kind: "cities", country, state }).then((next) => {
        if (!live) return;
        setCities(next);
        setLoading(null);
      });
    }, SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [country, state]);

  useEffect(() => {
    setZip("");
    if (!country || !state || !city) {
      setZips([]);
      return;
    }
    let live = true;
    setLoading("Zip Code");
    const timer = setTimeout(() => {
      loadOptions({ kind: "zips", country, state, city }).then((next) => {
        if (!live) return;
        setZips(next);
        setLoading(null);
      });
    }, SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [country, state, city]);

  const value: Record<Level, string> = {
    Country: country,
    State: state,
    City: city,
    "Zip Code": zip,
  };
  const setValue: Record<Level, (next: string) => void> = {
    Country: setCountry,
    State: setState,
    City: setCity,
    "Zip Code": setZip,
  };
  const list: Record<Level, string[]> = {
    Country: countries,
    State: states,
    City: cities,
    "Zip Code": zips,
  };

  return { value, setValue, list, loading };
}
