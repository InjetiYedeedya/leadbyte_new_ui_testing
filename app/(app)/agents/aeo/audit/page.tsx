import { readSignedText } from "@/lib/signed-text";
import { FlashNotice } from "@/components/ui/flash-notice";
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "@/components/ui/app-link";
import { PageLoading } from "@/components/ui/page-loading";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import { PageContainer } from "@/components/ui/page-container";
import { SubmitButton } from "@/components/ui/submit-button";
import { AeoSubdomainPicker } from "@/components/agents/aeo-subdomain-picker";
import { getBusinessProfileRepo } from "@/lib/data/business-profile-repo";
import { firstFilled } from "@/lib/data/profile-display";
import { isAeoConfigured } from "@/lib/api/config";
import { readAeoPick, readAeoRun } from "@/lib/data/aeo-run";
import { startAeoAuditAction } from "../actions";

export const metadata: Metadata = { title: "AEO audit · LeadByte" };

/**
 * Step one of the AEO agent: which site, and how much of it.
 *
 * ## Why this is a static segment and not part of `[agentId]`
 *
 * The shared agent flow pages — `suggestion`, `semi`, `creative` — all
 * `notFound()` unless the agent has an n8n `chatPath`, and this agent will
 * never have one: it talks to a different service entirely. `openai-ads`
 * reached the same conclusion first and set the precedent. A static segment
 * does not shadow `[agentId]/page.tsx`, so `/agents/aeo` still renders the
 * agent's own workspace; only the deeper paths are ours.
 */
async function AeoAuditPageBody({
  searchParams,
}: {
  searchParams: Promise<{ problem?: string; kind?: string; url?: string; pick?: string }>;
}) {
  const { problem: rawProblem, kind, url, pick } = await searchParams;
  // Signed by the action that redirected here; a link carrying any other text
  // shows nothing rather than words someone else chose (audit, 2026-09-29).
  const problem = readSignedText(rawProblem) ?? undefined;
  const businessId = await currentBusinessId();
  const [profile, discovery, run] = await Promise.all([
    getBusinessProfileRepo().get(businessId),
    readAeoPick(),
    readAeoRun(),
  ]);

  // The account's own site, offered rather than imposed: an agency auditing a
  // client's site is the obvious second case, and the field stays editable.
  const defaultUrl = url ?? firstFilled(profile?.websiteUrl) ?? "";

  // Not a thrown error and not an empty form — the service is a separate
  // deployment and either it is reachable or it is not. Saying so is the whole
  // state; offering a Try again for it would be a button guaranteed to fail.
  const unavailable = !isAeoConfigured() || kind === "unavailable";

  return (
    <PageContainer>
      <div className="max-w-3xl">
        <Link
          href="/agents/aeo"
          className="text-sm text-ink-soft transition-colors hover:text-ink motion-reduce:transition-none"
        >
          ← AEO agent
        </Link>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Audit your site for AI answer engines
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
          We fetch your pages the way ChatGPT, Perplexity and Google&apos;s AI results do, and
          score what they can read, trust and quote.
        </p>
        {/* The one line that keeps two scores from reading as a bug. GEO
            analysis measures the same site from the website-analyze job; this
            is a separate audit by a separate service, and the two numbers are
            not the same measurement. */}
        <p className="mt-2 max-w-prose text-sm text-ink-soft">
          This is a separate audit from{" "}
          <Link
            href="/overview/geo-analysis"
            className="text-accent-ink underline-offset-4 hover:underline"
          >
            GEO analysis
          </Link>
          , which reports on your last website analysis. The two run different checks, so their
          scores will not match.
        </p>
      </div>

      {unavailable ? (
        <div role="status" className="max-w-3xl rounded-lg border border-border bg-surface p-4">
          <h2 className="text-base font-semibold text-ink">
            The audit service isn&apos;t available yet
          </h2>
          <p className="mt-1 max-w-prose text-sm text-ink-soft">
            The AEO agent runs on a service that isn&apos;t connected to this environment. Nothing
            is wrong with your site — there is simply nothing to ask yet.
          </p>
        </div>
      ) : (
        <>
          {problem && (
            <FlashNotice role="alert" clear={["problem"]} className="max-w-3xl rounded-lg bg-crit-soft px-4 py-3 text-sm text-crit">
              {problem}
            </FlashNotice>
          )}

          {discovery && discovery.subdomains.length > 0 ? (
            <div className="max-w-3xl">
              <AeoSubdomainPicker
                domain={discovery.domain || discovery.websiteUrl}
                subdomains={discovery.subdomains}
                autoOpen={pick === "1"}
              />
            </div>
          ) : (
            <form action={startAeoAuditAction} className="max-w-3xl">
              <div className="rounded-lg border border-border bg-surface p-4">
                <label htmlFor="aeo-url" className="block text-sm font-medium text-ink">
                  Website address
                </label>
                <input
                  id="aeo-url"
                  name="websiteUrl"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  required
                  defaultValue={defaultUrl}
                  placeholder="example.com"
                  suppressHydrationWarning
                  className="mt-2 w-full rounded-md border border-border bg-ground px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent"
                />

                <label className="mt-4 flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    name="subdomain"
                    suppressHydrationWarning
                    className="mt-0.5 size-4 shrink-0 accent-accent"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">
                      Check for subdomains first
                    </span>
                    {/* The wait is named because it is long enough to look
                        broken otherwise: the service queries Certificate
                        Transparency logs, then checks which hosts are live,
                        before it answers at all. */}
                    <span className="mt-0.5 block text-sm text-ink-soft">
                      We&apos;ll look for other sites on your domain and let you pick which to
                      include. This takes up to a minute before anything starts.
                    </span>
                  </span>
                </label>

                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
                  <SubmitButton
                    pendingLabel="Checking your site…"
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ground transition hover:bg-accent-ink motion-reduce:transition-none"
                  >
                    Run audit
                  </SubmitButton>
                  {run && run.sites.length > 0 && (
                    <Link
                      href="/agents/aeo/report"
                      className="text-sm font-medium text-accent-ink underline-offset-4 hover:underline"
                    >
                      See the audit already running
                    </Link>
                  )}
                </div>
              </div>
            </form>
          )}
        </>
      )}
    </PageContainer>
  );
}

export default function AeoAuditPage(props: Parameters<typeof AeoAuditPageBody>[0]) {
  return (
    <PageShell activeTab="/agents" currentStageId="agents">
      <Suspense fallback={<PageLoading title="AEO audit" />}>
        <AeoAuditPageBody {...props} />
      </Suspense>
    </PageShell>
  );
}
