"use server";

import { signText } from "@/lib/signed-text";
import { redirect } from "next/navigation";
import { getSession, type Session } from "@/lib/auth/session";
import { APP_URL } from "@/lib/api/config";
import { isRedirectError } from "@/lib/auth/session-expired";
import { BillingDisabledError, BILLING_UNAVAILABLE_MESSAGE } from "@/lib/billing/guard";
import { createStripeCheckoutSession, StripeCheckoutError } from "@/lib/billing/stripe-checkout";
import { clearCart, getCart, type Cart } from "@/lib/data/cart";
import { dropEntitlementsCache } from "@/lib/entitlements";
import { isBackendConfigured } from "@/lib/api/config";
import { getEntitlements } from "@/lib/entitlements";
import { readCheckoutForm, validateCheckoutForm, type CheckoutFields } from "@/lib/data/checkout-form";
import { getPriceSheet } from "@/lib/billing/live-pricing";
import { chargeFor, findLine, sheetTotal, type AgentPriceLine, type PriceSheet } from "@/lib/billing/price-sheet";
import { checkCartCoupon, type CouponCheck } from "@/lib/billing/coupons";
import { normaliseCouponCode } from "@/lib/billing/coupon-quote";
import { billingErrorMessage } from "@/lib/billing/billing-call";
import {
  createRazorpayOrder,
  verifyRazorpayPayment,
  type RazorpayOrder,
  type RazorpayProof,
} from "@/lib/billing/payments";

/**
 * Checkout's Server Actions: USD pays on Stripe's page (`submitCheckout`),
 * INR in Razorpay's popup (`startRazorpayCheckout` then
 * `confirmRazorpayPayment`), and the coupon box asks `previewCartCoupon`.
 *
 * ## Nothing from the browser is trusted for money
 *
 * The browser sends the billing form and, at most, a coupon CODE. What is
 * bought comes from the cart cookie, what it costs from the price sheet read
 * here, and what a coupon is worth from the backend — so a forged total or a
 * forged coupon discount has nowhere to go. The totals sent to the backend
 * are the ones this page SHOWED, and the new backend refuses a charge that
 * no longer matches (`PRICE_CHANGED`) rather than taking it.
 *
 * ## Where the redirect sits, and why it must not be inside the try/catch
 *
 * CLAUDE.md's rule 4 records a real bug from exactly this shape: a
 * `redirect()` placed inside a `try/catch` throws its own `NEXT_REDIRECT`
 * signal, and a catch written for something else can turn a SUCCESSFUL
 * action into a reported failure. So the success redirect below is captured
 * as a plain string inside the try and only called AFTER it, never inside it.
 * `isRedirectError` rethrows a dead SESSION's redirect, which is different.
 */

type Prepared = {
  session: Session;
  cart: Cart;
  sheet: PriceSheet;
  fields: CheckoutFields;
  email: string;
  lines: AgentPriceLine[];
  subtotal: number;
  total: number;
  couponCode?: string;
};

type Preparation = { ok: true; prepared: Prepared } | { ok: false; errors: string[]; emptyCart?: boolean };

async function prepare(formData: FormData): Promise<Preparation> {
  const session = await getSession();
  if (!session) redirect("/login");

  const cart = await getCart(session.businessId);
  const sheet = await getPriceSheet(cart.currency);
  if (sheet.currency !== cart.currency) {
    return { ok: false, errors: [`Payment in ${cart.currency} isn't available yet. Choose ${sheet.currency} on the Pricing page.`] };
  }

  const fields = readCheckoutForm(formData);
  // Every problem at once, not just the first — reported one at a time, a
  // long form becomes a guessing game about which answer is being rejected.
  const errors = validateCheckoutForm(fields, sheet.currency);
  if (errors.length > 0) return { ok: false, errors };

  // An agent the account already has is never charged for again. The Pricing
  // page hides them, but a cart filled before a purchase landed can still
  // hold one.
  const owned = isBackendConfigured() ? (await getEntitlements(session.businessId)).agents : [];
  const lines = cart.agentIds
    .filter((id) => !owned.includes(id))
    .map((id) => findLine(sheet, id))
    .filter((line): line is AgentPriceLine => line !== undefined && chargeFor(line, cart.billingPeriod) !== null);
  if (lines.length === 0) return { ok: false, errors: [], emptyCart: true };

  const ids = lines.map((line) => line.id);
  const subtotal = sheetTotal(sheet, ids, cart.billingPeriod);

  const code = normaliseCouponCode(formData.get("couponCode"));
  let total = subtotal;
  if (code !== "") {
    const check = await checkCartCoupon({ code, currency: sheet.currency, billingPeriod: cart.billingPeriod, agentIds: ids });
    if (!check.ok) return { ok: false, errors: [`${check.message.replace(/\.$/, "")}. The coupon was removed.`] };
    total = check.quote.total;
  }

  // The ORDER is saved under this email, and the order is how a purchase is
  // found again (entitlements scan orders by the signed-in email). A typed
  // address made a paid order unfindable and the agent stayed locked
  // (PAYMENT_FLOW.md §9.10), so the signed-in email is used, never the form's.
  const email = session.businessId.includes("@") ? session.businessId : fields.email;

  return {
    ok: true,
    prepared: { session, cart, sheet, fields, email, lines, subtotal, total, ...(code !== "" ? { couponCode: code } : {}) },
  };
}

