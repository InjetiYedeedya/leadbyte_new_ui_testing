import { ApiError, apiRequest } from "@/lib/api/client";
import { isBackendConfigured } from "@/lib/api/config";
import { isRedirectError } from "@/lib/auth/session-expired";
import type { BillingPeriod } from "@/lib/data/pricing-catalog";
import type { Currency } from "@/lib/billing/price-sheet";
import {
  mapCouponOffers,
  mapCouponQuote,
  type CouponFlow,
  type CouponOffer,
  type CouponQuote,
} from "@/lib/billing/coupon-quote";

/**
 * The coupon calls. Server-only (they reach `lib/api/client.ts`).
 *
 * Neither ever throws. Listing or checking a coupon charges nothing, so it is
 * NOT behind `assertBillingSafe()`; the charge that follows is. An endpoint
 * that is not deployed yet answers 404, and that reads as "no coupons" and
 * "coupons aren't available yet" rather than as a broken checkout.
 */

export type CouponCheck = { ok: true; quote: CouponQuote } | { ok: false; message: string };

const NOT_AVAILABLE = "Coupons aren't available yet.";

export async function listCouponOffers(currency: Currency, flow: CouponFlow): Promise<CouponOffer[]> {
  if (!isBackendConfigured()) return [];
  try {
    const raw = await apiRequest<unknown>(`/api/coupons/available?currency=${currency}`);
    return mapCouponOffers(raw, currency, flow);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (!(error instanceof ApiError && error.status === 404)) {
      console.warn("[coupons] could not list coupons:", error instanceof Error ? error.message : error);
    }
    return [];
  }
}

async function check(body: Record<string, unknown>): Promise<CouponCheck> {
  if (!isBackendConfigured()) return { ok: false, message: NOT_AVAILABLE };
  try {
    const raw = await apiRequest<unknown>("/api/coupons/validate", { method: "POST", body });
    const quote = mapCouponQuote(raw);
    return quote ? { ok: true, quote } : { ok: false, message: "That coupon could not be applied." };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof ApiError && error.status === 404 && !error.code) return { ok: false, message: NOT_AVAILABLE };
    // The backend's own sentence ("This coupon has expired") is the useful one.
    const message = error instanceof ApiError && error.message.trim() !== "" && !/^leadbyte-api returned \d+$/.test(error.message)
      ? error.message.slice(0, 160)
      : "That coupon could not be applied.";
    return { ok: false, message };
  }
}

/** A coupon against a one-time cart. */
export function checkCartCoupon(input: {
  code: string;
  currency: Currency;
  billingPeriod: BillingPeriod;
  agentIds: readonly string[];
}): Promise<CouponCheck> {
  return check({
    code: input.code,
    currency: input.currency,
    billing_period: input.billingPeriod,
    cart_items: input.agentIds.map((id) => ({ id })),
  });
}

/** A coupon against one agent's autopay: it applies to the first month only. */
export function checkAutopayCoupon(input: { code: string; currency: Currency; agentId: string }): Promise<CouponCheck> {
  return check({ code: input.code, flow: "autopay", agent_id: input.agentId, currency: input.currency });
}
