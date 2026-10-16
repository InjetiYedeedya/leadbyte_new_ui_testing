import type { BillingPeriod, PricingAgent } from "@/lib/data/pricing-catalog";
import { YEARLY_DISCOUNT } from "@/lib/data/pricing-catalog";

/**
 * What every agent costs, in one currency — the single answer the Pricing
 * page, Checkout and Autopay all read, so the price a customer is shown and
 * the price they are sent to pay can never come from two places.
 *
 * ## Two sources, one shape
 *
 * - `live`: the admin pricing table, via `GET /api/pricing?currency=`. The
 *   contract is the one in the billing handoff (LeadByteBilling.tsx,
 *   2026-09-28). Live on leadbyte-api_v1 (probed 2026-09-28).
 * - `catalog`: `PRICING_AGENTS`, in USD, when the live read is unavailable.
 *   An unreachable pricing table must not take the Pricing page down.
 *
 * Features and tags only exist in the catalog (they are this app's copy),
 * so a live agent borrows them from its catalog entry by id.
 *
 * Pure, so every rule about money here is tested.
 */

export type Currency = "INR" | "USD";
export const CURRENCIES: readonly Currency[] = ["USD", "INR"];

export function isCurrency(value: unknown): value is Currency {
  return value === "INR" || value === "USD";
}

export interface PriceDiscount {
  kind: "percent" | "fixed";
  /** Set for `percent`. */
  percent: number | null;
  /** Set for `fixed`, in the sheet's currency. */
  amount: number | null;
  label: string;
  endsAt: string | null;
}

export interface AgentPriceLine {
  id: string;
  title: string;
  description: string;
  tag: string;
  features: string[];
  isCustom: boolean;
  /** Before the agent's own discount. Null for the custom agent. */
  baseMonthly: number | null;
  /** After it: what a month costs today. */
  monthly: number | null;
  discount: PriceDiscount | null;
  yearlyDiscountPercent: number;
  yearlyPerMonth: number | null;
  yearlyTotal: number | null;
  /** The pricing table's row version, sent back so a stale price is refused. */
  version: number | null;
}

export interface PriceSheet {
  currency: Currency;
  source: "live" | "catalog";
  agents: AgentPriceLine[];
}

// ───────────────────────────── Reading ─────────────────────────────

type Raw = Record<string, unknown>;
const record = (value: unknown): Raw => (value && typeof value === "object" ? (value as Raw) : {});
const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const str = (value: unknown): string => (typeof value === "string" ? value : "");

function readDiscount(raw: unknown): PriceDiscount | null {
  const d = record(raw);
  const kind = d.type === "fixed" ? "fixed" : d.type === "percent" ? "percent" : null;
  if (kind === null) return null;
  const percent = num(d.percent);
  const amount = num(d.amount);
  // A discount with no size is no discount, not "0% off".
  if ((kind === "percent" && !percent) || (kind === "fixed" && !amount)) return null;
  return { kind, percent, amount, label: str(d.label), endsAt: str(d.ends_at) || null };
}

/**
 * The live response, as a sheet — or null when it carries nothing usable,
 * so the caller falls back to the catalog rather than showing an empty page.
 * Agents with no price in this currency are not sold in it and are left out.
 */
export function mapLivePricing(
  raw: unknown,
  currency: Currency,
  catalog: readonly PricingAgent[],
): PriceSheet | null {
  const list = record(raw).agents;
  if (!Array.isArray(list)) return null;

  const agents = list
    .map((entry) => {
      const agent = record(entry);
      const id = str(agent.agent_id);
      const price = record(record(agent.prices)[currency]);
      const monthly = num(price.monthly_price);
      const baseMonthly = num(price.base_monthly_price);
      if (id === "" || monthly === null || baseMonthly === null) return null;
      const known = catalog.find((c) => c.id === id);
      const line: AgentPriceLine = {
        id,
        title: str(agent.title) || known?.title || id,
        description: str(agent.description) || known?.description || "",
        tag: known?.tag ?? "",
        features: known?.features ?? [],
        isCustom: false,
        baseMonthly,
        monthly,
        discount: readDiscount(price.discount),
        yearlyDiscountPercent: num(price.yearly_discount_percent) ?? 0,
        yearlyPerMonth: num(price.yearly_price_per_month),
        yearlyTotal: num(price.yearly_total),
        version: num(price.pricing_version),
      };
      return { line, order: num(agent.sort_order) ?? Number.MAX_SAFE_INTEGER };
    })
    .filter((entry): entry is { line: AgentPriceLine; order: number } => entry !== null)
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.line);

  if (agents.length === 0) return null;
  return { currency, source: "live", agents: [...agents, ...customLines(catalog)] };
}

