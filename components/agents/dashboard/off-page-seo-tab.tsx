import { LinkSimple } from "@phosphor-icons/react/ssr";
import type { DashboardTabProps } from "@/lib/data/dashboard/tabs";
import { LoadFailed, NothingYet, SectionHeader } from "@/components/agents/dashboard/parts";
import { CompetitorsPanel } from "@/components/agents/dashboard/off-page/competitors-panel";
import { OutreachPanels } from "@/components/agents/dashboard/off-page/outreach-panels";
import { getAgentDashboard } from "@/lib/data/agent-dashboard";
import { readOffPageOutreach } from "@/lib/data/dashboard/off-page-outreach";

/**
 * The Off-Page SEO tab: outreach, the backlink profile, then competitors.
 *
 * ## Why the outreach panels are built while they show nothing
 *
 * `off_page_seo` is keyed on the outreach TARGET, so no route can find an
 * account's record yet (`lib/data/dashboard/off-page-outreach.ts`). The whole
 * panel is here so it lights up when the backend can, and until then the
 * empty state says what is true — no outreach record is available for this
 * account — rather than "the agent has never run", which we do not know.
 *
 * The two reads are independent and run together; a failure in one never
 * hides the other.
 */
export async function OffPageSeoTab({ tab, email, uid }: DashboardTabProps) {
  const [outreach, dashboard] = await Promise.all([
    readOffPageOutreach(email, uid),
    getAgentDashboard("off-page-seo", email, uid),
  ]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SectionHeader
        icon={<LinkSimple size={18} weight="bold" />}
        title={tab.title}
        subtitle={tab.subtitle}
      />

      {!outreach.ok ? (
        <LoadFailed what="this agent's outreach" />
      ) : outreach.outreach === null ? (
        <NothingYet
          title="No outreach recorded yet"
          description="Emails sent, replies and backlinks won appear here once this agent's outreach is recorded for your account."
        />
      ) : (
        <OutreachPanels outreach={outreach.outreach} />
      )}

      <CompetitorsPanel
        outcome={dashboard.outcomes["comp_details"]}
        competitors={dashboard.competitors}
      />
    </div>
  );
}
