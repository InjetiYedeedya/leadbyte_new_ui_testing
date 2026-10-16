import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";
import { LinkedinLogo } from "@phosphor-icons/react/ssr";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { PageLoading } from "@/components/ui/page-loading";
import { Badge } from "@/components/ui/badge";
import { ConnectLink } from "@/components/ui/connect-link";
import { PendingLink } from "@/components/ui/pending-link";
import { getSession } from "@/lib/auth/session";
import { checkOAuthStatus } from "@/lib/api/oauth-status";
import { AGENT_DEFINITIONS } from "@/lib/data/agent-repo";
import { checkAgentRun } from "@/lib/data/agent-run-check";
import { LINKEDIN_CONNECT_START } from "@/lib/data/agent-run-gate";
import { statusBadgeVariant, statusLabel } from "@/lib/data/connections";

export const metadata: Metadata = { title: "Connect LinkedIn Ads · LeadByte" };

const AGENT_ID = "linkedin-ads";
const AGENT_PAGE = `/agents/${AGENT_ID}`;

const PRIMARY =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none";
const SECONDARY =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium text-ink transition hover:bg-surface-raised active:scale-[0.98] motion-reduce:transform-none";

/**
 * LinkedIn Ads' own connection page (product notes, 2026-09-30: "when clicked
 * it should lead to a new page specifically for LinkedIn Ads connection").
 *
 * Reached from the Agents list and from the agent's own gate card whenever the
 * agent is bought but no LinkedIn ad account is connected. It says what is
 * needed and what happens next BEFORE sending anyone to LinkedIn, because
 * consent is a trip off-site and the picker that follows it is the one step
 * people abandon. The button starts consent with `from=agent`, so the picker
 * returns to the agent's setup form rather than to Connections
 * (`lib/data/ads-return.ts`).
 *
 * Only LinkedIn has this page; any other agent id is a 404. Google and Meta
 * start consent straight from their agent screens.
 */
async function ConnectPageBody({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const definition = AGENT_DEFINITIONS.find((d) => d.id === agentId);
  if (agentId !== AGENT_ID || !definition) notFound();

  const businessId = await currentBusinessId();
  const email = (await getSession())?.businessId ?? businessId;
  // Purchase first, the same order as the agent page (`agent-run-gate.ts`).
  // The badge reads the real check row rather than the gate, which lets a run
  // through when the check itself cannot be read.
  const [gate, connection] = await Promise.all([
    checkAgentRun(agentId, email, definition.name),
    checkOAuthStatus("linkedInAds", businessId),
  ]);
  const notBought = !gate.ok && gate.step === "purchase";
  // Logged in to LinkedIn, but no ad account picked: not "Connected" yet —
  // "Set up a campaign" would send them to the agent, which sends them back.
  const needsChoice = !gate.ok && gate.step === "account";
  const connected = connection.status === "valid" && !needsChoice;

  return (
    <PageContainer width="reading">
      <Link
        href={AGENT_PAGE}
        className="self-start text-sm text-ink-soft transition-colors hover:text-ink"
      >
        ← {definition.name}
      </Link>

      <PageHeader
        title="Connect LinkedIn Ads"
        description="Link the LinkedIn ad account this agent builds and runs your campaigns in."
      />

      {notBought ? (
        <section className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-ink">{gate.title}</p>
          <p className="mt-1 text-sm text-ink-soft">{gate.message}</p>
          <PendingLink href={gate.fixHref} className={`mt-3 ${PRIMARY}`}>
            {gate.fixLabel}
          </PendingLink>
        </section>
      ) : (
        <section
          aria-labelledby="linkedin-connection"
          className="rounded-lg border border-border bg-surface p-4"
        >
          <div className="flex items-start gap-3">
            {/* LinkedIn's own blue — a third party's brand colour, not ours to
                tokenise (the same exception the account picker takes). */}
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#0A66C2] text-white">
              <LinkedinLogo size={20} weight="fill" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="linkedin-connection" className="text-base font-semibold text-ink">
                  LinkedIn Ads account
                </h2>
                {needsChoice ? (
                  <Badge variant="connection-analysing">Finish setup</Badge>
                ) : (
                  <Badge variant={statusBadgeVariant(connection.status)}>
                    {statusLabel(connection.status)}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                {connected
                  ? "Your LinkedIn ad account is connected. The agent can set up your first campaign."
                  : needsChoice
                    ? "Your LinkedIn login is connected, but no ad account has been chosen. Connect again and pick the one to use."
                    : connection.status === "expired"
                    ? "Your LinkedIn connection has expired. Connect again to keep campaigns running."
                    : connection.status === "error"
                      ? "We couldn't check your LinkedIn connection just now. Connecting again is safe."
                      : definition.description}
              </p>
            </div>
          </div>

          {!connected && (
            <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-ink">What you need</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                  <li>A LinkedIn account that can sign in to Campaign Manager.</li>
                  <li>An ad account in Campaign Manager that you&apos;re allowed to manage.</li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">What happens next</h3>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-soft">
                  <li>Sign in to LinkedIn and allow access.</li>
                  <li>Choose the ad account to use.</li>
                  <li>You come back here to set up your first campaign.</li>
                </ol>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            {connected ? (
              <>
                <PendingLink href={AGENT_PAGE} className={PRIMARY}>
                  Set up a campaign
                </PendingLink>
                {/* Leaves the site, so ConnectLink's raw anchor. */}
                <ConnectLink href={LINKEDIN_CONNECT_START} pendingLabel="Opening…" className={SECONDARY}>
                  Use a different account
                </ConnectLink>
              </>
            ) : (
              <ConnectLink href={LINKEDIN_CONNECT_START} pendingLabel="Opening…" className={PRIMARY}>
                {needsChoice ? "Choose ad account" : "Connect LinkedIn Ads"}
              </ConnectLink>
            )}
          </div>

          {!connected && (
            <p className="mt-3 text-sm text-ink-soft">
              No ad account yet?{" "}
              <a
                href="https://www.linkedin.com/campaignmanager/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-ink underline underline-offset-2 transition-colors hover:text-accent-ink"
              >
                Create one in Campaign Manager
              </a>
              , then come back and connect it.
            </p>
          )}
        </section>
      )}
    </PageContainer>
  );
}

/** Behind its own boundary, like every page here — NOT a `loading.tsx` (rule 0). */
export default function ConnectPage(props: Parameters<typeof ConnectPageBody>[0]) {
  return (
    <PageShell activeTab="/agents" currentStageId="agents">
      <Suspense fallback={<PageLoading title="LinkedIn Ads" />}>
        <ConnectPageBody {...props} />
      </Suspense>
    </PageShell>
  );
}
