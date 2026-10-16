import { LEADBYTE_API_URL } from "@/lib/api/config";

/**
 * A hard stop between this app and real money.
 *
 * ## Why this exists
 *
 * The backend team confirmed on 2026-08-28 that `STRIPE_SECRET_KEY` on
 * `leadbyte-api_v1` is an **`sk_live_` key**, and `STRIPE_WEBHOOK_SECRET` is not
 * set. Calling `/stripe/create-checkout-session` against that Lambda would
 * attempt a **real charge on a real card**, and the webhook that grants
 * entitlements could not verify its own signature.
 *
 * Checkout is not built yet. This guard exists so it cannot be built and
 * accidentally wired to a live key by someone who doesn't know that — including
 * a future me. Every call into Stripe must pass through `assertBillingSafe()`,
 * which throws unless the environment has explicitly been marked as test.
 *
 * ## Removing the guard
 *
 * Set `LEADBYTE_BILLING_MODE=test` and point `LEADBYTE_API_URL` at a backend
 * running an `sk_test_` key. Do not set it against production to "just try
 * something" — the failure mode is a stranger's card being charged.
 *
 * `live` is accepted only once a deliberate go-live decision has been made.
 */

export type BillingMode = "disabled" | "test" | "live";

export function billingMode(): BillingMode {
  const raw = (process.env.LEADBYTE_BILLING_MODE ?? "").toLowerCase().trim();
  if (raw === "test" || raw === "live") return raw;
  return "disabled";
}

export class BillingDisabledError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "BillingDisabledError";
  }
}

/**
 * Throws unless it is safe to talk to Stripe. Call at the top of every billing
 * Server Action, before any request is built.
 */
export function assertBillingSafe(): void {
  const mode = billingMode();

  if (mode === "disabled") {
    throw new BillingDisabledError(
      "Billing is disabled. The configured backend runs a LIVE Stripe key, so a " +
        "checkout call would attempt a real charge. Set LEADBYTE_BILLING_MODE=test " +
        "and point LEADBYTE_API_URL at a backend using an sk_test_ key.",
    );
  }

  if (mode === "test" && !LEADBYTE_API_URL) {
    throw new BillingDisabledError("Billing is in test mode but no backend is configured.");
  }
}

/** True when checkout may be offered at all. Use to hide, not just to disable. */
export function isBillingAvailable(): boolean {
  return billingMode() !== "disabled";
}

/** Shown wherever a purchase would normally be offered. */
export const BILLING_UNAVAILABLE_MESSAGE =
  "Payments aren't switched on in this environment yet.";
