import { describe, expect, it } from "vitest";
import { parseCountryNames } from "@/lib/data/countries";

const LIVE_SHAPE = {
  error: false,
  msg: "countries and ISO codes retrieved",
  data: [
    { name: "Zimbabwe", Iso2: "ZW", Iso3: "ZWE" },
    { name: "Afghanistan", Iso2: "AF", Iso3: "AFG" },
    { name: "Åland Islands", Iso2: "AX", Iso3: "ALA" },
  ],
};

describe("parseCountryNames", () => {
  it("reads the live response shape", () => {
    expect(parseCountryNames(LIVE_SHAPE)).toEqual([
      "Afghanistan",
      "Åland Islands",
      "Zimbabwe",
    ]);
  });

  /**
   * The API returns them almost, but not quite, alphabetically. Sorting on the
   * server means the client component is handed a settled order and renders
   * the same list on both sides of hydration.
   */
  it("sorts by name, with accents where a reader expects them", () => {
    const names = parseCountryNames(LIVE_SHAPE);
    expect(names.indexOf("Åland Islands")).toBe(1);
  });

  it("drops rows with no usable name rather than rendering blank options", () => {
    expect(
      parseCountryNames({ data: [{ Iso2: "XX" }, { name: "  " }, { name: 42 }, { name: "Peru" }] }),
    ).toEqual(["Peru"]);
  });

  it("de-duplicates", () => {
    expect(parseCountryNames({ data: [{ name: "Peru" }, { name: "Peru" }] })).toEqual(["Peru"]);
  });

  // Every failure path returns [] so the control can fall back to a text box.
  it.each([
    ["an error envelope", { error: true, data: null }],
    ["a bare array", [{ name: "Peru" }]],
    ["a string", "down for maintenance"],
    ["null", null],
  ])("returns nothing for %s", (_label, payload) => {
    expect(parseCountryNames(payload)).toEqual([]);
  });
});
