import { ApiTimeoutError, apiRequest } from "@/lib/api/client";
import { isRedirectError } from "@/lib/auth/session-expired";
import { assertBillingSafe } from "@/lib/billing/guard";
import { chargeRefusal, refusalMessage, type ChargeRefusal } from "@/lib/billing/charge-errors";
import type { Currency } from "@/lib/billing/price-sheet";
import type { BillingPeriod } from "@/lib/data/pricing-catalog";

/**
 * The two Stripe calls, and nothing else.
 *
 * ## The contract
 *
 *   POST /stripe/create-checkout-session
 *     { company_name, ein, billing_first_name, billing_last_name, address,
 *       zip_code, email, cart_items, user_id, billing_period, amount,
 *       base_url, success_url }
 *     -> { success, session_url, order_id }
 *
 *   POST /stripe/verify-payment
 *     { session_id, order_id }
 *     -> { success, transaction_id, order_id, amount_paid,
 *          subscription_end_date, billing_period }
 *     -> { success: true, status: "processing", order_id }   (not done yet)
 *     -> { success: false, error, order_id? }
 *
 * Confirmed against the legacy production site's own `Checkout.jsx` /
 * `PaymentSuccess.jsx` and the backend's documented contract
 * (`docs/migration/2026-08-28-legacy-parity-inventory.md` §3.7).
 *
 * ## Why every function here starts with `assertBillingSafe()`
 *
 * The backend's Stripe key is LIVE. `assertBillingSafe()` throws unless
 * `LEADBYTE_BILLING_MODE` has been explicitly set, which today it has not —
 * so in this environment BOTH functions below throw before building a
 * request, every time, by design. That is not a bug to work around; it is
 * the entire reason this module can exist and be reviewed at all. See
 * `lib/billing/guard.ts`.
 *
 * ## The price is OURS, because the backend trusts whatever it is sent
 *
 * The backend charges `cart_items[].price` exactly as received — it does not
 * look prices up itself (PAYMENT_FLOW.md §9.1; this comment used to claim the
 * opposite). The top-level `amount` is ignored. So every price in this body
 * comes from `PRICING_AGENTS` on our server, never from the browser, and the
 * cart cookie carries agent ids only. That protects checkout through THIS
 * app; a request sent straight to the Lambda can still name its own price,
 * and only a server-side price list in the backend closes that.
 * `cart_items[].price` is the base MONTHLY price; for `billing_period:
 * "yearly"` the backend applies its own rounded discount, which
 * `billedPrice` mirrors for the on-screen total.
 */

/**
 * n8n commits the order row and then keeps checking with Stripe, so this can
 * legitimately take longer than a data read.
 */
const CHECKOUT_TIMEOUT_MS = 30_000;
const VERIFY_TIMEOUT_MS = 30_000;

export class StripeCheckoutError extends Error {
  constructor(
    message: string,
    readonly userMessage?: string,
    /**
     * True when WE stopped waiting rather than the backend refusing — see
     * `GoogleSaveError`'s identical field. A checkout call that outran our
     * deadline may well have created the order; the caller must not report
     * it as a plain failure.
     */
    readonly timedOut: boolean = false,
    /** Set when the backend refused for a reason the customer acts on. */
    readonly refusal: ChargeRefusal | null = null,
  ) {
    super(message);
    this.name = "StripeCheckoutError";
  }
}

export interface CheckoutSession {
  sessionUrl: string;
  orderId: string;
}

