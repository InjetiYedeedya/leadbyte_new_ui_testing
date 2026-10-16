import { FlashNotice } from "@/components/ui/flash-notice";
import { Suspense } from "react";
import { CheckCircle, LinkBreak, LinkedinLogo } from "@phosphor-icons/react/ssr";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConnectLink } from "@/components/ui/connect-link";
import { PageLoading } from "@/components/ui/page-loading";
import { PageContainer } from "@/components/ui/page-container";
import { PlatformLogo } from "@/components/analytics/platform-logo";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { cookies } from "next/headers";
import {
  ADS_PLATFORMS,
  adsAccountsCookie,
  parseStoredAccounts,
  platformFromSlug,
  type AdsPlatform,
} from "@/lib/data/ads-accounts";
import { disconnectAdsAccount, loadLinkedInAccounts, selectAdsAccount } from "./actions";

export const metadata: Metadata = { title: "Choose an ad account · LeadByte" };

/**
 * Which ad account should this workspace use?
 *
 * ## Why a picker exists at all
 *
 * One login commonly has access to several ad accounts — an agency's, a
 * client's, an old one nobody has closed. The LinkedIn login this was built
 * against offers five, two of them with the same name. Picking for the
 * customer would attach the wrong account's spend to the whole workspace.
 *
 * ## Nothing is pre-selected
 *
 * It used to pre-check the first row, "because one click is better than two".
 * With several accounts that is a guess made on the customer's behalf, and
 * "the customer picks; we never guess" is the rule the Google picker already
 * follows. The design says it in words: "You must choose exactly one."
 *
 * ## Built to the approved design (2026-09-24), with no client JavaScript
 *
 * The Continue button reads as unavailable until a row is chosen. That is CSS
 * (`group-has-[:checked]`), not state: the radios are `required`, so a submit
 * with none chosen is stopped by the browser and says why. The selected row is
 * outlined the same way. A Server Component with a plain form, because
 * choosing from a list and submitting is exactly what a form does.
 */
