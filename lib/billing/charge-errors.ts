import { ApiError } from "@/lib/api/client";

/**
 * The two refusals a charge can come back with that are the customer's to
 * act on rather than a fault, per the billing handoff (2026-09-28):
 *
 * - `PRICE_CHANGED` (409): an admin changed a price between the page being
 *   shown and the charge. Nothing was charged; the new price must be shown
 *   before anyone pays it.
 * - `COUPON_*`: the coupon stopped applying (expired, used up, not for this
 *   agent). Nothing was charged; the coupon is dropped.
 *
 * Shared by Stripe and Razorpay, one-time and autopay, so all four say the
 * same thing.
 */

export type ChargeRefusal = "price-changed" | "coupon";

export const PRICE_CHANGED_MESSAGE = "A price was just updated. Please review the new total and pay again.";

export function chargeRefusal(error: unknown): ChargeRefusal | null {
  if (!(error instanceof ApiError) || !error.code) return null;
  if (error.code === "PRICE_CHANGED") return "price-changed";
  if (error.code.startsWith("COUPON_")) return "coupon";
  return null;
}

/** What to tell the customer for a refusal. */
export function refusalMessage(refusal: ChargeRefusal, error: unknown): string {
  if (refusal === "price-changed") return PRICE_CHANGED_MESSAGE;
  const reason = error instanceof Error && error.message.trim() !== "" ? error.message.trim().replace(/\.$/, "") : "That coupon no longer applies";
  return `${reason}. The coupon was removed.`;
}
