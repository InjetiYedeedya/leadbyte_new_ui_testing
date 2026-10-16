"use client";

/**
 * Stripe autopay's return: ask until the subscription has started.
 *
 * Client because it polls, the same reason `payment-status.tsx` is. A
 * subscription still processing after the wait is NOT reported as failed:
 * the money may well be on its way, and "failed" sends people to pay twice.
 */

import { useEffect, useState } from "react";
import Link from "@/components/ui/app-link";
import type { AutopayCheck } from "@/app/autopay-success/actions";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/billing/price-sheet";
import { whenVisible } from "@/lib/poll-pacing";

const POLL_MS = 3000;
const GIVE_UP_MS = 60_000;

const PANEL = "flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-8 py-12 text-center";
const LINK =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-surface transition-colors hover:bg-accent-ink";

export function AutopayStatus({
  sessionId,
  check,
}: {
  sessionId: string;
  check: (sessionId: string) => Promise<AutopayCheck>;
}) {
  const [result, setResult] = useState<AutopayCheck | null>(null);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    async function poll() {
      // Never from a hidden tab (Error 1102, `lib/poll-pacing.ts`).
      await whenVisible();
      if (cancelled) return;
      const outcome = await check(sessionId);
      if (cancelled) return;
      setResult(outcome);
      if (outcome.ok && outcome.status === "processing") {
        if (Date.now() - startedAt >= GIVE_UP_MS) setGaveUp(true);
        else timer = setTimeout(poll, POLL_MS);
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, check]);

  if (result === null || (result.ok && result.status === "processing" && !gaveUp)) {
    return (
      <div className={PANEL} role="status">
        <Spinner />
        <p className="text-sm text-ink-soft">Confirming your autopay…</p>
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div className={PANEL} role="alert">
        <p className="text-sm text-ink">{result.message}</p>
      </div>
    );
  }
  if (result.status === "processing") {
    return (
      <div className={PANEL}>
        <p className="text-lg font-semibold text-ink">Your autopay is still being set up</p>
        <p className="max-w-sm text-sm text-ink-soft">This can take a few minutes. You don&apos;t need to pay again.</p>
      </div>
    );
  }
  const next = result.nextChargeAt ? new Date(result.nextChargeAt) : null;
  return (
    <div className={PANEL}>
      <p className="text-lg font-semibold text-ink">Autopay is on</p>
      {next && !Number.isNaN(next.getTime()) && result.renewalAmount !== null && (
        <p className="text-sm text-ink-soft">
          Next charge on {next.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}:{" "}
          {formatCurrency(result.renewalAmount, "USD")}/month.
        </p>
      )}
      <Link href="/agents" className={LINK}>
        Open agents
      </Link>
    </div>
  );
}
