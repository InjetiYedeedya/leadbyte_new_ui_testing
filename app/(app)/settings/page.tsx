import type { Metadata } from "next";
import { Suspense } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import Link from "@/components/ui/app-link";
import { PageLoading } from "@/components/ui/page-loading";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { getBusinessProfileRepo } from "@/lib/data/business-profile-repo";
import { getBusinessRepo, type BusinessAnalysisStatus } from "@/lib/data/business-repo";
import { getSession } from "@/lib/auth/session";
import { isBackendConfigured } from "@/lib/api/config";
import { firstFilled, joinFilled } from "@/lib/data/profile-display";
import { getEntitlements } from "@/lib/entitlements";
import { isHiddenAgent } from "@/lib/data/agent-repo";
import { addBusiness, switchBusinessAction } from "./actions";
import { PageContainer, PageHeader } from "@/components/ui/page-container";

export const metadata: Metadata = { title: "Settings · LeadByte" };

const STATUS_VARIANT: Record<BusinessAnalysisStatus, BadgeVariant> = {
  active: "connection-connected",
  analysing: "connection-analysing",
  "not-started": "connection-not-connected",
};

async function SettingsPageBody() {
  const businessId = await currentBusinessId();
  const session = await getSession();
  const [profile, entitlements, allBusinesses] = await Promise.all([
    getBusinessProfileRepo().get(businessId),
    // What the account can actually run, from its purchases and grants. The
    // card used to show `getPlan()`, a cookie nothing ever set, so every
    // account — paying ones included — read "Free plan" (audit, 2026-09-25).
    getEntitlements(businessId),
    getBusinessRepo().list(session!.ownerId),
  ]);
  const offeredUnlocked = entitlements.agents.filter((id) => !isHiddenAgent(id)).length;

  /**
   * CONFIRMED by the backend team 2026-08-28: there is no business dimension.
   * Core tables are keyed by email/user_id; `business_id` appears only on the
   * integration tables. There is no businesses list, no per-business data
   * separation and no business CRUD.
   *
   * So against a live backend this is one business per account, and the
   * switcher is hidden. Showing it would let someone "switch" to a workspace
   * that reads the same records under a different name — the fake switching
   * the migration brief explicitly forbids.
   *
   * The multi-business UI is kept for mock mode, and returns in full if the
   * backend ever gains the dimension.
   */
  const multiBusiness = !isBackendConfigured();
  const businesses = multiBusiness
    ? allBusinesses
    : allBusinesses.filter((b) => b.businessId === businessId);
  // Businesses with no seeded profile yet (e.g. just added) have no
  // BusinessProfile row — fall back to what BusinessRepo already knows
  // about them rather than showing the raw internal businessId.
  const activeBusiness = businesses.find((b) => b.businessId === businessId);

  return (
    <>
      <PageContainer>
        <PageHeader
          title="Settings"
          description={
            session!.ownerId +
            (multiBusiness
              ? ` · Owner of ${businesses.length} businesses. Anything you change here applies to the active workspace only.`
              : " · Account settings.")
          }
        />

        {/* In live mode BusinessRepo is mock-only, so this list is empty for a
            real account and the card rendered as a lone heading. The Workspace
            card below already states the same facts. */}
        {(multiBusiness || businesses.length > 0) && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">
              {multiBusiness ? "Businesses" : "Your business"}
            </h2>
          </div>
          <div className="space-y-2">
            {businesses.map((b) => (
              <div
                key={b.businessId}
                className="flex items-center justify-between rounded border border-border p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{b.name}</span>
                    <Badge variant={STATUS_VARIANT[b.status]}>{b.status}</Badge>
                  </div>
                  <div className="text-xs text-ink-soft">
                    {joinFilled([b.websiteUrl, b.statusDetail])}
                  </div>
                </div>
                {b.businessId === businessId ? (
                  <span className="text-xs text-ink-soft">Active</span>
                ) : (
                  <form action={switchBusinessAction}>
                    <input type="hidden" name="businessId" value={b.businessId}
                      suppressHydrationWarning
                    />
                    <SubmitButton pendingLabel="Switching…" className="text-xs text-accent-ink">
                      Switch →
                    </SubmitButton>
                  </form>
                )}
              </div>
            ))}
          </div>
          {/* Adding a business only means anything in mock mode. Against a
              live backend there is one business per account (confirmed by the
              backend team) and BusinessRepo is mock-only, so this form would
              promise a workspace that cannot exist. */}
          {multiBusiness && (
          <form action={addBusiness} className="mt-4 flex gap-2">
            <input
              type="text"
              name="websiteUrl"
              placeholder="https://newbusiness.com"
              required
              className="flex-1 rounded border border-border bg-ground p-2 text-sm text-ink"
              suppressHydrationWarning
            />
            <SubmitButton
              pendingLabel="Adding…"
              className="rounded bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
            >
              Add a business
            </SubmitButton>
          </form>
          )}
        </div>
        )}

        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-4 text-base font-bold text-ink">Workspace</h2>
          {/* Four short values across a 1440px card left each one alone in a
              ~700px column. They fit on one row on a wide screen. */}
          <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="mb-1 text-xs text-ink-soft">
                Workspace name
              </div>
              <div className="text-ink">
                {firstFilled(profile?.businessName, activeBusiness?.name, businessId)}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-ink-soft">Website</div>
              <div className="text-ink">{firstFilled(profile?.websiteUrl, activeBusiness?.websiteUrl) ?? "—"}</div>
            </div>
            {/* These two were literals — "INR ₹ · USD shown secondary" and
                "Asia/Kolkata (IST)" — printed as though they were this
                workspace's settings, directly beside a Website field that
                genuinely reads the profile. Nothing stores either value, and
                nothing in the app reads them: a customer who moved their
                reporting to USD would see INR here forever and have no way to
                change it. A setting nobody can set is worse than an absent
                one, so they say what is true until there is somewhere to
                store them. */}
            <div>
              <div className="mb-1 text-xs text-ink-soft">
                Reporting currency
              </div>
              <div className="text-ink-soft">Not configured</div>
            </div>
            <div>
              <div className="mb-1 text-xs text-ink-soft">Time zone</div>
              <div className="text-ink-soft">Not configured</div>
            </div>
          </div>
        </div>

        {/* Connections now lives here rather than in the top nav / stage rail.
            The Connections page itself is unchanged and still handles every
            provider — this is just its entry point. */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-ink">Connections</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Connect Google, ad accounts, social and your email mailbox — the accounts your
                agents read and send from.
              </p>
            </div>
            <Link
              href="/intelligence/connections"
              className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
            >
              Manage connections
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-3 text-base font-bold text-ink">Plan &amp; billing</h2>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink">
              {/* Only agents the product offers. Hidden ones (Writer, Coding) were
                  counted too, so this read "11 agents unlocked" beside an Agents
                  page listing 10 (seen live, 2026-09-29). */}
              {offeredUnlocked === 0
                ? "No agents unlocked yet"
                : `${offeredUnlocked} agent${offeredUnlocked === 1 ? "" : "s"} unlocked`}
            </span>
            {/* This used to point at /upgrade, removed because the tiered
                plans it sold were never defined. `/pricing` (2026-09-18) is a
                different, per-agent model — real prices, no tier to name — so
                "See pricing" rather than "Upgrade": nothing here is being
                offered as better than what `{plan} plan` already says. */}
            <Link
              href="/pricing"
              className="text-sm font-medium text-accent-ink transition-colors hover:text-ink"
            >
              See pricing
            </Link>
          </div>
        </div>
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
export default function SettingsPage() {
  return (
    <PageShell activeTab="/settings" currentStageId="agents">
      <Suspense fallback={<PageLoading title="Settings" />}>
        <SettingsPageBody />
      </Suspense>
    </PageShell>
  );
}
