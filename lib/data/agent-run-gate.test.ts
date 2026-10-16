import { describe, expect, it } from "vitest";
import { AGENT_RUN_RULES, connectionFor, firstUnmetStep, runGateCopy } from "./agent-run-gate";

describe("AGENT_RUN_RULES — the product rule, agent by agent", () => {
  it.each([
    ["google-ads", "googleAds"],
    ["meta-ads", "metaAds"],
    ["linkedin-ads", "linkedInAds"],
    ["openai-ads", null],
    ["lead-qualification", "mailbox"],
    ["off-page-seo", "mailbox"],
    ["on-page-seo", null],
    ["aeo", null],
    ["social-media", "social"],
  ])("%s must be bought, then needs %s", (agentId, connection) => {
    expect(AGENT_RUN_RULES[agentId]?.purchase).toBe(true);
    expect(connectionFor(agentId)).toBe(connection);
  });

  it("asks nothing of an agent that is not sold", () => {
    expect(firstUnmetStep("writer", { purchased: false, connected: false })).toBeNull();
  });
});

describe("firstUnmetStep — purchase always comes first", () => {
  it("points at Pricing before asking for any connection", () => {
    expect(firstUnmetStep("google-ads", { purchased: false, connected: false })).toBe("purchase");
    expect(firstUnmetStep("lead-qualification", { purchased: false, connected: true })).toBe(
      "purchase",
    );
  });

  it("asks for the connection once the agent is bought", () => {
    expect(firstUnmetStep("meta-ads", { purchased: true, connected: false })).toBe("connection");
    expect(firstUnmetStep("off-page-seo", { purchased: true, connected: false })).toBe("connection");
  });

  it("never asks a purchase-only agent to connect anything", () => {
    for (const id of ["openai-ads", "on-page-seo", "aeo"]) {
      expect(firstUnmetStep(id, { purchased: true, connected: false })).toBeNull();
    }
  });
});

describe("runGateCopy", () => {
  it("sends an unbought agent to Pricing", () => {
    expect(runGateCopy("aeo", "AEO", "purchase")).toMatchObject({
      title: "Unlock AEO",
      fixHref: "/pricing",
    });
  });

  it("names the ad platform and starts its own consent, returning to the agent", () => {
    expect(runGateCopy("google-ads", "Google Ads", "connection")).toMatchObject({
      title: "Connect your Google Ads account",
      fixHref: "/api/ads/connect?platform=google-ads&from=agent",
      fixLabel: "Connect Google Ads",
    });
    expect(runGateCopy("meta-ads", "Meta Ads", "connection").fixHref).toBe(
      "/api/ads/connect?platform=meta-ads&from=agent",
    );
  });

  it("sends LinkedIn Ads to its own connect page", () => {
    expect(runGateCopy("linkedin-ads", "LinkedIn Ads", "connection").fixHref).toBe(
      "/agents/linkedin-ads/connect",
    );
  });

  it("sends the mailbox and social steps to Connections", () => {
    expect(runGateCopy("lead-qualification", "LQ", "connection").fixHref).toBe(
      "/intelligence/connections",
    );
    expect(runGateCopy("social-media", "Social", "connection").fixHref).toBe(
      "/intelligence/connections",
    );
  });
});
