import Link from "@/components/ui/app-link";
import { CursorClick, Eye, LinkedinLogo, Money, Target } from "@phosphor-icons/react/ssr";
import { Panel, PanelPair, SectionHeader, SummaryCard, SummaryRow } from "@/components/agents/dashboard/parts";
import type { DashboardTabProps } from "@/lib/data/dashboard/tabs";

/**
 * LinkedIn Ads (guide §5.5).
 *
 * There is NO LinkedIn metrics table — no n8n workflow writes one — so this is
 * the honest empty layout the guide describes: the four figures the tab will
 * carry, each "—", two empty panels, and the one step that gets data flowing.
 * Nothing is read, because there is nothing to read; a zero here would claim
 * campaigns that ran and got nothing, which is a different statement.
 *
 * The header's icon is the generic LinkedIn glyph, not LinkedIn's own logo
 * asset — there is none in `public/` yet (see `platform-logo.tsx`).
 */
export async function LinkedInAdsTab({ tab }: DashboardTabProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SectionHeader icon={<LinkedinLogo size={18} weight="bold" />} title={tab.title} subtitle={tab.subtitle} />

      <SummaryRow columns={4}>
        <SummaryCard label="Impressions" value={null} icon={<Eye size={18} weight="bold" />} />
        <SummaryCard label="Clicks" value={null} icon={<CursorClick size={18} weight="bold" />} />
        <SummaryCard label="Total spend" value={null} icon={<Money size={18} weight="bold" />} tone="primary" />
        <SummaryCard label="Conversions" value={null} icon={<Target size={18} weight="bold" />} tone="success" />
      </SummaryRow>

      <PanelPair>
        <Panel title="Clicks by campaign">
          <p className="py-6 text-center text-sm text-ink-soft">No data yet</p>
        </Panel>
        <Panel title="Spend by campaign">
          <p className="py-6 text-center text-sm text-ink-soft">No data yet</p>
        </Panel>
      </PanelPair>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-surface p-4">
        <p className="min-w-0 text-sm text-ink">
          Configure your LinkedIn Ads Agent to start tracking campaign performance.
        </p>
        <Link
          href="/agents/linkedin-ads"
          className="inline-flex min-h-9 shrink-0 items-center rounded-md bg-accent px-3 text-sm font-medium text-surface transition hover:bg-accent-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Configure LinkedIn Ads
        </Link>
      </div>
    </div>
  );
}
