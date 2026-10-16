import { readSignedText } from "@/lib/signed-text";
import { decodeBlockingCard } from "@/lib/data/ads-blocking-error";
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageLoading } from "@/components/ui/page-loading";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import { AGENT_DEFINITIONS } from "@/lib/data/agent-repo";
import type { AgentBackendId } from "@/lib/data/agent-setup";
import { getSuggestion } from "@/lib/data/ads-suggestion";
import { CampaignFrame } from "@/components/agents/campaign-frame";
import { AutomationModeForm } from "@/components/agents/automation-mode-form";
import { asksMode, campaignStepsFor, modeLast } from "@/lib/data/campaign-steps";
import { existingPostOf } from "@/lib/data/engagement-post";
import { chooseAutomationMode } from "../actions";

export const metadata: Metadata = { title: "Automation mode · LeadByte" };

/**
 * Google and Meta's automation step: Plan → Details → HERE → Creative (Full)
 * or launch (Semi). Product owner, 2026-10-06. Reached only once the details
 * form is done; landing here any earlier goes back to it.
 */
async function ModePageBody({
  params,
  searchParams,
}: {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ problems?: string; blocked?: string }>;
}) {
  const { agentId } = await params;
  const { problems: rawProblems, blocked: rawBlocked } = await searchParams;
  const definition = AGENT_DEFINITIONS.find((d) => d.id === agentId);
  if (!definition || !modeLast(agentId)) notFound();

  const businessId = await currentBusinessId();
  const suggestion = await getSuggestion(businessId, agentId);
  if (!suggestion?.semiAsked) redirect(`/agents/${agentId}`);
  if (!suggestion.answers) redirect(`/agents/${agentId}/semi`);
  // Full-only campaigns skip this step (`asksMode`); an old link lands on the
  // details form, whose submit carries them on.
  if (!asksMode(agentId, suggestion.semiAllowed, existingPostOf(suggestion.launchExtras))) {
    redirect(`/agents/${agentId}/semi`);
  }

  const typedId = agentId as AgentBackendId;
  // Signed by the action that redirected here; anything else shows nothing.
  const problems = readSignedText(rawProblems) ?? undefined;

  async function choose(formData: FormData) {
    "use server";
    await chooseAutomationMode(typedId, formData);
  }

  return (
    <CampaignFrame
      step="mode"
      steps={campaignStepsFor(agentId)}
      title="How should this campaign be handled?"
      back={{ href: `/agents/${agentId}/semi`, label: "Back to the details" }}
      blocked={decodeBlockingCard(rawBlocked)}
      problems={problems ? problems.split(" | ").filter(Boolean) : undefined}
      intro="Choose full automation to have the agent write the creative, or semi automation to supply your own. Nothing launches until you confirm."
    >
      <AutomationModeForm
        action={choose}
        creativeStep={agentId === "meta-ads" ? "meta" : agentId === "linkedin-ads" ? "linkedin" : "google"}
        semiAllowed={suggestion.semiAllowed !== false}
        backHref={`/agents/${agentId}/semi`}
      />
    </CampaignFrame>
  );
}

export default function ModePage(props: Parameters<typeof ModePageBody>[0]) {
  return (
    <PageShell activeTab="/agents" currentStageId="agents">
      <Suspense fallback={<PageLoading title="Automation mode" />}>
        <ModePageBody {...props} />
      </Suspense>
    </PageShell>
  );
}
