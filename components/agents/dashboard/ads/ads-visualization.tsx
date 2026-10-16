import { useEffect, useRef } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { BarRow, NothingYet, Panel, PanelPair } from "@/components/agents/dashboard/parts";
import { LineChart, SplitDonut } from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import type { AdsDay } from "@/lib/data/ads-insights";
import { shortDay } from "@/lib/data/analytics-timeline";
import { sortCampaigns, type AdCampaign, type AdsPlatform } from "@/lib/data/dashboard/ads-campaigns";
import { humaniseOr } from "@/lib/data/labels";
import { formatMoney } from "@/lib/format";
import { PLATFORM_COPY, formatFigure, formatPct, statusVariant } from "./ads-copy";
import { AdsSummaryCards } from "./ads-summary";

/**
 * The tab's Visualization view: the campaigns as charts, and one campaign's
 * own daily trend on request.
 *
 * Rendered inside the ads island (the chips and the back button are its
 * state), so it carries no directive of its own. Ranked bars are `BarRow`s
 * rather than `RankedBars`, because `RankedBars` formats every value as a
 * count — a CTR of 3.4% would print as "3".
 */

const TOP = 10;

interface Metric {
  title: string;
  read: (row: AdCampaign) => number | null;
  format: (value: number) => string;
}

function metricsFor(platform: AdsPlatform): Metric[] {
  const spend: Metric = { title: "Spend by campaign", read: (row) => row.spend, format: formatMoney };
  const ctr: Metric = { title: "CTR by campaign", read: (row) => row.ctrPct, format: formatPct };
  return platform === "google"
    ? [
        spend,
        { title: "Clicks by campaign", read: (row) => row.clicks, format: formatFigure },
        { title: "Conversions by campaign", read: (row) => row.conversions, format: formatFigure },
        ctr,
      ]
    : [
        spend,
        { title: "Reach by campaign", read: (row) => row.reach, format: formatFigure },
        { title: "Impressions by campaign", read: (row) => row.impressions, format: formatFigure },
        ctr,
      ];
}

