import { flatten, normKey, pickNum, pickRaw, pickStr, type Row } from "@/lib/data/dashboard/fields";
import { shortDay } from "@/lib/data/analytics-timeline";

/**
 * The Meta and Google tabs of the agent dashboard, from the raw campaign rows.
 *
 * From the legacy dashboard's implementation guide (§5.4): ONE shape for both
 * platforms, so one screen serves both. The rows are the same ones
 * `lib/data/ads-insights.ts` reads for the Performance screen —
 * `google_ads_full_insights` / `meta_ads_full_insights`, one row per campaign
 * with its all-time totals — but that module is deliberately spend-only since
 * 2026-09-29, and the dashboard shows every metric (product owner's decision,
 * 2026-09-30). So this is its own mapper rather than a widening of that one,
 * and the two stay consistent where they overlap: the CTR units, the field
 * spellings, and null-is-not-zero.
 *
 * ## Null is not zero
 *
 * Nearly half of Meta's campaigns carry no metrics at all (see
 * `ads-insights.ts`). Every figure here is `number | null`, every derived one
 * is null when there is nothing to divide by, and a total is null when NO
 * campaign reported the metric — "—", never a confident 0.
 *
 * ## Money has no currency
 *
 * The guide says "account currency"; the rows carry none (Google's `currency`
 * column is present and empty), so amounts are plain numbers and the screen
 * formats them with `formatMoney`, no symbol.
 *
 * Pure and client-safe: the client island filters, sorts and ranks with the
 * same functions the tests exercise.
 */

export type AdsPlatform = "google" | "meta";

export type BudgetType = "Daily" | "Lifetime";

/** One `raw_actions` entry: what Meta counted, and how many. */
export interface AdAction {
  type: string;
  value: number;
}

export interface AdCampaign {
  /** Unique within the list — names repeat across ad accounts. */
  key: string;
  campaign: string;
  campaignId: string | null;
  /** Verbatim: ENABLED / PAUSED / ACTIVE / REMOVED… */
  status: string | null;
  /** Meta: what the campaign is for (OUTCOME_LEADS…). */
  objective: string | null;
  /** Google: how it reaches people, title-cased ("Performance Max"). */
  channelType: string | null;

  impressions: number | null;
  clicks: number | null;
  /** A PERCENTAGE, whichever platform sent it. */
  ctrPct: number | null;
  cpc: number | null;
  cpm: number | null;
  spend: number | null;
  conversions: number | null;
  convValue: number | null;
  /** Meta only. */
  reach: number | null;
  frequency: number | null;

  budget: number | null;
  budgetType: BudgetType | null;
  /** `YYYY-MM-DD`. */
  startDate: string | null;
  /** `YYYY-MM-DD`; null for "no end date", including Google's 2037-12-30. */
  endDate: string | null;

  leads: number | null;
  iosInstalls: number | null;
  androidInstalls: number | null;
  /**
   * Every install, either OS: iOS + Android when the row splits them, else
   * the row's own total or Meta's action list — whose install types usually
   * do not name an OS, so they cannot fill the two fields above.
   */
  installs: number | null;

  // Calculated, all null-safe.
  roas: number | null;
  costPerConversion: number | null;
  /** A fraction, 0–1. */
  conversionRate: number | null;
  /** Daily budget × days run, or the lifetime budget. */
  estimatedAmount: number | null;

  /** Meta's per-action counts, largest first. Empty when absent. */
  actions: AdAction[];
  /** Every field the row carried, by name, as text — credentials removed. */
  raw: [string, string][];
  /** `YYYY-MM-DD`, from `updated_at`. */
  updatedAt: string | null;
}

/* ---------------------------------------------------------------- dates -- */

/** Google's way of saying "this campaign has no end date". */
const NO_END_DATE = "2037-12-30";

const DAY_MS = 86_400_000;

/**
 * A calendar day out of whatever the row sent: `2026-09-14`,
 * `2026-09-14T00:00:00+0000`, `2026-09-14 10:22:01`. Only the date part is
 * kept — these are campaign days, and a timezone shift would move one.
 */
export function calendarDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  if (!match || !match[1]) return null;
  return Number.isNaN(Date.parse(`${match[1]}T00:00:00Z`)) ? null : match[1];
}

