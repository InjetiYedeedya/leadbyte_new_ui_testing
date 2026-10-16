import { ApiTimeoutError, apiRequest } from "@/lib/api/client";
import { isRedirectError } from "@/lib/auth/session-expired";
import { assertBillingSafe } from "@/lib/billing/guard";
import { chargeRefusal, refusalMessage, type ChargeRefusal } from "@/lib/billing/charge-errors";

/**
 * One call to a backend payment route, for everything added with the billing
 * handoff (Razorpay orders, both providers' autopay). Stripe's one-time
 * checkout keeps its own module because it predates this and is tested there.
 *
 * `assertBillingSafe()` FIRST, before a body is even sent: the backend's
 * Stripe key is live, and this is the line between building a request and
 * spending money. See `lib/billing/guard.ts`.
 */

const PAYMENT_TIMEOUT_MS = 30_000;

export class BillingCallError extends Error {
  constructor(
    message: string,
    /** Safe to show the customer, when the backend said something useful. */
    readonly userMessage: string | undefined,
    /** We stopped waiting; the charge may still have gone through. */
    readonly timedOut: boolean,
    readonly refusal: ChargeRefusal | null,
    /** The backend's own code, e.g. ALREADY_SUBSCRIBED. */
    readonly code: string | undefined,
  ) {
    super(message);
    this.name = "BillingCallError";
  }
}

function usefulMessage(error: unknown): string | undefined {
  const text = error instanceof Error ? error.message.trim() : "";
  return text === "" || /^leadbyte-api returned \d+$/.test(text) ? undefined : text.slice(0, 200);
}

export async function billingPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  assertBillingSafe();
  try {
    return await apiRequest<T>(path, { method: "POST", body, timeoutMs: PAYMENT_TIMEOUT_MS });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof ApiTimeoutError) {
      throw new BillingCallError(`${path} timed out`, undefined, true, null, undefined);
    }
    const refusal = chargeRefusal(error);
    const code = (error as { code?: unknown }).code;
    throw new BillingCallError(
      `${path} failed: ${error instanceof Error ? error.message : String(error)}`,
      refusal ? refusalMessage(refusal, error) : usefulMessage(error),
      false,
      refusal,
      typeof code === "string" ? code : undefined,
    );
  }
}

/** What to show for a failed call: its own sentence, or a plain fallback. */
export function billingErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof BillingCallError) {
    if (error.timedOut) return "The payment service is taking longer than usual. Please check again in a minute before retrying.";
    return error.userMessage ?? fallback;
  }
  return fallback;
}