function RankedPanel({ metric, rows }: { metric: Metric; rows: readonly AdCampaign[] }) {
  const ranked = rows
    .map((row) => ({ row, value: metric.read(row) }))
    .filter((entry): entry is { row: AdCampaign; value: number } => entry.value !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP);
  const max = ranked[0]?.value ?? 0;
  const noun = metric.title.replace(/ by campaign$/, "").toLowerCase();

  return (
    <Panel title={metric.title} hint={`Top ${TOP}, highest first`}>
      {ranked.length === 0 ? (
        <p className="text-sm text-ink-soft">No campaign here reported {noun} yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {ranked.map(({ row, value }) => (
            <li key={row.key}>
              <BarRow
                label={<span title={row.campaign}>{row.campaign}</span>}
                value={value}
                max={max}
                display={metric.format(value)}
                ariaLabel={`${row.campaign}: ${noun} ${metric.format(value)}`}
              />
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function AdsOverviewCharts({
  rows,
  platform,
  onPick,
}: {
  rows: readonly AdCampaign[];
  platform: AdsPlatform;
  onPick: (row: AdCampaign) => void;
}) {
  const [spend, second, third, ctr] = metricsFor(platform);
  // Biggest spenders first, running ones ahead of the rest — the same order
  // as the table's default, so the two views agree.
  const chips = sortCampaigns(rows, "spend", "desc");
  const spendShare = rows
    .filter((row) => row.spend !== null && row.spend > 0)
    // Whole units: the donut's centre prints its total as a count.
    .map((row) => ({ label: row.campaign, value: Math.round(row.spend ?? 0) }));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Panel title="Campaigns" hint="Click a campaign to see its own daily trend">
        <ul className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
          {chips.map((row) => (
            <li key={row.key} className="min-w-0 max-w-full">
              <button
                type="button"
                id={`ads-chip-${row.key}`}
                onClick={() => onPick(row)}
                suppressHydrationWarning
                className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-ink transition hover:border-accent hover:bg-accent/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97] motion-reduce:transform-none"
              >
                <span
                  aria-hidden="true"
                  className={`size-2 shrink-0 rounded-full ${statusVariant(row.status) === "campaign-active" ? "bg-good" : "bg-ink-soft/40"}`}
                />
                <span className="truncate">{row.campaign}</span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <PanelPair>
        {spend && <RankedPanel metric={spend} rows={rows} />}
        {second && <RankedPanel metric={second} rows={rows} />}
      </PanelPair>
      <PanelPair>
        {third && <RankedPanel metric={third} rows={rows} />}
        {ctr && <RankedPanel metric={ctr} rows={rows} />}
      </PanelPair>

      <Panel title="Share of spend" hint="Each campaign's part of the total spent, largest five named">
        {spendShare.length >= 2 ? (
          <SplitDonut data={spendShare} unitLabel="spent" />
        ) : (
          <p className="text-sm text-ink-soft">
            {spendShare.length === 1
              ? "Only one campaign has spent anything, so there is no split to show."
              : "No campaign here has reported spend yet."}
          </p>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------ one campaign -- */

function DailyPanel({
  title,
  points,
  tone = "accent",
  caption,
  budget,
}: {
  title: string;
  points: { label: string; value: number; prior?: number | null }[];
  tone?: "accent" | "good" | "warn";
  caption: string;
  /** Present only on the spend chart, when the campaign has a daily budget. */
  budget?: boolean;
}) {
  return (
    <Panel title={title}>
      <LineChart
        points={points}
        height={160}
        minWidth={280}
        tone={tone}
        caption={caption}
        currentLabel={budget ? "Spend" : undefined}
        priorLabel={budget ? "Daily budget" : undefined}
      />
    </Panel>
  );
}

export function AdsCampaignTrend({
  campaign,
  days,
  platform,
  onBack,
}: {
  campaign: AdCampaign;
  /** Its own daily rows, oldest first. */
  days: AdsDay[];
  platform: AdsPlatform;
  onBack: () => void;
}) {
  const backRef = useRef<HTMLButtonElement>(null);
  const copy = PLATFORM_COPY[platform];

  // The overview this replaced is gone from the page, and focus with it.
  useEffect(() => {
    backRef.current?.focus();
  }, [campaign.key]);

  const label = (day: AdsDay) => shortDay(day.date);
  const dailyBudget = campaign.budgetType === "Daily" ? campaign.budget : null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          ref={backRef}
          type="button"
          onClick={onBack}
          suppressHydrationWarning
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-ink transition hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ArrowLeft size={14} weight="bold" aria-hidden="true" />
          Back to overview
        </button>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h4 className="min-w-0 break-words text-sm font-bold text-ink">{campaign.campaign}</h4>
          <Badge variant={statusVariant(campaign.status)}>{humaniseOr(campaign.status, "Unknown")}</Badge>
        </div>
      </div>

      <AdsSummaryCards rows={[campaign]} platform={platform} />

      {days.length < 2 ? (
        <NothingYet
          title={days.length === 0 ? "No daily history for this campaign" : "Only one day of history so far"}
          description={
            days.length === 0
              ? `${copy.name} has sent this campaign's lifetime totals (above) but no day-by-day rows. Most campaigns have none yet; a trend appears here once they arrive.`
              : "One day is not a trend. The charts appear once a second day is reported."
          }
        />
      ) : (
        <>
          <PanelPair>
            <DailyPanel
              title={dailyBudget !== null ? "Spend vs daily budget" : "Spend per day"}
              points={days.map((day) => ({ label: label(day), value: day.spend, prior: dailyBudget }))}
              caption={`Daily spend for ${campaign.campaign}${dailyBudget !== null ? `, against a daily budget of ${formatMoney(dailyBudget)}` : ""}`}
              budget={dailyBudget !== null}
            />
            <DailyPanel
              title="Clicks per day"
              points={days.map((day) => ({ label: label(day), value: day.clicks }))}
              caption={`Daily clicks for ${campaign.campaign}`}
            />
          </PanelPair>
          <PanelPair>
            <DailyPanel
              title="Impressions per day"
              points={days.map((day) => ({ label: label(day), value: day.impressions }))}
              caption={`Daily impressions for ${campaign.campaign}`}
            />
            <DailyPanel
              title={`${copy.results} per day`}
              tone="good"
              points={days.map((day) => ({ label: label(day), value: day.conversions }))}
              caption={`Daily ${copy.results.toLowerCase()} for ${campaign.campaign}`}
            />
          </PanelPair>
        </>
      )}
    </div>
  );
}