/** `2026-09-14` → `14 Sep 2026`. The analytics day spelling, with the year: campaigns span years. */
export function campaignDay(day: string | null): string {
  if (day === null) return "—";
  return `${shortDay(day)} ${day.slice(0, 4)}`;
}

/** Days a campaign runs, counting both ends: 1 Sep → 1 Sep is one day. */
export function daysInclusive(start: string, end: string): number | null {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null;
  return Math.round((to - from) / DAY_MS) + 1;
}

/** A `Date` as its UTC calendar day. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/* --------------------------------------------------------------- labels -- */

/** `PERFORMANCE_MAX` → `Performance Max`. */
export function titleCase(value: string | null): string | null {
  if (value === null) return null;
  const words = value
    .trim()
    .split(/[\s_-]+/)
    .filter((word) => word !== "")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  return words.length > 0 ? words.join(" ") : null;
}

const ACTIVE_STATUSES = new Set(["ENABLED", "ACTIVE", "RUNNING"]);
const ENDED_STATUSES = new Set(["REMOVED", "DELETED", "ARCHIVED", "ENDED", "COMPLETED"]);

/** Running right now. ENABLED (Google), ACTIVE (Meta), RUNNING (either, older rows). */
export function isActiveStatus(status: string | null): boolean {
  return ACTIVE_STATUSES.has((status ?? "").trim().toUpperCase());
}

/** Over for good — quieter than paused, which is a decision that can be undone. */
export function isEndedStatus(status: string | null): boolean {
  return ENDED_STATUSES.has((status ?? "").trim().toUpperCase());
}

/* ------------------------------------------------------------ raw fields -- */

/**
 * A field name that looks like a credential. The drawer lists every field the
 * row carried; n8n rows have been seen carrying tokens beside the metrics, and
 * those must never reach the page. Stripped on the SERVER, before the rows
 * cross into the client island.
 */
export function isSecretKey(key: string): boolean {
  return /token|secret|password|passwd|apikey|authorization|bearer|credential|privatekey|sessionid|cookie/.test(
    normKey(key),
  );
}

const RAW_VALUE_LIMIT = 2000;

/** Any value as display text. Objects are stringified, never rendered. */
export function rawText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const text =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : safeJson(value);
  return text.length > RAW_VALUE_LIMIT ? `${text.slice(0, RAW_VALUE_LIMIT)}…` : text;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function rawFields(row: Row): [string, string][] {
  return Object.entries(row)
    .filter(([key]) => !isSecretKey(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => [key, rawText(value)]);
}

/* -------------------------------------------------------------- actions -- */

/**
 * Meta's `raw_actions` / `actions`: `[{ action_type, value }]`, sometimes as
 * a JSON string, sometimes as a `{ type: count }` map. Anything else is no
 * list rather than an error.
 */
export function parseActions(value: unknown): AdAction[] {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return [];
    }
  }

  const out: AdAction[] = [];
  if (Array.isArray(source)) {
    for (const entry of source) {
      const flat = flatten(entry);
      const type = pickStr(flat, "action_type", "type", "name");
      const count = pickNum(flat, "value", "count");
      if (type !== "" && count !== null) out.push({ type, value: count });
    }
  } else if (source && typeof source === "object") {
    for (const [type, raw] of Object.entries(source as Row)) {
      const count = pickNum({ v: raw }, "v");
      if (type.trim() !== "" && count !== null) out.push({ type: type.trim(), value: count });
    }
  }
  return out.sort((a, b) => b.value - a.value);
}

/**
 * Leads out of Meta's action list. One lead is counted under several action
 * types at once (`lead`, `onsite_conversion.lead_grouped`,
 * `offsite_conversion.fb_pixel_lead`), so the most specific one present is
 * taken — summing them would count the same person two or three times.
 */
function leadsFromActions(actions: AdAction[]): number | null {
  const preferred = ["lead", "onsite_conversion.lead_grouped", "leadgen_grouped", "offsite_conversion.fb_pixel_lead"];
  for (const type of preferred) {
    const hit = actions.find((action) => action.type.toLowerCase() === type);
    if (hit) return hit.value;
  }
  return actions.find((action) => action.type.toLowerCase().includes("lead"))?.value ?? null;
}