function backToCheckout(errors: string[]): never {
  redirect(`/checkout?error=${encodeURIComponent(signText(errors.join("|")))}`);
}

/** USD: Stripe's hosted page. */
export async function submitCheckout(formData: FormData): Promise<void> {
  const preparation = await prepare(formData);
  if (!preparation.ok) {
    if (preparation.emptyCart) redirect("/pricing");
    backToCheckout(preparation.errors);
  }
  const { session, cart, sheet, fields, email, lines, total, couponCode } = preparation.prepared;
  if (sheet.currency !== "USD") backToCheckout(["This order is in INR, which is paid through Razorpay."]);

  let sessionUrl: string;
  try {
    const result = await createStripeCheckoutSession({
      companyName: fields.companyName,
      ein: fields.ein,
      billingFirstName: fields.billingFirstName,
      billingLastName: fields.billingLastName,
      address: fields.address,
      zipCode: fields.zipCode,
      email,
      userId: session.userId,
      items: lines.map((line) => ({
        id: line.id,
        title: line.title,
        monthlyPrice: line.monthly ?? 0,
        charge: chargeFor(line, cart.billingPeriod) ?? 0,
      })),
      currency: sheet.currency,
      couponCode,
      billingPeriod: cart.billingPeriod,
      amount: total,
      baseUrl: APP_URL,
    });
    sessionUrl = result.sessionUrl;
  } catch (error) {
    if (isRedirectError(error)) throw error;

    // The real, permanent state of this environment: the backend's Stripe
    // key is live, so this throws every time until LEADBYTE_BILLING_MODE is
    // deliberately set — see lib/billing/guard.ts.
    if (error instanceof BillingDisabledError) backToCheckout([BILLING_UNAVAILABLE_MESSAGE]);

    const message =
      error instanceof StripeCheckoutError && error.userMessage
        ? error.userMessage
        : "We couldn't start checkout. Please try again.";
    backToCheckout([message]);
  }

  redirect(sessionUrl);
}

export type RazorpayStart =
  | { ok: true; order: RazorpayOrder; description: string }
  | { ok: false; errors: string[] };

/** INR, step one: create the order the popup will pay. Returns, never redirects. */
export async function startRazorpayCheckout(formData: FormData): Promise<RazorpayStart> {
  const preparation = await prepare(formData);
  if (!preparation.ok) {
    return { ok: false, errors: preparation.emptyCart ? ["Your cart is empty."] : preparation.errors };
  }
  const { session, cart, sheet, fields, email, lines, total, couponCode } = preparation.prepared;
  if (sheet.currency !== "INR") return { ok: false, errors: ["This order is in USD, which is paid through Stripe."] };

  try {
    const order = await createRazorpayOrder({
      email,
      userId: session.userId,
      companyName: fields.companyName,
      billingFirstName: fields.billingFirstName,
      billingLastName: fields.billingLastName,
      address: fields.address,
      zipCode: fields.zipCode,
      gstin: fields.gstin,
      billingPeriod: cart.billingPeriod,
      items: lines.map((line) => ({ id: line.id, title: line.title, charge: chargeFor(line, cart.billingPeriod) ?? 0 })),
      expectedTotal: total,
      couponCode,
    });
    return { ok: true, order, description: lines.map((line) => line.title).join(", ") };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof BillingDisabledError) return { ok: false, errors: [BILLING_UNAVAILABLE_MESSAGE] };
    return { ok: false, errors: [billingErrorMessage(error, "We couldn't start the payment. Please try again.")] };
  }
}

export type RazorpayConfirm = { ok: true; orderId: string; agentIds: string[] } | { ok: false; message: string };

/**
 * INR, step two: the popup says it was paid; the backend checks Razorpay's
 * signature before anything unlocks. The cart is cleared only once it has.
 */
export async function confirmRazorpayPayment(proof: RazorpayProof): Promise<RazorpayConfirm> {
  const session = await getSession();
  if (!session) redirect("/login");
  try {
    const { orderId } = await verifyRazorpayPayment(proof);
    // Read before the cart is cleared: the Agents page names what was bought.
    const { agentIds } = await getCart(session.businessId);
    await clearCart(session.businessId);
    // The new agents must show as unlocked on the very next page.
    dropEntitlementsCache(session.businessId);
    return { ok: true, orderId, agentIds };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      ok: false,
      message: billingErrorMessage(
        error,
        "We couldn't confirm the payment yet. If you were charged, your agents unlock automatically.",
      ),
    };
  }
}

/**
 * The coupon box on the final step. Only a CODE comes in; the cart, prices
 * and discount are all read here.
 */
export async function previewCartCoupon(rawCode: string): Promise<CouponCheck> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Please sign in again." };
  const code = normaliseCouponCode(rawCode);
  if (code === "") return { ok: false, message: "Enter a coupon code." };

  const cart = await getCart(session.businessId);
  const sheet = await getPriceSheet(cart.currency);
  const ids = cart.agentIds.filter((id) => {
    const line = findLine(sheet, id);
    return line !== undefined && chargeFor(line, cart.billingPeriod) !== null;
  });
  if (ids.length === 0) return { ok: false, message: "Your cart is empty." };
  return checkCartCoupon({ code, currency: sheet.currency, billingPeriod: cart.billingPeriod, agentIds: ids });
}
