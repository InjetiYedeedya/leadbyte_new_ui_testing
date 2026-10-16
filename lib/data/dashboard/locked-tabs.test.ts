import { lockedDashboardTabs, opensDashboard } from "./locked-tabs";
import type { AgentRowStatus } from "@/lib/data/agent-row-status";

describe("opensDashboard", () => {
  it("opens for an agent the account has, set up or not", () => {
    expect(opensDashboard("lead-qualification", "ready")).toBe(true);
    expect(opensDashboard("lead-qualification", "needs-setup")).toBe(true);
    expect(opensDashboard("lead-qualification", "blocked")).toBe(true);
  });

  it("stays shut for a locked or coming-soon agent, and for one with no dashboard", () => {
    expect(opensDashboard("lead-qualification", "locked")).toBe(false);
    expect(opensDashboard("lead-qualification", "coming-soon")).toBe(false);
    expect(opensDashboard("aeo", "ready")).toBe(false);
  });
});

describe("lockedDashboardTabs", () => {
  it("locks the tabs of agents not bought or not offered, never Ads Leads", () => {
    const statuses = new Map<string, AgentRowStatus>([
      ["lead-qualification", "ready"],
      ["meta-ads", "locked"],
    ]);
    const locked = lockedDashboardTabs(statuses);
    expect(locked.has("lead-qualification")).toBe(false);
    expect(locked.has("meta-ads")).toBe(true);
    // Not in the map at all: not offered to this account.
    expect(locked.has("google-ads")).toBe(true);
    expect(locked.has("ads-leads")).toBe(false);
  });
});
