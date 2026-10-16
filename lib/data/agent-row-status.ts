import type { BadgeVariant } from "@/components/ui/badge";

/**
 * One status, one badge word and one button word per agent on the agents list.
 *
 * The list used to mix five words for three situations — "Ready", "Needs
 * setup", "Unlock", "Configure" and "Open" — chosen by which KIND of agent a
 * row was (popup or page) rather than by what the customer could do next. A
 * new account saw "Needs setup" beside an "Unlock" button on one row, and
 * "Open" on the next row for an agent it had not bought either. Now the
 * situation decides, and the kind of agent only decides where the button
 * leads:
 *
 *   coming-soon  nothing built yet     badge "Coming soon"   no button
 *   locked       not bought yet        badge "Locked"        button "Unlock"
 *   needs-setup  bought, not set up    badge "Needs setup"   button "Set up"
 *   blocked      bought, but stuck     badge "Blocked"       button "Open"
 *   ready        set up                badge "Ready"         button "Open"
 *
 * Pure, so the mapping is tested without a page.
 */

export type AgentRowStatus = "coming-soon" | "locked" | "needs-setup" | "blocked" | "ready";

export function agentRowStatus(input: {
  /** Listed, but nothing is built behind it yet: no button, nothing to buy. */
  comingSoon?: boolean;
  /** False only for an agent that is sold and this account does not own. */
  purchased: boolean;
  /** Its setup row exists on the backend. */
  configured: boolean;
  /** Runs without a setup step (AEO): owning it is enough. */
  noSetupNeeded: boolean;
  /** Has run at least once. */
  hasRuns: boolean;
  /** The agent repo's own status — only "blocked" and "ready" are read. */
  repoStatus: string | undefined;
}): AgentRowStatus {
  // Purchase first, the same order as the run gate (`agent-run-gate.ts`): a
  // setup row left over from before does not make an unbought agent usable.
  if (input.comingSoon) return "coming-soon";
  if (!input.purchased) return "locked";
  if (input.repoStatus === "blocked") return "blocked";
  if (input.configured || input.hasRuns || input.noSetupNeeded || input.repoStatus === "ready") {
    return "ready";
  }
  return "needs-setup";
}

export const ROW_STATUS_LABEL: Record<AgentRowStatus, string> = {
  "coming-soon": "Coming soon",
  locked: "Locked",
  "needs-setup": "Needs setup",
  blocked: "Blocked",
  ready: "Ready",
};

export const ROW_STATUS_VARIANT: Record<AgentRowStatus, BadgeVariant> = {
  "coming-soon": "coming-soon",
  locked: "purchase-no",
  "needs-setup": "agent-needs-setup",
  blocked: "agent-blocked",
  ready: "agent-ready",
};

export const ROW_ACTION_LABEL: Record<AgentRowStatus, string> = {
  // No button at all: there is nothing to press yet.
  "coming-soon": "",
  locked: "Unlock",
  "needs-setup": "Set up",
  // Blocked keeps "Open": the row's note says what is in the way, and the
  // button leads to fixing it rather than to a run.
  blocked: "Open",
  ready: "Run agent",
};

/** Ready agents in one group, everything that needs something in the other. */
export function isReadyRow(status: AgentRowStatus): boolean {
  return status === "ready";
}
