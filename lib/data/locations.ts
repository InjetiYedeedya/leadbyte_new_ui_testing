/**
 * The cascading location lists: states of a country, cities of a state, and
 * postcodes of a city.
 *
 * ## Sources, and why these ones
 *
 * - **States and cities**: `countriesnow.space` — free, no key, the same
 *   service the country list comes from. Its documented endpoints are POSTs,
 *   but those answer `301` with an empty body; the `/q` GET variants work and
 *   are what this module calls (probed 2026-09-04).
 * - **Postcodes**: `zippopotam.us` — free, no key. It covers roughly sixty
 *   countries: `us`, `gb` and `de` answer, `in` returns `404`. That is not a
 *   fault to handle away, it is the normal case for most of the world, and it
 *   is why an empty postcode list must leave a text box rather than an error.
 *
 * Zippopotam is addressed by ISO codes, not names — `/us/nj/newark`, not
 * `/United States/New Jersey/Newark`. The state list carries both, which is
 * why `fetchStates` returns codes alongside names and `fetchZipCodes` resolves
 * them through it.
 *
 * ## The rule every function here follows
 *
 * A failure returns an empty list, never a throw. Each level of the control
 * falls back to a free-text box when its list is empty, so a campaign stays
 * submittable when a third party is down, rate-limits us, or simply has no
 * data for that country.
 */

const COUNTRIES_NOW = "https://countriesnow.space/api/v0.1/countries";
const ZIPPOPOTAM = "https://api.zippopotam.us";

/** These lists are effectively static; a day is politeness, not freshness. */
const REVALIDATE_SECONDS = 24 * 60 * 60;
const TIMEOUT_MS = 6000;

export interface StateOption {
  name: string;
  /** ISO subdivision code, e.g. "NJ". Empty when the source omits it. */
  code: string;
}

function names(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const found = list
    .filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    .map((entry) => entry.trim());
  return [...new Set(found)].sort((a, b) => a.localeCompare(b, "en"));
}

/** `{ data: { iso2, states: [{ name, state_code }] } }` */
export function parseStates(payload: unknown): StateOption[] {
  const data = (payload as { data?: { states?: unknown } })?.data;
  if (!Array.isArray(data?.states)) return [];

  const seen = new Set<string>();
  const states: StateOption[] = [];
  for (const row of data.states) {
    const name = (row as { name?: unknown })?.name;
    if (typeof name !== "string" || name.trim() === "" || seen.has(name.trim())) continue;
    seen.add(name.trim());
    const code = (row as { state_code?: unknown })?.state_code;
    states.push({ name: name.trim(), code: typeof code === "string" ? code : "" });
  }
  return states.sort((a, b) => a.name.localeCompare(b.name, "en"));
}

/** The two-letter country code that zippopotam is addressed by. */
export function parseCountryCode(payload: unknown): string {
  const iso2 = (payload as { data?: { iso2?: unknown } })?.data?.iso2;
  return typeof iso2 === "string" ? iso2.toLowerCase() : "";
}

/** `{ data: ["Adūr", "Alappuzha", …] }` */
export function parseCities(payload: unknown): string[] {
  return names((payload as { data?: unknown })?.data);
}

/** `{ places: [{ "post code": "07102" }] }` — note the space in the key. */
export function parseZipCodes(payload: unknown): string[] {
  const places = (payload as { places?: unknown })?.places;
  if (!Array.isArray(places)) return [];
  return names(places.map((place) => (place as Record<string, unknown>)?.["post code"]));
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: { revalidate: REVALIDATE_SECONDS },
  });
  // 404 is the ordinary "no data for this place" answer from zippopotam, not a
  // fault worth logging on every uncovered country.
  if (!response.ok) {
    if (response.status !== 404) console.error(`[locations] ${response.status} from ${url}`);
    return null;
  }
  return response.json();
}

async function statesPayload(country: string): Promise<unknown> {
  return getJson(`${COUNTRIES_NOW}/states/q?country=${encodeURIComponent(country)}`);
}

export async function fetchStates(country: string): Promise<StateOption[]> {
  if (!country) return [];
  try {
    return parseStates(await statesPayload(country));
  } catch (error) {
    console.error(`[locations] states for ${country}:`, error);
    return [];
  }
}

