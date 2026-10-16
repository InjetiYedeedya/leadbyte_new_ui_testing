import type { AgentRowStatus } from "@/lib/data/agent-row-status";
import { DASHBOARD_TABS, hasDashboardTab, type DashboardTabId } from "@/lib/data/dashboard/tabs";

/**
 * Which dashboard tabs this account may open, in one place.
 *
 * The Agents page renders the strip and the first panel; the dashboard's own
 * loader (`app/(app)/agents/dashboard-actions.tsx`) serves every tab after
 * that. Both have to give the same answer — a tab the strip shows locked must
 * not open from a hand-made call, and one it shows open must not be refused —
 * so the rule lives here rather than inline in either.
 */

/**
 * A dashboard opens for any agent the account HAS — Ready, or bought and still
 * showing "Needs setup". Only Ready used to count, and Ready depends on finding
 * a setup row: an account with 124 lead-activity rows whose setup was done in
 * the legacy app, or whose setup read timed out, could never see any of it
 * (audit, 2026-09-29). Locked and coming-soon agents have nothing to report.
 */
export function opensDashboard(agentId: string, status: AgentRowStatus): boolean {
  return (
    hasDashboardTab(agentId) && (status === "ready" || status === "needs-setup" || status === "blocked")
  );
}

/**
 * The tabs whose agent is not bought (or not offered). They stay in the strip,
 * locked, and open that agent's page instead. Ads Leads belongs to no agent and
 * is always open.
 *
 * `statusById` must hold every OFFERED agent — the page fills a missing status
 * as "needs-setup" before calling this, so an agent absent from the map is one
 * this account is not offered at all.
 */
export function lockedDashboardTabs(statusById: ReadonlyMap<string, AgentRowStatus>): Set<DashboardTabId> {
  return new Set(
    DASHBOARD_TABS.filter((tab) => {
      if (tab.agentId === null) return false;
      const status = statusById.get(tab.agentId);
      return status === undefined || !opensDashboard(tab.agentId, status);
    }).map((tab) => tab.id),
  );
}
