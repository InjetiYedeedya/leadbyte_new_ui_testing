import type { Metadata } from "next";
import { Suspense } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { PageLoading } from "@/components/ui/page-loading";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import { ConnectLink } from "@/components/ui/connect-link";
import { getStrategyRepo } from "@/lib/data/strategy-repo";
import { isBackendConfigured } from "@/lib/api/config";
import { getConversation } from "@/lib/data/strategy-conversation";
import { StrategyThread } from "@/components/strategy/strategy-thread";
import { ConnectAdsGate } from "@/components/strategy/connect-ads-gate";
import { checkOAuthStatus } from "@/lib/api/oauth-status";
import { adsPromptDecision } from "@/lib/data/ads-prompt";
import { ADS_PLATFORMS } from "@/lib/data/ads-accounts";
import { beginStrategy, restartStrategy, sendStrategyReply, skipAdsAndBegin } from "./actions";
import { PageContainer } from "@/components/ui/page-container";
import { NextStep } from "@/components/ui/next-step";

export const metadata: Metadata = { title: "Strategy · LeadByte" };

async function StrategyPageBody() {
  const businessId = await currentBusinessId();
  const strategy = await getStrategyRepo().get(businessId);

  // With a backend the strategy is a conversation with an agent. With none the
  // mock strategy below is still the working path — an unconfigured environment
  // is a working environment.
  const live = isBackendConfigured();
  const conversation = live ? await getConversation(businessId) : null;
  const started = (conversation?.turns.length ?? 0) > 0;
  // `generated` only ever becomes true on the mock path, so it must never win
  // once a backend is configured.
  const showMockStrategy = !live && strategy.generated;

  // Ad-account status, read on every visit — the ask is raised from this alone
  // now, with no remembered dismissal. Only on the live path: with no backend
  // there is nothing to connect to, and the modal would be a dead end.
  const [googleAds, metaAds] = await Promise.all([
    live
      ? checkOAuthStatus("googleAds", businessId)
      : Promise.resolve({ status: "valid" as const, expiryDate: null }),
    live
      ? checkOAuthStatus("metaAds", businessId)
      : Promise.resolve({ status: "valid" as const, expiryDate: null }),
  ]);

  const adsPrompt = adsPromptDecision({
    started,
    googleAds: googleAds.status,
    metaAds: metaAds.status,
  });

  return (
    <>
      <PageContainer>

        {live && conversation ? (
          // One column for the whole screen — heading, notice and thread share
          // an edge. It is capped because a chat thread at the page's full
          // 1440px is unreadable, but NOT centred: `mx-auto` here indented the
          // heading 208px while every other page's <h1> starts at the page
          // edge, so this screen alone looked misaligned with the wordmark
          // above it. The centring existed to stop things reading as "stuck to
          // the left" in a window twice their width — which is what the
          // container's own max-width now handles.
          <div className="w-full">
            {/* The heading row spans the page so Next sits at its right edge,
                where every other page puts it; the thread below stays capped. */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 max-w-5xl">
                <h1 className="text-lg font-bold tracking-tight text-ink">
                  Your marketing strategy
                </h1>
                <p className="mb-4 mt-0.5 text-sm leading-6 text-ink-soft">
                  {started
                    ? "The agent asks what it needs as it goes — answer below and it keeps the thread."
                    : "Talk it through with the strategy agent. It'll ask about your goal, budget and target, then build the plan."}
                </p>
              </div>
              <NextStep current="/growth/strategy" />
            </div>
            <div className="max-w-5xl">
            {/* The ask stands in FRONT of the first message rather than
                beside it: while it is outstanding it replaces the start button
                entirely, so there is no path to the agent's questions that
                skips it. `adsPrompt.show` is already false once the
                conversation has turns, so this never displaces the thread. */}
            {/* Stays after the dialog is closed, so there is still a way to
                connect without hunting for the Connections tab. */}
            {adsPrompt.show && (
              <p className="mb-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm leading-6 text-ink-soft">
                Connect{" "}
                {adsPrompt.missing.map((id, i) => (
                  <span key={id}>
                    {i > 0 && " and "}
                    <ConnectLink
                      href={ADS_PLATFORMS[id].connectHref}
                      className="inline-flex items-center gap-1.5 font-medium text-accent-ink underline"
                    >
                      {ADS_PLATFORMS[id].label}
                    </ConnectLink>
                  </span>
                ))}{" "}
                and the agent can plan against what your advertising actually costs.
              </p>
            )}

            {/* Before the first message the ask REPLACES the start button, so
                closing it cannot leave a way past. Mid-conversation it opens
                over the thread and closes without blocking a reply. */}
            {adsPrompt.gate ? (
              <ConnectAdsGate missing={adsPrompt.missing} onStartAnyway={skipAdsAndBegin} />
            ) : (
              <>
                {adsPrompt.show && <ConnectAdsGate missing={adsPrompt.missing} />}
                <StrategyThread
                  conversation={conversation}
                  onBegin={beginStrategy}
                  onSend={sendStrategyReply}
                  onRestart={restartStrategy}
                />
              </>
            )}
            </div>
          </div>
        ) : showMockStrategy ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-lg font-bold text-ink">{strategy.headline}</h1>
              <NextStep current="/growth/strategy" />
            </div>
            <p className="mb-4 max-w-2xl text-sm text-ink-soft">{strategy.executiveSummary}</p>
            <div className="space-y-4">
              {strategy.recommendations?.map((rec) => (
                <div key={rec.title} className="rounded-lg border border-border bg-surface p-4">
                  <h3 className="mb-2 font-medium text-ink">{rec.title}</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="mb-1 text-xs uppercase tracking-wide text-ink-soft">Why</div>
                      <div className="text-ink-soft">{rec.why}</div>
                    </div>
                    <div>
                      <div className="mb-1 text-xs uppercase tracking-wide text-ink-soft">
                        Evidence
                      </div>
                      <div className="text-ink-soft">{rec.evidence}</div>
                    </div>
                    <div>
                      <div className="mb-1 text-xs uppercase tracking-wide text-ink-soft">
                        Expected impact
                      </div>
                      <div className="text-ink-soft">{rec.expectedImpact}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-lg font-bold text-ink">Build your marketing strategy</h1>
              <NextStep current="/growth/strategy" />
            </div>
            <p className="mb-4 max-w-2xl text-sm text-ink-soft">
              No backend is configured, so this shows the sample strategy.
            </p>
            <form action={beginStrategy}>
              <SubmitButton
                pendingLabel="Generating…"
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
              >
                Generate strategy
              </SubmitButton>
            </form>
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
export default function StrategyPage() {
  return (
    <PageShell activeTab="/growth/strategy" currentStageId="strategy">
      <Suspense fallback={<PageLoading title="Strategy" />}>
        <StrategyPageBody />
      </Suspense>
    </PageShell>
  );
}
