import {
  ADS_GOALS,
  ADS_PLATFORMS,
  DESCRIPTION_MIN,
  absoluteDestination,
  readAdsSetupForm,
  validateAdsSetup,
  type ChatGptAdsSetup,
} from "./chatgpt-ads-setup";

/**
 * Reading the setup form, and refusing a campaign that cannot run.
 *
 * The vocabulary tests look trivial and are not: these ids are sent verbatim as
 * the service's `goal`, `budget_type` and `platforms` values, so a relabelling
 * that looks cosmetic is a 400.
 */

function form(values: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) {
    for (const entry of Array.isArray(value) ? value : [value]) data.append(name, entry);
  }
  return data;
}

const FILLED = {
  goal: "traffic",
  budgetType: "lifetime",
  budgetAmount: "500",
  locationPicks: JSON.stringify([{ type: "country", country: "United States" }]),
  platforms: ["web", "ios_app"],
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  brandName: "ZippyGo",
  businessDescription:
    "ZippyGo compares fares across every airline for leisure travellers booking city breaks.",
  destinationUrl: "https://zippygo.ai/flights",
  bidStrategy: "maximize_results",
};

const valid = (over: Partial<ChatGptAdsSetup> = {}): ChatGptAdsSetup => ({
  ...readAdsSetupForm(form(FILLED)),
  ...over,
});

describe("the vocabulary the service is sent", () => {
  it("offers the three surfaces the service knows, and no others", () => {
    // Briefly five, split out of a screenshot of the picker. The service takes
    // one `web` covering every browser plus the two app surfaces, and an id it
    // does not know is a silently narrower audience rather than an error.
    expect(ADS_PLATFORMS.map((p) => p.id)).toEqual(["web", "android_app", "ios_app"]);
  });

  it("offers exactly the five goals the service accepts", () => {
    expect([...ADS_GOALS.map((g) => g.id)].sort()).toEqual(
      ["app", "awareness", "leads", "sales", "traffic"].sort(),
    );
  });
});

describe("absoluteDestination", () => {
  /**
   * The profile stores a bare host — Stage 01 accepts one — and a scheme-less
   * value is a RELATIVE path. Sent as typed it earns a 422 that reads as though
   * the URL were malformed rather than merely missing its scheme.
   */
  it("gives a bare host a scheme", () => {
    expect(absoluteDestination("novaflow.io")).toBe("https://novaflow.io");
  });

  it("leaves a real link alone, including an insecure one", () => {
    expect(absoluteDestination("https://zippygo.ai/flights")).toBe("https://zippygo.ai/flights");
    expect(absoluteDestination("http://legacy.example")).toBe("http://legacy.example");
  });

  it("stays empty when there is nothing to fix", () => {
    expect(absoluteDestination("   ")).toBe("");
  });
});

describe("readAdsSetupForm", () => {
  it("reads every field the form offers", () => {
    expect(readAdsSetupForm(form(FILLED))).toEqual({
      goal: "traffic",
      budgetType: "lifetime",
      budgetAmount: 500,
      locationPicks: [{ type: "country", country: "United States" }],
      locations: [{ country: "United States", state: "", city: "", zip: "" }],
      excludeLocations: [],
      platforms: ["web", "ios_app"],
      conversionEventIds: [],
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      brandName: "ZippyGo",
      businessDescription: FILLED.businessDescription,
      destinationUrl: "https://zippygo.ai/flights",
      bidStrategy: "maximize_results",
      bidAmount: 0,
    });
  });

  it("falls back rather than passing on a value the service has no branch for", () => {
    const setup = readAdsSetupForm(form({ ...FILLED, goal: "world-domination", budgetType: "hourly" }));
    expect(setup.goal).toBe("leads");
    expect(setup.budgetType).toBe("");
  });

  it("leaves the budget type unchosen when the form sent none, and says so", () => {
    const setup = readAdsSetupForm(form({ ...FILLED, budgetType: "" }));
    expect(setup.budgetType).toBe("");
    expect(validateAdsSetup(setup)).toContain("Choose a budget type.");
  });

  it("reads every picked place, at its own level", () => {
    const setup = readAdsSetupForm(
      form({
        ...FILLED,
        locationPicks: JSON.stringify([
          { type: "country", country: "Canada" },
          { type: "state", country: "United States", state: "Texas" },
          { type: "city", country: "United States", state: "Ohio", city: "Columbus" },
          { type: "zip", country: "United States", zip: "10001" },
        ]),
      }),
    );
    expect(setup.locations).toEqual([
      { country: "Canada", state: "", city: "", zip: "" },
      { country: "United States", state: "Texas", city: "", zip: "" },
      { country: "United States", state: "Ohio", city: "Columbus", zip: "" },
      { country: "United States", state: "", city: "", zip: "10001" },
    ]);
  });

  it("keeps only the platforms the form actually offered", () => {
    const setup = readAdsSetupForm(form({ ...FILLED, platforms: ["web", "smart-fridge"] }));
    expect(setup.platforms).toEqual(["web"]);
  });

  it("reads several exclusions and drops the blanks", () => {
    const setup = readAdsSetupForm(
      form({ ...FILLED, excludeLocations: ["Canada", "", "  ", "Mexico"] }),
    );
    expect(setup.excludeLocations).toEqual(["Canada", "Mexico"]);
  });

  /** An untouched optional number is "not set", which the payload sends as null. */
  it("treats an empty bid as zero", () => {
    expect(readAdsSetupForm(form({ ...FILLED, bidAmount: "" })).bidAmount).toBe(0);
    expect(readAdsSetupForm(form({ ...FILLED, bidAmount: "2.50" })).bidAmount).toBe(2.5);
  });

  it("makes the destination absolute on the way in", () => {
    expect(readAdsSetupForm(form({ ...FILLED, destinationUrl: "novaflow.io" })).destinationUrl).toBe(
      "https://novaflow.io",
    );
  });
});

