import { adsFieldLabel, humaniseKey, humaniseOr, isMachineKey, platformLabel } from "@/lib/data/labels";

describe("isMachineKey", () => {
  it("recognises the spellings backends use", () => {
    expect(isMachineKey("budget_amount")).toBe(true);
    expect(isMachineKey("search-partners")).toBe(true);
    expect(isMachineKey("ENABLED")).toBe(true);
    expect(isMachineKey("OUTCOME_LEADS")).toBe(true);
    expect(isMachineKey("bidAmount")).toBe(true);
  });

  it("leaves anything a person wrote alone", () => {
    expect(isMachineKey("Ad goal")).toBe(false);
    expect(isMachineKey("Location")).toBe(false);
    expect(isMachineKey("CTR")).toBe(false);
    expect(isMachineKey("")).toBe(false);
  });

  it("does not mistake a dash inside a sentence for a key", () => {
    // The whole reason the space test runs first: an outreach log writing
    // "Sent - awaiting reply" must not lose its dash.
    expect(isMachineKey("Sent - awaiting reply")).toBe(false);
    expect(isMachineKey("Maximize conversions (highest number of leads)")).toBe(false);
  });

  it("still calls out a shouted sentence", () => {
    expect(isMachineKey("MAXIMIZE CONVERSIONS")).toBe(true);
  });
});

describe("humaniseKey", () => {
  it("sentence-cases a key", () => {
    expect(humaniseKey("budget_amount")).toBe("Budget amount");
    expect(humaniseKey("bidAmount")).toBe("Bid amount");
    expect(humaniseKey("OUTCOME_LEADS")).toBe("Outcome leads");
    expect(humaniseKey("ENABLED")).toBe("Enabled");
    expect(humaniseKey("PERFORMANCE_MAX")).toBe("Performance max");
  });

  it("keeps acronyms shouting", () => {
    expect(humaniseKey("avg_ctr")).toBe("Avg CTR");
    expect(humaniseKey("url_slug")).toBe("URL slug");
    expect(humaniseKey("seo_score")).toBe("SEO score");
  });

  it("returns a human label exactly as it arrived", () => {
    expect(humaniseKey("Ad goal")).toBe("Ad goal");
    expect(humaniseKey("CTR")).toBe("CTR");
    expect(humaniseKey("Sent - awaiting reply")).toBe("Sent - awaiting reply");
    expect(humaniseKey("Maximize conversions (use when aiming for leads)")).toBe(
      "Maximize conversions (use when aiming for leads)",
    );
  });

  it("trims, and survives an empty value", () => {
    expect(humaniseKey("  budget_amount  ")).toBe("Budget amount");
    expect(humaniseKey("")).toBe("");
    expect(humaniseKey("   ")).toBe("");
  });
});

describe("humaniseOr", () => {
  it("falls back to an em dash, matching formatMoney", () => {
    expect(humaniseOr(null)).toBe("—");
    expect(humaniseOr(undefined)).toBe("—");
    expect(humaniseOr("")).toBe("—");
    expect(humaniseOr("  ")).toBe("—");
  });

  it("takes a fallback of its own", () => {
    expect(humaniseOr(null, "Unknown")).toBe("Unknown");
  });

  it("humanises anything present", () => {
    expect(humaniseOr("PAUSED")).toBe("Paused");
  });
});

describe("platformLabel", () => {
  it("spells the brands the way the brands do", () => {
    expect(platformLabel("linkedin")).toBe("LinkedIn");
    expect(platformLabel("tiktok")).toBe("TikTok");
    expect(platformLabel("youtube")).toBe("YouTube");
    expect(platformLabel("x")).toBe("X");
  });

  it("does not care how the key was cased", () => {
    expect(platformLabel("LinkedIn")).toBe("LinkedIn");
    expect(platformLabel(" YOUTUBE ")).toBe("YouTube");
  });

  it("renders a platform nobody has mapped yet", () => {
    expect(platformLabel("mastodon")).toBe("Mastodon");
    expect(platformLabel("facebook_page")).toBe("Facebook page");
  });
});

describe("adsFieldLabel", () => {
  it("names the fields the service reports problems on", () => {
    // Spellings captured from real 422s — see ads-errors.test.ts.
    expect(adsFieldLabel("budget_amount")).toBe("Budget");
    expect(adsFieldLabel("locations")).toBe("Locations");
    expect(adsFieldLabel("business_description")).toBe("Business description");
    expect(adsFieldLabel("goal")).toBe("Campaign goal");
  });

  it("accepts the form's own camelCase spelling of the same field", () => {
    expect(adsFieldLabel("bidAmount")).toBe("Bid");
    expect(adsFieldLabel("adType")).toBe("Ad format");
  });

  it("falls through for a field the service adds later", () => {
    expect(adsFieldLabel("audience_signal")).toBe("Audience signal");
  });
});
