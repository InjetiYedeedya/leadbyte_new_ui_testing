import { formatCount } from "@/lib/format";
import { cache } from "react";
import { rollupByDate, sumOf } from "@/lib/data/daily-rollup";
import { getConnectedData, tableRows } from "@/lib/data/connected-data";

/**
 * Aggregation for the ad-platform insight tables.
 *
 * CONFIRMED contract (2026-08-27) from the previous app's
 * `services/adsInsightsService.js` and `components/dashboard/AdsInsights.jsx`:
 *
 * - One row per campaign, keyed by **email**, in the "full insights" tables.
 * - Read with `GET /api/query/{table}/{email}` → `{ success, data: Items[] }`,
 *   falling back to `GET /api/scan/{table}/{email}` when email is not the
 *   partition key on that table.
 *
 * ## What the tables actually hold (probed live, 2026-09-08)
 *
 * `google_ads_full_insights`: 30 fields on 100% of 132 rows — campaign name and
 * id, status, `channel_type`, start and end dates, `daily_budget` and
 * `total_budget`, impressions, clicks, `cost`, `ctr`, `avg_cpc`, `avg_cpm`,
 * `conversions`, `all_conversions`, `conversions_value`,
 * `cost_per_conversion`, and the app-install counts.
 *
 * `meta_ads_full_insights`: six fields on all 43 rows (name, `effective_status`,
 * start and end dates, `total_budget`) and the ~30 metric fields on **21 of
 * 43**. So nearly half of Meta's campaigns carry NO metrics at all.
 *
 * That last fact is why every metric here is `number | null`. An absent metric
 * coerced to 0 — which is what this did — puts a campaign that reported
 * nothing next to one that genuinely spent nothing and got nothing, and the two
 * are indistinguishable on screen. Same rule as `formatMoney`: null is not zero.
 *
 * ## Three platform differences that are easy to get wrong
 *
 * 1. **CTR units differ.** Google stores a fraction (`0.0806` = 8.06%); Meta
 *    stores a percentage (`2.099` = 2.1%). Confirmed against the legacy app's
 *    own rendering of the same rows. Both are normalised to a percentage here.
 * 2. **CPC field name differs.** Google `avg_cpc`, Meta `cpc`.
 * 3. **Status field name differs.** Google `status`, Meta `effective_status` —
 *    and Meta's metric-less rows have only the latter.
 *
 * Totals still derive CTR, CPC and CPA from the summed totals rather than
 * averaging per-campaign rates, which is more correct regardless: a mean of
 * rates ignores how much each campaign spent.
 *
 * ## `currency` is present and empty
 *
 * Every Google row has a `currency` column and every one of them is `""`.
 * CLAUDE.md says the rows "do not carry one", which is imprecise — they carry
 * an empty one. The outcome is the same (nothing to render a symbol from), so
 * amounts stay unlabelled, but a future row with a real code would be usable.
 */

export interface AdCampaignRow {
  campaign: string;
  campaignId: string | null;
  /** PAUSED / ACTIVE / REMOVED, verbatim from the platform. */
  status: string | null;
  /**
   * What the campaign is for. Google's `channel_type` (SEARCH, DISPLAY,
   * PERFORMANCE_MAX, MULTI_CHANNEL, DEMAND_GEN) and Meta's `objective`
   * (OUTCOME_LEADS, APP_INSTALLS, LINK_CLICKS...) answer the same question in
   * one column.
   */
  kind: string | null;
  startDate: string | null;
  endDate: string | null;
  dailyBudget: number | null;
  totalBudget: number | null;

  /**
   * Every metric below is null when the platform reported none for this
   * campaign — never 0. Half of Meta's rows are in exactly that state.
   */
  impressions: number | null;
  clicks: number | null;
  spend: number | null;
  conversions: number | null;
  conversionValue: number | null;
  /** Normalised to a PERCENTAGE, whichever platform it came from. */
  ctr: number | null;
  cpc: number | null;
  costPerConversion: number | null;
  /** Meta only — Google has no equivalent field. */
  leads: number | null;
  reach: number | null;
  iosInstalls: number | null;
  androidInstalls: number | null;
}

export interface AdTotals {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversionValue: number;
  /** Derived, as a percentage. Null when there were no impressions. */
  ctr: number | null;
  /** Derived. Null when there were no clicks. */
  cpc: number | null;
  /** Derived cost per acquisition. Null when there were no conversions. */
  cpa: number | null;
  /** Derived return on ad spend. Null when nothing was spent. */
  roas: number | null;
}

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * A number, or null when the field is genuinely absent.
 *
 * The distinction this whole module turns on. `total_budget` also arrives as a
 * STRING on Meta (`"22"`) and a number on Google, so the parse is not
 * decorative.
 */