/**
 * Installs for one OS out of Meta's action list, the way `leadsFromActions`
 * reads leads: an action type naming both "install" and the OS
 * (`app_install_ios`…). The most specific spelling present is taken, never a
 * sum, for the same double-counting reason.
 */
function installsFromActions(actions: AdAction[], os: "ios" | "android"): number | null {
  const preferred = [`mobile_app_install_${os}`, `app_install_${os}`, `${os}_app_install`];
  for (const type of preferred) {
    const hit = actions.find((action) => action.type.toLowerCase() === type);
    if (hit) return hit.value;
  }
  return (
    actions.find((action) => {
      const type = action.type.toLowerCase();
      return type.includes("install") && type.includes(os) && !NOT_A_COUNT.test(type);
    })?.value ?? null
  );
}

/**
 * Installs of any kind out of Meta's action list: `mobile_app_install`,
 * `app_install`, `omni_app_install`, then any type naming "install". Meta's
 * action types rarely say which OS, so this is the total the per-OS figures
 * cannot hold.
 */
function totalInstallsFromActions(actions: AdAction[]): number | null {
  const preferred = ["mobile_app_install", "app_install", "omni_app_install"];
  for (const type of preferred) {
    const hit = actions.find((action) => action.type.toLowerCase() === type);
    if (hit) return hit.value;
  }
  return (
    actions.find((action) => {
      const type = action.type.toLowerCase();
      return type.includes("install") && !NOT_A_COUNT.test(type);
    })?.value ?? null
  );
}

/** Keys that measure a rate or a price of something, not a count of it. */
const NOT_A_COUNT = /cost|per|rate|value|pct|percent|ctr/;

/**
 * Keys that NAME something rather than count it. Keys are normalised
 * (`lead_form_id` → `leadformid`), so "ends in id" is the test — and without
 * it a Meta lead form's id, which is all digits, was read as its lead count.
 */
const AN_ID = /id$/;

/**
 * The first field whose name contains every one of `parts` and is a count —
 * `ios_installs`, `iosAppInstalls`, `app_installs_ios` all match
 * `["ios", "install"]`; `cost_per_ios_install` and `lead_form_id` do not.
 */
function fuzzyCount(flat: Row, parts: string[]): number | null {
  for (const key of Object.keys(flat)) {
    if (NOT_A_COUNT.test(key) || AN_ID.test(key)) continue;
    if (!parts.every((part) => key.includes(part))) continue;
    const value = pickNum(flat, key);
    if (value !== null) return value;
  }
  return null;
}

/* --------------------------------------------------------------- mapper -- */

/** Divides, or null when either side is missing or there is nothing to divide by. */
function per(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole <= 0) return null;
  return part / whole;
}

/**
 * One raw campaign row → the shared shape.
 *
 * `platform` is the TABLE the row came from, not a field on it: the CTR units
 * differ (Google a fraction, Meta a percentage) and the magnitude cannot tell
 * them apart — see `ctrPercent` in `ads-insights.ts`.
 */
