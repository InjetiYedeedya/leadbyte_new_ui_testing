import { adsPromptDecision } from "@/lib/data/ads-prompt";

const BASE = {
  started: false,
  googleAds: "not-connected",
  metaAds: "not-connected",
} as const;

describe("adsPromptDecision", () => {
  it("asks when neither ad platform is connected", () => {
    const decision = adsPromptDecision({ ...BASE });
    expect(decision.show).toBe(true);
    expect(decision.missing).toEqual(["googleAds", "metaAds"]);
  });

  it("still asks when only one is missing, and names just that one", () => {
    const decision = adsPromptDecision({ ...BASE, googleAds: "valid" });
    expect(decision.show).toBe(true);
    expect(decision.missing).toEqual(["metaAds"]);
  });

  it("stays quiet once both are connected", () => {
    const decision = adsPromptDecision({ ...BASE, googleAds: "valid", metaAds: "valid" });
    expect(decision.show).toBe(false);
    expect(decision.gate).toBe(false);
  });

  it("treats an expired connection as needing reconnecting", () => {
    expect(adsPromptDecision({ ...BASE, googleAds: "expired", metaAds: "valid" }).show).toBe(true);
  });

  it("does not ask on the strength of a failed status lookup", () => {
    // "error" means we could not reach the backend. Telling someone to connect
    // an account they may already have is worse than staying quiet — they
    // cannot tell our outage from their missing connection.
    expect(adsPromptDecision({ ...BASE, googleAds: "error", metaAds: "error" }).show).toBe(false);
  });

  it("keeps asking on a conversation already under way", () => {
    // Chosen behaviour (2026-09-03): landing on the strategy screen with ads
    // unconnected raises the ask, every visit. The previous rule asked only
    // before the first message, which in practice meant almost nobody saw it.
    const decision = adsPromptDecision({ ...BASE, started: true });
    expect(decision.show).toBe(true);
  });

  it("only GATES starting before the first message", () => {
    // Before: dismissing must not leave a working start button behind.
    expect(adsPromptDecision({ ...BASE, started: false }).gate).toBe(true);
    // After: there is nothing left to gate, so it is an offer and closing it
    // must not block replying to the agent.
    expect(adsPromptDecision({ ...BASE, started: true }).gate).toBe(false);
  });
});
