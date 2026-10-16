import { adsConnectionFor, requiresAdsConnection, statusBlocks } from "./agent-ads-gate";

describe("the ad-connection gate", () => {
  it("locks LinkedIn Ads on its own connection", () => {
    expect(requiresAdsConnection("linkedin-ads")).toBe(true);
    expect(adsConnectionFor("linkedin-ads")).toBe("linkedInAds");
  });

  it("locks Google Ads and Meta Ads on theirs too (product rule, 2026-09-25)", () => {
    expect(adsConnectionFor("google-ads")).toBe("googleAds");
    expect(adsConnectionFor("meta-ads")).toBe("metaAds");
  });

  it("leaves every other agent open, OpenAI Ads included", () => {
    for (const id of ["openai-ads", "social-media", "lead-qualification", "aeo"]) {
      expect(requiresAdsConnection(id)).toBe(false);
    }
  });

  it("blocks only on a definite answer, never on a check that could not be made", () => {
    expect(statusBlocks("not-connected")).toBe(true);
    expect(statusBlocks("expired")).toBe(true);
    expect(statusBlocks("valid")).toBe(false);
    expect(statusBlocks("error")).toBe(false);
  });
});
