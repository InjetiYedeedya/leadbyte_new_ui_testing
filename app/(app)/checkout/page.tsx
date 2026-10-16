import { isBillingAvailable } from "@/lib/billing/guard";
import { readSignedText } from "@/lib/signed-text";
import { FlashNotice } from "@/components/ui/flash-notice";
import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { getSession } from "@/lib/auth/session";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { TextField } from "@/components/ui/form";
import { EinField } from "@/components/checkout/ein-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { CheckoutSummary } from "@/components/checkout/checkout-summary";
import { RazorpayPayForm } from "@/components/checkout/razorpay-pay-form";
import { getCart } from "@/lib/data/cart";
import { isBackendConfigured } from "@/lib/api/config";
import { getEntitlements } from "@/lib/entitlements";
import { getPriceSheet } from "@/lib/billing/live-pricing";
import { listCouponOffers } from "@/lib/billing/coupons";
import { chargeFor, findLine, yearlySavings, type AgentPriceLine } from "@/lib/billing/price-sheet";
import { confirmRazorpayPayment, previewCartCoupon, startRazorpayCheckout, submitCheckout } from "./actions";

export const metadata: Metadata = { title: "Checkout · LeadByte" };

const FORM_ID = "checkout-form";
const FORM_CLASS = "flex flex-col gap-4 rounded-lg border border-border bg-surface p-4";

