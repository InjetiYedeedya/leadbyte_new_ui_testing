/**
 * Where an ad campaign runs, as a LIST of places at mixed levels.
 *
 * One pick is one place at one level: a whole country, a state of a country, a
 * city of a state, or a postcode in a country. A campaign holds any number of
 * them and any mix — "Texas" beside "Los Angeles" beside "10001" — which is
 * what Google, Meta and LinkedIn all accept, and what the old single-place
 * cascade (one country, one state, one city) could not say (2026-10-01).
 *
 * Pure, so every rule here is tested. The picker (`location-picker.tsx`) and
 * every server reader share it, so the browser and the server cannot disagree
 * about what counts as a duplicate or a complete pick.
 */

export const PICK_LEVELS = ["country", "state", "city", "zip"] as const;
export type PickLevel = (typeof PICK_LEVELS)[number];

export interface LocationPick {
  type: PickLevel;
  country: string;
  state?: string;
  city?: string;
  zip?: string;
  /**
   * Typed by hand because no list could load (or a postcode no service could
   * check). Shown on the chip so a misspelling is visible, never refused —
   * someone else's API being down must not block a campaign.
   */
  unchecked?: boolean;
}

/**
 * The most places one campaign may hold. The in-progress campaign lives in
 * chunked cookies (`ads-suggestion.ts`, eight chunks at most), and an
 * oversized plan is dropped — the flow silently restarts. Fifty places is a
 * large local campaign and keeps the plan well inside that budget. The picker
 * says when it is reached rather than ignoring the next tick.
 */
export const MAX_PICKS = 50;

/** How the picks travel in a form: one hidden input. */
export const PICKS_SUFFIX = "_picks";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

/**
 * The identity used to spot a duplicate: level and place, ignoring case and
 * spacing. "california" and "California " are the same pick; California the
 * state and a city called California are not.
 */
export function pickKey(pick: LocationPick): string {
  const part = (value: string | undefined) => clean(value).toLowerCase();
  const zip = part(pick.zip).replace(/\s/g, "");
  switch (pick.type) {
    case "country":
      return `country|${part(pick.country)}`;
    case "state":
      return `state|${part(pick.country)}|${part(pick.state)}`;
    case "city":
      return `city|${part(pick.country)}|${part(pick.state)}|${part(pick.city)}`;
    case "zip":
      return `zip|${part(pick.country)}|${zip}`;
  }
}

/** `list` with each of `picks` added in order, skipping any already there. */
export function addPicks(list: LocationPick[], picks: LocationPick[]): LocationPick[] {
  const seen = new Set(list.map(pickKey));
  const out = [...list];
  for (const pick of picks) {
    const key = pickKey(pick);
    if (seen.has(key) || out.length >= MAX_PICKS) continue;
    seen.add(key);
    out.push(pick);
  }
  return out;
}

export function hasPick(list: LocationPick[], pick: LocationPick): boolean {
  const key = pickKey(pick);
  return list.some((entry) => pickKey(entry) === key);
}

export function removePick(list: LocationPick[], pick: LocationPick): LocationPick[] {
  const key = pickKey(pick);
  return list.filter((entry) => pickKey(entry) !== key);
}

/** Only the fields a pick of this level carries, tidied. */
function normalise(raw: unknown): LocationPick | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const type = PICK_LEVELS.find((level) => level === row.type);
  if (!type) return null;
  const pick: LocationPick = { type, country: clean(row.country) };
  if (type === "state" || type === "city") pick.state = clean(row.state);
  if (type === "city") pick.city = clean(row.city);
  if (type === "zip") {
    pick.zip = clean(row.zip);
    // A checked postcode may carry the place it resolved to, for its label.
    if (clean(row.state)) pick.state = clean(row.state);
    if (clean(row.city)) pick.city = clean(row.city);
  }
  if (row.unchecked === true) pick.unchecked = true;
  return pick;
}

export function encodePicks(picks: LocationPick[]): string {
  return JSON.stringify(picks);
}

/**
 * The picks a form posted. Anything that is not a pick is dropped — the picker
 * never builds one, so that only happens to a hand-made request — and so are
 * duplicates. An incomplete pick is KEPT, so `pickProblems` can say what is
 * missing rather than the place quietly vanishing.
 */
export function decodePicks(raw: unknown): LocationPick[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const picks = parsed.map(normalise).filter((pick): pick is LocationPick => pick !== null);
  return addPicks([], picks);
}

