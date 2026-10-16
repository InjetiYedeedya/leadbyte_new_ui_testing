import { liveAgentStates } from "@/lib/data/agent-live-status";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import { OVERVIEW_TABS } from "@/lib/nav";
import { absoluteUrl, firstFilled, isFilled } from "@/lib/data/profile-display";
import { getBusinessProfileRepo } from "@/lib/data/business-profile-repo";
import { getWebsiteAuditRepo } from "@/lib/data/website-audit-repo";
import { getGeoAnalysisRepo } from "@/lib/data/geo-analysis-repo";
import { getAdvertisingRepo } from "@/lib/data/advertising-repo";
import { getAgentRepo, visibleAgentDefinitions } from "@/lib/data/agent-repo";
import { agentAttentionBreakdown } from "@/lib/data/agent-status";
import {
  actionKind,
  buildActions,
  buildHeroStats,
  buildOpportunities,
  orderForSummary,
  scoreTone,
  summarySentence,
  SUMMARY_AGENT_DESCRIPTIONS,
  DEFAULT_BUSINESS_NAME,
} from "@/lib/data/overview-summary";
import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page-container";
import { OverviewDashboard, type OverviewDashboardData } from "@/components/overview/overview-dashboard";
import { OverviewHero } from "@/components/overview/overview-hero";

export const metadata: Metadata = { title: "Business overview · LeadByte" };

/**
 * How many agent tiles show before the "+N more" tile — enough for every
 * agent in `SUMMARY_AGENT_ORDER`, which lead the list.
 */
const VISIBLE_AGENT_TILES = 7;

async function OverviewPageBody() {
  const businessId = await currentBusinessId();

  const [profile, audit, geo, ads, agentStates] = await Promise.all([
    getBusinessProfileRepo().get(businessId),
    getWebsiteAuditRepo().get(businessId),
    getGeoAnalysisRepo().get(businessId),
    getAdvertisingRepo().get(businessId),
    liveAgentStates(businessId),
  ]);

  // Same shared breakdown the Agents tab badge reads, so the two screens
  // cannot disagree about how many agents need setup (see `agent-status.ts`).
  const attention = agentAttentionBreakdown(agentStates);
  const visibleAgents = orderForSummary(visibleAgentDefinitions());
  const actions = buildActions({ profile, audit, geo, ads, agentStates, agents: visibleAgents });
  const opportunities = buildOpportunities({ audit, geo, ads, needsSetup: attention.needsSetup });

  const stateById = new Map(agentStates.map((state) => [state.agentId, state]));
  const websiteHref = absoluteUrl(profile?.websiteUrl);
  const aiBots = geo?.aiBots ?? [];
  const firstSubScore = geo?.subScores?.[0] ?? null;

  const adsState: OverviewDashboardData["ads"]["state"] =
    !ads ? "not-connected" : ads.conversions === 0 ? "no-conversions" : "available";

  const data: OverviewDashboardData = {
    business: {
      name: firstFilled(profile?.businessName) ?? DEFAULT_BUSINESS_NAME,
      websiteHref: isFilled(websiteHref) ? websiteHref : null,
      websiteLabel: firstFilled(profile?.websiteUrl)
        ?.replace(/^https?:\/\//, "")
        .replace(/\/$/, "") ?? null,
      tags: [profile?.industry, profile?.businessType].filter(isFilled),
      logo: firstFilled(profile?.brand?.logo) ?? null,
      description: isFilled(profile?.description) ? profile.description : null,
      // One clean sentence out of that crawled text (`summarySentence`).
      summary: summarySentence(profile?.description, firstFilled(profile?.businessName) ?? ""),
      // The real homepage headline the crawler found — never a synthesized
      // "value proposition"; there is no field anywhere that models one.
      headline: firstFilled(profile?.brand?.messaging?.[0]?.text) ?? null,
      industry: firstFilled(profile?.industry) ?? null,
    },
    audit: audit
      ? {
          score: audit.score,
          tone: scoreTone(audit.score),
          totalIssues: audit.totalIssues,
          pagesCrawled: audit.pagesCrawled,
          criticalCount: audit.criticalCount,
          highCount: audit.highCount,
          mediumCount: audit.mediumCount,
          lowCount: audit.lowCount,
          analysedAt: audit.analysedAt ?? null,
        }
      : null,
    geo: geo
      ? {
          score: geo.score,
          tone: scoreTone(geo.score),
          aiBotsAllowed: aiBots.length > 0 ? aiBots.filter((b) => b.access === "allowed").length : null,
          aiBotsTotal: aiBots.length > 0 ? aiBots.length : null,
          totalIssues: geo.totalIssues ?? null,
          subScoreLabel: firstSubScore?.label ?? null,
          subScoreValue: firstSubScore?.score ?? null,
        }
      : null,
    ads: {
      state: adsState,
      conversions: ads?.conversions ?? 0,
      cpa: ads && adsState === "available" ? ads.cpa : null,
    },
    agents: {
      needsSetup: attention.needsSetup,
      // The Agents tab's badge counts every agent; saying "9 of 10" ties the
      // two numbers together instead of leaving them to look like a mismatch.
      total: visibleAgents.length,
      tiles: visibleAgents.slice(0, VISIBLE_AGENT_TILES).map((def) => ({
        id: def.id,
        name: def.name,
        description: SUMMARY_AGENT_DESCRIPTIONS[def.id] ?? def.description,
        status: stateById.get(def.id)?.status ?? "needs-setup",
      })),
      moreCount: Math.max(0, visibleAgents.length - VISIBLE_AGENT_TILES),
    },
    actions: actions.map((action) => ({
      title: action.title,
      reason: action.reason,
      href: action.href,
      cta: action.cta,
      kind: actionKind(action),
    })),
    openCount: actions.length,
    opportunities,
  };

  const heroStats = buildHeroStats({
    audit: data.audit,
    opportunities: data.opportunities,
    openCount: data.openCount,
  });

  return (
    <>
      <PageContainer>
        {/* The opening text is a server element handed to the client stack,
            which pins it, docks the first card under it and fades it as the
            second card slides past. */}
        <OverviewDashboard
          data={data}
          hero={
            <OverviewHero
              websiteLabel={data.business.websiteLabel}
              stats={heroStats}
              analysed={data.audit !== null}
              entranceClass="reveal-up"
            />
          }
        />
      </PageContainer>
    </>
  );
}

/**
 * The page's own reads sit behind a boundary so the frame does not wait on
 * them. Without it the whole screen — header, tabs, rail — was held back until
 * the slowest backend read landed, and a click showed the previous page for
 * the entire wait. See the note on `PageShell`; this is NOT a route-level
 * `loading.tsx` (rule 0).
 */
export default function OverviewPage() {
  return (
    <PageShell
      activeTab="/overview"
      currentStageId="audit"
      subTabs={OVERVIEW_TABS}
      subTabActive="/overview"
    >
      <Suspense fallback={<PageLoading title="Business overview" />}>
        <OverviewPageBody />
      </Suspense>
    </PageShell>
  );
}
