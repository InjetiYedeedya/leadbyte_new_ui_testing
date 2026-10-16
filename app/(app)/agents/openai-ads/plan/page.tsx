import { readSignedText } from "@/lib/signed-text";
import { FlashNotice } from "@/components/ui/flash-notice";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { redirect } from "next/navigation";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import { PageLoading } from "@/components/ui/page-loading";
import { getAdsDraft } from "@/lib/data/ads-draft";
import { AdsPlanEditor } from "@/components/agents/ads-plan-editor";
import { CampaignSteps } from "@/components/agents/campaign-steps";
// From the plain module, not the client one: importing the helper from a
// `"use client"` file makes it a client reference that a Server Component
// cannot call.
import { adsApiSteps } from "@/lib/data/campaign-steps";
import { needsBidAmount } from "@/lib/data/ads-campaign-request";
import { AdsDestinationPanel } from "@/components/agents/ads-destination-panel";
import { continueToReview, redraftAdsCopy, supplyAdsDestinations } from "../actions";
import { PageContainer } from "@/components/ui/page-container";

export const metadata: Metadata = { title: "Campaign plan · LeadByte" };

/**
 * What the ads service said about the campaign, before any money is involved.
 *
 * Everything on this page came from three real calls made by the setup form —
 * `read_website`, `advise` and `generate` — none of which touch the customer's
 * advertiser account. So this screen is reachable, and useful, before an
 * account is connected at all.
 *
 * ## Why it lives under `agents/openai-ads/` and not `agents/[agentId]/`
 *
 * The shared flow pages (`suggestion`, `semi`, `creative`) all `notFound()`
 * unless the agent has an n8n `chatPath`, which this one will never have. A
 * static segment here does NOT shadow `[agentId]/page.tsx`, because it only
 * claims the deeper `/plan` path — `/agents/openai-ads` itself still renders
 * the agent workspace with its activity timeline and status badge.
 */
async function PlanPageBody({
  searchParams,
}: {
  searchParams: Promise<{
    problem?: string;
    saved?: string;
    replied?: string;
    redrafted?: string;
    linked?: string;
  }>;
}) {
  const { problem: rawProblem, saved, replied, redrafted, linked } = await searchParams;
  // Signed by the action that redirected here; a link carrying any other text
  // shows nothing rather than words someone else chose (audit, 2026-09-29).
  const problem = readSignedText(rawProblem) ?? undefined;
  const businessId = await currentBusinessId();
  const draft = await getAdsDraft(businessId);

  // No draft means the setup form was never completed, or the two-hour cookie
  // lapsed. A redirect, not a 404: the page is fine, there is simply nothing
  // to show yet, and step one is where that is fixed.
  if (!draft?.copy) redirect("/agents/openai-ads");

  const { setup, site, advice, copy } = draft;

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-5xl">
        <Link
          href="/agents/openai-ads"
          className="text-sm text-ink-soft transition-colors hover:text-ink"
        >
          ← Campaign setup
        </Link>

        <div className="mt-4">
          <CampaignSteps current="plan" steps={adsApiSteps(draft.adType)} />
        </div>

        <h1 className="mt-6 text-lg font-bold text-ink">Your campaign plan</h1>
        <p className="mt-1 max-w-prose text-sm text-ink-soft">
          Written by the ads service from your website and settings. Nothing has been created and
          nothing has been charged.
        </p>

        {problem && (
          <FlashNotice role="alert" clear={["problem"]} className="mt-6 rounded-lg bg-crit-soft px-4 py-3 text-sm text-crit">
            {problem}
          </FlashNotice>
        )}

        {(saved || redrafted || linked) && (
          <FlashNotice clear={["saved", "redrafted", "linked"]} className="mt-6 rounded-lg bg-good-soft px-4 py-3 text-sm text-good">
            {saved
              ? "Advert saved."
              : linked
                ? "Links saved. The advert was written again with them."
                : "Rewritten. The previous draft is gone."}
          </FlashNotice>
        )}

        {/* What it said back. Shown above the advice it revises, because it is
            an answer to something the customer just typed and burying it under
            the cards it changed reads as having been ignored. */}
        {replied && advice?.reply && (
          <FlashNotice clear={["replied"]} duration={12_000} className="mt-6 rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
            {advice.reply}
          </FlashNotice>
        )}

        {/* The goal was changed under them. This is money, so it is said first
            and said plainly — not folded into a list of notes. */}
        {advice?.downgraded && (
          <p role="alert" className="mt-6 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
            <span className="font-medium">This campaign was adjusted.</span> Your goal could not be
            delivered as asked, so it will run as{" "}
            <span className="font-medium">{advice.objective ?? "a safer objective"}</span> instead.
          </p>
        )}

        <section className="mt-6 rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">
            How it will run
          </h2>
          <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Fact label="Goal" value={setup.goal} />
            <Fact label="Objective" value={advice?.objective ?? "—"} />
            <Fact
              label="Budget"
              value={`${setup.budgetAmount} ${setup.budgetType}`}
            />
            {/* What they will be charged FOR, which is not the same question as
                how much — and is the one nobody thinks to ask until the bill. */}
            <Fact label="Charged for" value={advice?.billingBasis ?? "—"} />
            <Fact label="Runs" value={`${setup.startDate} → ${setup.endDate}`} />
            <Fact label="Platforms" value={setup.platforms.join(", ")} />
          </dl>
        </section>

        {advice && advice.risks.length > 0 && (
          <section className="mt-4 rounded-lg border border-warn/30 bg-warn-soft p-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-warn">
              Worth knowing
            </h2>
            <ul className="mt-2 space-y-1.5 text-sm text-ink">
              {advice.risks.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Above the advert: a campaign whose link is still missing is not one
            anybody should be polishing the wording of. */}
        <AdsDestinationPanel destination={draft.destination} supply={supplyAdsDestinations} />

        {/* Keyed on the copy: the editor seeds its fields from props once,
            and "Write it again" (or the destination panel's "Save and rewrite
            the advert") lands back on this same route as a soft navigation,
            so without a remount the new draft arrived and the fields kept the
            old text — and Continue saved the old text over the new. */}
        <AdsPlanEditor
          key={`${copy.title}|${copy.description}|${copy.topics.join(",")}`}
          copy={copy}
          adType={draft.adType ?? "semi"}
          bidAmount={setup.bidAmount}
          needsBid={needsBidAmount(setup, advice?.bidding)}
          bidding={advice?.bidding}
          notes={[]}
          save={continueToReview}
          redraft={redraftAdsCopy}
        />

        {site?.title && (
          <p className="mt-4 text-xs text-ink-soft">
            Written from <span className="text-ink">{site.title}</span>.
          </p>
        )}

      </div>
    </PageContainer>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

/**
 * The page's reads sit behind a boundary so the frame does not wait on them.
 * NOT a route-level `loading.tsx` — see rule 0 in CLAUDE.md.
 */
export default function PlanPage(props: Parameters<typeof PlanPageBody>[0]) {
  return (
    <PageShell activeTab="/agents" currentStageId="agents" showConnectPrompt={false}>
      <Suspense fallback={<PageLoading title="Your campaign plan" />}>
        <PlanPageBody {...props} />
      </Suspense>
    </PageShell>
  );
}
