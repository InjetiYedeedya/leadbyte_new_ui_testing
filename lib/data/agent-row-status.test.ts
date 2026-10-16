import { describe, expect, it } from "vitest";
import { ROW_ACTION_LABEL, ROW_STATUS_LABEL, agentRowStatus } from "./agent-row-status";

const base = {
  purchased: true,
  configured: false,
  noSetupNeeded: false,
  hasRuns: false,
  repoStatus: undefined,
};

describe("agentRowStatus", () => {
  it("locks an agent that was not bought, even with a setup row left over", () => {
    expect(agentRowStatus({ ...base, purchased: false, configured: true })).toBe("locked");
  });

  it("is ready once set up, once run, or when it needs no setup", () => {
    expect(agentRowStatus({ ...base, configured: true })).toBe("ready");
    expect(agentRowStatus({ ...base, hasRuns: true })).toBe("ready");
    expect(agentRowStatus({ ...base, noSetupNeeded: true })).toBe("ready");
  });

  it("needs setup when bought and nothing is done yet", () => {
    expect(agentRowStatus(base)).toBe("needs-setup");
  });

  it("marks an agent with nothing behind it Coming soon, before anything else", () => {
    expect(agentRowStatus({ ...base, comingSoon: true, purchased: false })).toBe("coming-soon");
  });

  it("keeps a blocked agent out of Ready", () => {
    expect(agentRowStatus({ ...base, configured: true, repoStatus: "blocked" })).toBe("blocked");
  });
});

describe("one word per situation", () => {
  it("uses Unlock, Set up, Open and Run agent — and never Configure", () => {
    expect(ROW_ACTION_LABEL).toEqual({
      "coming-soon": "",
      locked: "Unlock",
      "needs-setup": "Set up",
      blocked: "Open",
      ready: "Run agent",
    });
    expect(Object.values(ROW_STATUS_LABEL)).toEqual([
      "Coming soon",
      "Locked",
      "Needs setup",
      "Blocked",
      "Ready",
    ]);
  });
});
