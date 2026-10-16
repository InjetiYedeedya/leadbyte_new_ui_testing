import { CAMPAIGN_STEPS, asksMode, campaignStepsFor, modeLast } from "./campaign-steps";

describe("campaign steps per agent (2026-10-06)", () => {
  it("asks the automation mode after the details for Google, Meta and LinkedIn", () => {
    for (const agent of ["google-ads", "meta-ads", "linkedin-ads"]) {
      expect(modeLast(agent)).toBe(true);
      expect(campaignStepsFor(agent).map((s) => s.id)).toEqual(["setup", "plan", "details", "mode", "creative"]);
    }
  });

  it("puts LinkedIn in the same order as Meta (2026-10-08)", () => {
    expect(modeLast("linkedin-ads")).toBe(true);
    expect(campaignStepsFor("linkedin-ads").map((s) => s.id)).toEqual(["setup", "plan", "details", "mode", "creative"]);
    // Full-only still skips the automation step, as for Meta.
    expect(campaignStepsFor("linkedin-ads", false)).toBe(CAMPAIGN_STEPS);
  });

  it("skips the automation step when the agent says only full automation fits (2026-10-07)", () => {
    // An Engagement campaign comes back with `semiAllowed: false`: a question
    // with one possible answer is not a question.
    for (const agent of ["google-ads", "meta-ads", "linkedin-ads"]) {
      expect(asksMode(agent, false)).toBe(false);
      expect(campaignStepsFor(agent, false)).toBe(CAMPAIGN_STEPS);
      // Not known yet, or semi allowed: the step stays.
      expect(asksMode(agent, undefined)).toBe(true);
      expect(campaignStepsFor(agent, undefined).map((s) => s.id)).toContain("mode");
    }
    expect(asksMode("openai-ads", undefined)).toBe(false);
  });
});

describe("an Engagement campaign promoting an existing post (LBS-1253)", () => {
  it("ends at the details: no automation step, no creative step", () => {
    expect(asksMode("meta-ads", undefined, "1234567890")).toBe(false);
    expect(campaignStepsFor("meta-ads", undefined, "1234567890").map((step) => step.id)).toEqual([
      "setup",
      "plan",
      "details",
    ]);
  });

  it("leaves every other campaign's steps alone", () => {
    expect(asksMode("meta-ads", undefined)).toBe(true);
    expect(campaignStepsFor("meta-ads").map((step) => step.id)).toContain("creative");
  });
});