export function toAdCampaign(raw: unknown, platform: AdsPlatform, key = ""): AdCampaign {
  const row: Row = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Row) : {};
  const flat = flatten(row);
  const google = platform === "google";

  const impressions = pickNum(flat, "impressions");
  const clicks = pickNum(flat, "clicks");
  const spend = pickNum(flat, "spend", "cost");
  const conversions = pickNum(flat, "conversions", "purchases");
  const convValue = pickNum(flat, "conversions_value", "purchase_value");

  const ctrRaw = pickNum(flat, "ctr");
  const ctrPct =
    ctrRaw !== null
      ? google
        ? ctrRaw * 100
        : ctrRaw
      : // Derived from the row's own counts when the rate itself is absent.
        (() => {
          const share = per(clicks, impressions);
          return share === null ? null : share * 100;
        })();

  // Budget: whichever is set decides the type. Daily first — a Google row
  // carries both, and its `total_budget` is not what the campaign is capped at.
  const daily = pickNum(flat, "daily_budget");
  const lifetime = pickNum(flat, "lifetime_budget", "total_budget");
  const [budget, budgetType]: [number | null, BudgetType | null] =
    daily !== null && daily > 0
      ? [daily, "Daily"]
      : lifetime !== null && lifetime > 0
        ? [lifetime, "Lifetime"]
        : [null, null];

  const startDate = calendarDay(pickRaw(flat, "start_date", "start_time"));
  const endRaw = calendarDay(pickRaw(flat, "end_date", "stop_time", "end_time"));
  const endDate = endRaw === NO_END_DATE ? null : endRaw;

  let estimatedAmount: number | null = null;
  if (budgetType === "Lifetime") estimatedAmount = budget;
  else if (budgetType === "Daily" && budget !== null && startDate !== null && endDate !== null) {
    const days = daysInclusive(startDate, endDate);
    estimatedAmount = days === null ? null : budget * days;
  }

  const actions = parseActions(pickRaw(flat, "raw_actions", "actions"));
  const leads = pickNum(flat, "leads") ?? fuzzyCount(flat, ["lead"]) ?? leadsFromActions(actions);
  const iosInstalls = fuzzyCount(flat, ["ios", "install"]) ?? installsFromActions(actions, "ios");
  const androidInstalls = fuzzyCount(flat, ["android", "install"]) ?? installsFromActions(actions, "android");

  const campaign = pickStr(flat, "campaign_name", "name") || "Unnamed campaign";
  const campaignId = pickStr(flat, "campaign_id") || null;

  return {
    key: key || campaignId || campaign,
    campaign,
    campaignId,
    status: pickStr(flat, "status", "effective_status", "configured_status") || null,
    objective: pickStr(flat, "objective") || null,
    channelType: titleCase(pickStr(flat, "channel_type", "advertising_channel_type") || null),

    impressions,
    clicks,
    ctrPct,
    cpc: google ? pickNum(flat, "avg_cpc", "cpc") : pickNum(flat, "cpc", "avg_cpc"),
    cpm: google ? pickNum(flat, "avg_cpm", "cpm") : pickNum(flat, "cpm", "avg_cpm"),
    spend,
    conversions,
    convValue,
    reach: pickNum(flat, "reach"),
    frequency: pickNum(flat, "frequency"),

    budget,
    budgetType,
    startDate,
    endDate,

    leads,
    iosInstalls,
    androidInstalls,
    installs:
      iosInstalls !== null || androidInstalls !== null
        ? (iosInstalls ?? 0) + (androidInstalls ?? 0)
        : pickNum(flat, "installs", "app_installs") ?? totalInstallsFromActions(actions),

    roas: per(convValue, spend),
    costPerConversion: per(spend, conversions),
    conversionRate: per(conversions, clicks),
    estimatedAmount,

    actions,
    raw: rawFields(row),
    updatedAt: calendarDay(pickRaw(flat, "updated_at", "updatedat", "last_updated")),
  };
}

/** Every row, with a key that is unique even when a name repeats across ad accounts. */
export function mapAdCampaigns(rows: readonly unknown[], platform: AdsPlatform): AdCampaign[] {
  const seen = new Map<string, number>();
  return rows.map((raw) => {
    const first = toAdCampaign(raw, platform);
    const count = seen.get(first.key) ?? 0;
    seen.set(first.key, count + 1);
    return count === 0 ? first : { ...first, key: `${first.key}~${count}` };
  });
}

/** The newest `updated_at` across the rows, or null. */
export function newestUpdate(campaigns: readonly AdCampaign[]): string | null {
  let newest: string | null = null;
  for (const { updatedAt } of campaigns) {
    if (updatedAt !== null && (newest === null || updatedAt > newest)) newest = updatedAt;
  }
  return newest;
}

/* --------------------------------------------------------------- totals -- */

export interface AdsTotals {
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  convValue: number | null;
  /** Clicks ÷ impressions of the totals, as a percentage — not a mean of CTRs. */
  ctrPct: number | null;
  roas: number | null;
}

/** Sum of the campaigns that reported it; null when none did. */
function total(rows: readonly AdCampaign[], read: (row: AdCampaign) => number | null): number | null {
  let sum: number | null = null;
  for (const row of rows) {
    const value = read(row);
    if (value !== null) sum = (sum ?? 0) + value;
  }
  return sum;
}