export async function createStripeCheckoutSession(input: {
  companyName: string;
  ein: string;
  billingFirstName: string;
  billingLastName: string;
  address: string;
  zipCode: string;
  email: string;
  userId?: string;
  /**
   * What is being bought. `monthlyPrice` is the field the deployed backend
   * already reads (as `price`); `charge` is what this checkout shows for the
   * period, sent as `expected_price` so the new backend can refuse a stale one.
   */
  items: { id: string; title: string; monthlyPrice: number; charge: number }[];
  currency: Currency;
  /** Applied on the final step; the backend re-checks it before charging. */
  couponCode?: string;
  billingPeriod: BillingPeriod;
  amount: number;
  /** This app's own origin — `success_url` is built from it, never from a
      client-supplied value, so a forged Host header cannot redirect Stripe
      to somewhere else after payment. */
  baseUrl: string;
}): Promise<CheckoutSession> {
  assertBillingSafe();

  const body = {
    company_name: input.companyName,
    ein: input.ein,
    billing_first_name: input.billingFirstName,
    billing_last_name: input.billingLastName,
    address: input.address,
    zip_code: input.zipCode,
    email: input.email,
    cart_items: input.items.map((item) => ({
      id: item.id,
      title: item.title,
      price: item.monthlyPrice,
      expected_price: item.charge,
    })),
    user_id: input.userId,
    billing_period: input.billingPeriod,
    amount: input.amount,
    // The newer contract: the currency, the total the customer was shown,
    // and the coupon. The deployed backend ignores them; the new one refuses
    // a charge that does not match (409 PRICE_CHANGED) rather than taking it.
    currency: input.currency,
    expected_total: input.amount,
    ...(input.couponCode ? { coupon_code: input.couponCode } : {}),
    base_url: input.baseUrl,
    success_url: `${input.baseUrl}/payment-success`,
  };

  let payload: { success?: boolean; session_url?: string; order_id?: string; error?: string };
  try {
    payload = await apiRequest("/stripe/create-checkout-session", {
      method: "POST",
      body,
      timeoutMs: CHECKOUT_TIMEOUT_MS,
    });
  } catch (error) {
    // A dead session leaves as a redirect, not as this call's own failure —
    // see isRedirectError in session-expired.ts.
    if (isRedirectError(error)) throw error;
    if (error instanceof ApiTimeoutError) {
      throw new StripeCheckoutError(
        "create-checkout-session timed out",
        undefined,
        true,
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    const refusal = chargeRefusal(error);
    if (refusal) {
      throw new StripeCheckoutError(`create-checkout-session refused: ${detail}`, refusalMessage(refusal, error), false, refusal);
    }
    throw new StripeCheckoutError(`create-checkout-session failed: ${detail}`, humanMessage(detail));
  }

  if (payload.success === false || !payload.session_url || !payload.order_id) {
    throw new StripeCheckoutError(
      `create-checkout-session answered without a session: ${JSON.stringify(payload)}`,
      humanMessage(payload.error ?? ""),
    );
  }

  return { sessionUrl: payload.session_url, orderId: payload.order_id };
}

export type VerifyResult =
  | {
      status: "completed";
      transactionId: string;
      orderId: string;
      amountPaid: number | null;
      billingPeriod: BillingPeriod | null;
      subscriptionEndDate: string | null;
    }
  | { status: "processing"; orderId: string };

export async function verifyStripePayment(input: {
  sessionId: string;
  orderId: string;
}): Promise<VerifyResult> {
  assertBillingSafe();

  let payload: {
    success?: boolean;
    status?: string;
    transaction_id?: string;
    order_id?: string;
    amount_paid?: number;
    billing_period?: string;
    subscription_end_date?: string;
    error?: string;
  };
  try {
    payload = await apiRequest("/stripe/verify-payment", {
      method: "POST",
      body: { session_id: input.sessionId, order_id: input.orderId },
      timeoutMs: VERIFY_TIMEOUT_MS,
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof ApiTimeoutError) {
      throw new StripeCheckoutError("verify-payment timed out", undefined, true);
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new StripeCheckoutError(`verify-payment failed: ${detail}`, humanMessage(detail));
  }

  if (payload.status === "processing") {
    return { status: "processing", orderId: payload.order_id ?? input.orderId };
  }

  if (payload.success === false || !payload.transaction_id) {
    throw new StripeCheckoutError(
      `verify-payment reported failure: ${JSON.stringify(payload)}`,
      humanMessage(payload.error ?? "Payment was not completed"),
    );
  }

  return {
    status: "completed",
    transactionId: payload.transaction_id,
    orderId: payload.order_id ?? input.orderId,
    amountPaid: typeof payload.amount_paid === "number" ? payload.amount_paid : null,
    billingPeriod: payload.billing_period === "yearly" ? "yearly" : payload.billing_period === "monthly" ? "monthly" : null,
    subscriptionEndDate: payload.subscription_end_date ?? null,
  };
}

/** Anything that looks like a bare status line is ours to phrase, so it is hidden. */
function humanMessage(detail: string): string | undefined {
  const trimmed = detail.trim();
  if (trimmed === "" || /^leadbyte-api returned \d+$/.test(trimmed)) return undefined;
  return trimmed.slice(0, 200);
}
