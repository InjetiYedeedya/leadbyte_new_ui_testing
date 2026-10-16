import { safeReturnPath } from "@/lib/url-safety";
import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { PageLoading } from "@/components/ui/page-loading";
import { getAdsLeads } from "@/lib/data/ads-leads";
import { getSelectedLeadIds } from "@/lib/data/lead-selection";
import { AdsLeadsSelector } from "@/components/agents/ads-leads-selector";
import { saveLeadSelection } from "./actions";

export const metadata: Metadata = { title: "Choose ads leads · LeadByte" };

/**
 * Lead Qualification only, today — the one agent `LeadSourcePicker` offers
 * "Use my ads leads" for. Any other `agentId` 404s rather than rendering an
 * empty picker for an agent that has no ad leads to choose from.
 */
async function AdsLeadsPageBody({ agentId, from }: { agentId: string; from: string }) {
  if (agentId !== "lead-qualification") notFound();

  const businessId = await currentBusinessId();
  const [leads, saved] = await Promise.all([
    getAdsLeads(businessId),
    getSelectedLeadIds(businessId),
  ]);
  // No cookie yet means nobody has narrowed the list down — default to
  // everyone, the same as this agent behaved before there was a picker page.
  const initiallySelected = saved ?? leads.map((lead) => lead.id);

  return (
    <PageContainer width="reading">
      <PageHeader
        title="Choose your ads leads"
        description="Pick which ad-captured leads Lead Qualification should score and email. Everything starts selected — uncheck anyone you want to leave out."
      />
      <AdsLeadsSelector
        leads={leads}
        initiallySelected={initiallySelected}
        from={from}
        action={saveLeadSelection}
      />
    </PageContainer>
  );
}

export default async function AdsLeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { agentId } = await params;
  const { from } = await searchParams;
  const safeFrom = safeReturnPath(from, "/agents");

  return (
    <PageShell activeTab="/agents" currentStageId="agents">
      <Suspense fallback={<PageLoading title="Choose ads leads" />}>
        <AdsLeadsPageBody agentId={agentId} from={safeFrom} />
      </Suspense>
    </PageShell>
  );
}