/** The pick's own name: the place it targets, without its parents. */
export function pickName(pick: LocationPick): string {
  switch (pick.type) {
    case "country":
      return pick.country;
    case "state":
      return pick.state ?? "";
    case "city":
      return pick.city ?? "";
    case "zip":
      return pick.zip ?? "";
  }
}

/** The chip's text: "Los Angeles, California" · "90210 · United States". */
export function pickDisplay(pick: LocationPick): string {
  switch (pick.type) {
    case "country":
      return pick.country;
    case "state":
      return `${pick.state}, ${pick.country}`;
    case "city":
      return [pick.city, pick.state].filter(Boolean).join(", ");
    case "zip":
      return `${pick.zip} · ${pick.country}`;
  }
}

/** Narrowest first, the whole address: "Los Angeles, California, United States". */
export function pickAddress(pick: LocationPick): string[] {
  const parts =
    pick.type === "zip"
      ? [pick.zip, pick.country]
      : [pick.city, pick.state, pick.country].slice(
          { country: 2, state: 1, city: 0 }[pick.type],
        );
  return parts.filter((part): part is string => Boolean(part));
}

/**
 * What is wrong with a set of picks, each said once. Empty means ready.
 */
export function pickProblems(picks: LocationPick[]): string[] {
  if (picks.length === 0) return ["Add at least one location."];
  const problems: string[] = [];
  for (const pick of picks) {
    const name = pickName(pick) || "a location";
    if (!pick.country) problems.push(`Choose the country for ${name}.`);
    if ((pick.type === "state" || pick.type === "city") && !pick.state) {
      problems.push(pick.type === "state" ? "Choose a state to add." : `Choose the state for ${name}.`);
    }
    if (pick.type === "city" && !pick.city) problems.push("Choose a city to add.");
    if (pick.type === "zip" && !pick.zip) problems.push("Type a postcode to add.");
  }
  return [...new Set(problems)];
}

function joinUnique(values: (string | undefined)[]): string {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].join(", ");
}

export interface PickSummary {
  /** Every pick narrowest-first with " > ", picks joined with " | ". */
  location: string;
  /** Each level's own places, de-duplicated, joined with ", ". Empty when none. */
  country: string;
  state: string;
  city: string;
  zip: string;
}

/**
 * The strings every hop already carries, built from all the picks.
 *
 * The separators are the legacy app's (`formatLocationsForBackend`: " > "
 * inside a place, " | " between them) and the captured `adsreceiver` body's.
 * Unlike the legacy grouping, a state pick is not absorbed into a city of the
 * same state: "Texas" and "Dallas, Texas" are different targets.
 */
export function summarisePicks(picks: LocationPick[]): PickSummary {
  return {
    location: picks.map((pick) => pickAddress(pick).join(" > ")).join(" | "),
    country: joinUnique(picks.map((pick) => pick.country)),
    state: joinUnique(picks.filter((p) => p.type === "state" || p.type === "city").map((p) => p.state)),
    city: joinUnique(picks.filter((p) => p.type === "city").map((p) => p.city)),
    zip: joinUnique(picks.filter((p) => p.type === "zip").map((p) => p.zip)),
  };
}

/** The agent's option word for each level, as the details form spells it. */
export const LEVEL_OPTION: Record<PickLevel, string> = {
  country: "Country",
  state: "State",
  city: "City",
  zip: "Zip Code",
};

/** The levels a set of picks uses, in level order: "State, City, Zip Code". */
export function levelsUsed(picks: LocationPick[]): string {
  return PICK_LEVELS.filter((level) => picks.some((pick) => pick.type === level))
    .map((level) => LEVEL_OPTION[level])
    .join(", ");
}

/**
 * The levels an agent's own location options offer, in level order. The
 * schema spells them its own way ("Zip Code", "Postcode", "city"), so they are
 * matched loosely; options that name no level at all offer every level rather
 * than none, because a picker with no tabs cannot add a place.
 */
export function levelsFromOptions(options: readonly string[]): PickLevel[] {
  const said = options.map((option) => option.toLowerCase());
  const offered = PICK_LEVELS.filter((level) =>
    said.some((option) =>
      level === "zip" ? /zip|post/.test(option) : option.includes(level),
    ),
  );
  return offered.length > 0 ? offered : [...PICK_LEVELS];
}
