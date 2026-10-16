import { cookies } from "next/headers";
import { ALL_AGENT_IDS } from "@/lib/entitlements/agents";
import type { BillingPeriod } from "@/lib/data/pricing-catalog";
import { isCurrency, type Currency } from "@/lib/billing/price-sheet";

/**
 * What's selected on `/pricing`, carried across the Stripe redirect.
 *
 * ## Why a cookie, not the client state it started as
 *
 * `components/pricing/agent-pricing-board.tsx` holds the selection in
 * `useState` while someone is BROWSING — that's right for comparing agents,
 * and wrong the moment "Continue to checkout" is pressed, because checkout
 * means leaving the site for Stripe's hosted page and coming back. Client
 * state does not survive that; it is gone the instant the tab navigates away.
 *
 * This is the exact problem `lib/gating/gate.ts` already solved for the
 * paywall's pending action, documented there in detail: a closure was
 * dropped on remount, `globalThis` fixed that but not a real redirect off the
 * site. An httpOnly cookie travels with the browser and comes back from
 * Stripe intact. Same mechanism, same reasoning, new cookie.
 *
 * ## Writable only from a Server Action
 *
 * `getCart` is safe anywhere; `setCart` and `clearCart` must be called from a
 * Server Action or Route Handler — cookie writes are restricted to those.
 */

const CART_COOKIE = "leadbyte_cart";

export interface Cart {
  agentIds: string[];
  billingPeriod: BillingPeriod;
  /** Chosen on the Pricing page. A cart from before currencies existed is USD. */
  currency: Currency;
  /** A coupon applied on the final step, re-checked every time it is shown. */
  couponCode?: string;
}

const EMPTY_CART: Cart = { agentIds: [], billingPeriod: "monthly", currency: "USD" };

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

/**
 * Two hours: long enough to fill in a checkout form and complete a Stripe
 * redirect, including a card challenge, without leaving a stale selection to
 * resurface days later. Longer than the paywall gate's one hour on purpose —
 * that gate resumes a single click, this survives someone actually typing.
 */
const CART_MAX_AGE = 60 * 60 * 2;

/**
 * Reads back only what still makes sense. The cookie is user-controlled, so
 * an id that isn't a real agent, or a billing period that isn't one of the
 * two real values, is dropped rather than trusted — the same rule
 * `getGate()` applies to its own cookie.
 */
export async function getCart(businessId: string): Promise<Cart> {
  const store = await cookies();
  const raw = store.get(`${CART_COOKIE}_${businessId}`)?.value;
  if (!raw) return EMPTY_CART;

  try {
    const parsed = JSON.parse(raw) as {
      agentIds?: unknown;
      billingPeriod?: unknown;
      currency?: unknown;
      couponCode?: unknown;
    };
    const agentIds = Array.isArray(parsed.agentIds)
      ? parsed.agentIds.filter(
          (id): id is string => typeof id === "string" && ALL_AGENT_IDS.includes(id) && id !== "custom",
        )
      : [];
    const billingPeriod: BillingPeriod = parsed.billingPeriod === "yearly" ? "yearly" : "monthly";
    const currency: Currency = isCurrency(parsed.currency) ? parsed.currency : "USD";
    const couponCode =
      typeof parsed.couponCode === "string" && parsed.couponCode.trim() !== "" ? parsed.couponCode : undefined;
    return { agentIds, billingPeriod, currency, ...(couponCode ? { couponCode } : {}) };
  } catch {
    // A malformed cookie is not a checkout that failed — it is nothing to
    // checkout, and the checkout page's own empty state already says so.
    return EMPTY_CART;
  }
}

/**
 * `custom` is filtered here too, not only on the pricing page — the same
 * "never let it become billable" rule `totalForSelection` applies to a total,
 * applied to what gets written in the first place, so a hand-edited cookie
 * can't smuggle it in.
 */
export async function setCart(businessId: string, cart: Cart): Promise<void> {
  const store = await cookies();
  const agentIds = cart.agentIds.filter((id) => id !== "custom" && ALL_AGENT_IDS.includes(id));
  store.set(
    `${CART_COOKIE}_${businessId}`,
    JSON.stringify({
      agentIds,
      billingPeriod: cart.billingPeriod,
      currency: cart.currency,
      ...(cart.couponCode ? { couponCode: cart.couponCode } : {}),
    }),
    { ...COOKIE_OPTIONS, maxAge: CART_MAX_AGE },
  );
}

/** Called once a payment is confirmed, or when someone empties it by hand. */
export async function clearCart(businessId: string): Promise<void> {
  const store = await cookies();
  store.delete(`${CART_COOKIE}_${businessId}`);
}