/**
 * Cities of a state, falling back to cities of the whole country.
 *
 * countriesnow only breaks its city index down by state for the larger
 * countries. Albania's `Durrës County` is a real state — the request answers
 * `200 { error: false }` — with an empty city list, and the same is true of
 * most of the world. That silently turned the City step into a text box for
 * anyone outside the US, Canada, India and a handful of others, which is what
 * sent this back for a second look.
 *
 * The country-wide list does have those cities, just not filed under a state.
 * Offering it unfiltered is better than offering nothing: the customer already
 * knows which of their own cities they meant, and typing it blind risks a
 * spelling the ad platform will not match.
 */
export async function fetchCities(country: string, state: string): Promise<string[]> {
  if (!country || !state) return [];
  try {
    const byState = parseCities(
      await getJson(
        `${COUNTRIES_NOW}/state/cities/q?country=${encodeURIComponent(
          country,
        )}&state=${encodeURIComponent(state)}`,
      ),
    );
    if (byState.length > 0) return byState;

    return parseCities(await getJson(`${COUNTRIES_NOW}/cities/q?country=${encodeURIComponent(country)}`));
  } catch (error) {
    console.error(`[locations] cities for ${country}/${state}:`, error);
    return [];
  }
}

export async function fetchZipCodes(
  country: string,
  state: string,
  city: string,
): Promise<string[]> {
  if (!country || !state || !city) return [];
  try {
    // Zippopotam wants codes; the state list is where both codes live, and it
    // is already cached from the step before this one.
    const payload = await statesPayload(country);
    const countryCode = parseCountryCode(payload);
    const stateCode = parseStates(payload).find((s) => s.name === state)?.code;
    if (!countryCode || !stateCode) return [];

    return parseZipCodes(
      await getJson(
        `${ZIPPOPOTAM}/${countryCode}/${stateCode.toLowerCase()}/${encodeURIComponent(
          city.toLowerCase(),
        )}`,
      ),
    );
  } catch (error) {
    console.error(`[locations] postcodes for ${city}:`, error);
    return [];
  }
}

/**
 * Is this a real postcode in this country — and where is it?
 *
 * Zippopotam answers `/{cc}/{code}` with the place, or `404`. A 404 is only a
 * verdict where zippopotam holds FULL codes: it keeps just the outward half in
 * Great Britain ("SW1A") and the first three characters in Canada ("M5V"), so a
 * perfectly real "SW1A 1AA" 404s there, and roughly two hundred countries are
 * not covered at all. Refusing on those would block real campaigns, so outside
 * `STRICT_POSTCODE_COUNTRIES` a miss is "unknown" — added, and marked as not
 * checked — never "invalid".
 */
export type PostcodeCheck =
  | { status: "valid"; state: string; city: string }
  | { status: "invalid" }
  | { status: "unknown" };

/** Countries where zippopotam holds complete postcodes, so a miss means "no such code". */
export const STRICT_POSTCODE_COUNTRIES = new Set(["us", "de", "fr", "es", "it", "au", "at", "ch", "be", "dk", "no", "fi", "mx"]);

/** `{ places: [{ "place name": "Beverly Hills", state: "California" }] }` */
export function parsePostcodePlace(payload: unknown): { state: string; city: string } | null {
  const places = (payload as { places?: unknown })?.places;
  if (!Array.isArray(places) || places.length === 0) return null;
  const first = places[0] as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  return { state: text(first?.state), city: text(first?.["place name"]) };
}

export async function checkPostcode(country: string, code: string): Promise<PostcodeCheck> {
  const trimmed = code.trim();
  if (!country || !trimmed) return { status: "unknown" };
  try {
    const countryCode = parseCountryCode(await statesPayload(country));
    if (!countryCode) return { status: "unknown" };
    // US ZIP+4 is a real format; the lookup knows only the five digits.
    const lookup = countryCode === "us" ? trimmed.replace(/-\d{4}$/, "") : trimmed;
    const place = parsePostcodePlace(
      await getJson(`${ZIPPOPOTAM}/${countryCode}/${encodeURIComponent(lookup)}`),
    );
    if (place) return { status: "valid", ...place };
    return STRICT_POSTCODE_COUNTRIES.has(countryCode) ? { status: "invalid" } : { status: "unknown" };
  } catch (error) {
    console.error(`[locations] postcode check ${code}:`, error);
    return { status: "unknown" };
  }
}