async function SelectAdAccountPageBody({
  params,
  searchParams,
}: {
  params: Promise<{ platform: string }>;
  searchParams: Promise<{ error?: string; loaded?: string }>;
}) {
  const { platform: slug } = await params;
  const { error, loaded } = await searchParams;
  const platform = platformFromSlug(slug);

  if (!platform) {
    redirect("/intelligence/connections?error=unknown-platform");
  }

  const config = ADS_PLATFORMS[platform];
  const store = await cookies();
  const accounts = parseStoredAccounts(store.get(adsAccountsCookie(platform))?.value);

  return (
    <PageContainer>
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3">
          <PlatformMark platform={platform} />
          <h1 className="text-base font-semibold text-ink">{config.label}</h1>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-ground p-5">
          {error === "expired" && (
            <FlashNotice role="alert" clear={["error"]} className="mb-4 rounded-md bg-crit-soft px-4 py-3 text-sm text-crit">
              That selection is no longer valid. Pick again from the list below.
            </FlashNotice>
          )}
          {error === "record" && (
            <FlashNotice role="alert" clear={["error"]} className="mb-4 rounded-md bg-crit-soft px-4 py-3 text-sm text-crit">
              We saved your account choice but couldn&apos;t finish connecting it. Please choose it
              again.
            </FlashNotice>
          )}

          {accounts.length > 0 ? (
            <>
              <div className="flex flex-col items-center text-center">
                <span className="flex size-14 items-center justify-center rounded-full border border-good/20 bg-good-soft text-good">
                  <CheckCircle size={30} weight="fill" aria-hidden="true" />
                </span>
                <h2 className="mt-3 text-lg font-bold text-ink">
                  {config.label.replace(/ Ads$/, "")} Account Connected
                </h2>
                <p className="mt-1 text-xs text-ink-soft">
                  Select the ad account you want to use. You must choose exactly one.
                </p>
              </div>

              <form action={selectAdsAccount} className="group mt-6">
                <input type="hidden" name="platform" value={slug} />

                <fieldset>
                  <legend className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    Select an account ({accounts.length} found)
                  </legend>

                  <div className="mt-3 flex flex-col gap-2">
                    {accounts.map((account) => (
                      <label
                        key={account.id}
                        className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 transition-colors hover:border-accent/40 has-[:checked]:border-accent has-[:checked]:bg-accent-soft/40 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
                      >
                        <input
                          type="radio"
                          name="accountId"
                          value={account.id}
                          required
                          suppressHydrationWarning
                          className="size-4 shrink-0 accent-accent"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink">
                            {account.name}
                          </span>
                          {/* The id is what tells two same-named accounts apart
                              (two are called "Unimakler"); currency and status
                              say what the spend is in and whether the account
                              can run at all. `filter` so a missing part leaves
                              no stray separator. */}
                          <span className="block text-xs tabular-nums text-ink-soft">
                            {[`ID: ${account.id}`, account.currency, account.status, account.businessName]
                              .filter((part) => part !== "")
                              .join(" · ")}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3">
                  <p className="text-sm text-ink-soft">
                    <span className="group-has-[:checked]:hidden">Select an account above to continue</span>
                    <span className="hidden text-ink group-has-[:checked]:inline">Ready to continue</span>
                  </p>
                  <SubmitButton
                    pendingLabel="Connecting…"
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-accent px-5 text-sm font-semibold text-surface opacity-50 transition hover:bg-accent-ink group-has-[:checked]:opacity-100"
                  >
                    Continue <span aria-hidden="true">→</span>
                  </SubmitButton>
                </div>
              </form>
            </>
          ) : platform === "linkedInAds" ? (
            // LinkedIn has a second source for the list, so an empty picker
            // offers to fetch it rather than sending the customer back
            // through consent (LINKEDIN_ADS_FLOW.md 1.3).
            <div>
              <p className="text-sm font-medium text-ink">
                {loaded === "none"
                  ? "LinkedIn connected, but no ad accounts came back."
                  : "Let's find your LinkedIn ad accounts."}
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                {loaded === "none"
                  ? "This LinkedIn login may not have access to an ad account yet. Try again, or reconnect with the login that manages your ads."
                  : "We'll ask LinkedIn which ad accounts this login can use. It takes a few seconds."}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <form action={loadLinkedInAccounts}>
                  <SubmitButton
                    pendingLabel="Loading…"
                    className="min-h-10 rounded-md bg-accent px-4 text-sm font-semibold text-surface transition hover:bg-accent-ink"
                  >
                    {loaded === "none" ? "Try again" : "Load my ad accounts"}
                  </SubmitButton>
                </form>
                <ConnectLink
                  href={config.connectHref}
                  pendingLabel="Opening…"
                  className="inline-flex min-h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-ink transition hover:bg-surface-raised"
                >
                  Reconnect {config.label}
                </ConnectLink>
              </div>
            </div>
          ) : (
            // Nothing to choose from means consent has not been given, or has
            // lapsed. An empty picker with a disabled button would tell the
            // customer nothing about what to do next.
            <div>
              <p className="text-sm font-medium text-ink">
                We don&apos;t have a list of {config.label} accounts to show you.
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                The list arrives with the connection itself and only lasts an hour, so this
                happens if you came here directly, or left it a while. Connecting again brings it
                back, and you won&apos;t lose anything.
              </p>
              <ConnectLink
                href={config.connectHref}
                pendingLabel="Opening…"
                className="mt-4 inline-flex min-h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-surface transition hover:bg-accent-ink"
              >
                Connect {config.label}
              </ConnectLink>
            </div>
          )}

          {/* Asks first: removing the connection means walking back through
              the platform's consent to get it again. */}
          <form action={disconnectAdsAccount} className="mt-6 flex justify-center">
            <input type="hidden" name="platform" value={slug} />
            <ConfirmSubmit
              title={`Disconnect ${config.label}?`}
              body={`${config.label} will show as not connected, and its agent will stop until you connect again.`}
              confirmLabel="Disconnect"
              pendingLabel="Disconnecting…"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-accent/30 bg-surface px-3.5 text-xs font-medium text-accent-ink transition hover:bg-accent-soft/40"
            >
              <LinkBreak size={14} aria-hidden="true" />
              Disconnect account
            </ConfirmSubmit>
          </form>
        </div>
      </div>
    </PageContainer>
  );
}

/**
 * The platform's own mark. LinkedIn's is its logo on LinkedIn's blue — a third
 * party's brand colour, which is not ours to tokenise (the same exception
 * `connect-google.tsx` takes). Google and Meta use their official assets.
 */
function PlatformMark({ platform }: { platform: AdsPlatform }) {
  if (platform === "linkedInAds") {
    return (
      <span className="flex size-9 items-center justify-center rounded-md bg-[#0A66C2] text-white">
        <LinkedinLogo size={20} weight="fill" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="flex size-9 items-center justify-center overflow-hidden rounded-md border border-border bg-surface">
      <PlatformLogo platform={platform === "googleAds" ? "google" : "meta"} className="size-6" />
    </span>
  );
}

/**
 * The page's own reads sit behind a boundary so the frame does not wait on
 * them. See the note on `PageShell`; this is NOT a route-level `loading.tsx`
 * (rule 0).
 */
export default function SelectAdAccountPage(props: Parameters<typeof SelectAdAccountPageBody>[0]) {
  return (
    // `/growth/advertising` is no longer in TABS (2026-09-09), so pointing
    // there highlighted nothing — an unhighlighted tab bar reads as "you are
    // nowhere". Borrows the section it belongs to, as `advertising/page.tsx`
    // already does.
    <PageShell activeTab="/growth/strategy" currentStageId="connections" showConnectPrompt={false}>
      <Suspense fallback={<PageLoading title="Choose an ad account" />}>
        <SelectAdAccountPageBody {...props} />
      </Suspense>
    </PageShell>
  );
}
