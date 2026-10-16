"use server";

import { getSession } from "@/lib/auth/session";
import { isRedirectError } from "@/lib/auth/session-expired";
import { billingErrorMessage } from "@/lib/billing/billing-call";
import { verifyStripeSubscription, type AutopayVerifyResult } from "@/lib/billing/payments";

export type AutopayCheck = ({ ok: true } & AutopayVerifyResult) | { ok: false; message: string };

/** Asked by the success page until Stripe reports the subscription started. */
export async function checkAutopayStatus(sessionId: string): Promise<AutopayCheck> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Please sign in again to see your autopay." };
  try {
    return { ok: true, ...(await verifyStripeSubscription(sessionId)) };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      ok: false,
      message: billingErrorMessage(error, "We couldn't confirm autopay yet. If you were charged, your agent unlocks automatically."),
    };
  }
}
