import { decodeDraft, encodeDraft, MAX_DRAFT_CHARS } from "./linkedin-setup-draft";
import type { LinkedInAdsSetup } from "./linkedin-ads-setup";

const SETUP: LinkedInAdsSetup = {
  businessName: "Acme",
  goal: "leads",
  budgetType: "lifetime",
  budgetAmount: 500,
  days: 14,
  criteria: ["titles", "size", "interests"],
  targeting: { titles: ["CEO", "Founder"], size: ["11-50"], interests: ["SaaS"] },
  customTargeting: "No agencies",
  adFormat: "Lead gen form",
  automationMode: "full",
};

describe("LinkedIn setup draft (2026-10-08)", () => {
  it("round-trips every answer, keeping the criteria order", () => {
    expect(decodeDraft(encodeDraft(SETUP) ?? undefined)).toEqual(SETUP);
  });

  it("is re-checked like a post: a format the goal does not allow is dropped", () => {
    const stored = encodeDraft({ ...SETUP, goal: "video", adFormat: "Lead gen form" });
    expect(decodeDraft(stored ?? undefined)?.adFormat).toBe("");
  });

  it("keeps nothing that would not fit one cookie", () => {
    const huge = Array.from({ length: 30 }, (_, i) => `${"x".repeat(70)}${i}`);
    expect(encodeDraft({ ...SETUP, targeting: { titles: huge, skills: huge } })).toBeNull();
    expect((encodeDraft(SETUP) ?? "").length).toBeLessThanOrEqual(MAX_DRAFT_CHARS);
  });

  it("reads junk as no draft", () => {
    expect(decodeDraft(undefined)).toBeNull();
    expect(decodeDraft("not json")).toBeNull();
    expect(decodeDraft('{"a":1}')).toBeNull();
  });
});
