"use client";

/**
 * The pricing grid: pick agents, see the total, and continue for real.
 *
 * ## Why this earns `"use client"`
 *
 * It owns two things a `<form action={serverAction}>` cannot express: which
 * cards are selected, and the monthly/yearly toggle. The running total is
 * plain arithmetic over those two, computed on every render rather than
 * stored — there is nothing here for a form to submit until "Continue to
 * checkout" is actually pressed, which is the one thing that does submit
 * (`startCheckout`, a Server Action, see `app/pricing/actions.ts`).
 *
 * ## Where the "never fabricate a purchase" rule actually lives now
 *
 * It used to live here, branching on `isBillingAvailable()` before there was
 * a checkout page for the button to lead to. Now that `/checkout` exists,
 * clicking "Continue to checkout" is a real, honest action — it saves the
 * selection and navigates to a real page that collects real billing details.
 * The backend's Stripe key is live, so the rule moved to where the actual
 * risk is: `submitCheckout` in `app/(app)/checkout/actions.ts` calls
 * `assertBillingSafe()` immediately before the one call that could ever
 * reach Stripe, and that is where "payments aren't switched on yet" is
 * shown today. Building an order is safe; only firing it is guarded.
 *
 * ## Why "Custom AI" gets no `mailto:`
 *
 * There is no support or sales address anywhere in this codebase to point one
 * at — checked before writing this. Inventing one would be worse than not
 * having a link: a made-up address either bounces or reaches nobody. It gets
 * plain text instead, the same honesty the rest of the CTA logic uses.
 *
 * ## Where the prices come from
 *
 * A `PriceSheet` (`lib/billing/price-sheet.ts`): the admin's live pricing
 * table when it answers, today's catalog when it does not. Checkout reads the
 * same sheet again on the server, so what a card shows is what is charged.
 */

import Link from "@/components/ui/app-link";
import { useState } from "react";
import { ShoppingCart, X } from "@phosphor-icons/react";
import { startCheckout } from "@/app/pricing/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import type { BillingPeriod } from "@/lib/data/pricing-catalog";
import {
  type AgentPriceLine,
  type PriceSheet,
  autopayFor,
  chargeFor,
  discountText,
  formatCurrency,
  sheetTotal,
  wasFor,
  yearlySavings,
} from "@/lib/billing/price-sheet";

const CARD =
  "flex flex-col rounded-lg border border-border bg-surface p-4 transition-colors duration-150 motion-reduce:transition-none";

const TAG = "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-accent-soft text-accent-ink";
const DISCOUNT_PILL = "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-good-soft text-good";

const PRIMARY_BUTTON =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-surface transition-colors duration-150 hover:bg-accent-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none";
const SECONDARY_BUTTON =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none";
const REMOVE_BUTTON =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-crit px-4 text-sm font-medium text-crit transition-colors duration-150 hover:bg-crit-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none";

/** "20% off · Launch offer", or just the size when there is no label. */
function discountLabel(line: AgentPriceLine, sheet: PriceSheet): string | null {
  if (!line.discount) return null;
  return [discountText(line.discount, sheet.currency), line.discount.label]
    .filter((part) => part !== "")
    .join(" · ");
}

