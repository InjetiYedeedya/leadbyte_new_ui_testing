import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { BrandHeader } from "@/components/brand-header";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { PaymentStatus } from "@/components/checkout/payment-status";

export const metadata: Metadata = { title: "Payment · LeadByte" };

/**
 * Where Stripe's own `success_url` sends the browser back to.
 *
 * A plain top-level route, matching the URL shape the backend contract
 * expects (`{base_url}/payment-success`, built in
 * `createStripeCheckoutSession`) — it is not under `app/(app)/` because
 * Stripe is the one navigating here, not a click inside the authenticated
 * app, and the session cookie is still present regardless either way.
 *
 * `?session_id=&order_id=` is what a completed hop back from Stripe carries.
 * Missing either means this was reached some other way — reloaded from
 * history, or a bookmark — and there is nothing to verify, so it says that
 * rather than spinning forever waiting on a check that was never coming.
 *
 * `?provider=razorpay&order=` is an INR payment. Razorpay pays in a popup,
 * and `confirmRazorpayPayment` has already had the backend verify its
 * signature before sending the browser here, so there is nothing left to
 * poll: this only says it worked.
 */
export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; order_id?: string; provider?: string; order?: string }>;
}) {
  const { session_id: sessionId, order_id: orderId, provider, order } = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col">
      <BrandHeader />
      <PageContainer width="reading">
        <PageHeader title="Payment" />
        {provider === "razorpay" && order ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-8 py-12 text-center">
            <p className="text-lg font-semibold text-ink">Payment successful</p>
            <p className="max-w-sm text-sm text-ink-soft">
              Your agents unlock within a minute. Order ID {order}.
            </p>
            <Link
              href="/agents"
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-surface transition-colors hover:bg-accent-ink"
            >
              Open agents
            </Link>
          </div>
        ) : sessionId && orderId ? (
          <PaymentStatus sessionId={sessionId} orderId={orderId} />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-8 py-12 text-center">
            <p className="text-sm text-ink-soft">
              There&apos;s no payment to check here.
            </p>
            <Link
              href="/pricing"
              className="text-sm font-medium text-accent-ink transition-colors hover:text-ink"
            >
              Back to pricing →
            </Link>
          </div>
        )}
      </PageContainer>
    </main>
  );
}
