import { MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { AgentDashboard } from "@/components/agents/agent-dashboard";
import { SectionHeader } from "@/components/agents/dashboard/parts";
import { getAgentDashboard } from "@/lib/data/agent-dashboard";
import type { DashboardTab } from "@/lib/data/dashboard/tabs";
import { AdsInsightsTab } from "./ads-insights-tab";
import { AdsLeadsTab } from "./ads-leads-tab";
import { LeadQualificationTab } from "./lead-qualification-tab";
import { LinkedInAdsTab } from "./linkedin-ads-tab";
import { OffPageSeoTab } from "./off-page-seo-tab";
import { SocialMediaTab } from "./social-media-tab";

/**
 * The open tab's body. Each tab reads ONLY its own tables — the dashboard
 * never loads every tab to show one (the guide loads all ~20 tables up front
 * and needed a 6-at-a-time limiter to survive it; reading one tab's tables
 * needs neither). A Server Component; each tab owns its client islands.
 */
export async function DashboardTabBody({
  tab,
  email,
  uid,
}: {
  tab: DashboardTab;
  email: string;
  uid?: string;
}) {
  const props = { tab, email, uid };
  switch (tab.id) {
    case "on-page-seo":
      return <OnPageSeoTab {...props} />;
    case "off-page-seo":
      return <OffPageSeoTab {...props} />;
    case "lead-qualification":
      return <LeadQualificationTab {...props} />;
    case "social-media":
      return <SocialMediaTab {...props} />;
    case "meta-ads":
      return <AdsInsightsTab {...props} platform="meta" />;
    case "google-ads":
      return <AdsInsightsTab {...props} platform="google" />;
    case "linkedin-ads":
      return <LinkedInAdsTab {...props} />;
    case "ads-leads":
      return <AdsLeadsTab {...props} />;
  }
}

/** On-Page SEO is not in the guide; it keeps the keyword view it already had. */
async function OnPageSeoTab({ tab, email, uid }: { tab: DashboardTab; email: string; uid?: string }) {
  const dashboard = await getAgentDashboard("on-page-seo", email, uid);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SectionHeader
        icon={<MagnifyingGlass size={18} weight="bold" />}
        title={tab.title}
        subtitle={tab.subtitle}
      />
      <AgentDashboard dashboard={dashboard} />
    </div>
  );
}
