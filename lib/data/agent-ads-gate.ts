/**
 * Which ad agents cannot run until their ad account is connected.
 *
 * ## Why all three ad agents
 *
 * The legacy app locked `/agents/linkedin-ads` behind an `OAuthRequirementGuard`
 * (LINKEDIN_ADS_FLOW.md section 2): without a connected ad account there is
 * nowhere to create the campaign, so the setup form collects a budget and a
 * brief for a launch that cannot happen. Google and Meta were left open at
 * first; on 2026-09-25 the product owner made it the rule for all three
 * (purchase first, then the ad account — see `agent-run-gate.ts`).
 *
 * ## Why an unreadable check does not block
 *
 * `checkOAuthStatus` answers `error` when it could not reach the table, which
 * the Connections page labels "Unknown", never "failed". Locking the agent on
 * that would stop someone whose connection is very likely fine, because the
 * backend was slow for a moment. Only a definite "not connected" or "expired"
 * blocks.
 *
 * ## Why this is a module and not a check inside the action
 *
 * Same reason as `agent-social-gate.ts`: the rule is enforced twice, in the
 * Server Action (the real gate) and on the page (which explains it instead of
 * showing a form the action will refuse), so one list keeps them agreeing.
 *
 * Client-safe: ids and sentences only. The live read is `ads-gate-check.ts`.
 */

import type { OAuthPlatform, OAuthStatus } from "@/lib/api/oauth-status";

// All three ad agents since 2026-09-25: the product rule is purchase first,
// then the ad account, for Google and Meta as well as LinkedIn. The table of
// record is `agent-run-gate.ts`; this stays for the readers that ask it.
const GATED: Record<string, OAuthPlatform> = {
  "google-ads": "googleAds",
  "meta-ads": "metaAds",
  "linkedin-ads": "linkedInAds",
};

/** The connection this agent needs before it can run, or null when it needs none. */
export function adsConnectionFor(agentId: string): OAuthPlatform | null {
  return GATED[agentId] ?? null;
}

/** True when this agent is locked until its ad account is connected. */
export function requiresAdsConnection(agentId: string): boolean {
  return adsConnectionFor(agentId) !== null;
}

/** Whether a status reading should lock the agent. `error` deliberately does not. */
export function statusBlocks(status: OAuthStatus): boolean {
  // `pending`: consent given, no account chosen — nothing to run against.
  return status === "not-connected" || status === "expired" || status === "pending";
}

/** What to tell someone who has not connected one. */
export const ADS_GATE_MESSAGE =
  "Connect your LinkedIn Ads account first. This agent creates the campaign inside your " +
  "LinkedIn ad account, so it needs one to be connected and chosen.";
