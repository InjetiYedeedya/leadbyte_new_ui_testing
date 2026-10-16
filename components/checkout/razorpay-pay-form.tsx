"use client";

/**
 * Checkout's billing form for an INR order, paid in Razorpay's popup.
 *
 * ## Why this earns `"use client"`
 *
 * Stripe is a redirect, which a `<form action>` expresses; Razorpay is a
 * popup opened by script, which it cannot. So this owns the submit: it asks
 * the server to create the order (`startRazorpayCheckout`, which checks the
 * form, the prices and the coupon), opens the popup with the order it gets
 * back, and hands Razorpay's proof to `confirmRazorpayPayment`, which has the
 * backend verify Razorpay's signature before anything unlocks. The fields
 * themselves are rendered on the server and passed in as children.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RazorpayConfirm, RazorpayStart } from "@/app/(app)/checkout/actions";
import type { RazorpayProof } from "@/lib/billing/payments";
import { clearRazorpayOverlay, payWithRazorpay } from "@/lib/razorpay-browser";
import { Spinner } from "@/components/ui/spinner";
import { unlockedAgentsHref } from "@/lib/data/unlocked-agents";

export function RazorpayPayForm({
  id,
  className,
  children,
  payLabel,
  start,
  confirm,
}: {
  id: string;
  className?: string;
  children: React.ReactNode;
  payLabel: string;
  start: (formData: FormData) => Promise<RazorpayStart>;
  confirm: (proof: RazorpayProof) => Promise<RazorpayConfirm>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  // Paid in the popup; confirming with the backend and on the way to the
  // agents. Razorpay's dark backdrop could stay up through this and read as a
  // black, dead page (2026-10-15), so it is cleared and this says what is
  // happening instead.
  const [unlocking, setUnlocking] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors([]);
    let leaving = false;
    try {
      const started = await start(new FormData(event.currentTarget));
      if (!started.ok) {
        setErrors(started.errors);
        return;
      }
      const proof = await payWithRazorpay({
        key: started.order.keyId,
        order_id: started.order.orderId,
        amount: started.order.amount,
        currency: "INR",
        description: started.description,
        prefill: started.order.prefill,
      });
      if (proof === null) return; // Closed without paying: nothing to report.
      // Paid: Razorpay's part is over, so nothing of its popup may stay up.
      clearRazorpayOverlay();
      setUnlocking(true);
      const confirmed = await confirm(proof);
      if (confirmed.ok) {
        leaving = true;
        // Straight to the agents, which say what was just unlocked.
        router.replace(unlockedAgentsHref(confirmed.agentIds));
        return;
      }
      setUnlocking(false);
      setErrors([confirmed.message]);
    } catch (error) {
      setUnlocking(false);
      setErrors([error instanceof Error ? error.message : "The payment could not be started."]);
    } finally {
      // Not after a success: the button went back to "Pay…" and could be
      // pressed again while the success page loaded — a second payment
      // (audit, 2026-09-29).
      if (!leaving) setBusy(false);
    }
  }

  return (
    <>
    {unlocking && (
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-ground/95 px-6 text-center backdrop-blur-sm"
      >
        <Spinner size="md" />
        <p className="text-lg font-semibold text-ink">Payment received</p>
        <p className="max-w-sm text-sm text-ink-soft">Unlocking your agents. This takes a few seconds.</p>
      </div>
    )}
    <form id={id} onSubmit={onSubmit} className={className} noValidate={false}>
      {errors.length > 0 && (
        <div role="alert" className="rounded-lg border border-crit/30 bg-crit-soft px-4 py-3">
          <ul className="list-inside list-disc text-sm text-crit">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      {children}
      <button
        type="submit"
        disabled={busy}
        aria-busy={busy}
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-surface hover:bg-accent-ink disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {busy ? "Opening Razorpay…" : payLabel}
      </button>
    </form>
    </>
  );
}
