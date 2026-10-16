/**
 * Where an ad campaign's LAUNCH is sent: the campaign creator (`adsreceiver`
 * / LinkedIn's `ads-receiver`), or the platform's own semi workflow.
 *
 * One rule, pulled out of `launchCampaign` (an untested Server Action) so it is
 * pinned by a test — because getting it wrong is silent. Google semi launches
 * went to `/api/webhook/google-ads-semi`, n8n's `googleads` PLANNING
 * workflow, and never reached `adsreceiver`; the screen said the campaign was
 * being created and n8n received nothing (confirmed by the backend team,
 * 2026-09-30). Meta had the same fault until its launch moved to the receiver.
 *
 * - **Google and Meta always create through the receiver**, full or semi —
 *   the legacy flow's one address for both (campaign-flow guide §6); the
 *   receiver reads `automationMode` to tell the two apart.
 * - **LinkedIn semi alone** launches through its own semi workflow, with ONE
 *   post (LINKEDIN_ADS_FLOW.md 6.4b).
 */
export type LaunchTarget = "receiver" | "semi";

export function launchTarget(agentId: string, mode: "full" | "semi"): LaunchTarget {
  return agentId === "linkedin-ads" && mode === "semi" ? "semi" : "receiver";
}
