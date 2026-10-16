import { billingPost, BillingCallError } from "@/lib/billing/billing-call";
import { refusalOf } from "@/lib/api/refusal";
import type { BillingPeriod } from "@/lib/data/pricing-catalog";
import type { Currency } from "@/lib/billing/price-sheet";

/**
 * Razorpay (INR) and autopay, on the backend routes the billing handoff
 * names (2026-09-28). All answer on leadbyte-api_v1 (probed 2026-09-28).
 *
 * Server-only. Every call goes through `billingPost`, so every one is behind
 * `assertBillingSafe()`. What comes back is only what the browser needs to
 * open Razorpay's own popup: a public key id and an order or subscription id.
 * Card details never touch this app.
 */

type Raw = Record<string, unknown>;
const record = (value: unknown): Raw => (value && typeof value === "object" ? (value as Raw) : {});
const str = (value: unknown): string => (typeof value === "string" ? value : "");
const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * A verify answer is only a pass when it says so. `billingPost` throws on a
 * non-2xx status, but a 200 carrying `{ success: false }` — or
 * `verified: false` — was read as a verified payment: the cart was cleared and
 * "Payment successful" shown for a charge that failed (audit, 2026-09-29).
 * `verifyStripePayment` already checked this; these three did not.
 */
function assertVerified(path: string, payload: unknown): void {
  const refusal = refusalOf(payload);
  const body = record(payload);
  if (refusal !== null || body.verified === false) {
    throw new BillingCallError(
      `${path} did not verify: ${JSON.stringify(payload)}`,
      refusal ?? "The payment could not be verified.",
      false,
      null,
      str(body.code) || undefined,
    );
  }
}

function missing(path: string, payload: unknown): never {
  throw new BillingCallError(`${path} answered without what it promised: ${JSON.stringify(payload)}`, undefined, false, null, undefined);
}

// ───────────────────────────── One-time, INR ─────────────────────────────

export interface RazorpayOrder {
  keyId: string;
  orderId: string;
  /** In paise, as Razorpay expects it. */
  amount: number;
  prefill: { name?: string; email?: string; contact?: string };
}

export interface OneTimeInput {
  email: string;
  userId?: string;
  companyName: string;
  billingFirstName: string;
  billingLastName: string;
  address: string;
  zipCode: string;
  gstin: string;
  billingPeriod: BillingPeriod;
  items: { id: string; title: string; charge: number }[];
  expectedTotal: number;
  couponCode?: string;
}

export async function createRazorpayOrder(input: OneTimeInput): Promise<RazorpayOrder> {
  const path = "/razorpay/create-order";
  const payload = record(
    await billingPost<unknown>(path, {
      email: input.email,
      user_id: input.userId,
      company_name: input.companyName,
      billing_first_name: input.billingFirstName,
      billing_last_name: input.billingLastName,
      address: input.address,
      zip_code: input.zipCode,
      ...(input.gstin !== "" ? { gstin: input.gstin } : {}),
      country: "IN",
      currency: "INR",
      billing_period: input.billingPeriod,
      cart_items: input.items.map((item) => ({ id: item.id, title: item.title, expected_price: item.charge })),
      expected_total: input.expectedTotal,
      ...(input.couponCode ? { coupon_code: input.couponCode } : {}),
    }),
  );
  const keyId = str(payload.key_id);
  const orderId = str(payload.razorpay_order_id);
  const amount = num(payload.amount);
  if (keyId === "" || orderId === "" || amount === null) missing(path, payload);
  const prefill = record(payload.prefill);
  return {
    keyId,
    orderId,
    amount,
    prefill: { name: str(prefill.name) || undefined, email: str(prefill.email) || undefined, contact: str(prefill.contact) || undefined },
  };
}

/** What Razorpay's popup hands back on success, passed on to be checked. */
export interface RazorpayProof {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_subscription_id?: string;
  razorpay_signature: string;
}

/** Checked by the backend against Razorpay's signature, never trusted as sent. */
export async function verifyRazorpayPayment(proof: RazorpayProof): Promise<{ orderId: string }> {
  const raw = await billingPost<unknown>("/razorpay/verify-payment", { ...proof });
  assertVerified("/razorpay/verify-payment", raw);
  const payload = record(raw);
  return { orderId: str(payload.order_id) || proof.razorpay_order_id || "" };
}

// ───────────────────────────── Autopay ─────────────────────────────

export interface AutopayInput {
  agentId: string;
  currency: Currency;
  /** The first month, after the agent's discount and any coupon. */
  expectedAmount: number;
  /** Every month after. */
  expectedRenewal: number;
  couponCode?: string;
}

function autopayBody(input: AutopayInput): Record<string, unknown> {
  return {
    agent_id: input.agentId,
    currency: input.currency,
    expected_amount: input.expectedAmount,
    expected_renewal_amount: input.expectedRenewal,
    ...(input.couponCode ? { coupon_code: input.couponCode } : {}),
  };
}

/** USD: a Stripe-hosted page, returning to /autopay-success. */
export async function createStripeSubscription(input: AutopayInput, baseUrl: string): Promise<{ sessionUrl: string }> {
  const path = "/stripe/subscriptions/create";
  const payload = record(await billingPost<unknown>(path, { ...autopayBody(input), success_url: `${baseUrl}/autopay-success` }));
  const sessionUrl = str(payload.session_url);
  if (sessionUrl === "") missing(path, payload);
  return { sessionUrl };
}

export interface RazorpaySubscription {
  keyId: string;
  subscriptionId: string;
}

/** INR: a Razorpay subscription, confirmed in its popup. */
export async function createRazorpaySubscription(input: AutopayInput): Promise<RazorpaySubscription> {
  const path = "/razorpay/subscriptions/create";
  const payload = record(await billingPost<unknown>(path, autopayBody(input)));
  const keyId = str(payload.key_id);
  const subscriptionId = str(payload.subscription_id);
  if (keyId === "" || subscriptionId === "") missing(path, payload);
  return { keyId, subscriptionId };
}

export async function verifyRazorpaySubscription(proof: RazorpayProof): Promise<void> {
  const raw = await billingPost<unknown>("/razorpay/subscriptions/verify", { ...proof });
  assertVerified("/razorpay/subscriptions/verify", raw);
}

export type AutopayVerifyResult =
  | { status: "active"; nextChargeAt: string | null; renewalAmount: number | null }
  | { status: "processing" };

/** Stripe's return: has the subscription started yet? */
export async function verifyStripeSubscription(sessionId: string): Promise<AutopayVerifyResult> {
  const raw = await billingPost<unknown>("/stripe/subscriptions/verify", { session_id: sessionId });
  assertVerified("/stripe/subscriptions/verify", raw);
  const payload = record(raw);
  if (payload.status === "processing") return { status: "processing" };
  // Only a status that says the subscription started counts as started. Every
  // other value — "failed", "canceled", "incomplete", or none — used to read
  // as active.
  const status = str(payload.status).toLowerCase();
  if (status !== "" && !["active", "trialing", "complete", "completed", "paid", "succeeded"].includes(status)) {
    throw new BillingCallError(
      `/stripe/subscriptions/verify answered status ${status}`,
      "Autopay did not start. Please check your payment method and try again.",
      false,
      null,
      undefined,
    );
  }
  return {
    status: "active",
    nextChargeAt: str(payload.next_charge_at) || null,
    renewalAmount: num(payload.renewal_amount),
  };
}
