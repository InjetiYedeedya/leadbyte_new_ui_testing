import {
  agentAttentionBreakdown,
  agentStatusLabel,
  agentsNeedingAttention,
  agentsWaiting,
  isWaitingOnCustomer,
} from "./agent-status";
import type { AgentState, AgentStatus } from "./types";

/**
 * Three screens used to answer "how many agents need me?" three different ways
 * and disagreed on the same account — the tab said eight, Overview said zero.
 * These tests exist to keep the definitions in one place rather than to prove
 * arithmetic.
 */

const state = (status: AgentStatus, agentId: string = status): AgentState => ({
  agentId,
  status,
  runs: [],
});

const MIXED: AgentState[] = [
  state("needs-setup", "a"),
  state("needs-setup", "b"),
  state("blocked", "c"),
  state("recommended", "d"),
  state("ready", "e"),
];

describe("agentStatusLabel", () => {
  /**
   * The raw ids were rendered straight into badges and uppercased by CSS into
   * `NEEDS-SETUP`, which wrapped onto two lines on a phone and read as the
   * database value it was.
   */
  it("gives every status a sentence-case label", () => {
    expect(agentStatusLabel("needs-setup")).toBe("Needs setup");
    expect(agentStatusLabel("blocked")).toBe("Blocked");
    expect(agentStatusLabel("recommended")).toBe("Recommended");
    expect(agentStatusLabel("ready")).toBe("Ready");
  });

  it("never renders a hyphenated slug", () => {
    for (const status of ["ready", "needs-setup", "blocked", "recommended"] as AgentStatus[]) {
      expect(agentStatusLabel(status)).not.toContain("-");
    }
  });

  it("falls back rather than rendering nothing for an unknown status", () => {
    expect(agentStatusLabel("archived" as AgentStatus)).toBe("Needs setup");
  });
});

describe("what counts as waiting", () => {
  /**
   * `recommended` is a suggestion, not a task. A badge that cannot be cleared
   * teaches people to stop reading badges.
   */
  it("counts the two statuses an agent cannot leave on its own", () => {
    expect(isWaitingOnCustomer("needs-setup")).toBe(true);
    expect(isWaitingOnCustomer("blocked")).toBe(true);
    expect(isWaitingOnCustomer("recommended")).toBe(false);
    expect(isWaitingOnCustomer("ready")).toBe(false);
  });

  it("counts three of the five in a mixed account", () => {
    expect(agentsNeedingAttention(MIXED)).toBe(3);
  });

  /** The badge must be able to link to exactly what it counted. */
  it("can name the agents behind the number", () => {
    expect(agentsWaiting(MIXED).map((s) => s.agentId)).toEqual(["a", "b", "c"]);
    expect(agentsWaiting(MIXED)).toHaveLength(agentsNeedingAttention(MIXED));
  });

  it("is zero for an account with nothing outstanding", () => {
    expect(agentsNeedingAttention([state("ready"), state("recommended")])).toBe(0);
    expect(agentsNeedingAttention([])).toBe(0);
  });
});

describe("agentAttentionBreakdown", () => {
  it("splits the same total the badge shows", () => {
    const breakdown = agentAttentionBreakdown(MIXED);
    expect(breakdown).toEqual({ needsSetup: 2, blocked: 1, waiting: 3, recommended: 1 });
  });

  /**
   * The audited failure, in one assertion: Overview reported only `blocked`, so
   * an account of agents all awaiting setup showed zero while the tab showed
   * eight.
   */
  it("does not report zero for an account that is entirely awaiting setup", () => {
    const all = Array.from({ length: 8 }, (_, i) => state("needs-setup", `agent-${i}`));
    const breakdown = agentAttentionBreakdown(all);

    expect(breakdown.blocked).toBe(0);
    expect(breakdown.needsSetup).toBe(8);
    expect(breakdown.waiting).toBe(agentsNeedingAttention(all));
  });

  /** Derived from the two halves, so a headline cannot contradict its own parts. */
  it("keeps the total equal to its parts on any mix", () => {
    const breakdown = agentAttentionBreakdown(MIXED);
    expect(breakdown.waiting).toBe(breakdown.needsSetup + breakdown.blocked);
  });
});
