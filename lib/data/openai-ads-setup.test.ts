import {
  OPENAI_BUDGET_TYPES,
  OPENAI_GOALS,
  OPENAI_PLATFORMS,
  openAiAdsPayload,
  readOpenAiAdsForm,
  validateOpenAiAds,
  type OpenAiAdsSetup,
} from "./openai-ads-setup";

/**
 * The OpenAI Ads setup form, read and validated.
 *
 * Unlike the other three platforms there is no captured n8n execution to copy
 * labels from, so what is pinned here is our own shape — and the one rule that
 * is not cosmetic: the customer's API key never enters the prose or the
 * campaign object, because both are fed to a model and echoed back.
 */

function form(values: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) for (const one of value) data.append(key, one);
    else data.set(key, value);
  }
  return data;
}

/** A setup that passes validation, so each test can break one thing. */
function valid(over: Partial<OpenAiAdsSetup> = {}): OpenAiAdsSetup {
  return {
    goal: "leads",
    locations: [{ country: "India", state: "", city: "", zip: "" }],
    budgetType: "daily",
    budgetAmount: 50,
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    platforms: ["website"],
    bidAmount: 0,
    ...over,
  };
}

describe("readOpenAiAdsForm", () => {
  it("reads every field the form asks for", () => {
    const setup = readOpenAiAdsForm(
      form({
        goal: "sales",
        budgetType: "lifetime",
        budgetAmount: "250",
        startDate: "2026-10-01",
        endDate: "2026-11-01",
        platforms: ["ios", "android"],
        bidAmount: "2.5",
      }),
    );

    expect(setup.goal).toBe("sales");
    expect(setup.budgetType).toBe("lifetime");
    expect(setup.budgetAmount).toBe(250);
    expect(setup.startDate).toBe("2026-10-01");
    expect(setup.endDate).toBe("2026-11-01");
    expect(setup.platforms).toEqual(["ios", "android"]);
    expect(setup.bidAmount).toBe(2.5);
  });

  it("falls back rather than passing a value the backend has no branch for", () => {
    const setup = readOpenAiAdsForm(form({ goal: "nonsense", budgetType: "hourly" }));
    expect(OPENAI_GOALS.some((g) => g.id === setup.goal)).toBe(true);
    expect(OPENAI_BUDGET_TYPES).toContain(setup.budgetType);
  });

  it("keeps only platforms it recognises", () => {
    const setup = readOpenAiAdsForm(form({ platforms: ["ios", "smart-fridge", "website"] }));
    expect(setup.platforms).toEqual(["ios", "website"]);
    for (const platform of setup.platforms) {
      expect(OPENAI_PLATFORMS.some((p) => p.id === platform)).toBe(true);
    }
  });

  it("treats an empty bid as no bid, not as zero-pence", () => {
    expect(readOpenAiAdsForm(form({ bidAmount: "" })).bidAmount).toBe(0);
    expect(readOpenAiAdsForm(form({ bidAmount: "  " })).bidAmount).toBe(0);
  });
});

describe("validateOpenAiAds", () => {
  it("accepts a complete setup", () => {
    expect(validateOpenAiAds(valid())).toEqual([]);
  });

  it("requires a budget above zero", () => {
    expect(validateOpenAiAds(valid({ budgetAmount: 0 }))).toContain("Budget must be more than zero.");
  });

  it("requires both dates", () => {
    expect(validateOpenAiAds(valid({ startDate: "" }))).toContain(
      "Choose a start and an end date.",
    );
    expect(validateOpenAiAds(valid({ endDate: "" }))).toContain("Choose a start and an end date.");
  });

  it("refuses a campaign that ends before it starts", () => {
    const problems = validateOpenAiAds(valid({ startDate: "2026-11-01", endDate: "2026-10-01" }));
    expect(problems).toContain("The end date must be after the start date.");
  });

  it("refuses a campaign that ends on its start date", () => {
    // A zero-length window is a campaign that cannot run, not a one-day one.
    const problems = validateOpenAiAds(valid({ startDate: "2026-10-01", endDate: "2026-10-01" }));
    expect(problems).toContain("The end date must be after the start date.");
  });

  it("requires at least one platform, because none targets nothing", () => {
    expect(validateOpenAiAds(valid({ platforms: [] }))).toContain(
      "Choose at least one platform to run on.",
    );
  });

  it("requires a place, since the form asks for one", () => {
    // The country select is `required` in the browser. This is the same rule
    // on the server, where a POST that skipped the browser arrives.
    expect(validateOpenAiAds(valid({ locations: [] }))).toContain(
      "Add at least one place for the ads to run.",
    );
  });

  it("lets the bid be absent, but not negative", () => {
    expect(validateOpenAiAds(valid({ bidAmount: 0 }))).toEqual([]);
    expect(validateOpenAiAds(valid({ bidAmount: -1 }))).toContain(
      "Bid amount cannot be negative.",
    );
  });
});

describe("openAiAdsPayload", () => {
  const ids = { email: "a@b.com", userId: "uid", sessionId: "s1", apiKey: "sk-test-123" };

  it("carries the campaign as prose and as an object, from one source", () => {
    const payload = openAiAdsPayload(valid(), ids);
    const data = payload.campaign_data as Record<string, string>;

    expect(data["Ad goal"]).toBe("leads");
    expect(data["Budget type"]).toBe("daily");
    expect(data["Eligible platforms"]).toBe("website");
    // Every field in the object appears in the prose the agent reads.
    for (const [label, value] of Object.entries(data)) {
      expect(payload.chatInput as string).toContain(`${label}: ${value}`);
    }
  });

  /**
   * The one rule here that costs money if it is broken. `chatInput` is a
   * prompt and `campaign_data` is stored with the suggestion — a key in
   * either can come back out in the agent's own reply.
   */
  it("never puts the API key in the prose or the campaign object", () => {
    const payload = openAiAdsPayload(valid(), ids);
    expect(payload.chatInput as string).not.toContain("sk-test-123");
    expect(JSON.stringify(payload.campaign_data)).not.toContain("sk-test-123");
  });

  it("sends the key as its own field, so the workflow can find it", () => {
    const payload = openAiAdsPayload(valid(), ids);
    expect(payload.openai_api_key).toBe("sk-test-123");
  });

  it("says an absent bid is absent rather than sending a zero", () => {
    const data = openAiAdsPayload(valid({ bidAmount: 0 }), ids).campaign_data as Record<
      string,
      string
    >;
    // A zero bid reads as "bid nothing", which is a real instruction.
    expect(data["Bid amount"]).not.toBe("0");
  });

  it("asks for a suggestion — it does not launch", () => {
    // Same rule as the other three: the setup form asks, it never spends.
    expect(openAiAdsPayload(valid(), ids).action_type).toBe("get_suggestion");
  });
});
