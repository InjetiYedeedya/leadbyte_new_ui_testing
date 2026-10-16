import {
  MAX_PICKS,
  addPicks,
  decodePicks,
  encodePicks,
  hasPick,
  levelsFromOptions,
  levelsUsed,
  pickDisplay,
  pickKey,
  pickProblems,
  removePick,
  summarisePicks,
  type LocationPick,
} from "./location-picks";

const US = "United States";

/** The request's own example (2026-10-01). */
const EXAMPLE: LocationPick[] = [
  { type: "country", country: US },
  { type: "state", country: US, state: "New York" },
  { type: "state", country: US, state: "California" },
  { type: "state", country: US, state: "Texas" },
  { type: "city", country: US, state: "New York", city: "New York City" },
  { type: "city", country: US, state: "California", city: "Los Angeles" },
  { type: "city", country: US, state: "Texas", city: "Dallas" },
  { type: "zip", country: US, zip: "10001" },
  { type: "zip", country: US, zip: "90210" },
  { type: "zip", country: US, zip: "75201" },
];

describe("pickKey and addPicks", () => {
  it("treats case and spacing as the same place", () => {
    const a: LocationPick = { type: "state", country: US, state: "California" };
    const b: LocationPick = { type: "state", country: " united  states", state: "california " };
    expect(pickKey(a)).toBe(pickKey(b));
    expect(addPicks([a], [b])).toEqual([a]);
  });

  it("keeps a state and a same-named city apart", () => {
    const state: LocationPick = { type: "state", country: US, state: "New York" };
    const city: LocationPick = { type: "city", country: US, state: "New York", city: "New York" };
    expect(addPicks([state], [city])).toHaveLength(2);
  });

  it("ignores spaces inside a postcode", () => {
    const one: LocationPick = { type: "zip", country: "United Kingdom", zip: "SW1A 1AA" };
    const two: LocationPick = { type: "zip", country: "United Kingdom", zip: "sw1a1aa" };
    expect(addPicks([one], [two])).toHaveLength(1);
  });

  it("adds in order, mixes every level, and stops at the cap", () => {
    expect(addPicks([], EXAMPLE)).toEqual(EXAMPLE);
    const many = Array.from({ length: MAX_PICKS + 5 }, (_, i): LocationPick => ({ type: "zip", country: US, zip: String(i) }));
    expect(addPicks([], many)).toHaveLength(MAX_PICKS);
  });

  it("finds and removes one pick without touching the rest", () => {
    const texas = EXAMPLE[3]!;
    expect(hasPick(EXAMPLE, { ...texas, state: "TEXAS" })).toBe(true);
    const left = removePick(EXAMPLE, texas);
    expect(left).toHaveLength(EXAMPLE.length - 1);
    expect(hasPick(left, texas)).toBe(false);
  });
});

describe("encodePicks / decodePicks", () => {
  it("round-trips", () => {
    expect(decodePicks(encodePicks(EXAMPLE))).toEqual(EXAMPLE);
  });

  it("drops what is not a pick and duplicates, but keeps incomplete picks for the problem list", () => {
    const raw = JSON.stringify([
      { type: "state", country: US, state: "Texas" },
      { type: "state", country: US, state: "texas" },
      { type: "planet", country: "Mars" },
      "Texas",
      null,
      { type: "city", country: US, state: "", city: "Dallas", extra: "dropped" },
    ]);
    expect(decodePicks(raw)).toEqual([
      { type: "state", country: US, state: "Texas" },
      { type: "city", country: US, state: "", city: "Dallas" },
    ]);
  });

  it("reads nothing from nothing", () => {
    expect(decodePicks("")).toEqual([]);
    expect(decodePicks("not json")).toEqual([]);
    expect(decodePicks('{"type":"country"}')).toEqual([]);
    expect(decodePicks(null)).toEqual([]);
  });

  it("keeps the unchecked mark and a postcode's resolved place", () => {
    const raw = JSON.stringify([
      { type: "zip", country: US, zip: "90210", state: "California", city: "Beverly Hills" },
      { type: "city", country: "Albania", state: "Durrës", city: "Shkozet", unchecked: true },
    ]);
    expect(decodePicks(raw)).toEqual([
      { type: "zip", country: US, zip: "90210", state: "California", city: "Beverly Hills" },
      { type: "city", country: "Albania", state: "Durrës", city: "Shkozet", unchecked: true },
    ]);
  });
});

describe("pickProblems", () => {
  it("asks for at least one location", () => {
    expect(pickProblems([])).toEqual(["Add at least one location."]);
  });

  it("is empty for the request's example", () => {
    expect(pickProblems(EXAMPLE)).toEqual([]);
  });

  it("names what each incomplete pick is missing, once each", () => {
    expect(
      pickProblems([
        { type: "city", country: US, state: "", city: "Los Angeles" },
        { type: "city", country: US, state: "", city: "Los Angeles" },
        { type: "zip", country: "", zip: "10001" },
        { type: "state", country: US, state: "" },
      ]),
    ).toEqual([
      "Choose the state for Los Angeles.",
      "Choose the country for 10001.",
      "Choose a state to add.",
    ]);
  });
});

describe("summarisePicks", () => {
  it("builds every hop's strings from all the picks, not the last one", () => {
    expect(summarisePicks(EXAMPLE)).toEqual({
      location:
        "United States | New York > United States | California > United States | Texas > United States | " +
        "New York City > New York > United States | Los Angeles > California > United States | " +
        "Dallas > Texas > United States | 10001 > United States | 90210 > United States | 75201 > United States",
      country: US,
      state: "New York, California, Texas",
      city: "New York City, Los Angeles, Dallas",
      zip: "10001, 90210, 75201",
    });
  });

  it("leaves a level empty when nothing targets it", () => {
    expect(summarisePicks([{ type: "zip", country: US, zip: "10001" }])).toEqual({
      location: "10001 > United States",
      country: US,
      state: "",
      city: "",
      zip: "10001",
    });
  });
});

describe("pickDisplay and levelsUsed", () => {
  it("labels each chip by its place", () => {
    expect(pickDisplay(EXAMPLE[0]!)).toBe("United States");
    expect(pickDisplay(EXAMPLE[2]!)).toBe("California, United States");
    expect(pickDisplay(EXAMPLE[5]!)).toBe("Los Angeles, California");
    expect(pickDisplay(EXAMPLE[8]!)).toBe("90210 · United States");
  });

  it("names the levels in use in the agent's own spelling", () => {
    expect(levelsUsed(EXAMPLE)).toBe("Country, State, City, Zip Code");
    expect(levelsUsed([EXAMPLE[4]!, EXAMPLE[1]!])).toBe("State, City");
    expect(levelsUsed([])).toBe("");
  });
});

describe("levelsFromOptions", () => {
  it("reads the agent's own spellings, in level order", () => {
    expect(levelsFromOptions(["Zip Code", "Country", "City", "State"])).toEqual(["country", "state", "city", "zip"]);
    expect(levelsFromOptions(["country", "Postcode"])).toEqual(["country", "zip"]);
  });

  it("offers every level when the options name none", () => {
    expect(levelsFromOptions([])).toEqual(["country", "state", "city", "zip"]);
    expect(levelsFromOptions(["Anywhere"])).toEqual(["country", "state", "city", "zip"]);
  });
});
