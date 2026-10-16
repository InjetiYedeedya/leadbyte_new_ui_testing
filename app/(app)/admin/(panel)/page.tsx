import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { PageLoading } from "@/components/ui/page-loading";
import { ActionResult, AdminPanel, AdminStat, ReadFailed, param } from "@/components/admin/admin-ui";
import { redirect } from "next/navigation";
import { ADMIN_DENIED_PATH, getRbacMatrix, requireAdmin } from "@/lib/admin/access";
import { firstAllowedHref } from "@/lib/admin/nav";
import { can } from "@/lib/admin/rbac";
import { loadClients } from "@/lib/admin/data";
import { buildOverview, type AdoptionTile } from "@/lib/admin/clients";
import { countOf, formatCount } from "@/lib/format";

type Params = Promise<Record<string, string | string[] | undefined>>;

export default function AdminOverviewPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<PageLoading title="Overview" />}>
      <OverviewBody searchParams={searchParams} />
    </Suspense>
  );
}

async function OverviewBody({ searchParams }: { searchParams: Params }) {
  // The panel's front door — "Admin panel" in the account menu lands here. A
  // role without Overview is sent to the first section it may open, not to a
  // refusal on its way in.
  const me = await requireAdmin();
  const matrix = await getRbacMatrix();
  if (!can(matrix, me.role, "overview", "read")) {
    redirect(firstAllowedHref(me.role, matrix) ?? `${ADMIN_DENIED_PATH}?need=overview`);
  }
  const params = await searchParams;
  const { clients, ok, configs } = await loadClients();
  const overview = buildOverview(clients, configs);

  return (
    <PageContainer>
      <PageHeader title="Overview" description="Platform summary across every account." />
      <ActionResult notice={param(params, "notice")} error={param(params, "error")} />
      {!ok && <ReadFailed what="the client list" />}
      {overview.unreadable.length > 0 && (
        <ReadFailed what={`configurations for ${overview.unreadable.join(", ")}`} />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat label="Total clients" value={formatCount(overview.totalClients)} note="Registered accounts" />
        <AdminStat
          label="Agent configurations"
          value={formatCount(overview.totalConfigs)}
          note="Across all agent types"
        />
        <AdminStat
          label="New clients"
          value={formatCount(overview.newClients)}
          note="Signed up in the last 7 days"
          tone={overview.newClients > 0 ? "good" : "neutral"}
        />
        <AdminStat
          label="Most adopted agent"
          text
          value={overview.mostAdopted?.name ?? "None yet"}
          note={
            overview.mostAdopted
              ? `${overview.mostAdopted.count} of ${countOf(overview.totalConfigs, "configuration")}`
              : "No configurations yet"
          }
        />
      </div>

      <AdminPanel
        title="Agent adoption"
        hint={`Share of ${countOf(overview.totalConfigs, "configuration")} across ${countOf(
          overview.adoption.length,
          "agent",
        )}`}
      >
        <AgentAdoption tiles={overview.adoption} />
      </AdminPanel>
    </PageContainer>
  );
}

/**
 * Agent adoption, ranked. One hue for every bar: there is one measure here,
 * so colour would be encoding rank, which position already carries. An agent
 * nobody has set up says "none" rather than drawing a zero-width bar.
 */
function AgentAdoption({ tiles }: { tiles: AdoptionTile[] }) {
  if (tiles.length === 0) {
    return <p className="text-sm text-ink-soft">No agent configurations yet.</p>;
  }
  const max = Math.max(1, ...tiles.map((tile) => tile.count));
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {tiles.map((tile) => {
        const idle = tile.count === 0;
        return (
          <li
            key={tile.name}
            className={`flex flex-col gap-2 rounded-md border border-border p-3 ${idle ? "bg-ground" : "bg-surface"}`}
          >
            <p className="truncate text-sm font-medium text-ink" title={tile.name}>
              {tile.name}
            </p>
            <p className="flex items-baseline justify-between gap-2">
              <span className="text-xl font-semibold tabular-nums text-ink">{tile.count}</span>
              <span className="text-xs tabular-nums text-ink-soft">
                {idle ? "none" : `${tile.share.toFixed(0)}%`}
              </span>
            </p>
            <span
              role="img"
              aria-label={
                idle
                  ? `${tile.name}: no configurations yet`
                  : `${tile.name}: ${tile.count} configurations, ${tile.share.toFixed(0)} percent of all`
              }
              className="block h-1.5 overflow-hidden rounded-full bg-surface-raised"
            >
              {!idle && (
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${Math.max((tile.count / max) * 100, 4)}%` }}
                />
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
