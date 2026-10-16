"use client";

/**
 * Verifies a Stripe redirect, and keeps asking while it says "processing".
 *
 * ## Why this earns `"use client"`
 *
 * `POST /stripe/verify-payment` can legitimately answer "not done yet" — n8n
 * writes the order and keeps confirming with Stripe in the background, so
 * the first check right after landing here can arrive before that finishes.
 * A Server Component gets one render; this needs to ask again a moment
 * later, which is a timer, which is client state.
 *
 * ## Why it polls rather than awaiting once
 *
 * Reporting "payment failed" for a payment that is in fact still settling
 * would be worse than a few extra seconds of a spinner — the same reasoning
 * `run-analysis.tsx` polls a crawl instead of guessing from elapsed time.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/ui/app-link";
import { unlockedAgentsHref } from "@/lib/data/unlocked-agents";
import { checkPaymentStatus, type PaymentCheck } from "@/app/payment-success/actions";
import { Spinner } from "@/components/ui/spinner";
import { formatPrice } from "@/lib/data/pricing-catalog";

/** Same cadence as the analysis wait screen — frequent enough that "still
    checking" never reads as stuck, cheap enough not to hammer the backend. */
const POLL_MS = 2000;

/** How long "Payment successful" shows before moving on to the agents. */
const ON_TO_AGENTS_MS = 2500;

/** How long to keep asking before saying so. A card that needs extra checks
    can take minutes; a spinner with no end reads as a hung page. */
const GIVE_UP_MS = 90_000;

const PRIMARY_LINK =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-surface transition-colors duration-150 hover:bg-accent-ink motion-reduce:transition-none";
const SECONDARY_LINK =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface-raised motion-reduce:transition-none";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 text-sm last:border-b-0">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

export function PaymentStatus({ sessionId, orderId }: { sessionId: string; orderId: string }) {
  const [result, setResult] = useState<PaymentCheck | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  /** Bumped by "Check again" to restart the polling below. */
  const [attempt, setAttempt] = useState(0);
  const router = useRouter();
  const agentsHref =
    result?.ok && result.status === "completed" ? unlockedAgentsHref(result.agentIds ?? []) : "/agents";

  // Paid: on to the Agents page, which says what was just unlocked. A short
  // pause first, so "Payment successful" is seen rather than flashed.
  const completed = result?.ok === true && result.status === "completed";
  useEffect(() => {
    if (!completed) return;
    const timer = setTimeout(() => router.replace(agentsHref), ON_TO_AGENTS_MS);
    return () => clearTimeout(timer);
  }, [completed, agentsHref, router]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    async function poll() {
      let outcome: PaymentCheck;
      try {
        outcome = await checkPaymentStatus(sessionId, orderId);
      } catch {
        // A thrown check left "Checking…" spinning for good. Say so; "Check
        // again" restarts this.
        outcome = {
          ok: false,
          message: "We couldn't reach the payment check just now. If you were charged, your agents unlock automatically.",
        };
      }
      if (cancelled) return;
      setResult(outcome);
      if (outcome.ok && outcome.status === "processing") {
        if (Date.now() - startedAt >= GIVE_UP_MS) {
          setGaveUp(true);
          return;
        }
        timer = setTimeout(poll, POLL_MS);
      }
    }

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, orderId, attempt]);

  // Still processing after the wait. NOT "failed": the money may well be on
  // its way, and "failed" sends people to pay a second time.
  if (gaveUp && result?.ok && result.status === "processing") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-surface px-8 py-12 text-center">
        <p className="text-lg font-semibold text-ink">Your payment is still being processed</p>
        <p className="max-w-sm text-sm text-ink-soft">
          This can take a few minutes. You don&apos;t need to pay again. Check back on this page
          shortly, or contact support with order ID {orderId}.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            className={PRIMARY_LINK}
            onClick={() => {
              setGaveUp(false);
              setAttempt((n) => n + 1);
            }}
          >
            Check again
          </button>
          <Link href="/agents" className={SECONDARY_LINK}>
            Go to agents
          </Link>
        </div>
      </div>
    );
  }

  if (result === null || (result.ok && result.status === "processing")) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-8 py-12 text-center">
        <Spinner size="md" />
        <p className="text-sm text-ink-soft">Verifying your payment…</p>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-surface px-8 py-12 text-center">
        <p className="text-lg font-semibold text-crit">Payment failed</p>
        <p className="max-w-sm text-sm text-ink-soft">{result.message}</p>
        <div className="flex gap-3">
          <Link href="/checkout" className={PRIMARY_LINK}>
            Try again
          </Link>
          <Link href="/pricing" className={SECONDARY_LINK}>
            Back to pricing
          </Link>
        </div>
      </div>
    );
  }

  const suffix = result.billingPeriod === "yearly" ? "/yr" : "/mo";

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-surface px-8 py-12 text-center">
      <p className="text-lg font-semibold text-good">Payment successful!</p>
      <p className="max-w-sm text-sm text-ink-soft">
        Thank you for your purchase. Taking you to your agents…
      </p>
      <dl className="w-full max-w-sm text-left">
        {result.amountPaid !== null && (
          <Row label="Amount paid" value={`${formatPrice(result.amountPaid)}${suffix}`} />
        )}
        {result.billingPeriod && (
          <Row label="Billing" value={result.billingPeriod === "yearly" ? "Annual" : "Monthly"} />
        )}
        <Row label="Transaction ID" value={result.transactionId} />
        <Row label="Order ID" value={result.orderId} />
      </dl>
      <div className="flex gap-3">
        <Link href={agentsHref} className={PRIMARY_LINK}>
          Go to agents
        </Link>
        <Link href="/pricing" className={SECONDARY_LINK}>
          Browse more agents
        </Link>
      </div>
    </div>
  );
}
