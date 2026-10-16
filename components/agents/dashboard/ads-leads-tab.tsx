import { cache } from "react";
import { Megaphone } from "@phosphor-icons/react/ssr";
import type { DashboardTabProps } from "@/lib/data/dashboard/tabs";
import { LoadFailed, NothingYet, SectionHeader } from "@/components/agents/dashboard/parts";
import { LeadQualificationCard } from "@/components/agents/dashboard/ads-leads/lead-qualification-card";
import { LeadsPanel } from "@/components/agents/dashboard/ads-leads/leads-panel";
import { isBackendConfigured } from "@/lib/api/config";
import { readTable } from "@/lib/api/read-cascade";
import { buildLeadsTable, ownRows, type LeadsTable } from "@/lib/data/dashboard/ads-leads-table";
import { canRunAgent } from "@/lib/entitlements/guard";

/**
 * Reads `leadbyte-leads` through the cascade, so a failed read is not an
 * empty table.
 *
 * `getAdsLeads` in `lib/data/ads-leads.ts` is not used here, on purpose: it
 * swallows every failure into `[]` (right for the Configure popup, which must
 * not break over it) and maps rows to a fixed six-field shape, which drops
 * exactly the per-form answers this table exists to show.
 *
 * It lives here rather than beside `buildLeadsTable` because the cascade
 * reaches the server-only API client, and that module is imported by the
 * leads panel in the browser.
 */
const readAdsLeads = cache(
  async (email: string, uid?: string): Promise<{ ok: boolean; table: LeadsTable }> => {
    const empty: LeadsTable = { columns: [], rows: [] };
    if (!isBackendConfigured()) return { ok: true, table: empty };
    const outcome = await readTable("leadbyte-leads", { email, ...(uid ? { uid } : {}) });
    if (!outcome.ok) return { ok: false, table: empty };
    return { ok: true, table: buildLeadsTable(ownRows(outcome.rows, email)) };
  },
);

/**
 * Ads Leads Details: every lead an ad form captured, and a way to hand them
 * to Lead Qualification.
 *
 * The purchase check runs beside the read rather than after it — both are
 * needed for the common case, and `getEntitlements` is `cache()`d, so the tab
 * strip that already asked costs nothing extra here.
 *
 * The hand-off card appears only when there are leads to hand off. With none,
 * "send your 0 leads" is a control that cannot do anything; with a failed
 * read, we do not know how many there are.
 */
export async function AdsLeadsTab({ tab, email, uid }: DashboardTabProps) {
  const [leads, purchased] = await Promise.all([
    readAdsLeads(email, uid),
    canRunAgent("lead-qualification", email),
  ]);
  const count = leads.table.rows.length;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SectionHeader
        icon={<Megaphone size={18} weight="bold" />}
        title={tab.title}
        subtitle={tab.subtitle}
      />

      {!leads.ok ? (
        <LoadFailed what="your ads leads" />
      ) : count === 0 ? (
        <NothingYet
          title="No ads leads data available yet"
          description="Leads will appear here once your ad campaigns start generating responses."
        />
      ) : (
        <>
          <LeadQualificationCard count={count} purchased={purchased} />
          <LeadsPanel table={leads.table} />
        </>
      )}
    </div>
  );
}