function customLines(catalog: readonly PricingAgent[]): AgentPriceLine[] {
  return catalog.filter((agent) => agent.isCustom).map((agent) => catalogLine(agent));
}

function catalogLine(agent: PricingAgent): AgentPriceLine {
  const monthly = agent.monthlyPrice;
  const base = agent.wasPrice ?? monthly;
  const percent = monthly !== null && base !== null && base > monthly ? Math.round((1 - monthly / base) * 100) : null;
  const yearlyPerMonth = monthly === null ? null : Math.round(monthly * (1 - YEARLY_DISCOUNT));
  return {
    id: agent.id,
    title: agent.title,
    description: agent.description,
    tag: agent.tag,
    features: agent.features,
    isCustom: agent.isCustom,
    baseMonthly: base,
    monthly,
    discount: percent ? { kind: "percent", percent, amount: null, label: "", endsAt: null } : null,
    yearlyDiscountPercent: Math.round(YEARLY_DISCOUNT * 100),
    yearlyPerMonth,
    yearlyTotal: yearlyPerMonth === null ? null : yearlyPerMonth * 12,
    version: null,
  };
}

/** Today's price list, in USD — the fallback when the live table cannot be read. */
export function catalogSheet(catalog: readonly PricingAgent[]): PriceSheet {
  return { currency: "USD", source: "catalog", agents: catalog.map(catalogLine) };
}

// ───────────────────────────── Prices ─────────────────────────────

export function findLine(sheet: PriceSheet, id: string): AgentPriceLine | undefined {
  return sheet.agents.find((agent) => agent.id === id);
}

/** What one agent costs in a checkout: a month, or the year's total. */
export function chargeFor(line: AgentPriceLine, period: BillingPeriod): number | null {
  return period === "yearly" ? line.yearlyTotal : line.monthly;
}

/**
 * The struck-through price beside it, or null when there is nothing to
 * strike. Yearly: the year at the yearly rate without the agent's discount.
 */
export function wasFor(line: AgentPriceLine, period: BillingPeriod): number | null {
  if (line.baseMonthly === null || line.monthly === null || line.baseMonthly <= line.monthly) return null;
  if (period === "monthly") return line.baseMonthly;
  return Math.round((line.baseMonthly * (100 - line.yearlyDiscountPercent)) / 100) * 12;
}

/** Autopay: the first month carries the discount, every later month is full price. */
export function autopayFor(line: AgentPriceLine): { first: number; renewal: number } | null {
  if (line.monthly === null || line.baseMonthly === null) return null;
  return { first: line.monthly, renewal: line.baseMonthly };
}

/** The total for a selection. Unknown and custom agents add nothing. */
export function sheetTotal(sheet: PriceSheet, ids: readonly string[], period: BillingPeriod): number {
  return ids.reduce((sum, id) => {
    const line = findLine(sheet, id);
    const charge = line ? chargeFor(line, period) : null;
    return charge === null ? sum : sum + charge;
  }, 0);
}

/** What a year at the yearly rate saves over twelve monthly charges. */
export function yearlySavings(sheet: PriceSheet, ids: readonly string[]): number {
  const saved = sheetTotal(sheet, ids, "monthly") * 12 - sheetTotal(sheet, ids, "yearly");
  return Math.max(0, Math.round(saved * 100) / 100);
}

// ───────────────────────────── Money ─────────────────────────────

/** A price with its symbol. Whole amounts drop the decimals; others keep two. */
export function formatCurrency(value: number, currency: Currency): string {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** "20% off" or "$3 off". */
export function discountText(discount: PriceDiscount, currency: Currency): string {
  return discount.kind === "fixed"
    ? `${formatCurrency(discount.amount ?? 0, currency)} off`
    : `${discount.percent}% off`;
}

/**
 * Which currency a visitor starts in: their explicit choice, else INR for a
 * visitor the host places in India, else USD. They can always switch.
 */
export function defaultCurrency(choice: unknown, countryHeader: string | null): Currency {
  if (isCurrency(choice)) return choice;
  return countryHeader?.trim().toUpperCase() === "IN" ? "INR" : "USD";
}
