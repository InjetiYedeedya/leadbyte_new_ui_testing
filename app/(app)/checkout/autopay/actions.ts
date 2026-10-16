"use server";

import { redirect } from "next/navigation";
import { getSession, type Session } from "@/lib/auth/session";
import { APP_URL } from "@/lib/api/config";
import { isRedirectError } from "@/lib/auth/session-expired";
import { BillingDisabledError, BILLING_UNAVAILABLE_MESSAGE } from "@/lib/billing/guard";
import { billingErrorMessage } from "@/lib/billing/billing-call";
import { getPriceSheet } from "@/lib/billing/live-pricing";
import { autopayFor, findLine, isCurrency, type Currency } from "@/lib/billing/price-sheet";
import { checkAutopayCoupon, type CouponCheck } from "@/lib/billing/coupons";
import { normaliseCouponCode } from "@/lib/billing/coupon-quote";
import {
  createRazorpaySubscription,
  createStripeSubscription,
  verifyRazorpaySubscription,
  type RazorpayProof,
} from "@/lib/billing/payments";

/**
 * Autopay's Server Actions: one agent, charged monthly. The first month
 * carries the agent's discount and any coupon; every later month is the full
 * price, and an admin's price change applies from the next month.
 *
 * As with Checkout, only an agent id, a currency and a coupon CODE come in:
 * both amounts are worked out here from the price sheet and the backend's
 * coupon quote, and sent as `expected_*` so a stale price is refused.
 */

type Plan = {
  session: Session;
  agentId: string;
  title: string;
  currency: Currency;
  first: number;
  renewal: number;
  couponCode?: string;
};

async function plan(agentId: string, rawCurrency: string, rawCode: string): Promise<{ ok: true; plan: Plan } | { ok: false; message: string }> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isCurrency(rawCurrency)) return { ok: false, message: "Choose a currency on the Pricing page." };

  const sheet = await getPriceSheet(rawCurrency);
  if (sheet.currency !== rawCurrency) return { ok: false, message: `Autopay in ${rawCurrency} isn't available yet.` };
  const line = findLine(sheet, agentId);
  const amounts = line ? autopayFor(line) : null;
  if (!line || !amounts) return { ok: false, message: "This agent can't be put on autopay." };

  const code = normaliseCouponCode(rawCode);
  let first = amounts.first;
  if (code !== "") {
    const check = await checkAutopayCoupon({ code, currency: sheet.currency, agentId });
    if (!check.ok) return { ok: false, message: `${check.message.replace(/\.$/, "")}. The coupon was removed.` };
    first = check.quote.firstMonth ?? check.quote.total;
  }

  return {
    ok: true,
    plan: {
      session,
      agentId,
      title: line.title,
      currency: sheet.currency,
      first,
      renewal: amounts.renewal,
      ...(code !== "" ? { couponCode: code } : {}),
    },
  };
}

function failure(error: unknown): { ok: false; message: string } {
  if (error instanceof BillingDisabledError) return { ok: false, message: BILLING_UNAVAILABLE_MESSAGE };
  return { ok: false, message: billingErrorMessage(error, "We couldn't start autopay. Please try again.") };
}

export async function previewAutopayCoupon(agentId: string, currency: string, rawCode: string): Promise<CouponCheck> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Please sign in again." };
  const code = normaliseCouponCode(rawCode);
  if (code === "") return { ok: false, message: "Enter a coupon code." };
  if (!isCurrency(currency)) return { ok: false, message: "Choose a currency on the Pricing page." };
  return checkAutopayCoupon({ code, currency, agentId });
}

/** USD: Stripe's hosted page. Redirects there, or returns why it could not. */
export async function startStripeAutopay(agentId: string, currency: string, rawCode: string): Promise<{ ok: false; message: string }> {
  const planned = await plan(agentId, currency, rawCode);
  if (!planned.ok) return planned;
  const { plan: p } = planned;
  if (p.currency !== "USD") return { ok: false, message: "INR autopay runs through Razorpay." };

  let sessionUrl: string;
  try {
    ({ sessionUrl } = await createStripeSubscription(
      { agentId: p.agentId, currency: p.currency, expectedAmount: p.first, expectedRenewal: p.renewal, couponCode: p.couponCode },
      APP_URL,
    ));
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return failure(error);
  }
  // Outside the try: `redirect()` throws, and a catch must never mistake it
  // for a failure (CLAUDE.md rule 4).
  redirect(sessionUrl);
}

export type RazorpayAutopayStart =
  | { ok: true; keyId: string; subscriptionId: string; description: string; email: string }
  | { ok: false; message: string };

/** INR: create the subscription Razorpay's popup will confirm. */
export async function startRazorpayAutopay(agentId: string, currency: string, rawCode: string): Promise<RazorpayAutopayStart> {
  const planned = await plan(agentId, currency, rawCode);
  if (!planned.ok) return planned;
  const { plan: p } = planned;
  if (p.currency !== "INR") return { ok: false, message: "USD autopay runs through Stripe." };
  try {
    const subscription = await createRazorpaySubscription({
      agentId: p.agentId,
      currency: p.currency,
      expectedAmount: p.first,
      expectedRenewal: p.renewal,
      couponCode: p.couponCode,
    });
    return { ok: true, ...subscription, description: `${p.title}, monthly autopay`, email: p.session.businessId };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return failure(error);
  }
}

/** INR: the backend checks Razorpay's signature before the agent unlocks. */
export async function confirmRazorpayAutopay(proof: RazorpayProof): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await getSession();
  if (!session) redirect("/login");
  try {
    await verifyRazorpaySubscription(proof);
    return { ok: true };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      ok: false,
      message: billingErrorMessage(
        error,
        "We couldn't confirm autopay yet. If you were charged, your agent unlocks automatically.",
      ),
    };
  }
}
