"use server";

import { redirect } from "next/navigation";
import { currentBusinessId } from "@/components/page-shell";
import { getAdvertisingRepo } from "@/lib/data/advertising-repo";
import { getAgentRepo } from "@/lib/data/agent-repo";

/**
 * MOCK MODE ONLY. With a backend configured, LinkedIn connects through the real
 * consent flow (`/api/ads/connect?platform=linkedin-ads`) and the page never
 * renders this form — `HttpAdvertisingRepo.connectLinkedIn` still throws.
 *
 * Actually connects LinkedIn Ads: flips the platform's connected state and
 * unblocks the LinkedIn Ads agent (it was hard "blocked" specifically on
 * this account not being connected — see agent-repo.ts).
 */
async function performLinkedInConnect(businessId: string): Promise<void> {
  await getAdvertisingRepo().connectLinkedIn(businessId);
  await getAgentRepo().unblock(businessId, "linkedin-ads", "recommended");
}

export async function connectLinkedIn(): Promise<void> {
  const businessId = await currentBusinessId();

  // LinkedIn Ads was gated to the Scale tier, behind /upgrade. That route is
  // gone until the real plans are defined, so it connects directly — a gate
  // pointing at a page that no longer exists is a dead end, not a paywall.
  // `lib/gating/gate.ts` is kept intact for when the tiers come back.
  await performLinkedInConnect(businessId);
  redirect("/growth/advertising");
}
