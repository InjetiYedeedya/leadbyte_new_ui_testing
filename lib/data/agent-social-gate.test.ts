import {
  SOCIAL_GATE_MESSAGE,
  SOCIAL_PLATFORMS,
  requiresSocialConnection,
} from "./agent-social-gate";
import { requiresConnectedEmail } from "./agent-email-gate";

/**
 * The gate that stops the Social Media agent starting with nowhere to post.
 *
 * The list itself is the point: it is read by both the page and the Server
 * Action, so a platform added to one and not the other is impossible — but a
 * platform added to the SET by mistake would silently block an agent, which is
 * what these pin.
 */

describe("requiresSocialConnection", () => {
  it("gates the Social Media agent", () => {
    expect(requiresSocialConnection("social-media")).toBe(true);
  });

  /**
   * Meta Ads reaches Facebook and Instagram through an ad account, not a page
   * login — a different grant and a different table. Gating it here would
   * repeat the mistake the email gate had to undo for Google Ads, where the
   * screen told someone to connect the thing they had just connected.
   */
  it("does not gate the ad agents, whose Facebook is a different grant", () => {
    expect(requiresSocialConnection("meta-ads")).toBe(false);
    expect(requiresSocialConnection("google-ads")).toBe(false);
    expect(requiresSocialConnection("linkedin-ads")).toBe(false);
    expect(requiresSocialConnection("openai-ads")).toBe(false);
  });

  it("does not gate anything else", () => {
    for (const agentId of ["on-page-seo", "off-page-seo", "lead-qualification", "writer", "coding"]) {
      expect(requiresSocialConnection(agentId)).toBe(false);
    }
  });

  it("is not confused with the email gate — they gate disjoint agents", () => {
    // Nothing needs both today, and an agent that did would show two blocking
    // notices at once. Worth knowing if that ever changes.
    for (const agentId of ["social-media", "on-page-seo", "off-page-seo", "lead-qualification"]) {
      expect(requiresSocialConnection(agentId) && requiresConnectedEmail(agentId)).toBe(false);
    }
  });
});

describe("SOCIAL_PLATFORMS", () => {
  it("is the three social platforms, any one of which satisfies the gate", () => {
    expect([...SOCIAL_PLATFORMS]).toEqual(["facebook", "instagram", "youtube"]);
  });

  it("excludes the ad platforms, which are a different connection", () => {
    expect(SOCIAL_PLATFORMS).not.toContain("metaAds");
    expect(SOCIAL_PLATFORMS).not.toContain("linkedInAds");
  });
});

describe("SOCIAL_GATE_MESSAGE", () => {
  /**
   * "No social account connected" alone leaves the reader hunting through
   * Connections for which of eight cards it means, which is the reason
   * `EMAIL_GATE_MESSAGE` spells it out too.
   */
  it("names the platforms and where to connect them", () => {
    expect(SOCIAL_GATE_MESSAGE).toMatch(/Facebook/);
    expect(SOCIAL_GATE_MESSAGE).toMatch(/Instagram/);
    expect(SOCIAL_GATE_MESSAGE).toMatch(/YouTube/);
    expect(SOCIAL_GATE_MESSAGE).toMatch(/Connections page/);
  });
});