describe("validateAdsSetup", () => {
  it("passes a campaign that can run", () => {
    expect(validateAdsSetup(valid())).toEqual([]);
  });

  /**
   * The service's own floor, checked here too so the message lands beside the
   * box while someone is still typing rather than after a round trip.
   */
  it("refuses a description too short to write copy from", () => {
    const short = validateAdsSetup(valid({ businessDescription: "flights, cheap, travel" }));
    expect(short[0]).toContain(String(DESCRIPTION_MIN));
    expect(validateAdsSetup(valid({ businessDescription: "x".repeat(DESCRIPTION_MIN) }))).toEqual(
      [],
    );
  });

  it("insists on the fields the service requires and the old form never asked for", () => {
    expect(validateAdsSetup(valid({ brandName: "" }))).toHaveLength(1);
    expect(validateAdsSetup(valid({ destinationUrl: "" }))).toHaveLength(1);
  });

  it("refuses a budget of nothing", () => {
    expect(validateAdsSetup(valid({ budgetAmount: 0 }))[0]).toContain("more than zero");
  });

  it("enforces the account currency's floor when one is given", () => {
    // USD: $25 daily, $100 lifetime.
    expect(validateAdsSetup(valid({ budgetType: "daily", budgetAmount: 10 }), "USD")[0]).toContain(
      "at least $25",
    );
    expect(
      validateAdsSetup(valid({ budgetType: "lifetime", budgetAmount: 50 }), "USD")[0],
    ).toContain("at least $100");
    // At or above the floor, no budget problem.
    expect(validateAdsSetup(valid({ budgetType: "daily", budgetAmount: 25 }), "USD")).toEqual([]);
    // A currency with no published floor adds no rule beyond "more than zero".
    expect(validateAdsSetup(valid({ budgetType: "daily", budgetAmount: 5 }), "INR")).toEqual([]);
    // No currency at all keeps the old behaviour.
    expect(validateAdsSetup(valid({ budgetAmount: 1 }))).toEqual([]);
  });

  /** A window of zero length is a campaign that cannot run. */
  it("refuses an end date that is not after the start", () => {
    expect(validateAdsSetup(valid({ startDate: "2026-10-01", endDate: "2026-10-01" }))).toHaveLength(
      1,
    );
    expect(validateAdsSetup(valid({ startDate: "2026-10-02", endDate: "2026-10-01" }))).toHaveLength(
      1,
    );
    expect(validateAdsSetup(valid({ startDate: "", endDate: "" }))[0]).toContain("start and an end");
  });

  /**
   * The browser's `required` stops this, but a POST is not a browser and the
   * two have to agree or the check is theatre. An empty list targets everywhere
   * and spends the budget proving it.
   */
  it("refuses a campaign with nowhere to run", () => {
    expect(validateAdsSetup(valid({ locationPicks: [], locations: [] }))[0]).toContain("at least one location");
    expect(validateAdsSetup(valid({ platforms: [] }))[0]).toContain("at least one platform");
  });

  it("reports every problem at once, not one per submit", () => {
    const problems = validateAdsSetup(
      valid({ brandName: "", businessDescription: "", budgetAmount: 0, locationPicks: [], locations: [] }),
    );
    expect(problems.length).toBeGreaterThanOrEqual(4);
  });
  /**
   * This step now DOES know whether a bid is required, because the customer
   * picks the strategy here rather than waiting for `advise` to derive one.
   * Reach offers a CPM bid and nothing else, so awareness can never be left
   * without an amount — the only objective with no automatic option.
   */
  it("insists on a bid when the chosen strategy needs one", () => {
    expect(validateAdsSetup(valid({ goal: "awareness", bidAmount: 0 }))[0]).toContain(
      "Maximum CPM bid",
    );
    expect(validateAdsSetup(valid({ goal: "awareness", bidAmount: 10 }))).toEqual([]);
  });

  it("asks for nothing extra when the strategy bids automatically", () => {
    // Maximize results: an amount would be meaningless, so its absence is not
    // a problem to report.
    expect(validateAdsSetup(valid({ bidStrategy: "maximize_results", bidAmount: 0 }))).toEqual([]);
  });

  it("still refuses a negative bid", () => {
    expect(validateAdsSetup(valid({ bidAmount: -1 }))[0]).toContain("negative");
  });
});
