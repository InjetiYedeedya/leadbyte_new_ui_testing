import type { AgentState, AgentStatus } from "./types";

/**
 * One vocabulary for what an agent's status means, and one place that counts.
 *
 * ## Why this exists
 *
 * Three screens were answering "how many agents need me?" three different ways,
 * and a design audit on 2026-09-15 caught them disagreeing on one account: the
 * Agents tab said eight were waiting, Overview said zero blocked and zero
 * awaiting approval, and the Inbox said nothing needed attention at all.
 *
 * None of them was wrong on its own terms. The tab counted `needs-setup` plus
 * `blocked`; Overview counted only `blocked` for its "blocked on setup" figure
 * and used `recommended` for "awaiting approval"; the Inbox was describing an
 * empty notifications list. Three honest numbers, no shared definition, and a
 * customer left to work out which to believe.
 *
 * So the definitions live here and every screen reads them. A count that
 * disagrees with the list it links to is worse than no count.
 */

/**
 * What to call each status on screen.
 *
 * The raw ids were rendered directly into badges — `needs-setup`, uppercased by
 * CSS into `NEEDS-SETUP`, which wrapped onto two lines on a phone and reads as
 * a database value because it is one.
 */
export const AGENT_STATUS_LABELS: Record<AgentStatus, string> = {
  ready: "Ready",
  "needs-setup": "Needs setup",
  blocked: "Blocked",
  recommended: "Recommended",
};

export function agentStatusLabel(status: AgentStatus): string {
  return AGENT_STATUS_LABELS[status] ?? "Needs setup";
}

/**
 * The statuses an agent cannot leave without the customer.
 *
 * `needs-setup` wants a form filled in and `blocked` wants a connection made.
 * `recommended` is deliberately absent: it is a suggestion, not a task, and a
 * badge that cannot be cleared teaches people to stop reading badges.
 */
const WAITING: ReadonlySet<AgentStatus> = new Set<AgentStatus>(["needs-setup", "blocked"]);

export function isWaitingOnCustomer(status: AgentStatus): boolean {
  return WAITING.has(status);
}

/** The agents behind the count — so a badge can link to exactly what it counted. */
export function agentsWaiting(states: readonly AgentState[]): AgentState[] {
  return states.filter((state) => isWaitingOnCustomer(state.status));
}

/**
 * How many agents are waiting on the customer. The Agents tab badge.
 *
 * Kept as the single counter: `agent-repo.ts` re-exports it so existing callers
 * are unchanged, but there is now only one implementation to disagree with.
 */
export function agentsNeedingAttention(states: readonly AgentState[]): number {
  return agentsWaiting(states).length;
}

/** Waiting, split the way Overview reports it. The two always sum to the badge. */
export function agentAttentionBreakdown(states: readonly AgentState[]): {
  needsSetup: number;
  blocked: number;
  waiting: number;
  recommended: number;
} {
  const needsSetup = states.filter((state) => state.status === "needs-setup").length;
  const blocked = states.filter((state) => state.status === "blocked").length;
  return {
    needsSetup,
    blocked,
    // Derived from the same two figures rather than counted again, so the
    // headline can never disagree with its own breakdown.
    waiting: needsSetup + blocked,
    recommended: states.filter((state) => state.status === "recommended").length,
  };
}
