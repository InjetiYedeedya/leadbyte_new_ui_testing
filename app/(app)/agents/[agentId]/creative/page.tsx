import { readSignedText } from "@/lib/signed-text";
import { decodeBlockingCard } from "@/lib/data/ads-blocking-error";
import { BackLink } from "@/components/ui/back-link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageLoading } from "@/components/ui/page-loading";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import { AGENT_DEFINITIONS } from "@/lib/data/agent-repo";
import { agentBackend, type AgentBackendId } from "@/lib/data/agent-setup";
import { getSuggestion } from "@/lib/data/ads-suggestion";
import { adTypeFromAnswers } from "@/lib/data/semi-form";
import { CreativePromptPicker } from "@/components/agents/creative-prompt-picker";
import { CampaignFrame } from "@/components/agents/campaign-frame";
import { asksMode, campaignStepsFor } from "@/lib/data/campaign-steps";
import type { PromptChoice } from "@/lib/data/creative-prompts";
import { chooseAndLaunch, launchCampaign, pollCreativePrompts } from "../actions";

export const metadata: Metadata = { title: "Choose the creative · LeadByte" };

/**
 * The last step of a full-automation launch: pick the creative direction.
 *
 * ## Why it is its own page
 *
 * The three prompts are written from the ad type — Image, Video or Carousel —
 * and the agent asks for that in the campaign-details form. So generation
 * cannot start until that form is submitted, which rules out showing this
 * beside the form (it used to be, and it guessed `"image"` every time).
 *
 * The order is therefore: details form -> submit -> prompts are written ->
 * pick one -> the campaign launches. Nothing reaches the executor before the
 * pick, which is the point: the chosen prompt rides out with the launch body
 * as `selected_prompt`.
 *
 * ## Semi never comes here
 *
 * Semi supplies finished creative, so there is no prompt to write. It launches
 * straight from the details form. Landing here in semi mode is a wrong turn
 * rather than a state, so it redirects instead of rendering an empty step.
 */
async function CreativePageBody({
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
  if (!definition || !agentBackend(agentId)?.semiPath) notFound();

  const businessId = await currentBusinessId();
  const suggestion = await getSuggestion(businessId, agentId);

  // Gated on the ANSWERS, not on the schema: this step exists only once the
  // details form has actually been completed, because that is what the
  // prompts are written from and what the launch will send.
  if (!suggestion?.answers) {
    redirect(`/agents/${agentId}/semi`);
  }
  if (suggestion.mode === "semi") {
    redirect(`/agents/${agentId}`);
  }
  // Google and Meta choose Full or Semi after the details: not chosen yet.
  if (asksMode(agentId, suggestion.semiAllowed) && suggestion.mode === undefined) {
    redirect(`/agents/${agentId}/mode`);
  }

  const typedId = agentId as AgentBackendId;
  const adType = adTypeFromAnswers(suggestion.answers);

  async function poll() {
    "use server";
    return pollCreativePrompts();
  }

  async function choose(choice: PromptChoice) {
    "use server";
    return chooseAndLaunch(typedId, choice);
  }

  async function skip() {
    "use server";
    await launchCampaign(typedId);
  }

  // One previous step for both back controls: the bottom one went to the
  // details even when automation mode came in between (LBS-1147 g).
  const back = asksMode(agentId, suggestion.semiAllowed)
    ? { href: `/agents/${agentId}/mode`, label: "Back to automation mode" }
    : { href: `/agents/${agentId}/semi`, label: "Back to the details" };

  return (
    <CampaignFrame
      step="creative"
      steps={campaignStepsFor(agentId, suggestion.semiAllowed)}
      title="Choose the creative"
      back={back}
      blocked={blocked}
      problems={problems ? [problems] : undefined}
      intro={
        <>
          Your campaign is ready. Three models are each writing a{" "}
          <span className="font-medium text-ink">{adType}</span> prompt from the details you
          gave — pick the direction you want and the campaign launches.
        </>
      }
    >
      {/* Skip lives inside the picker so it and the prompt picks lock each
          other while one of them is launching. */}
      <CreativePromptPicker
        alreadyWriting
        onPoll={poll}
        onChoose={choose}
        onSkip={skip}
        back={<BackLink fallbackHref={back.href} history={false} />}
      />
    </CampaignFrame>
  );
}

export default function CreativePage(props: Parameters<typeof CreativePageBody>[0]) {
  return (
    <PageShell activeTab="/agents" currentStageId="agents">
      <Suspense fallback={<PageLoading title="Choose the creative" />}>
        <CreativePageBody {...props} />
      </Suspense>
    </PageShell>
  );
}
