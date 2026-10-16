import { describe, expect, it } from "vitest";
import { integrationSlides, ownedAgentCount, type MenuIntegration } from "./nav-menu-status";
import type { AgentRowStatus } from "./agent-row-status";

const row = (key: string, state: MenuIntegration["state"]): MenuIntegration => ({ key, state, account: "" });

describe("ownedAgentCount", () => {
  it("counts the agents the account has, not the ones it has not bought or cannot use yet", () => {
    const statuses: AgentRowStatus[] = ["ready", "needs-setup", "blocked", "locked", "locked", "coming-soon"];
    expect(ownedAgentCount(statuses)).toBe(3);
  });
});

describe("integrationSlides", () => {
  it("counts connections, lists fixes and says which agents are waiting", () => {
    const slides = integrationSlides([
      row("googleAnalytics", "connected"),
      row("linkedInAds", "expired"),
      row("facebook", "finish-setup"),
      row("email", "not-connected"),
      row("github", "not-connected"),
      row("wordpress", "not-connected"),
    ]);
    expect(slides[0]).toMatchObject({ kicker: "Connections", value: "1 of 6" });
    expect(slides[1]).toMatchObject({ kicker: "Issues", value: "2" });
    expect(slides[1]!.body).toContain("LinkedIn Ads: expired, reconnect");
    const waiting = slides.filter((s) => s.kicker === "Unlock more").map((s) => s.body);
    expect(waiting[0]).toContain("mailbox");
    expect(waiting[1]).toContain("GitHub or WordPress");
    expect(waiting.length).toBeLessThanOrEqual(3);
  });

  it("does not treat a row it could not check as missing", () => {
    const slides = integrationSlides([row("email", "unknown"), row("github", "unknown"), row("wordpress", "connected")]);
    expect(slides.some((s) => s.kicker === "Unlock more")).toBe(false);
  });
});
