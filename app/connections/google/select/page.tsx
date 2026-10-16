import { Suspense } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { GOOGLE_RESULT_PATH } from "@/components/analysis/google-connect-result";
import { PageLoading } from "@/components/ui/page-loading";
import Link from "@/components/ui/app-link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import {
  GOOGLE_PROPERTIES_COOKIE,
  groupByAccount,
  parseGoogleProperties,
  propertyNumber,
} from "@/lib/data/google-properties";
import {
  GOOGLE_SITES_COOKIE,
  parseGoogleSites,
  siteKind,
  siteLabel,
} from "@/lib/data/google-sites";
import { selectGoogleTargets } from "./actions";

export const metadata: Metadata = { title: "Choose what to read · LeadByte" };

/**
 * Which Analytics property and which Search Console site should this workspace
 * read?
 *
 * A Google account routinely owns several of each — properties across several
 * accounts, including auto-created "Default Account for Firebase" ones that
 * look nothing like the customer's brand; and an http prefix, an https prefix
 * and a domain property all covering the same site. Guessing on their behalf
 * would silently attach the wrong site's numbers to their whole workspace, so
 * they choose.
 *
 * One page serves all three flows. Analytics alone, Search Console alone and
 * both at once differ only in which lists the callback left behind, so the
 * sections render from what is there rather than from a `platform` parameter.
 *
 * A Server Component with a plain `<form action={serverAction}>`: choosing from
 * a list and submitting is exactly what a form does, so this earns no
 * `"use client"`. The first row of each list is pre-selected, because the
 * backend returns the customer's own account before the generated ones and one
 * click is better than two.
 */
async function SelectGoogleTargetsPageBody() {
  const businessId = await currentBusinessId();
  const store = await cookies();
  const properties = parseGoogleProperties(store.get(GOOGLE_PROPERTIES_COOKIE)?.value);
  const sites = parseGoogleSites(store.get(GOOGLE_SITES_COOKIE)?.value);

  // Landed here directly, or the 15-minute cookies expired. There is nothing to
  // choose from, so do not show an empty picker.
  if (properties.length === 0 && sites.length === 0) {
    redirect(`${GOOGLE_RESULT_PATH}?google=unselected`);
  }

  const groups = groupByAccount(properties);
  const googleEmail = properties[0]?.email || sites[0]?.email;
  const both = properties.length > 0 && sites.length > 0;

  return (
    <>
      <main className="p-4">
        <div className="max-w-2xl">
          <h1 className="text-lg font-bold text-ink">
            {both
              ? "Choose what LeadByte should read"
              : properties.length > 0
                ? "Choose an Analytics property"
                : "Choose a Search Console site"}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            You&apos;re connected
            {googleEmail && googleEmail !== businessId ? ` as ${googleEmail}` : ""}. Pick
            what belongs to this website — it&apos;s the data your reports and agents will
            read.
          </p>

          <form action={selectGoogleTargets} className="mt-6 space-y-4">
            {properties.length > 0 && (
              <fieldset>
                <legend className="text-sm font-medium text-ink">
                  Google Analytics property
                </legend>

                <div className="mt-3 space-y-4">
                  {groups.map((group, groupIndex) => (
                    <div key={group.accountName}>
                      <h2 className="mb-2 text-xs text-ink-soft">{group.accountName}</h2>
                      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                        {group.properties.map((property, i) => (
                          <label
                            key={property.propertyId}
                            className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-raised"
                          >
                            <input
                              type="radio"
                              name="propertyId"
                              value={property.propertyId}
                              defaultChecked={groupIndex === 0 && i === 0}
                              required
                              suppressHydrationWarning
                              className="h-4 w-4 shrink-0 accent-accent"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-ink">
                                {property.propertyName}
                              </span>
                              <span className="block font-mono text-xs text-ink-soft">
                                {propertyNumber(property)}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>
            )}

            {sites.length > 0 && (
              <fieldset>
                <legend className="text-sm font-medium text-ink">Search Console site</legend>

                <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                  {sites.map((site, i) => (
                    <label
                      key={site.siteUrl}
                      className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-raised"
                    >
                      <input
                        type="radio"
                        name="siteUrl"
                        value={site.siteUrl}
                        defaultChecked={i === 0}
                        required
                        suppressHydrationWarning
                        className="h-4 w-4 shrink-0 accent-accent"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">
                          {siteLabel(site)}
                        </span>
                        {/* A domain property and a URL prefix look almost
                            identical but cover very different things. */}
                        <span className="block text-xs text-ink-soft">{siteKind(site)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton
                pendingLabel="Saving…"
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition active:scale-[0.99] motion-reduce:transform-none hover:bg-accent-ink"
              >
                {both ? "Use these" : "Use this"}
              </SubmitButton>
              <Link
                href={`${GOOGLE_RESULT_PATH}?google=unselected`}
                className="text-sm text-ink-soft underline underline-offset-2 hover:text-ink"
              >
                Decide later
              </Link>
            </div>
          </form>
        </div>
      </main>
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
export default function SelectGoogleTargetsPage() {
  return (
    <PageShell activeTab="/overview" currentStageId="connections" showConnectPrompt={false}>
      <Suspense fallback={<PageLoading title="Choose what to connect" />}>
        <SelectGoogleTargetsPageBody />
      </Suspense>
    </PageShell>
  );
}
