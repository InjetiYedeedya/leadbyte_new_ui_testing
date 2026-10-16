"use client";

/**
 * The order summary on Checkout's final step, with the coupon box.
 *
 * ## Why this earns `"use client"`
 *
 * A coupon has to be checked, and the totals redrawn, WITHOUT reloading the
 * page: a coupon form that posted and redirected would throw away every
 * billing field the customer had already typed beside it. So the check is a
 * Server Action called from `CouponField`, and the code rides to the pay form
 * in a hidden input (`form={formId}`), where the pay action checks it AGAIN
 * before any charge. Nothing this component computes is trusted for money.
 */

import { useState } from "react";
import type { CouponOffer, CouponQuote } from "@/lib/billing/coupon-quote";
import type { CouponCheck } from "@/lib/billing/coupons";
import { formatCurrency, type Currency } from "@/lib/billing/price-sheet";
import { CouponField } from "@/components/checkout/coupon-field";

export interface SummaryLine {
  id: string;
  title: string;
  charge: number;
}

export function CheckoutSummary({
  formId,
  lines,
  currency,
  periodSuffix,
  savings,
  offers,
  check,
}: {
  /** The pay form the applied code is submitted with. */
  formId: string;
  lines: SummaryLine[];
  currency: Currency;
  periodSuffix: string;
  /** What yearly billing saves over monthly, or 0. */
  savings: number;
  offers: CouponOffer[];
  check: (code: string) => Promise<CouponCheck>;
}) {
  const [quote, setQuote] = useState<CouponQuote | null>(null);
  const money = (value: number) => formatCurrency(value, currency);

  const subtotal = lines.reduce((sum, line) => sum + line.charge, 0);
  const total = quote ? quote.total : subtotal;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 text-base font-bold text-ink">Order summary</h2>
      <ul className="divide-y divide-border">
        {lines.map((line) => {
          const off = quote?.lines.find((entry) => entry.id === line.id)?.discount ?? 0;
          return (
            <li key={line.id} className="flex items-baseline justify-between gap-2 py-2 text-sm">
              <span className="text-ink">{line.title}</span>
              <span className="shrink-0 text-right text-ink-soft">
                {money(line.charge)}/{periodSuffix}
                {off > 0 && <span className="block text-xs text-good">-{money(off)} coupon</span>}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 border-t border-border pt-3">
        <input type="hidden" form={formId} name="couponCode" value={quote?.code ?? ""} />
        <CouponField currency={currency} offers={offers} quote={quote} onQuote={setQuote} check={check} />

        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-sm font-semibold text-ink">Total</span>
          <span className="text-lg font-semibold text-ink">
            {quote && <span className="mr-2 text-sm font-normal text-ink-soft line-through">{money(subtotal)}</span>}
            {money(total)}/{periodSuffix}
          </span>
        </div>
        {savings > 0 && <p className="mt-1 text-sm text-good">Save {money(savings)}/yr with annual billing.</p>}
      </div>
    </div>
  );
}
