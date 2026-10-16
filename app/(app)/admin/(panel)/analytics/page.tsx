import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowsClockwise, Globe } from "@phosphor-icons/react/ssr";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { PageLoading } from "@/components/ui/page-loading";
import { StatCard } from "@/components/ui/stat-card";
import { LineChart, RankedBars } from "@/components/ui/chart";
import { SubmitButton } from "@/components/ui/submit-button";
import { AdminPanel, FilterPills, ReadFailed, param, withParams } from "@/components/admin/admin-ui";
import { requirePermission } from "@/lib/admin/access";
import { getAdminRepo } from "@/lib/data/admin-repo";
import { COMPANY_ANALYTICS_EMAIL, USER_DASHBOARD_TABLES } from "@/lib/admin/tables";
import { RANGES, buildSiteAnalytics, readRange } from "@/lib/admin/site-analytics";
import { formatCount } from "@/lib/format";
import { shortDay } from "@/lib/data/analytics-timeline";
import { refreshAdminPage } from "../actions";

export const metadata: Metadata = { title: "Website analytics · Admin · LeadByte" };

type Params = Promise<Record<string, string | string[] | undefined>>;

export default function AdminAnalyticsPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<PageLoading title="Website analytics" />}>
      <AnalyticsBody searchParams={searchParams} />
    </Suspense>
  );
}

async function AnalyticsBody({ searchParams }: { searchParams: Params }) {
  await requirePermission("analytics", "read");
  const params = await searchParams;
  const range = readRange(param(params, "range"));
  const regionParam = param(params, "region") ?? "all";

  const repo = getAdminRepo();
  const [daily, sources, countries] = await Promise.all([
    repo.userRows(USER_DASHBOARD_TABLES.dailyMetrics, COMPANY_ANALYTICS_EMAIL),
    repo.userRows(USER_DASHBOARD_TABLES.sessionPerSource, COMPANY_ANALYTICS_EMAIL),
    repo.userRows(USER_DASHBOARD_TABLES.sourceByCountry, COMPANY_ANALYTICS_EMAIL),
  ]);

  const data = buildSiteAnalytics({
    daily: daily.rows,
    sessionPerSource: sources.rows,
    sourceByCountry: countries.rows,
    range,
    region: regionParam,
  });

  const current = { range, region: data.region };
  const here = withParams("/admin/analytics", current, {});
  const comparison = data.comparisonDays ? `vs the previous ${data.comparisonDays} days` : undefined;
  const failed = [
    !daily.ok && "daily traffic",
    !sources.ok && "traffic sources",
    !countries.ok && "countries",
  ].filter((part): part is string => typeof part === "string");

  return (
    <PageContainer>
      <PageHeader
        title="Website analytics"
        description={
          data.days.length > 0
            ? `LeadByte's own site · ${data.days.length} days · ${shortDay(data.firstDay)} to ${shortDay(data.lastDay)}`
            : "LeadByte's own site"
        }
        actions={
          <form action={refreshAdminPage}>
            <input type="hidden" name="back" value={here} />
            <SubmitButton
              pendingLabel="Refreshing…"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-surface-raised"
            >
              <ArrowsClockwise aria-hidden="true" className="size-4" />
              Refresh
            </SubmitButton>
          </form>
        }
      />

      {failed.length > 0 && <ReadFailed what={failed.join(", ")} />}

      <div className="flex flex-col gap-2">
        <FilterPills
          label="Date range"
          options={RANGES.map((option) => ({ id: option.id, label: option.label }))}
          active={range}
          hrefFor={(id) => withParams("/admin/analytics", current, { range: id })}
        />
        {data.regions.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <Globe aria-hidden="true" className="size-4 text-ink-soft" />
            <FilterPills
              label="Region"
              options={[
                { id: "all", label: "All regions" },
                ...data.regions.map((name) => ({ id: name, label: name })),
              ]}
              active={data.region}
              hrefFor={(id) => withParams("/admin/analytics", current, { region: id })}
            />
          </div>
        )}
      </div>

      {data.days.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-ink-soft">
          No traffic has been imported for {COMPANY_ANALYTICS_EMAIL} yet.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {data.tiles.map((tile) => (
              <StatCard
                key={tile.metric}
                label={tile.label}
                value={formatCount(tile.value)}
                deltaPercent={tile.delta}
                note={tile.delta !== null ? comparison : undefined}
                series={tile.series}
              />
            ))}
            <StatCard label="Countries" value={formatCount(data.countryCount)} note="With at least one visitor" />
          </div>

          <AdminPanel
            title="Active visitors over time"
            hint={[
              data.granularity === "weekly" ? "Weekly totals" : "Daily totals",
              data.peak ? `peak ${data.peak.label} · ${formatCount(data.peak.value)}` : null,
              data.averagePerDay !== null ? `average ${formatCount(Math.round(data.averagePerDay))}/day` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            {data.trend.length >= 2 ? (
              <LineChart
                points={data.trend}
                caption="Active visitors"
                currentLabel={data.granularity === "weekly" ? "Active visitors per week" : `Last ${data.days.length} days`}
                priorLabel={data.comparisonDays ? `Previous ${data.comparisonDays} days` : "Previous period"}
              />
            ) : (
              <p className="text-sm text-ink-soft">Not enough days in this range to draw a line.</p>
            )}
          </AdminPanel>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminPanel title="Sessions by source" hint="Top traffic sources">
          {data.sources.length > 0 ? (
            <RankedBars items={data.sources} valueLabel="sessions" />
          ) : (
            <p className="text-sm text-ink-soft">No source data yet.</p>
          )}
        </AdminPanel>
        <AdminPanel
          title="Visitors by country"
          hint={data.region === "all" ? "Top countries by active visitors" : `Filtered to ${data.region}`}
        >
          {data.countries.length > 0 ? (
            <RankedBars items={data.countries} valueLabel="visitors" />
          ) : (
            <p className="text-sm text-ink-soft">No country data yet.</p>
          )}
        </AdminPanel>
      </div>
    </PageContainer>
  );
}
