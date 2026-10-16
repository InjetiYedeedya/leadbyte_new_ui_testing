"use client";

/**
 * The Meta and Google tabs' interactive body — one island for both platforms.
 *
 * ## Why this earns `"use client"`
 *
 * Four pieces of state that a form cannot express, and that all have to agree:
 * the Data / Visualization switch, the filters (which the summary cards, the
 * efficiency panel, the table and the charts all read), the campaign whose
 * daily trend is open, and the campaign in the drawer. It never fetches — the
 * rows are read and mapped on the server (`ads-insights-tab.tsx`) and arrive
 * as props, with credentials already stripped.
 *
 * ## Order on the page (guide §5.4)
 *
 * Cards → efficiency → filters → the view. The cards and the efficiency panel
 * sit above the filter bar and still follow it: they describe "the campaigns
 * currently shown", and the bar says how many that is.
 */

import { useMemo, useState, type ReactNode } from "react";
import { NothingYet, SectionHeader } from "@/components/agents/dashboard/parts";
import type { AdsDay } from "@/lib/data/ads-insights";
import {
  NO_FILTERS,
  filterCampaigns,
  statusesOf,
  type AdCampaign,
  type AdsPlatform,
  type CampaignFilters,
} from "@/lib/data/dashboard/ads-campaigns";
import { AdsCampaignDrawer } from "./ads-campaign-drawer";
import { AdsCampaignGrid } from "./ads-campaign-grid";
import { AdsFilterBar } from "./ads-filter-bar";
import { AdsSummaryCards, EfficiencyPanel } from "./ads-summary";
import { AdsCampaignTrend, AdsOverviewCharts } from "./ads-visualization";

export type AdsView = "data" | "visualization";

const VIEWS: { id: AdsView; label: string }[] = [
  { id: "data", label: "Data" },
  { id: "visualization", label: "Visualization" },
];

function ViewSwitch({ view, onChange }: { view: AdsView; onChange: (view: AdsView) => void }) {
  return (
    <div role="group" aria-label="View" className="inline-flex rounded-md border border-border bg-surface p-0.5">
      {VIEWS.map((option) => {
        const on = option.id === view;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.id)}
            suppressHydrationWarning
            className={`min-h-8 rounded-[calc(var(--radius-md)-2px)] px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              on ? "bg-accent text-surface" : "text-ink-soft hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function AdsInsightsView({
  platform,
  icon,
  title,
  subtitle,
  campaigns,
  dailyByCampaign,
}: {
  platform: AdsPlatform;
  icon: ReactNode;
  title: string;
  subtitle: string;
  campaigns: AdCampaign[];
  /** Each campaign's own daily series, keyed by campaign NAME (see `mapAdsDaysByCampaign`). */
  dailyByCampaign: Record<string, AdsDay[]>;
}) {
  const [view, setView] = useState<AdsView>("data");
  const [filters, setFilters] = useState<CampaignFilters>(NO_FILTERS);
  const [trendKey, setTrendKey] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<AdCampaign | null>(null);

  const statuses = useMemo(() => statusesOf(campaigns), [campaigns]);
  // `new Date()` is read here, in the browser, only when a date filter is
  // set — the default ("All time") ignores it, so the server render and the
  // first client render agree.
  const shown = useMemo(() => filterCampaigns(campaigns, filters, new Date()), [campaigns, filters]);
  const trend = trendKey === null ? null : (campaigns.find((row) => row.key === trendKey) ?? null);

  const daysOf = (row: AdCampaign | null): AdsDay[] =>
    row === null ? [] : (dailyByCampaign[row.campaign.trim()] ?? []);

  function closeTrend() {
    const key = trendKey;
    setTrendKey(null);
    // Back to the chip that opened it, once the overview is on the page again.
    requestAnimationFrame(() => {
      if (key !== null) document.getElementById(`ads-chip-${key}`)?.focus();
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SectionHeader
        icon={icon}
        title={title}
        subtitle={subtitle}
        action={<ViewSwitch view={view} onChange={setView} />}
      />

      {view === "visualization" && trend !== null ? (
        <AdsCampaignTrend campaign={trend} days={daysOf(trend)} platform={platform} onBack={closeTrend} />
      ) : (
        <>
          <AdsSummaryCards rows={shown} platform={platform} />
          <EfficiencyPanel rows={shown} platform={platform} />
          <AdsFilterBar
            filters={filters}
            onChange={setFilters}
            statuses={statuses}
            shown={shown.length}
            total={campaigns.length}
          />

          {shown.length === 0 ? (
            <NothingYet
              title="No campaigns match your filters."
              description="Clear the filters, or widen the date range, to see every campaign again."
            />
          ) : view === "data" ? (
            <AdsCampaignGrid rows={shown} platform={platform} onOpen={setDrawer} />
          ) : (
            <AdsOverviewCharts rows={shown} platform={platform} onPick={(row) => setTrendKey(row.key)} />
          )}
        </>
      )}

      <AdsCampaignDrawer
        campaign={drawer}
        days={daysOf(drawer)}
        platform={platform}
        onClose={() => setDrawer(null)}
      />
    </div>
  );
}
