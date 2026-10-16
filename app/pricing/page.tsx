import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import { BackLink } from "@/components/ui/back-link";
import { BrandHeader } from "@/components/brand-header";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { AgentPricingBoard } from "@/components/pricing/agent-pricing-board";
import { getSession } from "@/lib/auth/session";
import { isBackendConfigured } from "@/lib/api/config";
import { getEntitlements } from "@/lib/entitlements";
import { headers } from "next/headers";
import { getPriceSheet } from "@/lib/billing/live-pricing";
import { CURRENCIES, defaultCurrency, type Currency } from "@/lib/billing/price-sheet";

export const metadata: Metadata = { title: "Pricing · LeadByte" };

/**
 * Public pricing — reachable signed out, same shell `app/page.tsx` uses.
 *
 * Agents this account already has are marked Purchased and cannot be added
 * again — the legacy page did the same, and without it a customer could pay
 * twice for an agent they own (checkout drops owned agents too, in case the
 * cart was filled before the purchase landed). Only against a real backend:
 * demo mode unlocks everything, and marking every card Purchased would leave
 * the page with nothing to show.
 *
 * `isBillingAvailable()` is no longer read here at all — see
 * `components/pricing/agent-pricing-board.tsx`'s doc comment for where that
 * check moved once `/checkout` existed to move it to.
 *
 * ## Currency
 *
 * `?currency=` is the choice, so it survives a reload and can be linked.
 * Without one, a visitor the host places in India (Cloudflare's
 * `cf-ipcountry`) starts in INR and everyone else in USD. The switch only
 * appears when the live pricing table answers: the fallback catalog is USD
 * only, and a switch to a currency with no prices behind it is a dead control.
 */
export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  const session = await getSession();
  const { currency: asked } = await searchParams;
  const currency = defaultCurrency(asked, (await headers()).get("cf-ipcountry"));

  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex items-center justify-between pr-6">
        <BrandHeader />
        {session ? (
          <span className="text-sm text-ink-soft">{session.ownerId}</span>
        ) : (
          <Link href="/login" className="text-sm text-ink-soft transition-colors hover:text-ink">
            Sign in
          </Link>
        )}
      </div>

      {/* Behind its own boundary: "what do you already own" reads orders,
          which can take seconds, and the header should not wait for it. */}
      <Suspense fallback={<PageLoading title="Pricing" />}>
        <PricingBody businessId={session?.businessId ?? null} currency={currency} />
      </Suspense>
    </main>
  );
}

async function PricingBody({ businessId, currency }: { businessId: string | null; currency: Currency }) {
  const [ownedIds, sheet] = await Promise.all([
    businessId && isBackendConfigured()
      ? getEntitlements(businessId).then((entitlements) => entitlements.agents)
      : Promise.resolve<string[]>([]),
    getPriceSheet(currency),
  ]);
  return (
    <PageContainer>
      {/* Back to the page they came from; the dashboard (or the home page,
          signed out) when Pricing was opened directly. */}
      <BackLink fallbackHref={businessId ? "/overview" : "/"} />
      <PageHeader
        title="Pricing"
        description="Specialized AI agents, ready to deploy and fully customizable to your workflow."
        actions={sheet.source === "live" ? <CurrencySwitch current={sheet.currency} /> : undefined}
      />
      {sheet.currency !== currency && (
        <p className="rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
          Prices in {currency} aren&apos;t available yet, so they are shown in {sheet.currency}.
        </p>
      )}
      <AgentPricingBoard sheet={sheet} signedIn={businessId !== null} ownedIds={ownedIds} />
    </PageContainer>
  );
}

/**
 * INR or USD. Links, not buttons: the choice is the URL, and changing it
 * re-reads the price table in that currency on the server.
 */
function CurrencySwitch({ current }: { current: Currency }) {
  return (
    <nav aria-label="Currency" className="inline-flex rounded-lg border border-border bg-surface p-1">
      {CURRENCIES.map((option) => (
        <Link
          key={option}
          href={`/pricing?currency=${option}`}
          aria-current={option === current ? "true" : undefined}
          className={`inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none ${
            option === current ? "bg-accent text-surface" : "text-ink-soft hover:text-ink"
          }`}
        >
          {option === "INR" ? "₹ INR" : "$ USD"}
        </Link>
      ))}
    </nav>
  );
}
