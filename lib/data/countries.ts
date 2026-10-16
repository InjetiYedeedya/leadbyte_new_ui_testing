import { cache } from "react";

/**
 * The list of country names for the campaign location field.
 *
 * Source: `GET https://countriesnow.space/api/v0.1/countries/iso` — free, no
 * key, 222 countries with ISO codes. It was picked after the obvious
 * candidate stopped being usable: restcountries.com deprecated v3.1 and its
 * v5 replacement now answers `401 authKeyMissing`, so it is no longer a
 * drop-in free API (probed 2026-09-04).
 *
 * ## Two rules this module exists to enforce
 *
 * - **Server-side only, and cached for a week.** Country names change about
 *   once a decade; fetching them per render would put a third party in the
 *   path of every campaign form. `revalidate` keeps one copy warm and the
 *   customer never waits on it.
 * - **An outage must not block a launch.** Every failure path returns `[]`,
 *   and the location control falls back to a plain text box when the list is
 *   empty. A country the customer can type is worth more than a dropdown they
 *   cannot reach — the alternative is a campaign that cannot be submitted
 *   because someone else's API is down.
 */

const ISO_URL = "https://countriesnow.space/api/v0.1/countries/iso";

/** A week. The list is effectively static; this is politeness, not freshness. */
const REVALIDATE_SECONDS = 7 * 24 * 60 * 60;

/** Don't let a slow third party hold up the form. */
const TIMEOUT_MS = 6000;

/**
 * Pulls the names out of the response, tolerantly.
 *
 * Exported so the shape handling is testable without a network call — the
 * same reason `sessionArgsFromSignIn` is exported from the login action.
 */
export function parseCountryNames(payload: unknown): string[] {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];

  const names = data
    .map((row) => (row as { name?: unknown })?.name)
    .filter((name): name is string => typeof name === "string" && name.trim() !== "")
    .map((name) => name.trim());

  // The API returns them almost, but not quite, alphabetically. Sorting here
  // means the client component receives a settled order and renders the same
  // list on both sides of hydration.
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, "en"));
}

export const fetchCountryNames = cache(async (): Promise<string[]> => {
  try {
    const response = await fetch(ISO_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) {
      console.error(`[countries] ${response.status} from ${ISO_URL}`);
      return [];
    }
    return parseCountryNames(await response.json());
  } catch (error) {
    console.error("[countries] could not load the country list:", error);
    return [];
  }
});