function maybeNum(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** A non-empty string, or null. Blank is "not set" — see `currency`. */
function maybeStr(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

/**
 * Click-through rate as a PERCENTAGE, whichever platform sent it.
 *
 * Google sends a fraction and Meta a percentage, and there is no flag saying
 * which — so the discriminator is the platform field on the row itself, not a
 * guess from the magnitude. A magnitude test would be wrong in both directions:
 * a Google campaign at 8.06% sends `0.0806`, and a Meta campaign genuinely at
 * 0.08% sends `0.08`.
 */
function ctrPercent(row: Record<string, unknown>): number | null {
  const raw = maybeNum(row.ctr);
  if (raw === null) return null;
  const isFraction = maybeStr(row.platform) === "google";
  return isFraction ? raw * 100 : raw;
}

/** Normalises one raw campaign row from either platform. */
export function toCampaignRow(raw: unknown): AdCampaignRow {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  return {
    campaign: maybeStr(row.campaign_name) ?? "—",
    campaignId: maybeStr(row.campaign_id),
    // Meta's metric-less rows carry only `effective_status`.
    status: maybeStr(row.status, row.effective_status),
    // Google says how the campaign reaches people, Meta says what it is for.
    kind: maybeStr(row.channel_type, row.objective),
    startDate: maybeStr(row.start_date),
    endDate: maybeStr(row.end_date),
    dailyBudget: maybeNum(row.daily_budget, row.budget),
    totalBudget: maybeNum(row.total_budget, row.lifetime_budget),

    impressions: maybeNum(row.impressions),
    clicks: maybeNum(row.clicks),
    // Google calls it `cost`, Meta calls it `spend`.
    spend: maybeNum(row.spend, row.cost),
    // Meta reports `purchases` where Google reports `conversions`.
    conversions: maybeNum(row.conversions, row.purchases),
    conversionValue: maybeNum(row.conversions_value, row.purchase_value),
    ctr: ctrPercent(row),
    cpc: maybeNum(row.avg_cpc, row.cpc),
    costPerConversion: maybeNum(row.cost_per_conversion),
    leads: maybeNum(row.leads),
    reach: maybeNum(row.reach),
    iosInstalls: maybeNum(row.ios_installs),
    androidInstalls: maybeNum(row.android_installs),
  };
}

/**
 * Whether this campaign reported any performance at all.
 *
 * Half of Meta's rows are name, status, dates and a budget with nothing else.
 * They are real campaigns and belong in the list — but they must not be counted
 * as campaigns that spent nothing, and a chart of them would be a chart of
 * absences.
 */
export function hasMetrics(row: AdCampaignRow): boolean {
  return (
    row.spend !== null ||
    row.impressions !== null ||
    row.clicks !== null ||
    row.conversions !== null
  );
}

/**
 * Sums campaign rows and derives the rate metrics from the totals.
 *
 * Rates are null rather than 0 when undefined (no impressions, no clicks, no
 * conversions). A CPA of 0 and "we have no conversions" are very different
 * statements to put in front of someone deciding where to spend money.
 */
export function aggregate(rows: AdCampaignRow[]): AdTotals {
  // Nulls contribute nothing rather than being read as zero. The sum of a
  // platform whose campaigns all reported nothing is 0, which is correct for a
  // TOTAL — the per-campaign distinction is what the table needs, and it keeps
  // it.
  const totals = rows.reduce(
    (acc, row) => ({
      impressions: acc.impressions + (row.impressions ?? 0),
      clicks: acc.clicks + (row.clicks ?? 0),
      spend: acc.spend + (row.spend ?? 0),
      conversions: acc.conversions + (row.conversions ?? 0),
      conversionValue: acc.conversionValue + (row.conversionValue ?? 0),
    }),
    { impressions: 0, clicks: 0, spend: 0, conversions: 0, conversionValue: 0 },
  );

  return {
    ...totals,
    ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null,
    cpc: totals.clicks > 0 ? totals.spend / totals.clicks : null,
    cpa: totals.conversions > 0 ? totals.spend / totals.conversions : null,
    roas: totals.spend > 0 ? totals.conversionValue / totals.spend : null,
  };
}

// ------------------------------------------------------------- daily & read --

/** A day of one platform's ad performance. */
export interface AdsDay {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

/**
 * Reads the `*_ads_daily` rows.
 *
 * Field names are read as defensively as the campaign rows, and for the same
 * reason: Google says `cost`, Meta says `spend`, and the tables were written by
 * different n8n workflows over time. Rows with no date are dropped rather than
 * charted at the epoch.
 */
export function mapAdsDays(rows: unknown): AdsDay[] {
  if (!Array.isArray(rows)) return [];

  const mapped = rows
    .map((raw) => {
      const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const date = [row.date, row.Date, row.day, row.report_date, row.date_start].find(
        (value): value is string => typeof value === "string" && value.trim() !== "",
      );
      return {
        date: date?.trim() ?? "",
        spend: num(row.spend ?? row.cost ?? row.amount_spent),
        clicks: num(row.clicks),
        impressions: num(row.impressions),
        conversions: num(row.conversions ?? row.purchases),
      };
    })
    .filter((day) => day.date !== "");

  // One row per day, not one per ad ACCOUNT per day. Two accounts on the same
  // platform reporting the same date gave the chart two points at one x and
  // the table two rows with the same key. Every field here is additive, so the
  // day's row is simply the sum.
  return rollupByDate(mapped, (group, date) => ({
    date,
    spend: sumOf(group, (row) => row.spend),
    clicks: sumOf(group, (row) => row.clicks),
    impressions: sumOf(group, (row) => row.impressions),
    conversions: sumOf(group, (row) => row.conversions),
  }));
}

/**
 * Each campaign's own daily series, keyed by campaign name.
 *
 * The `*_ads_daily` tables carry `campaign_name` on every row — they are one
 * row per campaign per day, not one per day. `mapAdsDays` sums that dimension
 * away to get the platform's daily total, which is what the timeline lane
 * needs; this keeps it, which is what a per-campaign chart needs.
 *
 * Keyed by NAME rather than id because the campaign rows and the daily rows do
 * not reliably share an id: Meta's metric-less campaign rows carry no
 * `campaign_id` at all. The name is what both sides always have.
 */
export function mapAdsDaysByCampaign(rows: unknown): Record<string, AdsDay[]> {
  if (!Array.isArray(rows)) return {};

  const byCampaign = new Map<string, unknown[]>();
  for (const raw of rows) {
    const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const name = typeof row.campaign_name === "string" ? row.campaign_name.trim() : "";
    if (name === "") continue;
    const existing = byCampaign.get(name);
    if (existing === undefined) byCampaign.set(name, [raw]);
    else existing.push(raw);
  }

  const out: Record<string, AdsDay[]> = {};
  for (const [name, group] of byCampaign) {
    // Still rolled up per date within the campaign: one campaign can appear
    // twice on a day when two ad accounts report it.
    out[name] = mapAdsDays(group);
  }
  return out;
}

export interface PlatformAds {
  platform: "googleAds" | "metaAds";
  label: string;
  campaigns: AdCampaignRow[];
  totals: AdTotals;
  daily: AdsDay[];
  /** Each campaign's own series, for the per-campaign drawer. */
  dailyByCampaign: Record<string, AdsDay[]>;
  /** True when this platform has anything at all to show. */
  hasData: boolean;
}

/**
 * Both ad platforms, from the shared `/api/connected-data` bundle.
 *
 * Same one call the Analytics and Search Console panels use — `getConnectedData`
 * is `cache()`d, so adding this section to a page costs no extra round trip.
 *
 * Campaign rows are lifetime totals (one row per campaign) and the daily rows
 * are the time series; a platform can have one without the other, so `hasData`
 * is either, not both.
 */
export const getAdsInsights = cache(async function getAdsInsights(): Promise<PlatformAds[]> {
  const bundle = await getConnectedData();

  const platforms: { platform: "googleAds" | "metaAds"; label: string; prefix: string }[] = [
    { platform: "googleAds", label: "Google Ads", prefix: "google_ads" },
    { platform: "metaAds", label: "Meta Ads", prefix: "meta_ads" },
  ];

  return platforms.map(({ platform, label, prefix }) => {
    const campaigns = tableRows(bundle, `${prefix}_full_insights`).map(toCampaignRow);
    const dailyRaw = tableRows(bundle, `${prefix}_daily`);
    const daily = mapAdsDays(dailyRaw);

    return {
      platform,
      label,
      campaigns,
      totals: aggregate(campaigns),
      daily,
      dailyByCampaign: mapAdsDaysByCampaign(dailyRaw),
      hasData: campaigns.length > 0 || daily.length > 0,
    };
  });
});

/**
 * The line under a platform's spend on the Paid advertising card:
 * "135 campaigns · 40 conversions". Zero conversions is said as "none yet"
 * rather than "0 conversions", which reads as a verdict on a new account.
 */
export function adsCardNote(campaigns: number, conversions: number): string {
  const count = `${formatCount(campaigns)} ${campaigns === 1 ? "campaign" : "campaigns"}`;
  if (conversions <= 0) return `${count} · no conversions yet`;
  return `${count} · ${formatCount(conversions)} ${conversions === 1 ? "conversion" : "conversions"}`;
}
