import { isBackendConfigured } from "@/lib/api/config";
import { accountChoice, checkOAuthStatus, hasChosenAccount, type AccountChoice } from "@/lib/api/oauth-status";
import { adsConnectionFor, statusBlocks } from "@/lib/data/agent-ads-gate";

/**
 * The live half of `agent-ads-gate.ts`: is this agent locked for this account
 * right now?
 *
 * Server-only (it reads the Frontend Check table). With no backend configured
 * nothing is locked, the same rule as entitlements: an unconfigured
 * environment is a working one, and the seeded demo has its own "blocked"
 * state for LinkedIn in `agent-repo.ts`.
 */
export async function adsGateBlocks(agentId: string, email: string): Promise<boolean> {
  const platform = adsConnectionFor(agentId);
  if (platform === null || !isBackendConfigured()) return false;
  const { status } = await checkOAuthStatus(platform, email);
  return statusBlocks(status);
}

/**
 * Has this account picked the ad account an ad agent creates campaigns in?
 * True for agents that need none, with no backend, and when it cannot be
 * read — only a definite "nothing chosen" blocks (`hasChosenAccount`).
 */
export async function adsAccountChosen(agentId: string, email: string): Promise<boolean> {
  const platform = adsConnectionFor(agentId);
  if (platform === null || !isBackendConfigured()) return true;
  return hasChosenAccount(platform, email);
}

/**
 * Whether the page should mention that no ad account pick is on record —
 * `unknown` from `accountChoice` — without blocking anything. Null for agents
 * with no ad account, or with no backend.
 */
export async function adsAccountChoice(agentId: string, email: string): Promise<AccountChoice | null> {
  const platform = adsConnectionFor(agentId);
  if (platform === null || !isBackendConfigured()) return null;
  return accountChoice(platform, email);
}
