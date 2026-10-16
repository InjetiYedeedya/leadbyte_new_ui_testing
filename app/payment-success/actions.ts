"use server";

import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { isRedirectError } from "@/lib/auth/session-expired";
import { clearCart, getCart } from "@/lib/data/cart";
import { dropEntitlementsCache } from "@/lib/entitlements";
import { StripeCheckoutError, verifyStripePayment } from "@/lib/billing/stripe-checkout";
import type { BillingPeriod } from "@/lib/data/pricing-catalog";

/**
 * Called directly from the polling client component — not via a
 * `<form action>`, since there is nothing to submit, only a question to ask
 * repeatedly. A Server Action imported into a client component and invoked
 * as a plain async function works exactly as it does on the server, the
 * same precedent `AccountMenu`'s sign-out form already relies on.
 *
 * Returns a discriminated result rather than throwing across the
 * server/client boundary — a thrown custom error class loses its shape by
 * the time a client component would see it, so every failure this can hit is
 * turned into `{ ok: false, message }` here instead.
 */
export type PaymentCheck =
  | {
      ok: true;
      status: "completed";
      transactionId: string;
      orderId: string;
      amountPaid: number | null;
      billingPeriod: BillingPeriod | null;
      subscriptionEndDate: string | null;
      /** What was bought, for the "unlocked" note on the Agents page. */
      agentIds?: string[];
    }
  | { ok: true; status: "processing"; orderId: string }
  | { ok: false; message: string };

/**
 * Confirmed payments, remembered so a refresh does not verify again.
 *
 * `verify-payment` is not safe to repeat: every call for a paid session saves
 * the transaction again and moves the access end date to a month from NOW
 * (PAYMENT_FLOW.md §9.4). A reload of this page, or the back button, used to
 * do exactly that. Until the backend makes the call repeat-safe, a confirmed
 * order is answered from here. `leadbyte_` prefix, so sign-out sweeps it.
 */
const PAID_COOKIE = "leadbyte_paid_orders";
const PAID_MAX_AGE = 60 * 60 * 24 * 7;
const PAID_KEEP = 5;

type Completed = Extract<PaymentCheck, { status: "completed" }>;

async function readPaid(): Promise<Completed[]> {
  const raw = (await cookies()).get(PAID_COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (row): row is Completed =>
            typeof row === "object" && row !== null &&
            typeof (row as Completed).orderId === "string" &&
            typeof (row as Completed).transactionId === "string",
        )
      : [];
  } catch {
    return [];
  }
}

async function rememberPaid(result: Completed): Promise<void> {
  const kept = (await readPaid()).filter((row) => row.orderId !== result.orderId);
  (await cookies()).set(PAID_COOKIE, JSON.stringify([result, ...kept].slice(0, PAID_KEEP)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PAID_MAX_AGE,
  });
}

export async function checkPaymentStatus(sessionId: string, orderId: string): Promise<PaymentCheck> {
  const already = (await readPaid()).find((row) => row.orderId === orderId);
  if (already) return already;

  try {
    const result = await verifyStripePayment({ sessionId, orderId });

    if (result.status === "completed") {
      // The cart's job ends here — a confirmed payment is the one signal
      // that means the selection it described is no longer pending.
      const session = await getSession();
      let agentIds: string[] = [];
      if (session) {
        // Read before the cart is cleared: the Agents page names them.
        agentIds = (await getCart(session.businessId)).agentIds;
        await clearCart(session.businessId);
        // The new agents must unlock now, not after the remembered purchases
        // expire.
        dropEntitlementsCache(session.businessId);
      }

      const completed: Completed = {
        ok: true,
        status: "completed",
        transactionId: result.transactionId,
        orderId: result.orderId,
        amountPaid: result.amountPaid,
        billingPeriod: result.billingPeriod,
        subscriptionEndDate: result.subscriptionEndDate,
        agentIds,
      };
      await rememberPaid({ ...completed, orderId });
      return completed;
    }

    return { ok: true, status: "processing", orderId: result.orderId };
  } catch (error) {
    // A dead session mid-verification still leaves as a redirect — Next's
    // client runtime honours a `redirect()` thrown from a Server Action
    // called directly, the same as one returned from a form action.
    if (isRedirectError(error)) throw error;

    const message =
      error instanceof StripeCheckoutError && error.userMessage
        ? error.userMessage
        : "We couldn't confirm your payment. Please contact support with your order ID.";
    return { ok: false, message };
  }
}
