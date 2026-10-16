import { Suspense } from "react";
import type { Metadata } from "next";
import { PageLoading } from "@/components/ui/page-loading";
import { PageShell } from "@/components/page-shell";
import { ErrorState, NotConnectedState, PartialDataState } from "@/components/ui/states";
import {
  GoogleConnectResult,
  isGoogleConnectState,
} from "@/components/analysis/google-connect-result";
import { TimelineBands } from "@/components/analytics/timeline-bands";
import { ChannelOverview } from "@/components/analytics/channel-overview";
import { DateWindow } from "@/components/analytics/date-window";
import { readPerformance } from "./performance-data";
import { PageContainer } from "@/components/ui/page-container";
import { NextStep } from "@/components/ui/next-step";
import { HashScroll } from "@/components/ui/hash-scroll";

export const metadata: Metadata = { title: "Performance · LeadByte" };

async function AnalyticsPageBody({
  searchParams,
}: {
  /** Set by the Google connect flow, which lands here — see `GOOGLE_RESULT_PATH`. */
  searchParams: Promise<{ google?: string; message?: string }>;
}) {
  const { google: googleState, message: googleMessage } = await searchParams;
  const {
    hasSearch,
    withAdsData,
    linked,
    adsLinked,
    loadFailed,
    linkUnknown,
    timeline,
    window,
    channels,
    sources,
  } =
    await readPerformance();

  const nothingConnected = sources.length === 0;

  return (
    <PageContainer>
      {/* The window sits with the title because "how recent is this?" is the
          first question about any dashboard. It used to be a "Days of data"
          stat tile, at the same size as the sessions figure — a count of days
          is metadata about our import, not a metric. */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="text-lg font-bold text-ink">Performance</h1>
          <p className="mt-0.5 max-w-prose text-sm text-ink-soft">
            Your website, search and advertising in one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateWindow window={window} />
          <NextStep current="/analytics" />
        </div>
      </div>

      {/* The Google connect flow's result, because the flow now returns here.
          Connecting is the one moment someone needs telling whether it worked,
          and a confirmation left behind on the page they used to land on is a
          confirmation nobody sees. */}
      {isGoogleConnectState(googleState) && (
        <GoogleConnectResult state={googleState} message={googleMessage} />
      )}

      {/* Two different empty states, because they need two different actions.
          Reading this from the mock connections repo — as this page used to —
          told a linked account it "isn't connected", and pointed it at a
          connect flow it had already completed. */}
      {/* A failed read is "couldn't load", not "not connected". An empty
          page used to tell a connected account, whose data simply had not
          loaded, to go and connect (audit, 2026-09-29). */}
      {nothingConnected && loadFailed && (
        <ErrorState
          title="Couldn't load your performance data"
          description="Your data didn't come back in time. Reload the page in a moment."
        />
      )}

      {nothingConnected && !loadFailed && !linked && !adsLinked && !linkUnknown && (
        <NotConnectedState platform="Google Analytics" connectHref="/intelligence/connections" />
      )}

      {nothingConnected && !loadFailed && (linked || adsLinked) && (
        <PartialDataState
          missing="Your first import"
          reason="Your accounts are connected — the first import usually lands within a few hours. Nothing to do."
        />
      )}

      {/* Each card links to /analytics/explore — the detail is its own page,
          so this one stays the answer to "how is each channel doing". */}
      <ChannelOverview channels={channels} timeline={timeline} />

      {/* The chart needs two days to draw a line between. With one it says
          nothing a number has not already said, so the cards stand alone. */}
      {/* `#cross-channel`: where the Agents menu's cross-channel card leads. */}
      <HashScroll />
      {timeline.dates.length > 1 && (
        <div id="cross-channel" className="scroll-mt-40 rounded-lg border border-border bg-surface p-4">
          <TimelineBands timeline={timeline} />
        </div>
      )}

      {/* Notices for a source that is connected but absent from the explorer.
          Only shown when something else IS there — with nothing at all, the
          page-level state above has already said it once. */}
      {!nothingConnected && !hasSearch && linked && (
        <PartialDataState
          missing="Search Console data"
          reason="Your Google account is connected — Search Console data usually appears within a day of connecting."
        />
      )}

      {!nothingConnected && withAdsData.length === 0 && adsLinked && (
        <PartialDataState
          missing="Campaign data"
          reason="Your ad account is connected — the first import usually lands within a few hours of choosing an account."
        />
      )}
    </PageContainer>
  );
}

/**
 * Called "Performance" on screen; the route is still `/analytics`.
 *
 * Renaming the directory would change a URL that `TabBar`, the Overview "next
 * step" links and every page's `activeTab` all name, for no gain the reader
 * can see. The detail behind each channel is its own page, `/analytics/explore`.
 */
export default function AnalyticsPage(props: Parameters<typeof AnalyticsPageBody>[0]) {
  return (
    <PageShell activeTab="/analytics" currentStageId="connections">
      <Suspense fallback={<PageLoading title="Performance" />}>
        <AnalyticsPageBody {...props} />
      </Suspense>
    </PageShell>
  );
}
