import { Suspense } from "react";
import Link from "@/components/ui/app-link";
import type { Metadata } from "next";
import { PageLoading } from "@/components/ui/page-loading";
import { PageShell } from "@/components/page-shell";
import { ErrorState, NotConnectedState, PartialDataState } from "@/components/ui/states";
import { SourceExplorer } from "@/components/analytics/source-explorer";
import { DateWindow } from "@/components/analytics/date-window";
import { readPerformance } from "../performance-data";
import { PageContainer } from "@/components/ui/page-container";

export const metadata: Metadata = { title: "Explore your performance · LeadByte" };

/**
 * The detail behind one channel, as its own screen.
 *
 * It used to sit under the three cards on `/analytics`, which made the summary
 * a lid on four charts, three tables and a filter bar nobody had asked for
 * yet. A card's "Explore" link now navigates here, and `?source=` says which
 * channel was clicked — a real URL, so it can be linked, bookmarked and
 * returned to, which an in-page disclosure could not be.
 */
async function ExplorePageBody({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const { source } = await searchParams;
  const { window, sources, loadFailed, linked, adsLinked } = await readPerformance();

  if (sources.length === 0) {
    // Three different empties, as on /analytics: a failed read, connected but
    // not yet imported, and genuinely not connected. This page said "isn't
    // connected" for all three (audit, 2026-09-29).
    return (
      <PageContainer>
        {loadFailed ? (
          <ErrorState
            title="Couldn't load your performance data"
            description="Your data didn't come back in time. Reload the page in a moment."
          />
        ) : linked || adsLinked ? (
          <PartialDataState
            missing="Your first import"
            reason="Your accounts are connected — the first import usually lands within a few hours. Nothing to do."
          />
        ) : (
          <NotConnectedState platform="Google Analytics" connectHref="/intelligence/connections" />
        )}
      </PageContainer>
    );
  }

  // An unknown or missing `source` opens the first one rather than erroring:
  // the parameter says which channel was clicked, and a stale link is not a
  // failure — it is a link to this page with no preference expressed.
  const initial = sources.find((item) => item.id === source)?.id ?? sources[0]!.id;

  return (
    <PageContainer>
      {/* The heading lives on the card below, where the design puts it. This
          row is the way back and the range the figures cover. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div>
          <Link
            href="/analytics"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink transition-colors hover:underline"
          >
            <span aria-hidden="true">←</span> Performance
          </Link>
          <h1 className="mt-0.5 text-lg font-bold text-ink">Channel detail</h1>
        </div>
        <DateWindow window={window} />
      </div>

      <SourceExplorer sources={sources} initialSourceId={initial} />
    </PageContainer>
  );
}

export default function ExplorePage(props: Parameters<typeof ExplorePageBody>[0]) {
  return (
    <PageShell activeTab="/analytics" currentStageId="connections">
      <Suspense fallback={<PageLoading title="Explore your performance" />}>
        <ExplorePageBody {...props} />
      </Suspense>
    </PageShell>
  );
}
