"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { setCart } from "@/lib/data/cart";
import type { BillingPeriod } from "@/lib/data/pricing-catalog";
import { isCurrency } from "@/lib/billing/price-sheet";

/**
 * Moves a selection from the pricing page's client state into the
 * server-side cart, then sends the browser on to checkout.
 *
 * This is the one write the cart cookie needs before Stripe is ever
 * involved — from here on, checkout reads the cookie rather than trusting
 * anything the client still remembers, because the client is about to be
 * redirected to Stripe's hosted page and back.
 *
 * A `<form action={startCheckout}>`, not a plain function call, so the
 * board's existing `SubmitButton` (`useFormStatus`) can show a pending state
 * — the selection rides along as two hidden fields rather than positional
 * arguments. `setCart` itself re-validates every id against the real agent
 * list, so a tampered hidden field is defence-in-depth away from becoming a
 * cart entry, not the only thing standing between one and the cookie.
 *
 * A signed-out visitor goes to `/signup` instead, exactly as the pricing
 * page's own CTA already does. The selection they made is not carried
 * through the sign-up detour — this repo's own `leadbyte_pending_url` cookie
 * is the precedent for how that class of problem gets solved when it's
 * worth solving, and doing the same for the cart is a reasonable next step,
 * not something to bolt on silently here.
 */
export async function startCheckout(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/signup");

  // A malformed value is an empty selection, not a 500.
  let rawIds: unknown = [];
  try {
    rawIds = JSON.parse(String(formData.get("agentIds") ?? "[]"));
  } catch {
    rawIds = [];
  }
  const agentIds = Array.isArray(rawIds) ? rawIds.filter((id): id is string => typeof id === "string") : [];
  const billingPeriod: BillingPeriod = formData.get("billingPeriod") === "yearly" ? "yearly" : "monthly";

  const rawCurrency = formData.get("currency");
  const currency = isCurrency(rawCurrency) ? rawCurrency : "USD";

  // A fresh selection starts without a coupon: one applied to a different
  // cart has not been checked against this one.
  await setCart(session.businessId, { agentIds, billingPeriod, currency });
  redirect("/checkout");
}
