import type { Metadata } from "next";
import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { PageLoading } from "@/components/ui/page-loading";
import { AdminPanel, FilterPills, ReadFailed, param } from "@/components/admin/admin-ui";
import { ConfigTable } from "@/components/admin/config-table";
import { requirePermission } from "@/lib/admin/access";
import { loadAgentConfigs } from "@/lib/admin/data";
import { configColumns, configRows } from "@/lib/admin/clients";
import { humanizeKey } from "@/lib/admin/fields";
import { countOf } from "@/lib/format";

export const metadata: Metadata = { title: "Agents · Admin · LeadByte" };

type Params = Promise<Record<string, string | string[] | undefined>>;

export default function AdminAgentsPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<PageLoading title="Agents" />}>
      <AgentsBody searchParams={searchParams} />
    </Suspense>
  );
}

async function AgentsBody({ searchParams }: { searchParams: Params }) {
  await requirePermission("agents", "read");
  const params = await searchParams;
  const configs = await loadAgentConfigs();
  const total = configs.reduce((sum, set) => sum + set.rows.length, 0);

  // `?agent=` names the pill; an unknown one opens the first agent.
  const wanted = param(params, "agent");
  const active = configs.find((set) => set.name === wanted) ?? configs[0];
  const columns = active ? configColumns(active.rows) : [];

  return (
    <PageContainer>
      {/* The legacy subtitle read "undefined configurations": it took the
          `.length` of an object keyed by agent name. */}
      <PageHeader title="Agents" description={`${countOf(total, "configuration")} across ${countOf(configs.length, "agent")}`} />

      <FilterPills
        label="Agent"
        options={configs.map((set) => ({ id: set.name, label: set.name, count: set.ok ? set.rows.length : undefined }))}
        active={active?.name ?? ""}
        hrefFor={(id) => `/admin/agents?agent=${encodeURIComponent(id)}`}
      />

      {active && (
        <AdminPanel title={`${active.name} configurations`} hint={countOf(active.rows.length, "configuration")}>
          {!active.ok ? (
            <ReadFailed what={`${active.name} configurations`} />
          ) : (
            <ConfigTable
              agent={active.name}
              columns={columns.map((key) => ({ key, header: key === "email" ? "Email" : humanizeKey(key) }))}
              rows={configRows(active.rows, columns)}
            />
          )}
        </AdminPanel>
      )}
    </PageContainer>
  );
}
