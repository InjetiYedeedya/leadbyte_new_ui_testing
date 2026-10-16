"use client";

/**
 * The coupon box, shared by the two final steps: Checkout's summary and
 * Autopay's confirmation. Nowhere else offers coupons (the billing handoff's
 * rule).
 *
 * Client because checking a code must not reload the page; see
 * `checkout-summary.tsx`. It only ever reports a quote back to its parent.
 * The parent sends the CODE on to a Server Action, which checks it again
 * before any charge.
 */

import { useState, useTransition } from "react";
import type { CouponOffer, CouponQuote } from "@/lib/billing/coupon-quote";
import type { CouponCheck } from "@/lib/billing/coupons";
import { formatCurrency, type Currency } from "@/lib/billing/price-sheet";

const INPUT =
  "min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm uppercase text-ink placeholder:normal-case placeholder:text-ink-soft focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";
const BUTTON =
  "inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-raised disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function CouponField({
  currency,
  offers,
  quote,
  onQuote,
  check,
}: {
  currency: Currency;
  offers: CouponOffer[];
  quote: CouponQuote | null;
  onQuote: (quote: CouponQuote | null) => void;
  check: (code: string) => Promise<CouponCheck>;
}) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(value: string) {
    const trimmed = value.trim();
    if (trimmed === "") return;
    setMessage(null);
    startTransition(async () => {
      const result = await check(trimmed);
      if (result.ok) {
        onQuote(result.quote);
        setCode(result.quote.code);
      } else {
        onQuote(null);
        setMessage(result.message);
      }
    });
  }

  if (quote) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md bg-good-soft px-3 py-2.5">
        <p className="text-sm text-good">
          <span className="font-semibold">{quote.code}</span> applied. You save {formatCurrency(quote.discount, currency)}.
        </p>
        <button
          type="button"
          onClick={() => {
            onQuote(null);
            setCode("");
          }}
          className="shrink-0 text-sm font-medium text-good underline"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div>
      {offers.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-ink-soft">Coupons for you</p>
          <div className="flex flex-wrap gap-2">
            {offers.map((offer) => (
              <button
                key={offer.code}
                type="button"
                onClick={() => apply(offer.code)}
                disabled={pending}
                title={offer.description || undefined}
                className="rounded-md border border-dashed border-accent/40 bg-accent-soft/50 px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent-soft disabled:opacity-50"
              >
                {offer.code}
                {/* `offerLabel` can be "", which left "CODE · " with nothing after it. */}
                {offer.label && ` · ${offer.label}`}
                {offer.personal && <span className="ml-1 font-normal">(just for you)</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <label htmlFor="coupon-code" className="mb-1.5 block text-xs font-medium text-ink-soft">
        Coupon code
      </label>
      <div className="flex gap-2">
        <input
          id="coupon-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            // Enter here applies the coupon; it must not submit the pay form.
            if (event.key === "Enter") {
              event.preventDefault();
              apply(code);
            }
          }}
          placeholder="Enter a code"
          autoComplete="off"
          className={INPUT}
        />
        <button type="button" onClick={() => apply(code)} disabled={pending || code.trim() === ""} className={BUTTON}>
          {pending ? "Checking…" : "Apply"}
        </button>
      </div>
      {message && (
        <p role="alert" className="mt-1.5 text-xs text-crit">
          {message}
        </p>
      )}
    </div>
  );
}
