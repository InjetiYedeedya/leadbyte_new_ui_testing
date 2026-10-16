import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { BrandHeader } from "@/components/brand-header";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { AutopayStatus } from "@/components/checkout/autopay-status";
import { checkAutopayStatus } from "./actions";

export const metadata: Metadata = { title: "Autopay · LeadByte" };

/**
 * Where autopay lands once it is paid.
 *
 * `?session_id=` is Stripe (USD) coming back from its hosted page; the
 * subscription is confirmed by polling. `?provider=razorpay` is INR, already
 * verified by `confirmRazorpayAutopay` before the browser was sent here, so it
 * only says so. Outside `app/(app)/` for the same reason `/payment-success`
 * is: Stripe is the one navigating here.
 */
export default async function AutopaySuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; provider?: string }>;
}) {
  const { session_id: sessionId, provider } = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col">
      <BrandHeader />
      <PageContainer width="reading">
        <PageHeader title="Autopay" />
        {provider === "razorpay" ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-8 py-12 text-center">
            <p className="text-lg font-semibold text-ink">Autopay is on</p>
            <p className="max-w-sm text-sm text-ink-soft">Your agent unlocks within a minute.</p>
            <Link
              href="/agents"
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-surface transition-colors hover:bg-accent-ink"
            >
              Open agents
            </Link>
          </div>
        ) : sessionId ? (
          <AutopayStatus sessionId={sessionId} check={checkAutopayStatus} />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-8 py-12 text-center">
            <p className="text-sm text-ink-soft">There&apos;s no autopay to check here.</p>
            <Link href="/pricing" className="text-sm font-medium text-accent-ink transition-colors hover:text-ink">
              Back to pricing →
            </Link>
          </div>
        )}
      </PageContainer>
    </main>
  );
}