/**
 * Billing details and the final review for whatever is in the cart cookie.
 *
 * Reads `getCart`, never client state — the pricing page's selection was
 * already written into the cookie by `startCheckout` before the browser got
 * here, which is what lets this page survive a reload without losing the
 * order (a real concern: Stripe's own hosted checkout, and a card challenge
 * inside it, both leave and return to this origin).
 *
 * Prices come from the same `PriceSheet` the Pricing page showed, re-read
 * here so a price the admin changed since is the price shown before paying.
 * This page is the FINAL step, so it is the one place (with Autopay) that
 * offers coupons. USD pays on Stripe's page; INR in Razorpay's popup.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; cancelled?: string }>;
}) {
  const { error, cancelled } = await searchParams;
  const session = await getSession();
  // The route group's own layout already redirects a signed-out visitor to
  // /login before this ever renders — this is just the type narrowing.
  if (!session) return null;

  const cart = await getCart(session.businessId);
  const [owned, sheet] = await Promise.all([
    // Same rule as `submitCheckout`: nothing already owned is offered again.
    isBackendConfigured()
      ? getEntitlements(session.businessId).then((entitlements) => entitlements.agents)
      : Promise.resolve<string[]>([]),
    getPriceSheet(cart.currency),
  ]);
  const lines = cart.agentIds
    .filter((id) => !owned.includes(id))
    .map((id) => findLine(sheet, id))
    .filter((line): line is AgentPriceLine => line !== undefined && chargeFor(line, cart.billingPeriod) !== null);

  if (lines.length === 0) {
    return (
      <PageContainer width="reading">
        <PageHeader title="Checkout" />
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-sm text-ink-soft">Your cart is empty.</p>
          <Link
            href="/pricing"
            className="mt-3 inline-block text-sm font-medium text-accent-ink transition-colors hover:text-ink"
          >
            Browse pricing →
          </Link>
        </div>
      </PageContainer>
    );
  }

  // With payments off the order and the form are still shown, but the pay
  // button is disabled and the notice sits ABOVE the form, so nobody fills it
  // in expecting to pay. The server actions stay guarded either way.
  const billingOn = isBillingAvailable();

  // The cart asked for a currency the price table does not sell in.
  if (sheet.currency !== cart.currency) {
    return (
      <PageContainer width="reading">
        <PageHeader title="Checkout" />
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-sm font-medium text-ink">Payment in {cart.currency} isn&apos;t available yet.</p>
          <Link
            href={`/pricing?currency=${sheet.currency}`}
            className="mt-3 inline-block text-sm font-medium text-accent-ink transition-colors hover:text-ink"
          >
            See prices in {sheet.currency}
          </Link>
        </div>
      </PageContainer>
    );
  }

  const india = sheet.currency === "INR";
  const offers = await listCouponOffers(sheet.currency, "one_time");
  const ids = lines.map((line) => line.id);
  const savings = cart.billingPeriod === "yearly" ? yearlySavings(sheet, ids) : 0;
  const periodSuffix = cart.billingPeriod === "monthly" ? "mo" : "yr";

  // Every problem at once, at the top — see `submitCheckout`'s own comment
  // on why they arrive joined by "|" rather than one at a time.
  const signed = readSignedText(error);
  const errors = signed ? signed.split("|") : [];

  const fields = (
    <>
      <h2 className="text-base font-bold text-ink">Billing details</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="companyName" label="Company name" required autoComplete="organization" />
        {india ? (
          <TextField
            name="gstin"
            label="GSTIN (optional)"
            autoComplete="off"
            placeholder="22AAAAA0000A1Z5"
            hint="Only if your business is GST-registered. It appears on your invoice."
          />
        ) : (
          <EinField />
        )}
        <TextField name="billingFirstName" label="Billing first name" required autoComplete="given-name" />
        <TextField name="billingLastName" label="Billing last name" required autoComplete="family-name" />
        <div className="sm:col-span-2">
          <TextField name="address" label="Billing address" required autoComplete="street-address" />
        </div>
        <TextField
          name="zipCode"
          label={india ? "PIN code" : "ZIP code"}
          required
          autoComplete="postal-code"
          placeholder={india ? "560001" : "90210"}
        />
        {/* Read-only: the order is saved under this email and found by
            it afterwards, so it must be the one they sign in with — see
            `submitCheckout`. */}
        <TextField
          name="email"
          label="Email"
          type="email"
          required
          readOnly
          autoComplete="email"
          defaultValue={session.businessId}
          hint="Your sign-in email. The receipt and your purchase are linked to it."
        />
      </div>

      {/* Card details are never collected here — the payment provider's own
          page or window takes them. */}
      <div className="rounded-md border border-border bg-surface-raised px-3.5 py-3 text-xs text-ink-soft">
        🔒{" "}
        {india
          ? "Razorpay's secure window opens to take your payment. We never see or store your card or UPI details."
          : "You'll be securely redirected to Stripe to complete payment. We never see or store your card details."}
      </div>
    </>
  );

  return (
    <PageContainer>
      <PageHeader title="Checkout" description="Billing details and a final review of your order." />

      <ol aria-label="Checkout steps" className="flex flex-wrap items-center gap-2 text-sm">
        {[
          { label: "Choose agents", state: "done" },
          { label: "Billing details", state: "current" },
          { label: india ? "Pay with Razorpay" : "Pay on Stripe", state: "next" },
        ].map((step, index) => (
          <li key={step.label} className="flex items-center gap-2">
            {index > 0 && <span aria-hidden="true" className="h-px w-6 bg-border" />}
            <span
              aria-current={step.state === "current" ? "step" : undefined}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-medium ${
                step.state === "current"
                  ? "bg-accent text-surface"
                  : step.state === "done"
                    ? "bg-good-soft text-good"
                    : "bg-surface-raised text-ink-soft"
              }`}
            >
              <span aria-hidden="true">{step.state === "done" ? "✓" : index + 1}</span>
              {step.label}
            </span>
          </li>
        ))}
        <li className="ml-auto">
          <Link href="/pricing" className="text-sm font-medium text-accent-ink transition-colors hover:text-ink">
            ← Edit cart
          </Link>
        </li>
      </ol>

      {!billingOn && (
        <div role="status" className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-3">
          <p className="text-sm font-medium text-ink">Online payment isn&apos;t switched on in this environment yet.</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            You can review your order below, but the payment step is locked. Contact your LeadByte representative to
            add these agents to your account.
          </p>
        </div>
      )}

      {/* Stripe's cancel_url. Nothing was charged, and the order it left
          behind stays unpaid — say so, or "back on the form" reads as a
          payment that silently failed. */}
      {cancelled && errors.length === 0 && (
        <FlashNotice role="status" clear={["cancelled"]} className="rounded-lg border border-border bg-surface-raised px-4 py-3">
          <p className="text-sm text-ink">Checkout was cancelled. You haven&apos;t been charged.</p>
        </FlashNotice>
      )}

      {errors.length > 0 && (
        <FlashNotice role="alert" clear={["error"]} className="rounded-lg border border-crit/30 bg-crit-soft px-4 py-3">
          <ul className="list-inside list-disc text-sm text-crit">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </FlashNotice>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px] lg:items-start">
        {!billingOn ? (
          <form id={FORM_ID} className={FORM_CLASS}>
            {fields}
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-surface opacity-50"
            >
              {india ? "Pay with Razorpay" : "Proceed to payment"} — not available yet
            </button>
          </form>
        ) : india ? (
          <RazorpayPayForm
            id={FORM_ID}
            className={FORM_CLASS}
            payLabel="Pay with Razorpay"
            start={startRazorpayCheckout}
            confirm={confirmRazorpayPayment}
          >
            {fields}
          </RazorpayPayForm>
        ) : (
          <form id={FORM_ID} action={submitCheckout} className={FORM_CLASS}>
            {fields}
            <SubmitButton
              pendingLabel="Redirecting to Stripe…"
              className="min-h-11 justify-center rounded-md bg-accent px-4 text-sm font-medium text-surface hover:bg-accent-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Proceed to payment
            </SubmitButton>
          </form>
        )}

        <CheckoutSummary
          formId={FORM_ID}
          lines={lines.map((line) => ({
            id: line.id,
            title: line.title,
            charge: chargeFor(line, cart.billingPeriod) ?? 0,
          }))}
          currency={sheet.currency}
          periodSuffix={periodSuffix}
          savings={savings}
          offers={offers}
          check={previewCartCoupon}
        />
      </div>
    </PageContainer>
  );
}
