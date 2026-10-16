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
import { getSuggestion } from "@/lib/data/ads-suggestion";
import { creativesFor } from "@/lib/data/ads-creatives";
import { fetchCountryNames } from "@/lib/data/countries";
import { SemiForm } from "@/components/agents/semi-form";
import { CampaignFrame } from "@/components/agents/campaign-frame";
import { asksMode, campaignStepsFor } from "@/lib/data/campaign-steps";
import { existingPostOf } from "@/lib/data/engagement-post";
import { submitSemiForm } from "../actions";
import { adjustSemiFields, isLocationField } from "@/lib/data/semi-form";
import { PICKS_SUFFIX, decodePicks } from "@/lib/data/location-picks";

export const metadata: Metadata = { title: "Complete the campaign · LeadByte" };

/**
 * Semi automation, step two: the fields the agent asked for.
 *
 * Reached only by choosing Semi on the approved suggestion, because the field
 * list comes from that call — `POST /api/webhook/{platform}-ads-semi` answers
 * with the schema, and there is nothing to render without it. Landing here
 * cold redirects to the agent rather than 404ing: the campaign is real, the
 * question list simply is not in memory any more.
 */
async function SemiFormPageBody({
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

  // Gated on having ASKED, not on having fields: a platform with no extra
  // questions still needs its creative collected.
  if (!suggestion?.semiAsked) {
    redirect(`/agents/${agentId}`);
  }

  const typedId = agentId as AgentBackendId;
  // An Engagement campaign promoting a post that already exists launches
  // from this form: no automation step, no creative (LBS-1253).
  const existingPost = existingPostOf(suggestion.launchExtras);
  // Fetched on the server and handed down as a prop — the location control is
  // a client island and never fetches for itself.
  const countries = await fetchCountryNames();

  // Refilled from the last refused submit when there was one (`semiDraft`),
  // else from the answers already submitted — "Back to the details" from
  // /mode or /creative showed every field at its default and the places gone
  // (review, 2026-10-08). Every field through its default, the places through
  // the picker; with neither, the places start from the Google setup's picks.
  const draft = suggestion.semiDraft ?? suggestion.answers;
  const fields = adjustSemiFields(agentId, suggestion.semiFields ?? []).map((field) => ({
    ...field,
    defaultValue: draft?.[field.label] ?? field.defaultValue,
  }));
  const locationLabel = fields.find(isLocationField)?.label;
  const draftPicks = locationLabel ? draft?.[`${locationLabel}${PICKS_SUFFIX}`] : undefined;
  const initialPicks = draftPicks !== undefined ? decodePicks(draftPicks) : (suggestion.setupLocations ?? []);

  async function submit(formData: FormData) {
    "use server";
    await submitSemiForm(typedId, formData);
  }

  return (
    <CampaignFrame
      step="details"
      steps={campaignStepsFor(agentId, suggestion.semiAllowed, existingPost)}
      title="Complete the campaign"
      back={{ href: `/agents/${agentId}/suggestion`, label: "Back to the plan" }}
      blocked={blocked}
      problems={problems ? problems.split(" | ").filter(Boolean) : undefined}
      intro={
        existingPost !== ""
          ? "The agent needs these details to promote your post. The campaign is created when you submit — there is no ad to design."
          : asksMode(agentId, suggestion.semiAllowed) && suggestion.mode === undefined
          ? "The agent needs these details to build the campaign. Next you'll choose full or semi automation — nothing launches until then."
          : suggestion.mode === "semi"
          ? "You are supplying the creative yourself. The agent needs these details to build the campaign around it — nothing launches until you submit."
          : "The agent needs these details first. Once you submit, three creative prompts are written and the campaign launches after you pick one."
      }
    >
      {/* The creative prompt picker used to sit here, above the form, and
          started generating on mount. It has moved to its own step
          (`/creative`) because it CANNOT run before this form is submitted:
          the ad type it writes from — Image / Video / Carousel — is a field in
          this very form, so generating first meant guessing the format. Full
          automation lands there on submit; semi launches directly and never
          sees it. */}
      <SemiForm
        action={submit}
        fields={fields}
        // Every platform collects its creative at the Semi choice now (/mode),
        // so none gets `creatives` inputs here. The LinkedIn branch only
        // serves a campaign that chose Semi on the plan before 2026-10-08.
        creatives={
          suggestion.mode === "semi" && agentId === "linkedin-ads" ? creativesFor(typedId) : []
        }
        countries={countries}
        // Google and Meta ask it on the automation step instead, with Full —
        // unless the campaign is full-only and that step is skipped.
        askSelectionMode={
          suggestion.mode !== "semi" &&
          !(asksMode(agentId, suggestion.semiAllowed, existingPost) && suggestion.mode === undefined)
        }
        initialPicks={initialPicks}
        backHref={`/agents/${agentId}/suggestion`}
      />
    </CampaignFrame>
  );
}

export default function SemiFormPage(props: Parameters<typeof SemiFormPageBody>[0]) {
  return (
    <PageShell activeTab="/agents" currentStageId="agents">
      <Suspense fallback={<PageLoading title="A few more details" />}>
        <SemiFormPageBody {...props} />
      </Suspense>
    </PageShell>
  );
}