export function adsTotals(rows: readonly AdCampaign[]): AdsTotals {
  const spend = total(rows, (row) => row.spend);
  const impressions = total(rows, (row) => row.impressions);
  const clicks = total(rows, (row) => row.clicks);
  const convValue = total(rows, (row) => row.convValue);
  const share = per(clicks, impressions);
  return {
    spend,
    impressions,
    clicks,
    conversions: total(rows, (row) => row.conversions),
    convValue,
    ctrPct: share === null ? null : share * 100,
    roas: per(convValue, spend),
  };
}

/* ----------------------------------------------------------- efficiency -- */

export type EfficiencyMode = "roas" | "cost-per-result";

export interface EfficiencyItem {
  campaign: AdCampaign;
  /** ROAS, or cost per result — whichever the mode ranks by. */
  value: number;
  /** The bar's length, 0–1. The BEST campaign is 1 in either mode. */
  share: number;
}

/**
 * The campaigns that return the most for what they cost.
 *
 * When any campaign reports a conversion value, ROAS is the measure (higher is
 * better). Otherwise cost per result (cheaper is better), with the cheapest
 * given the LONGEST bar — a bar is read as "more", and more of this is worse.
 * The two are never mixed in one list: a ROAS of 3 and a cost of 3 are
 * different units, and ranking one against the other means nothing.
 */
export function rankEfficiency(rows: readonly AdCampaign[], limit = 8): { mode: EfficiencyMode; items: EfficiencyItem[] } {
  const byRoas = rows.some((row) => row.convValue !== null && row.convValue > 0);

  if (byRoas) {
    const ranked = rows
      .filter((row): row is AdCampaign & { roas: number } => row.roas !== null)
      .sort((a, b) => b.roas - a.roas)
      .slice(0, limit);
    const best = ranked[0]?.roas ?? 0;
    return {
      mode: "roas",
      items: ranked.map((row) => ({ campaign: row, value: row.roas, share: best > 0 ? row.roas / best : 0 })),
    };
  }

  const ranked = rows
    .filter((row): row is AdCampaign & { costPerConversion: number } => row.costPerConversion !== null)
    .sort((a, b) => a.costPerConversion - b.costPerConversion)
    .slice(0, limit);
  const cheapest = ranked[0]?.costPerConversion ?? 0;
  return {
    mode: "cost-per-result",
    items: ranked.map((row) => ({
      campaign: row,
      value: row.costPerConversion,
      // A free result (cost 0) is the best there is.
      share: row.costPerConversion > 0 ? cheapest / row.costPerConversion : 1,
    })),
  };
}

/* ----------------------------------------------------------------- sort -- */

/** The fields a column can sort by: every text or number field. */
export type CampaignSortKey = {
  [K in keyof AdCampaign]: AdCampaign[K] extends string | number | null ? K : never;
}[keyof AdCampaign];

export type SortDirection = "asc" | "desc";

/**
 * Running campaigns first, always; then the rest of the order.
 *
 * Unknowns (null) go last in BOTH directions — "we don't know what it spent"
 * is not the smallest spend, and flipping the sort should not float every
 * metric-less Meta campaign to the top.
 */
export function sortCampaigns(
  rows: readonly AdCampaign[],
  key: CampaignSortKey,
  direction: SortDirection,
): AdCampaign[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const activeA = isActiveStatus(a.status);
    const activeB = isActiveStatus(b.status);
    if (activeA !== activeB) return activeA ? -1 : 1;

    const av = a[key];
    const bv = b[key];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
    return cmp * sign;
  });
}

/**
 * The table's order before anyone picks a column (2026-10-13): COMPLETED
 * campaigns first, then running, then paused, then the rest — and within each,
 * the latest START date first. Asked for as "completed first, latest start
 * date first". A row with no start date ends its group. Picking a column
 * header still sorts by that column (`sortCampaigns`).
 */
export function defaultCampaignOrder(rows: readonly AdCampaign[]): AdCampaign[] {
  const rank = (status: string | null) => {
    const word = (status ?? "").trim().toUpperCase();
    if (word === "COMPLETED") return 0;
    if (isActiveStatus(status)) return 1;
    if (word === "PAUSED") return 2;
    return 3;
  };
  return [...rows].sort((a, b) => {
    const byStatus = rank(a.status) - rank(b.status);
    if (byStatus !== 0) return byStatus;
    if (a.startDate === b.startDate) return 0;
    if (a.startDate === null) return 1;
    if (b.startDate === null) return -1;
    // ISO dates (YYYY-MM-DD…) order as text; latest first.
    return b.startDate.localeCompare(a.startDate);
  });
}

