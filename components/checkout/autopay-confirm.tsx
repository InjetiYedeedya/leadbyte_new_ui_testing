"use client";

/**
 * Autopay's final step: the coupon box, what is charged today and every month
 * after, and the one button that starts it.
 *
 * ## Why this earns `"use client"`
 *
 * The coupon changes today's amount without a reload, and INR autopay is
 * confirmed in Razorpay's popup, which only script can open. USD hands off to
 * a Server Action that redirects to Stripe. Every amount shown here is worked
 * out again on the server before anything is charged.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CouponOffer, CouponQuote } from "@/lib/billing/coupon-quote";
import type { CouponCheck } from "@/lib/billing/coupons";
import { formatCurrency, type Currency } from "@/lib/billing/price-sheet";
import type { RazorpayProof } from "@/lib/billing/payments";
import type { RazorpayAutopayStart } from "@/app/(app)/checkout/autopay/actions";
import { payWithRazorpay } from "@/lib/razorpay-browser";
import { CouponField } from "@/components/checkout/coupon-field";

export function AutopayConfirm({
  agentId,
  currency,
  first,
  renewal,
  offers,
  check,
  startStripe,
  startRazorpay,
  confirmRazorpay,
}: {
  agentId: string;
  currency: Currency;
  /** Today's charge before any coupon: the agent's discounted month. */
  first: number;
  /** Every month after. */
  renewal: number;
  offers: CouponOffer[];
  check: (agentId: string, currency: string, code: string) => Promise<CouponCheck>;
  startStripe: (agentId: string, currency: string, code: string) => Promise<{ ok: false; message: string }>;
  startRazorpay: (agentId: string, currency: string, code: string) => Promise<RazorpayAutopayStart>;
  confirmRazorpay: (proof: RazorpayProof) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const router = useRouter();
  const [quote, setQuote] = useState<CouponQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const money = (value: number) => formatCurrency(value, currency);

  const today = quote ? (quote.firstMonth ?? quote.total) : first;
  const code = quote?.code ?? "";

  async function start() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    let leaving = false;
    try {
      if (currency === "USD") {
        // Redirects to Stripe on success; only a failure comes back.
        const result = await startStripe(agentId, currency, code);
        if (result.message) setMessage(result.message);
        else leaving = true;
        return;
      }
      const started = await startRazorpay(agentId, currency, code);
      if (!started.ok) {
        setMessage(started.message);
        return;
      }
      const proof = await payWithRazorpay({
        key: started.keyId,
        subscription_id: started.subscriptionId,
        description: started.description,
        prefill: { email: started.email },
      });
      if (proof === null) return;
      const confirmed = await confirmRazorpay(proof);
      if (confirmed.ok) {
        leaving = true;
        router.push("/autopay-success?provider=razorpay");
        return;
      }
      setMessage(confirmed.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Autopay could not be started.");
    } finally {
      // Not after a success, for the same reason as the Razorpay pay form:
      // a live button during the redirect invites a second charge.
      if (!leaving) setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <CouponField
        currency={currency}
        offers={offers}
        quote={quote}
        onQuote={setQuote}
        check={(value) => check(agentId, currency, value)}
      />

      <dl className="rounded-md border border-border bg-surface-raised px-4 py-3 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-ink">Today (first month)</dt>
          <dd className="text-lg font-semibold text-ink">
            {today !== renewal && <span className="mr-2 text-sm font-normal text-ink-soft line-through">{money(renewal)}</span>}
            {money(today)}
          </dd>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <dt className="text-ink-soft">Then every month, charged automatically</dt>
          <dd className="text-ink">{money(renewal)}/mo</dd>
        </div>
      </dl>

      {message && (
        <p role="alert" className="rounded-lg border border-crit/30 bg-crit-soft px-4 py-3 text-sm text-crit">
          {message}
        </p>
      )}

      <button
        type="button"
        onClick={start}
        disabled={busy}
        aria-busy={busy}
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-surface hover:bg-accent-ink disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {busy
          ? currency === "USD"
            ? "Redirecting to Stripe…"
            : "Opening Razorpay…"
          : `Start autopay and pay ${money(today)}`}
      </button>
    </div>
  );
}
