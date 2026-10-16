import { afterEach, describe, expect, it, vi } from "vitest";
import {
  STRICT_POSTCODE_COUNTRIES,
  fetchCities,
  parsePostcodePlace,
  parseCities,
  parseCountryCode,
  parseStates,
  parseZipCodes,
} from "@/lib/data/locations";

// Trimmed from live responses, 2026-09-04.
const STATES = {
  error: false,
  msg: "states in United States retrieved",
  data: {
    name: "United States",
    iso3: "USA",
    iso2: "US",
    states: [
      { name: "New York", state_code: "NY" },
      { name: "Alabama", state_code: "AL" },
    ],
  },
};

const CITIES = { error: false, data: ["Cochin", "Alappuzha", "Adūr"] };

const ZIPS = {
  "country abbreviation": "US",
  places: [
    { "place name": "Newark", "post code": "07102" },
    { "place name": "Newark", "post code": "07101" },
  ],
};

describe("parseStates", () => {
  it("reads the live shape, name and code together", () => {
    // The code is what zippopotam is addressed by; dropping it would cost the
    // postcode step entirely.
    expect(parseStates(STATES)).toEqual([
      { name: "Alabama", code: "AL" },
      { name: "New York", code: "NY" },
    ]);
  });

  it("keeps a state whose code is missing rather than dropping the state", () => {
    expect(parseStates({ data: { states: [{ name: "Kerala" }] } })).toEqual([
      { name: "Kerala", code: "" },
    ]);
  });

  it.each([
    ["no states key", { data: { iso2: "US" } }],
    ["an error envelope", { error: true, data: null }],
    ["null", null],
  ])("returns nothing for %s", (_label, payload) => {
    expect(parseStates(payload)).toEqual([]);
  });
});

describe("parseCountryCode", () => {
  it("lower-cases it, because zippopotam paths are lower-case", () => {
    expect(parseCountryCode(STATES)).toBe("us");
  });

  it("returns an empty string when it is absent", () => {
    expect(parseCountryCode({ data: { states: [] } })).toBe("");
  });
});

describe("parseCities", () => {
  it("sorts the plain string list", () => {
    expect(parseCities(CITIES)).toEqual(["Adūr", "Alappuzha", "Cochin"]);
  });

  it("drops blanks and non-strings rather than rendering empty options", () => {
    expect(parseCities({ data: ["Cochin", "", 7, null] })).toEqual(["Cochin"]);
  });

  it("returns nothing when there is no list", () => {
    expect(parseCities({ error: true, data: null })).toEqual([]);
  });
});

describe("parseZipCodes", () => {
  /** The key has a space in it. Reading `postCode` silently returns nothing. */
  it('reads the "post code" key, space and all', () => {
    expect(parseZipCodes(ZIPS)).toEqual(["07101", "07102"]);
  });

  it("de-duplicates codes shared by several places", () => {
    expect(
      parseZipCodes({ places: [{ "post code": "07102" }, { "post code": "07102" }] }),
    ).toEqual(["07102"]);
  });

  /**
   * Zippopotam covers roughly sixty countries and answers 404 for the rest.
   * An empty list is the normal case, and the control turns it into a text box.
   */
  it("returns nothing for an uncovered country", () => {
    expect(parseZipCodes({})).toEqual([]);
    expect(parseZipCodes(null)).toEqual([]);
  });
});

describe("fetchCities", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Stub the upstream by URL fragment, and record what was asked for. */
  function stub(byUrl: Record<string, unknown>) {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        const match = Object.entries(byUrl).find(([fragment]) => url.includes(fragment));
        return { ok: true, status: 200, json: async () => match?.[1] ?? null };
      }),
    );
    return calls;
  }

  it("uses the state's own cities when it has any", async () => {
    const calls = stub({ "state/cities": { data: ["Newark", "Camden"] } });
    expect(await fetchCities("United States", "New Jersey")).toEqual(["Camden", "Newark"]);
    // No second request: the state list answered.
    expect(calls).toHaveLength(1);
  });

  /**
   * REGRESSION. countriesnow only breaks its city index down by state for the
   * larger countries. Albania's `Durrës County` is a real state that answers
   * `200 { error: false, data: [] }`, and that empty list turned the City step
   * into a text box for most of the world.
   */
  it("falls back to the country's cities when the state has none", async () => {
    const calls = stub({
      "state/cities": { error: false, data: [] },
      "cities/q": { data: ["Tirana", "Durrës"] },
    });

    expect(await fetchCities("Albania", "Durrës County")).toEqual(["Durrës", "Tirana"]);
    expect(calls[1]).toContain("cities/q?country=Albania");
  });

  it("returns nothing when neither list has anything, so the field takes typing", async () => {
    stub({ cities: { data: [] } });
    expect(await fetchCities("Nowhere", "Nowhere")).toEqual([]);
  });

  it("asks for nothing at all until a state is chosen", async () => {
    const calls = stub({});
    expect(await fetchCities("Albania", "")).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("parsePostcodePlace", () => {
  it("reads the first place a postcode resolves to", () => {
    expect(
      parsePostcodePlace({
        "post code": "90210",
        places: [{ "place name": "Beverly Hills", state: "California", "state abbreviation": "CA" }],
      }),
    ).toEqual({ state: "California", city: "Beverly Hills" });
  });

  it("is null for no place at all", () => {
    expect(parsePostcodePlace(null)).toBeNull();
    expect(parsePostcodePlace({ places: [] })).toBeNull();
  });
});

describe("STRICT_POSTCODE_COUNTRIES", () => {
  it("leaves out the countries zippopotam holds only partial codes for", () => {
    // "SW1A 1AA" and "M5V 3L9" are real and 404 there; refusing them would block campaigns.
    expect(STRICT_POSTCODE_COUNTRIES.has("gb")).toBe(false);
    expect(STRICT_POSTCODE_COUNTRIES.has("ca")).toBe(false);
    expect(STRICT_POSTCODE_COUNTRIES.has("us")).toBe(true);
  });
});
