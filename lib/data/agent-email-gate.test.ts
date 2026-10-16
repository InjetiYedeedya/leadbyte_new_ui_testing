import {
  EMAIL_GATE_MESSAGE,
  emailGatedAgents,
  requiresConnectedEmail,
} from "@/lib/data/agent-email-gate";

describe("requiresConnectedEmail", () => {
  it("gates the two agents that send outreach by email", () => {
    // On-Page SEO is purchase-only since 2026-09-25.
    expect(requiresConnectedEmail("on-page-seo")).toBe(false);
    expect(requiresConnectedEmail("off-page-seo")).toBe(true);
    expect(requiresConnectedEmail("lead-qualification")).toBe(true);
  });

  it("does NOT gate the ads agents", () => {
    // Connecting an ads platform is an OAuth login and nothing else — the
    // agent's work lands in the ad account, not in an inbox. These were gated
    // and the screen told someone who had just connected Google Ads that
    // Google Ads needed a mailbox (2026-09-08).
    expect(requiresConnectedEmail("google-ads")).toBe(false);
    expect(requiresConnectedEmail("meta-ads")).toBe(false);
    expect(requiresConnectedEmail("linkedin-ads")).toBe(false);
  });

  it("does not gate an agent that was not asked for", () => {
    expect(requiresConnectedEmail("writer")).toBe(false);
    expect(requiresConnectedEmail("coding")).toBe(false);
  });

  it("does not gate an unknown id", () => {
    // A typo must not become a block on an agent nobody meant to gate.
    expect(requiresConnectedEmail("")).toBe(false);
    expect(requiresConnectedEmail("meta")).toBe(false);
  });

  it("lists the gated agents for the UI to read", () => {
    expect([...emailGatedAgents()].sort()).toEqual([
      "lead-qualification",
      "off-page-seo",
    ]);
  });
});

describe("EMAIL_GATE_MESSAGE", () => {
  it("says what to do, not just what is wrong", () => {
    expect(EMAIL_GATE_MESSAGE.toLowerCase()).toContain("connect");
    expect(EMAIL_GATE_MESSAGE.toLowerCase()).toContain("email");
  });
});
