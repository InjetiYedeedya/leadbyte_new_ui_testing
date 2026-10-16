import type { Metadata } from "next";
import { Suspense } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { PageLoading } from "@/components/ui/page-loading";
import Link from "@/components/ui/app-link";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { formatCount } from "@/lib/format";
import { getAdvertisingRepo } from "@/lib/data/advertising-repo";
import { EmptyState } from "@/components/ui/empty-state";
import { connectLinkedIn } from "./actions";
import { ConnectLink } from "@/components/ui/connect-link";
import { isBackendConfigured } from "@/lib/api/config";
import { connectUrl } from "@/lib/data/connections";
import { PageContainer, PageHeader } from "@/components/ui/page-container";

export const metadata: Metadata = { title: "Advertising · LeadByte" };

async function AdvertisingPageBody() {
  const businessId = await currentBusinessId();
  const ads = await getAdvertisingRepo().get(businessId);

  return (
    <>
      <PageContainer>
        <PageHeader title="Advertising intelligence" />
        {/* Without this the page rendered nothing but its own heading for any
            account with no ad data — no explanation, no way forward. */}
        {!ads && (
          <EmptyState
            title="No advertising data yet"
            description="Nothing to report until an ad account is connected."
            note="Connect Google Ads, Meta Ads or LinkedIn Ads on the Connections page and campaign performance appears here automatically."
          />
        )}
        {ads && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ads.platforms.map((p) => (
                <div key={p.platform} className="rounded-lg border border-border bg-surface p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium text-ink">{p.label}</span>
                    <Badge variant={p.connected ? "connection-connected" : "connection-not-connected"}>
                      {p.connected ? "Connected" : "Not connected"}
                    </Badge>
                  </div>
                  <p className="mb-3 text-sm text-ink-soft">{p.detail}</p>
                  {/* Live: the real consent flow, the same link the Connections
                      page uses. Mock: the in-memory switch, because an
                      unconfigured environment has no n8n to consent through
                      and must still work end to end. */}
                  {p.platform === "linkedin" && !p.connected && isBackendConfigured() && (
                    <ConnectLink
                      href={connectUrl("linkedInAds") ?? "/intelligence/connections"}
                      pendingLabel="Opening…"
                      className="inline-flex rounded bg-accent px-3 py-1.5 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
                    >
                      Connect
                    </ConnectLink>
                  )}
                  {p.platform === "linkedin" && !p.connected && !isBackendConfigured() && (
                    <form action={connectLinkedIn}>
                      <SubmitButton
                        pendingLabel="Connecting…"
                        className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
                      >
                        Connect
                      </SubmitButton>
                    </form>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: "Spend", value: ads.spend },
                { label: "Impressions", value: ads.impressions },
                { label: "Clicks", value: ads.clicks },
                { label: "CTR", value: ads.ctr },
                { label: "CPC", value: ads.cpc },
                { label: "Conversions", value: formatCount(ads.conversions) },
                { label: "CPA", value: ads.cpa },
                { label: "ROAS", value: ads.roas },
              ].map((m) => (
                <div key={m.label} className="rounded-lg border border-border bg-surface p-4">
                  <div className="font-mono text-lg tabular-nums text-ink">{m.value}</div>
                  <div className="text-xs text-ink-soft">{m.label}</div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                {/* It named "website intelligence, audit, GEO, analytics and
                    two ad platforms" whenever ANY ad data existed — false for
                    most accounts (audit, 2026-09-29). */}
                <span className="text-sm text-ink">
                  Your ad data is in. The strategy agent can use it to plan what to do next.
                </span>
                <Link
                  href="/growth/strategy"
                  className="rounded bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
                >
                  Continue to Marketing Strategy
                </Link>
              </div>
            </div>
          </>
        )}
      </PageContainer>
    </>
  );
}

/**
 * The page's own reads sit behind a boundary so the frame does not wait on
 * them. Without it the whole screen — header, tabs, rail — was held back until
 * the slowest backend read landed, and a click showed the previous page for
 * the entire wait. See the note on `PageShell`; this is NOT a route-level
 * `loading.tsx` (rule 0).
 */
export default function AdvertisingPage() {
  // `activeTab` is Strategy: this page is off the nav, but it still belongs to
  // that section, and an unhighlighted tab bar reads as "you are nowhere".
  return (
    <PageShell activeTab="/growth/strategy" currentStageId="connections">
      <Suspense fallback={<PageLoading title="Advertising" />}>
        <AdvertisingPageBody />
      </Suspense>
    </PageShell>
  );
}
