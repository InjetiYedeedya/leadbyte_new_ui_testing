import { demoUnlocksAllowed } from "@/lib/api/config";
import { getAdminRole } from "@/lib/admin/access";
import { getEntitlements } from "@/lib/entitlements";
import { ALL_AGENT_IDS } from "@/lib/entitlements/agents";

/**
 * May this account RUN this agent?
 *
 * Built and tested since August, and never called: every agent ran for any
 * free signup, as often as they liked, at the platform's cost (audit,
 * 2026-09-25). Decided with the product owner: an agent runs only for an
 * account that bought it or was granted it (Admin → Grant access).
 *
 * - Agents that are not sold (AEO, the strategy chat) are not gated here.
 * - Staff admins can always run everything, so the team can test live.
 * - Local demo mode unlocks everything, the same rule as elsewhere.
 * - A read that fails refuses: failing closed is the only safe direction for
 *   a paywall.
 *
 * `email` must be the SIGNED session identity (`getSession().businessId`).
 */
export async function canRunAgent(agentId: string, email: string): Promise<boolean> {
  if (!ALL_AGENT_IDS.includes(agentId)) return true;
  if (demoUnlocksAllowed()) return true;
  try {
    if ((await getAdminRole(email)) !== null) return true;
    return (await getEntitlements(email)).canAccess(agentId);
  } catch (error) {
    console.error(`[entitlements] could not check ${agentId} for ${email}:`, error);
    return false;
  }
}

// Lives in its own module so the pure run-gate table can use it too.
export { UNLOCK_MESSAGE } from "./messages";