function endsOn(iso: string): string | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function AgentCard({
  line,
  sheet,
  period,
  selected,
  onToggle,
  signedIn,
  owned,
}: {
  line: AgentPriceLine;
  sheet: PriceSheet;
  period: BillingPeriod;
  selected: boolean;
  onToggle: () => void;
  signedIn: boolean;
  /** Already on this account — offering it again would charge twice for it. */
  owned: boolean;
}) {
  const price = chargeFor(line, period);
  const was = wasFor(line, period);
  const pill = discountLabel(line, sheet);
  const autopay = autopayFor(line);
  const offerEnds = line.discount?.endsAt ? endsOn(line.discount.endsAt) : null;
  const money = (value: number) => formatCurrency(value, sheet.currency);

  return (
    <div className={`${CARD} ${selected ? "border-accent ring-2 ring-accent/30" : ""}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">{line.title}</h3>
        {owned ? (
          <Badge variant="purchase-yes">Purchased</Badge>
        ) : (
          line.tag !== "" && <span className={TAG}>{line.tag}</span>
        )}
      </div>
      <p className="text-sm text-ink-soft">{line.description}</p>

      <div className="mt-4">
        {line.isCustom || price === null ? (
          <p className="text-lg font-semibold text-ink">Custom pricing</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-semibold text-ink">
                {money(price)}/{period === "monthly" ? "mo" : "yr"}
              </span>
              {was !== null && <span className="text-sm text-ink-soft line-through">{money(was)}</span>}
              {pill && <span className={DISCOUNT_PILL}>{pill}</span>}
            </div>
            {period === "yearly" && line.yearlyPerMonth !== null && (
              <p className="mt-1 text-xs text-ink-soft">{money(line.yearlyPerMonth)}/month, billed yearly</p>
            )}
            {offerEnds && <p className="mt-1 text-xs text-ink-soft">Offer ends {offerEnds}</p>}
          </>
        )}
      </div>

      <ul className="mt-4 flex-1 space-y-1.5">
        {line.features.map((feature) => (
          <li key={feature} className="flex gap-2 text-sm text-ink-soft">
            <span aria-hidden="true" className="mt-0.5 text-good">
              ✓
            </span>
            {feature}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-col gap-2">
        {line.isCustom ? (
          signedIn ? (
            <p className="text-sm text-ink-soft">
              Get in touch with your account team to scope this.
            </p>
          ) : (
            <Link href="/signup" className={SECONDARY_BUTTON}>
              Get started
            </Link>
          )
        ) : owned ? (
          <Link href="/agents" className={SECONDARY_BUTTON}>
            Open agents
          </Link>
        ) : (
          <>
            <button
              type="button"
              onClick={onToggle}
              aria-pressed={selected}
              className={selected ? REMOVE_BUTTON : PRIMARY_BUTTON}
            >
              {selected ? "Remove from cart" : "Add to cart"}
            </button>
            {/* Autopay is one agent, charged monthly, so it skips the
                selection and goes straight to its own final step. */}
            {signedIn && autopay && (
              <Link
                href={`/checkout/autopay?agent=${encodeURIComponent(line.id)}&currency=${sheet.currency}`}
                className={SECONDARY_BUTTON}
              >
                {autopay.first !== autopay.renewal
                  ? `Autopay: ${money(autopay.first)} first month, then ${money(autopay.renewal)}/mo`
                  : `Autopay: ${money(autopay.renewal)}/mo`}
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Exported for the top menu's compact Pricing view, which shares this cart. */
export function CheckoutCta(props: Parameters<typeof Cta>[0]) {
  return <Cta {...props} />;
}

function Cta({
  signedIn,
  selected,
  period,
  currency,
}: {
  signedIn: boolean;
  selected: string[];
  period: BillingPeriod;
  currency: PriceSheet["currency"];
}) {
  if (!signedIn) {
    return (
      <Link href="/signup" className={PRIMARY_BUTTON}>
        Sign up to get started
      </Link>
    );
  }

  return (
    <form action={startCheckout}>
      <input type="hidden" name="agentIds" value={JSON.stringify(selected)} />
      <input type="hidden" name="billingPeriod" value={period} />
      <input type="hidden" name="currency" value={currency} />
      <SubmitButton pendingLabel="Continuing…" className={`${PRIMARY_BUTTON} w-full`}>
        Proceed to checkout
      </SubmitButton>
    </form>
  );
}

export function AgentPricingBoard({
  sheet,
  signedIn,
  ownedIds = [],
  selected: selectedProp,
  onSelectedChange,
  period: periodProp,
  onPeriodChange,
}: {
  sheet: PriceSheet;
  signedIn: boolean;
  /** Agents this account already has, read on the server. */
  ownedIds?: string[];
  /**
   * Optional: the selection and billing period held by the caller instead —
   * the top menu's Pricing view keeps one cart across its compact list and
   * this full board. Left out (the Pricing page), the board holds its own.
   */
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  period?: BillingPeriod;
  onPeriodChange?: (period: BillingPeriod) => void;
}) {
  const [ownSelected, setOwnSelected] = useState<string[]>([]);
  const [ownPeriod, setOwnPeriod] = useState<BillingPeriod>("monthly");
  const selected = selectedProp ?? ownSelected;
  const period = periodProp ?? ownPeriod;
  const setPeriod = onPeriodChange ?? setOwnPeriod;

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((existing) => existing !== id) : [...selected, id];
    if (onSelectedChange) onSelectedChange(next);
    else setOwnSelected(next);
  };

  return (
    <div className="flex flex-col gap-4 @container">
      {/* The billing toggle. `role="radiogroup"` because exactly one of the
          two is chosen at a time — a plain pair of buttons here would tell a
          screen reader nothing about the relationship between them. */}
      <div
        role="radiogroup"
        aria-label="Billing period"
        className="inline-flex w-fit rounded-lg border border-border bg-surface p-1"
      >
        {(["monthly", "yearly"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={period === option}
            onClick={() => setPeriod(option)}
            className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none ${
              period === option ? "bg-accent text-surface" : "text-ink-soft hover:text-ink"
            }`}
          >
            {option === "monthly" ? "Monthly" : "Annually"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 @3xl:grid-cols-[minmax(0,1fr)_17rem] @5xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="@container">
          <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2 @4xl:grid-cols-3">
            {sheet.agents.map((line) => (
              <AgentCard
                key={line.id}
                line={line}
                sheet={sheet}
                period={period}
                selected={selected.includes(line.id)}
                onToggle={() => toggle(line.id)}
                signedIn={signedIn}
                owned={ownedIds.includes(line.id)}
              />
            ))}
          </div>
        </div>
        <CartSummary
          sheet={sheet}
          selected={selected}
          period={period}
          signedIn={signedIn}
          onRemove={toggle}
        />
      </div>
    </div>
  );
}

/**
 * The cart beside the cards, as on most checkout pages: what is in it, the
 * total, and the one way on. Sticky so it stays in view while the cards
 * scroll; below the side-by-side width it sits under them, pinned to the
 * bottom once something is in it.
 */
function CartSummary({
  sheet,
  selected,
  period,
  signedIn,
  onRemove,
}: {
  sheet: PriceSheet;
  selected: string[];
  period: BillingPeriod;
  signedIn: boolean;
  onRemove: (id: string) => void;
}) {
  const money = (value: number) => formatCurrency(value, sheet.currency);
  const unit = period === "monthly" ? "mo" : "yr";
  const items = selected.flatMap((id) => {
    const line = sheet.agents.find((agent) => agent.id === id);
    const price = line ? chargeFor(line, period) : null;
    return line && price !== null ? [{ line, price }] : [];
  });
  const total = sheetTotal(sheet, selected, period);
  const savings = yearlySavings(sheet, selected);
  const empty = items.length === 0;

  return (
    <aside
      aria-label="Your cart"
      className={`flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-[0_12px_32px_-20px_rgb(12_21_63/0.45)] @3xl:sticky @3xl:top-4 @3xl:bottom-auto ${
        empty ? "" : "sticky bottom-3 z-10"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
          <ShoppingCart size={18} weight="bold" aria-hidden="true" className="text-accent" />
          Your cart
        </h3>
        {!empty && (
          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-surface">
            {items.length}
          </span>
        )}
      </div>

      {empty ? (
        <div className="flex flex-col items-center gap-1 rounded-md border border-dashed border-border px-3 py-6 text-center">
          <p className="text-sm font-medium text-ink">Your cart is empty</p>
          <p className="text-xs text-ink-soft">Add agents from the list to see your total here.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-ink-soft">
            {items.length} {items.length === 1 ? "agent" : "agents"} selected
          </p>
          <ul className="flex max-h-56 flex-col divide-y divide-border overflow-y-auto">
            {items.map(({ line, price }) => (
              <li key={line.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{line.title}</span>
                <span className="text-sm font-medium text-ink">{money(price)}</span>
                <button
                  type="button"
                  onClick={() => onRemove(line.id)}
                  aria-label={`Remove ${line.title} from cart`}
                  className="inline-flex size-7 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-crit-soft hover:text-crit focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <X size={14} weight="bold" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between gap-2 border-t border-border pt-3">
            <span className="text-sm font-medium text-ink-soft">Total</span>
            <span className="text-xl font-semibold text-ink">
              {money(total)}/{unit}
            </span>
          </div>
          {period === "yearly" && savings > 0 && (
            <p className="text-sm text-good">Save {money(savings)}/yr with annual billing.</p>
          )}
          <Cta signedIn={signedIn} selected={selected} period={period} currency={sheet.currency} />
          {signedIn && (
            <p className="text-center text-xs text-ink-soft">
              Next you&apos;ll review your billing details before paying.
            </p>
          )}
        </>
      )}
    </aside>
  );
}