/* -------------------------------------------------------------- filters -- */

export type DatePreset = "all" | "today" | "yesterday" | "7d" | "30d" | "custom";

export const DATE_PRESETS: readonly { id: DatePreset; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "custom", label: "Custom" },
];

export interface CampaignFilters {
  search: string;
  /** A status verbatim, or "all". */
  status: string;
  date: DatePreset;
  /** `YYYY-MM-DD` or "", for the custom range. */
  from: string;
  to: string;
  /** As typed; "" is no minimum. */
  minSpend: string;
  minRoas: string;
}

export const NO_FILTERS: CampaignFilters = {
  search: "",
  status: "all",
  date: "all",
  from: "",
  to: "",
  minSpend: "",
  minRoas: "",
};

export function isFiltered(filters: CampaignFilters): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.status !== "all" ||
    filters.date !== "all" ||
    filters.minSpend !== "" ||
    filters.minRoas !== ""
  );
}

/**
 * The days a preset covers, both ends inclusive, as UTC calendar days — the
 * campaign dates are calendar days, so both sides of the comparison are read
 * the same way. Null ends are open. "Last 7 days" includes today.
 */
export function dateRange(
  filters: Pick<CampaignFilters, "date" | "from" | "to">,
  now: Date,
): { from: string | null; to: string | null } {
  const today = utcDay(now);
  const back = (days: number) => utcDay(new Date(Date.parse(`${today}T00:00:00Z`) - days * DAY_MS));
  switch (filters.date) {
    case "all":
      return { from: null, to: null };
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: back(1), to: back(1) };
    case "7d":
      return { from: back(6), to: today };
    case "30d":
      return { from: back(29), to: today };
    case "custom":
      return { from: calendarDay(filters.from), to: calendarDay(filters.to) };
  }
}

/**
 * Was the campaign running at any point in the range? No end date means still
 * running; no start date means we cannot rule it out, so it stays.
 */
export function runsWithin(campaign: AdCampaign, from: string | null, to: string | null): boolean {
  if (to !== null && campaign.startDate !== null && campaign.startDate > to) return false;
  if (from !== null && campaign.endDate !== null && campaign.endDate < from) return false;
  return true;
}

function minimum(typed: string): number | null {
  if (typed.trim() === "") return null;
  const value = Number(typed);
  return Number.isFinite(value) ? value : null;
}

/**
 * The campaigns the filters keep.
 *
 * A campaign with no figure FAILS a minimum rather than passing it: unknown is
 * not small, and letting it through would put "—" rows in a list that claims
 * every row spent at least 50 (same rule as `campaign-table.tsx`).
 */
export function filterCampaigns(rows: readonly AdCampaign[], filters: CampaignFilters, now: Date): AdCampaign[] {
  const needle = filters.search.trim().toLowerCase();
  const { from, to } = dateRange(filters, now);
  const minSpend = minimum(filters.minSpend);
  const minRoas = minimum(filters.minRoas);

  return rows.filter((row) => {
    if (needle !== "" && !row.campaign.toLowerCase().includes(needle)) return false;
    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (!runsWithin(row, from, to)) return false;
    if (minSpend !== null && (row.spend === null || row.spend < minSpend)) return false;
    if (minRoas !== null && (row.roas === null || row.roas < minRoas)) return false;
    return true;
  });
}

/** Every status present, for the dropdown — an option that matches nothing only disappoints. */
export function statusesOf(rows: readonly AdCampaign[]): string[] {
  return [...new Set(rows.map((row) => row.status).filter((s): s is string => s !== null))].sort();
}

/* --------------------------------------------------------------- budget -- */

export type BudgetTone = "good" | "warn" | "crit";

/**
 * How much of the planned amount is gone: good under 90%, warn from 90%, crit
 * at or past it. Null when either side is unknown — no bar beats a made-up one.
 */
export function budgetUse(campaign: AdCampaign): { share: number; tone: BudgetTone } | null {
  const share = per(campaign.spend, campaign.estimatedAmount);
  if (share === null) return null;
  return { share, tone: share >= 1 ? "crit" : share >= 0.9 ? "warn" : "good" };
}
