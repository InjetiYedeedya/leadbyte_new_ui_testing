import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { getSession } from "@/lib/auth/session";
import { isBillingAvailable } from "@/lib/billing/guard";
import { isBackendConfigured } from "@/lib/api/config";
import { getEntitlements } from "@/lib/entitlements";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { AutopayConfirm } from "@/components/checkout/autopay-confirm";
import { getPriceSheet } from "@/lib/billing/live-pricing";
import { listCouponOffers } from "@/lib/billing/coupons";
import { autopayFor, defaultCurrency, discountText, findLine } from "@/lib/billing/price-sheet";
import {
  confirmRazorpayAutopay,
  previewAutopayCoupon,
  startRazorpayAutopay,
  startStripeAutopay,
} from "./actions";

export const metadata: Metadata = { title: "Autopay · LeadByte" };

/**
 * Autopay's final step, for one agent: `?agent=&currency=`, reached from its
 * card on Pricing.
 *
 * One subscription per agent. The first month carries the agent's discount
 * and any coupon; every month after is the full price. USD on Stripe's page,
 * INR in Razorpay's popup. Behind the same payment lock as Checkout.
 */
export default async function AutopayPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; currency?: string }>;
}) {
  const { agent = "", currency: asked } = await searchParams;
  const session = await getSession();
  if (!session) return null;

  const currency = defaultCurrency(asked, null);
  const [sheet, owned] = await Promise.all([
    getPriceSheet(currency),
    isBackendConfigured()
      ? getEntitlements(session.businessId).then((entitlements) => entitlements.agents)
      : Promise.resolve<string[]>([]),
  ]);
  const line = findLine(sheet, agent);
  const amounts = line ? autopayFor(line) : null;

  const notice = (title: string, body: string, href: string, label: string) => (
    <PageContainer width="reading">
      <PageHeader title="Autopay" />
      <div className="rounded-lg border border-border bg-surface p-8 text-center">
        <p className="text-sm font-medium text-ink">{title}</p>
        {body !== "" && <p className="mt-1 text-sm text-ink-soft">{body}</p>}
        <Link href={href} className="mt-3 inline-block text-sm font-medium text-accent-ink transition-colors hover:text-ink">
          {label}
        </Link>
      </div>
    </PageContainer>
  );

  if (!line || !amounts) {
    return notice("This agent isn't available for autopay.", "", "/pricing", "Back to pricing");
  }
  if (sheet.currency !== currency) {
    return notice(`Autopay in ${currency} isn't available yet.`, "", `/pricing?currency=${sheet.currency}`, `See prices in ${sheet.currency}`);
  }
  if (owned.includes(line.id)) {
    return notice(`${line.title} is already on your account.`, "", "/agents", "Open agents");
  }
  // Said before anything else is asked, as on Checkout.
  if (!isBillingAvailable()) {
    return notice(
      "Online payment isn't open yet.",
      "Contact your LeadByte representative to add this agent to your account.",
      "/pricing",
      "Back to pricing",
    );
  }

  const offers = await listCouponOffers(sheet.currency, "autopay");

  return (
    <PageContainer width="reading">
      <PageHeader
        title={`${line.title}, monthly autopay`}
        description="Charged monthly, automatically. The first month carries the discount; every month after is the full price."
      />
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        {line.discount && (
          <span className="inline-flex w-fit items-center rounded px-2 py-0.5 text-xs font-medium bg-good-soft text-good">
            {discountText(line.discount, sheet.currency)} first month
            {line.discount.label !== "" && ` · ${line.discount.label}`}
          </span>
        )}
        <AutopayConfirm
          agentId={line.id}
          currency={sheet.currency}
          first={amounts.first}
          renewal={amounts.renewal}
          offers={offers}
          check={previewAutopayCoupon}
          startStripe={startStripeAutopay}
          startRazorpay={startRazorpayAutopay}
          confirmRazorpay={confirmRazorpayAutopay}
        />
      </div>
      <Link href={`/pricing?currency=${sheet.currency}`} className="w-fit text-sm font-medium text-accent-ink hover:text-ink">
        ← Back to pricing
      </Link>
    </PageContainer>
  );
}
