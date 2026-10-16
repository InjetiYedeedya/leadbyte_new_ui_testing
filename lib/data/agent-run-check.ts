import { canRunAgent } from "@/lib/entitlements/guard";
import { adsAccountChosen, adsGateBlocks } from "@/lib/data/ads-gate-check";
import { getConnectedMailbox } from "@/lib/data/email-callback";
import { anySocialConnected } from "@/lib/data/social-connections";
import { connectionFor, firstUnmetStep, runGateCopy, type RunGateCopy, type RunStep } from "./agent-run-gate";

/**
 * May this account run this agent right now — and if not, what is missing?
 *
 * The live half of `agent-run-gate.ts`. Every Run entry point, on the page and
 * in the Server Actions, asks this one function, so the page never offers a
 * button the action will then refuse, and the action never trusts the page.
 *
 * `email` must be the SIGNED session identity. The connection is only read
 * once the purchase has passed: someone who has not bought the agent is sent
 * to Pricing, and the connection read would be wasted.
 *
 * Server-only (entitlements, the Frontend Check tables, cookies).
 */
export type AgentRunCheck = { ok: true } | ({ ok: false; step: RunStep } & RunGateCopy);

async function isConnected(agentId: string, email: string): Promise<boolean> {
  switch (connectionFor(agentId)) {
    case null:
      return true;
    case "googleAds":
    case "metaAds":
    case "linkedInAds":
      // A check that could not be made does not block — see `statusBlocks`.
      return !(await adsGateBlocks(agentId, email));
    case "mailbox":
      return (await getConnectedMailbox()) !== null;
    case "social":
      return anySocialConnected(email);
  }
}

export async function checkAgentRun(
  agentId: string,
  email: string,
  agentName = "this agent",
): Promise<AgentRunCheck> {
  const purchased = await canRunAgent(agentId, email);
  const connected = purchased ? await isConnected(agentId, email) : false;
  // Only asked once connected, and only for the ad platforms — which ad
  // account the campaign is created in (`agent-run-gate.ts`).
  const accountChosen = connected ? await adsAccountChosen(agentId, email) : true;
  const step = firstUnmetStep(agentId, { purchased, connected, accountChosen });
  if (step === null) return { ok: true };
  if (step === "connection") {
    console.warn(`[${agentId}] blocked: ${connectionFor(agentId)} not connected for ${email}`);
  }
  if (step === "account") {
    console.warn(`[${agentId}] blocked: no ad account chosen for ${email}`);
  }
  return { ok: false, step, ...runGateCopy(agentId, agentName, step) };
}
