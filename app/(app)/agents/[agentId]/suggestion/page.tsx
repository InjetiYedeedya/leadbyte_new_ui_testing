import { readSignedText } from "@/lib/signed-text";
import { decodeBlockingCard } from "@/lib/data/ads-blocking-error";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import Link from "@/components/ui/app-link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import { AGENT_DEFINITIONS } from "@/lib/data/agent-repo";
import { agentBackend, type AgentBackendId } from "@/lib/data/agent-setup";
import { getSuggestion, parseSuggestion } from "@/lib/data/ads-suggestion";
import { SuggestionReview } from "@/components/agents/suggestion-review";
import { CampaignFrame } from "@/components/agents/campaign-frame";
import { approveSuggestion, reviseSuggestion, sendUserSuggestion } from "../actions";
import { campaignStepsFor, modeLast } from "@/lib/data/campaign-steps";
import { existingPostOf } from "@/lib/data/engagement-post";

export const metadata: Metadata = { title: "Campaign suggestion · LeadByte" };

/**
 * The plan the agent proposed, and the decision about it.
 *
 * ## Why this is its own page
 *
 * Approving a campaign spends money, and the setup form's own submit does not.
 * Keeping them on one screen would put "get a suggestion" and "launch a
 * campaign" a few pixels apart. A separate URL also means the decision survives
 * a refresh and can be linked to.
 *
 * ## Why landing here without a suggestion is a redirect, not a 404
 *
 * The store is in memory (`devGlobal`), so a restart loses it while the agent
 * keeps its own session. Sending someone back to the setup form is honest — the
 * plan really is gone — and 404 would suggest the page itself was wrong.
 */
async function SuggestionPageBody({
  params,
  searchParams,
}: {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ problems?: string; blocked?: string }>;
}) {
  const { agentId } = await params;
  const { problems: rawProblems, blocked: rawBlocked } = await searchParams;
  // A refusal with a fix, as a card (`BlockingErrorCardView`). Signed.
  const blocked = decodeBlockingCard(rawBlocked);
  // Signed by the action that redirected here; a link carrying any other text
  // shows nothing rather than words someone else chose (audit, 2026-09-29).
  const problems = readSignedText(rawProblems) ?? undefined;

  const definition = AGENT_DEFINITIONS.find((d) => d.id === agentId);
  // Only the agents with a chat webhook have a suggestion step at all.
  if (!definition || !agentBackend(agentId)?.chatPath) notFound();

  const businessId = await currentBusinessId();
  const suggestion = await getSuggestion(businessId, agentId);
  if (!suggestion) {
    redirect(`/agents/${agentId}`);
  }

  const typedId = agentId as AgentBackendId;

  // Bound to this agent here, so the client island takes plain callbacks and
  // never has to know which agent it is rendering.
  async function approve(formData: FormData) {
    "use server";
    await approveSuggestion(typedId, formData);
  }

  async function revise() {
    "use server";
    await reviseSuggestion(typedId);
  }

  async function suggest(formData: FormData) {
    "use server";
    await sendUserSuggestion(typedId, formData);
  }

  return (
    <CampaignFrame
      step="plan"
      steps={campaignStepsFor(agentId, suggestion.semiAllowed, existingPostOf(suggestion.launchExtras))}
      title="Review the campaign before it runs"
      back={{ href: `/agents/${agentId}`, label: definition.name }}
      blocked={blocked}
      problems={problems ? [problems] : undefined}
      intro={
        <>
          Nothing has been spent yet. Approve this plan, ask for a rewrite, or tell the agent
          what to change.
          {suggestion.revisions > 0 &&
            ` Revised ${suggestion.revisions} time${suggestion.revisions === 1 ? "" : "s"}.`}
        </>
      }
    >
      <SuggestionReview
        sections={parseSuggestion(suggestion.output)}
        userDetails={suggestion.userDetails}
        onApprove={approve}
        onRevise={revise}
        onSuggest={suggest}
        // Only used where the plan still asks Full or Semi. Google, Meta and
        // (since 2026-10-08) LinkedIn ask it after the details instead, on
        // /mode, where each collects its own creative.
        creativeStep={
          agentId === "meta-ads" ? "meta" : agentId === "google-ads" ? "google" : null
        }
        semiAllowed={suggestion.semiAllowed !== false}
        modeLater={modeLast(agentId)}
      />
    </CampaignFrame>
  );
}

/**
 * The page's own reads sit behind a boundary so the frame does not wait on
 * them. Without it the whole screen — header, tabs, rail — was held back until
 * the slowest backend read landed, and a click showed the previous page for
 * the entire wait. See the note on `PageShell`; this is NOT a route-level
 * `loading.tsx` (rule 0).
 */
export default function SuggestionPage(props: Parameters<typeof SuggestionPageBody>[0]) {
  return (
    <PageShell activeTab="/agents" currentStageId="agents">
      <Suspense fallback={<PageLoading title="The agent's plan" />}>
        <SuggestionPageBody {...props} />
      </Suspense>
    </PageShell>
  );
}
