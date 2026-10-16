import { discountText, type Currency } from "@/lib/billing/price-sheet";

/**
 * Coupons, as the screens need them: the offers a customer can pick from, and
 * the quote for one applied to a cart or an autopay.
 *
 * The contract is the billing handoff's (LeadByteBilling.tsx, 2026-09-28):
 * `GET /api/coupons/available?currency=` and `POST /api/coupons/validate`.
 * Both answer on leadbyte-api_v1 (probed 2026-09-28).
 *
 * Coupons are offered on the FINAL step only (Checkout's summary, Autopay's
 * confirmation), never on the Pricing page. Pure, so it is tested.
 */

export type CouponFlow = "one_time" | "autopay";

export interface CouponOffer {
  code: string;
  description: string;
  /** "20% off" / "₹200 off", in the currency being paid. Empty when it has no size there. */
  label: string;
  /** Sent to this customer's email only, rather than listed for everyone. */
  personal: boolean;
  endsAt: string | null;
}

export interface CouponQuote {
  code: string;
  description: string;
  subtotal: number;
  discount: number;
  total: number;
  /** Per agent, so each line can show its own share of the saving. */
  lines: { id: string; discount: number; final: number }[];
  /** Autopay only: the discounted first month, and every month after. */
  firstMonth: number | null;
  renewal: number | null;
}

type Raw = Record<string, unknown>;
const record = (value: unknown): Raw => (value && typeof value === "object" ? (value as Raw) : {});
const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const str = (value: unknown): string => (typeof value === "string" ? value : "");

function offerLabel(coupon: Raw, currency: Currency): string {
  if (coupon.discount_type === "percent") {
    const percent = num(coupon.percent_off);
    return percent ? discountText({ kind: "percent", percent, amount: null, label: "", endsAt: null }, currency) : "";
  }
  const amount = num(record(coupon.amount_off)[currency]);
  return amount ? discountText({ kind: "fixed", percent: null, amount, label: "", endsAt: null }, currency) : "";
}

/**
 * The coupons a customer can pick from on this step. One with no size in
 * this currency is left out: offering "DIWALI · " with no discount beside it
 * is offering nothing.
 */
export function mapCouponOffers(raw: unknown, currency: Currency, flow: CouponFlow): CouponOffer[] {
  const list = record(raw).coupons;
  if (!Array.isArray(list)) return [];
  return list
    .map(record)
    .filter((coupon) => Array.isArray(coupon.flows) && coupon.flows.includes(flow))
    .map((coupon) => ({
      code: str(coupon.code).trim().toUpperCase(),
      description: str(coupon.description),
      label: offerLabel(coupon, currency),
      personal: coupon.personal === true,
      endsAt: str(coupon.ends_at) || null,
    }))
    .filter((offer) => offer.code !== "" && offer.label !== "");
}

/** A validate answer as a quote, or null when it does not add up to one. */
export function mapCouponQuote(raw: unknown): CouponQuote | null {
  const quote = record(raw);
  const coupon = record(quote.coupon);
  const code = str(coupon.code).trim().toUpperCase();
  const subtotal = num(quote.subtotal);
  const discount = num(quote.discount);
  const total = num(quote.total);
  if (code === "" || subtotal === null || discount === null || total === null) return null;
  // A quote that charges more than it started from, or less than nothing, is
  // not one to put in front of a customer.
  if (total < 0 || total > subtotal) return null;
  const lines = Array.isArray(quote.lines)
    ? quote.lines.map(record).map((line) => ({
        id: str(line.id),
        discount: num(line.discount) ?? 0,
        final: num(line.final) ?? 0,
      }))
    : [];
  return {
    code,
    description: str(coupon.description),
    subtotal,
    discount,
    total,
    lines: lines.filter((line) => line.id !== ""),
    firstMonth: num(quote.first_month_amount),
    renewal: num(quote.renewal_amount),
  };
}

/** A code as typed, the way the backend stores it. Empty for nothing usable. */
export function normaliseCouponCode(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "") : "";
}
