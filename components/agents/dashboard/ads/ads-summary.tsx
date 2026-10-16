import { ChartLineUp, CursorClick, Eye, Money, Percent, Target } from "@phosphor-icons/react";
import { BarRow, Panel, SummaryCard, SummaryRow } from "@/components/agents/dashboard/parts";
import { adsTotals, rankEfficiency, type AdCampaign, type AdsPlatform } from "@/lib/data/dashboard/ads-campaigns";
import { CURRENCY_UNKNOWN, formatMoney } from "@/lib/format";
import { PLATFORM_COPY, formatFigure, formatPct, formatRoas } from "./ads-copy";

/**
 * The six key figures, for whichever campaigns are in front of the reader —
 * all of them, the filtered set, or one campaign's own row.
 *
 * CTR and ROAS come from the TOTALS (clicks ÷ impressions, value ÷ spend),
 * never a mean of per-campaign rates: a mean ignores how much each campaign
 * spent. No state of its own, so no directive: it renders inside the ads
 * island's tree.
 */
export function AdsSummaryCards({ rows, platform }: { rows: readonly AdCampaign[]; platform: AdsPlatform }) {
  const totals = adsTotals(rows);
  const copy = PLATFORM_COPY[platform];
  return (
    <SummaryRow columns={6}>
      <SummaryCard
        label="Total spend"
        value={totals.spend === null ? null : formatMoney(totals.spend)}
        note={CURRENCY_UNKNOWN}
        icon={<Money size={18} weight="bold" />}
        tone="primary"
      />
      <SummaryCard
        label="Impressions"
        value={totals.impressions === null ? null : formatFigure(totals.impressions)}
        icon={<Eye size={18} weight="bold" />}
      />
      <SummaryCard
        label="Clicks"
        value={totals.clicks === null ? null : formatFigure(totals.clicks)}
        icon={<CursorClick size={18} weight="bold" />}
      />
      <SummaryCard
        label="Avg. CTR"
        value={totals.ctrPct === null ? null : formatPct(totals.ctrPct)}
        note="Clicks ÷ impressions"
        icon={<Percent size={18} weight="bold" />}
      />
      <SummaryCard
        label={copy.results}
        value={totals.conversions === null ? null : formatFigure(totals.conversions)}
        icon={<Target size={18} weight="bold" />}
        tone="success"
      />
      <SummaryCard
        label="ROAS"
        value={totals.roas === null ? null : formatRoas(totals.roas)}
        note="Conversion value ÷ spend"
        icon={<ChartLineUp size={18} weight="bold" />}
        tone="success"
      />
    </SummaryRow>
  );
}

/**
 * The most important panel on the tab: which campaigns return the most for
 * what they cost. One measure per list, and the hint names it — see
 * `rankEfficiency` for why ROAS and cost per result are never mixed.
 */
export function EfficiencyPanel({ rows, platform }: { rows: readonly AdCampaign[]; platform: AdsPlatform }) {
  const { mode, items } = rankEfficiency(rows);
  const copy = PLATFORM_COPY[platform];
  const resultWord = copy.results.toLowerCase();

  return (
    <Panel
      title="Campaign efficiency"
      hint={
        mode === "roas"
          ? "Top campaigns by return on ad spend (conversion value ÷ spend). Higher is better."
          : `Top campaigns by cost per ${resultWord === "results" ? "result" : "conversion"} (spend ÷ ${resultWord}). Cheapest gets the longest bar.`
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-ink-soft">
          No campaign here has {mode === "roas" ? "a return" : resultWord} to rank yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map(({ campaign, value, share }, index) => {
            const display = mode === "roas" ? formatRoas(value) : formatMoney(value);
            return (
              <li key={campaign.key}>
                <BarRow
                  label={
                    <>
                      <span className="mr-1.5 tabular-nums text-ink-soft">{index + 1}.</span>
                      <span title={campaign.campaign}>{campaign.campaign}</span>
                    </>
                  }
                  value={share}
                  max={1}
                  display={mode === "roas" ? display : `${display} each`}
                  tone="good"
                  ariaLabel={
                    mode === "roas"
                      ? `${campaign.campaign}: return on ad spend ${display}`
                      : `${campaign.campaign}: ${display} per ${resultWord === "results" ? "result" : "conversion"}`
                  }
                />
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
