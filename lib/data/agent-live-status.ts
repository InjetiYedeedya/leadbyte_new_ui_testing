import { cache } from "react";
import { isBackendConfigured } from "@/lib/api/config";
import { getSession } from "@/lib/auth/session";
import { getAgentRepo } from "@/lib/data/agent-repo";
import { agentBackend, agentSetupExists, type AgentBackendId } from "@/lib/data/agent-setup";
import { agentRowStatus, type AgentRowStatus } from "@/lib/data/agent-row-status";
import { runRuleFor } from "@/lib/data/agent-run-gate";
import { canRunAgent } from "@/lib/entitlements/guard";
import type { AgentState } from "@/lib/data/types";

/**
 * Run without a setup step — owning the agent is enough to be Ready. Blog
 * Posting is free for now (no purchase rule), so it is Ready for everyone.
 */
export const NO_SETUP_AGENTS = new Set(["aeo", "blog-posting"]);

/**
 * Listed so customers know it is on the way; nothing runs behind it yet.
 * Empty since Blog Posting was switched on (2026-09-28).
 */
export const COMING_SOON_AGENTS = new Set<string>([]);

/**
 * Every offered agent's list status — Locked, Needs setup, Blocked or Ready —
 * worked out ONCE per render for every screen that reports it.
 *
 * The Agents tab badge, the Agents page and Overview each used to count on
 * their own: the page knew about purchases and about AEO needing no setup,
 * the badge did not, so a screen reading "4 need setup or unlock" sat under a
 * tab badge of 5 (2026-09-25). One function, three readers, one answer.
 *
 * `cache()`d: the header badge and the page body both ask in one render.
 */
export const agentRowStatuses = cache(async function agentRowStatuses(
  businessId: string,
): Promise<Map<string, AgentRowStatus>> {
  const repo = getAgentRepo();
  const [states, email] = await Promise.all([
    repo.listStates(businessId),
    getSession().then((session) => session?.businessId ?? businessId),
  ]);
  const live = isBackendConfigured();

  const entries = await Promise.all(
    states.map(async (state) => {
      const backend = agentBackend(state.agentId);
      // `triggerPath: ""` is an agent with no backend yet (OpenAI Ads): no
      // setup table exists to ask, so it cannot have been configured.
      const hasSetupTable = live && backend !== null && backend.triggerPath !== "";
      const [purchased, configured] = await Promise.all([
        runRuleFor(state.agentId).purchase ? canRunAgent(state.agentId, email) : true,
        hasSetupTable
          ? agentSetupExists(state.agentId as AgentBackendId, businessId)
          : Promise.resolve(false),
      ]);
      const status = agentRowStatus({
        comingSoon: COMING_SOON_AGENTS.has(state.agentId),
        purchased,
        configured,
        noSetupNeeded: NO_SETUP_AGENTS.has(state.agentId),
        hasRuns: state.runs.length > 0,
        repoStatus: state.status,
      });
      return [state.agentId, status] as const;
    }),
  );
  return new Map(entries);
});

/**
 * Every agent's state, with its status taken from `agentRowStatuses` so the
 * badge and Overview count exactly what the Agents page shows. A Locked agent
 * reads as `needs-setup` here — it is waiting on the customer too, which is
 * all the count means ("Needs setup or unlock" on the page).
 */
export const liveAgentStates = cache(async function liveAgentStates(
  businessId: string,
): Promise<AgentState[]> {
  const [states, statuses] = await Promise.all([
    getAgentRepo().listStates(businessId),
    agentRowStatuses(businessId),
  ]);
  return states.map((state) => {
    const status = statuses.get(state.agentId);
    if (status === undefined) return state;
    // Coming soon is not waiting on the customer, so it must not add to
    // Overview's "needs setup" count: `recommended` is the one state that is
    // neither ready nor waiting.
    const mapped: AgentState["status"] =
      status === "ready"
        ? "ready"
        : status === "blocked"
          ? "blocked"
          : status === "coming-soon"
            ? "recommended"
            : "needs-setup";
    return { ...state, status: mapped };
  });
});
