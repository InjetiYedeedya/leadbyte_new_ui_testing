import { currentBusinessId } from "@/components/page-shell";
import { LineChart, SplitDonut } from "@/components/ui/chart";
import { PageTable } from "@/components/analytics/page-table";
import { KeywordTable } from "@/components/analysis/keyword-table";
import { CampaignTable } from "@/components/analytics/campaign-table";
import { CampaignEfficiency } from "@/components/analytics/campaign-efficiency";
import type { PerformanceChannel } from "@/components/analytics/channel-overview";
import { MetricLedger, type LedgerEntry } from "@/components/analytics/metric-ledger";
import { MetricCards } from "@/components/analytics/metric-cards";
import { BreakdownPanel, type BreakdownView } from "@/components/analytics/breakdown-panel";
import { getAnalytics } from "@/lib/data/analytics-repo";
import { getSearchDays, getTopQueries, summariseSearch } from "@/lib/data/search-console";
import { getAdsInsights, type AdCampaignRow } from "@/lib/data/ads-insights";
import { buildTimeline, shortDay, timelineWindow } from "@/lib/data/analytics-timeline";
import { periodDelta, withPriorPeriod } from "@/lib/data/prior-period";
import { CURRENCY_UNKNOWN, formatCount, formatMoney } from "@/lib/format";
import { adsCardNote } from "@/lib/data/ads-insights";
import { checkGoogleProduct, checkOAuthStatus } from "@/lib/api/oauth-status";
import { getConnectedData } from "@/lib/data/connected-data";
import type { ExplorerSource } from "@/components/analytics/source-explorer";
import type { Timeline } from "@/lib/data/analytics-timeline";
import { PlatformLogo } from "@/components/analytics/platform-logo";

/**
 * A quiet caveat beside a heading.
 *
 * Grey and small on purpose: it qualifies a chart rather than warning about
 * it, and a yellow box would say something is wrong when nothing is.
 */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 rounded-lg bg-ground px-3 py-1.5 text-xs text-ink-soft">
      <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3.5 w-3.5 shrink-0">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 7.5V11M8 5.2v.6" strokeLinecap="round" />
      </svg>
      {children}
    </span>
  );
}

/** A fraction as a percentage, at the precision a CTR is actually read at. */
function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/** Short axis label — "2026-08-14" is unreadable repeated across a chart. */
function shortDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return shortDay(iso);
}

/**
 * Everything both Performance screens read, read once.
 *
 * `/analytics` shows the three channel cards and the cross-channel timeline;
 * `/analytics/explore` shows the detail behind one channel. They are two pages
 * — the detail is a destination, not a section — and they need the same
 * numbers, so the reads and the shapes built from them live here rather than
 * being written twice and drifting apart.
 *
 * This is a server module with no `"use client"` anywhere in its import graph:
 * it calls `lib/api/client.ts`, which reads httpOnly cookies. The panels it
 * builds are already-rendered server elements, which is what lets
 * `SourceExplorer` switch between them without a round trip.
 */
export interface Performance {
  analytics: Awaited<ReturnType<typeof getAnalytics>>;
  hasSearch: boolean;
  withAdsData: Awaited<ReturnType<typeof getAdsInsights>>;
  /** Whether the ACCOUNT is linked, which is a different question to data. */
  linked: boolean;
  adsLinked: boolean;
  /**
   * The data read itself failed (a timeout, a refusal). Then an empty page is
   * "couldn't load", never "not connected" — which is what it said, over
   * accounts that were connected and had data (audit, 2026-09-29).
   */
  loadFailed: boolean;
  /** At least one connection check could not answer, so "not connected" is not known. */
  linkUnknown: boolean;
  timeline: Timeline;
  /** "30 Jun – 14 Sep 2026", or null when there are no dates at all. */
  window: string | null;
  channels: PerformanceChannel[];
  sources: ExplorerSource[];
}

export async function readPerformance(): Promise<Performance> {
  const businessId = await currentBusinessId();

  // Analytics, Search Console and both ad platforms all come from the ONE
  // `/api/connected-data` bundle — `getConnectedData` is `cache()`d, so these
  // reads cost a single round trip between them. That shared call is also why
  // the timeline below can put all three on one axis for free.
  const [analytics, searchDays, queries, ads, google, googleAds, metaAds] = await Promise.all([
    getAnalytics(businessId),
    getSearchDays(),
    getTopQueries(),
    getAdsInsights(),
    // The authority on whether an account is linked. The data reads answer a
    // different question — whether n8n has imported anything yet — and the two
    // legitimately disagree for the first while after connecting.
    // Analytics' own grant — the Google row also covers Search Console,
    // which is a separate permission (`lib/data/google-products.ts`).
    checkGoogleProduct("analytics", businessId),
    checkOAuthStatus("googleAds", businessId),
    checkOAuthStatus("metaAds", businessId),
  ]);
  // Already fetched by the reads above (`cache()`d), so this is free.
  const bundle = await getConnectedData();
  const loadFailed = !bundle.ok;
  const linkUnknown = [google, googleAds, metaAds].some((check) => check.status === "error");

  const linked = google.status === "valid";
  const search = summariseSearch(searchDays);
  const hasSearch = searchDays.length > 0 || queries.length > 0;

  const withAdsData = ads.filter((platform) => platform.hasData);
  const adsLinked = googleAds.status === "valid" || metaAds.status === "valid";

  // One axis for everything daily. Bands are added only for a source that has
  // something to say — an empty lane is honest inside a chart that has other
  // lanes, but a chart of nothing but empty lanes is not a chart.
  const timeline = buildTimeline([
    ...(analytics
      ? [
          {
            key: "sessions",
            label: "Sessions",
            format: "count" as const,
            rows: analytics.daily.map((day) => ({ date: day.date, value: day.sessions })),
          },
        ]
      : []),
    ...(searchDays.length > 0
      ? [
          {
            key: "search",
            label: "Search clicks",
            format: "count" as const,
            rows: searchDays.map((day) => ({ date: day.date, value: day.clicks })),
          },
        ]
      : []),
    ...(withAdsData.length > 0
      ? [
          {
            key: "spend",
            label: "Ad spend",
            format: "amount" as const,
            // Both platforms feed one lane: what matters at this level is what
            // left the account, and `buildTimeline` sums a shared date.
            rows: withAdsData.flatMap((platform) =>
              platform.daily.map((day) => ({ date: day.date, value: day.spend })),
            ),
          },
        ]
      : []),
  ]);

  // Each daily series split into "this period" and the one before it, so every
  // chart carries its own comparison instead of a shape with nothing to judge
  // it against. See `lib/data/prior-period.ts` for how the halves are chosen.
  const sessionsSeries = withPriorPeriod(
    (analytics?.daily ?? []).map((day) => ({ label: shortDate(day.date), value: day.sessions })),
  );
  const searchClicksSeries = withPriorPeriod(
    searchDays.map((day) => ({ label: shortDate(day.date), value: day.clicks })),
  );

  const window = timelineWindow(timeline.dates);
  const totalSpend = withAdsData.reduce((sum, platform) => sum + platform.totals.spend, 0);

  // The figures the page is about, each naming the account it came from so a
  // number that looks wrong leads somewhere. Built conditionally: a row for a
  // source that has not imported yet would be em dashes claiming to be a
  // headline.
  const ledger: LedgerEntry[] = [
    ...(analytics
      ? [
          {
            label: "Sessions",
            value: formatCount(analytics.summary.sessions),
            source: "Google Analytics",
            // From the same split the chart uses, so the number and the ghost
            // line beneath it are answering the same question.
            deltaPercent: periodDelta(sessionsSeries) ?? analytics.summary.sessionsDelta,
            goodDirection: "up" as const,
            series: analytics.daily.map((day) => day.sessions),
          },
          {
            label: "Page views",
            value: formatCount(analytics.summary.pageViews),
            source: "Google Analytics",
            series: analytics.daily.map((day) => day.pageViews),
          },
        ]
      : []),
    ...(hasSearch
      ? [
          {
            label: "Clicks from search",
            value: formatCount(search.clicks),
            source: "Search Console",
            deltaPercent: periodDelta(searchClicksSeries),
            goodDirection: "up" as const,
            series: searchDays.map((day) => day.clicks),
          },
          {
            label: "Times you appeared",
            value: formatCount(search.impressions),
            source: "Search Console",
            series: searchDays.map((day) => day.impressions),
          },
        ]
      : []),
    ...(withAdsData.length > 0
      ? [
          {
            label: "Ad spend",
            value: formatMoney(totalSpend),
            series: withAdsData
              .flatMap((platform) => platform.daily)
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((day) => day.spend),
            // The currency is named here because it cannot be named in the
            // figure: every ad row's `currency` column comes back empty
            // (`ads-insights.ts`), and this total can span two accounts
            // reporting in different ones. A bare "3,334" reads as dollars to
            // one person and rupees to the next.
            source: `${
              withAdsData.length === 1
                ? withAdsData[0]!.label
                : withAdsData.map((platform) => platform.label).join(" and ")
            } · ${CURRENCY_UNKNOWN}`,
          },
        ]
      : []),
  ];

  const breakdowns: BreakdownView[] = analytics
    ? [
        {
          id: "sources",
          label: "Sources",
          caption: "Where visitors arrived from.",
          rows: analytics.sources,
        },
        {
          id: "countries",
          label: "Countries",
          caption: "Sessions by country.",
          rows: analytics.countries,
        },
        {
          id: "devices",
          label: "Devices",
          caption: "Sessions by device.",
          rows: analytics.devices,
        },
      ]
    : [];

  /**
   * The three channel cards.
   *
   * The figures are the ledger's own, so nothing here recomputes a number — a
   * card that disagreed with the panel beneath it would be worse than no card.
   * What the cards deliberately do NOT carry is the prior-period delta: the
   * comparison lives in the explorer, where the chart draws both periods and
   * says how long each one is. A bare "−10.1%" over a 77-day import compares
   * two halves the reader was never told about.
   */
  const stat = (label: string, entryLabel: string, note?: string) => {
    const entry = ledger.find((row) => row.label === entryLabel);
    return entry ? [{ label, value: entry.value, note }] : [];
  };

  const channels: PerformanceChannel[] = [
    ...(analytics
      ? [
          {
            id: "analytics" as const,
            title: "Website traffic",
            source: "Google Analytics",
            description: "How many people visited your site, and what they looked at.",
            stats: [...stat("Sessions", "Sessions"), ...stat("Page views", "Page views")],
            bandKey: "sessions",
            exploreLabel: "Explore website",
            exploreHref: "/analytics/explore?source=analytics",
          },
        ]
      : []),
    ...(hasSearch
      ? [
          {
            id: "search" as const,
            title: "Search visibility",
            source: "Search Console",
            description:
              "How often your site appeared in search, and how many clicks you got.",
            stats: [
              ...stat("Search clicks", "Clicks from search"),
              ...stat("Impressions", "Times you appeared"),
            ],
            bandKey: "search",
            exploreLabel: "Explore search",
            exploreHref: "/analytics/explore?source=search",
          },
        ]
      : []),
    ...(withAdsData.length
      ? [
          {
            id: "ads" as const,
            title: "Paid advertising",
            source: withAdsData.map((platform) => platform.label).join(" + "),
            platforms: withAdsData.map((platform) => platform.platform),
            // Each amount is in that platform's own account currency: every ad
            // row's `currency` column comes back empty (`ads-insights.ts`), so
            // the currency is said once, here, rather than under each figure.
            description: "What each platform has spent, in each ad account's own currency.",
            // One figure per platform (2026-10-01), the way the explore page
            // splits them — a single combined total hid which platform the
            // money went to. The daily chart stays the combined spend.
            stats: withAdsData.map((platform) => ({
              label: platform.label,
              value: formatMoney(platform.totals.spend),
              note: adsCardNote(platform.campaigns.length, platform.totals.conversions),
            })),
            bandKey: "spend",
            exploreLabel: "Explore campaigns",
            exploreHref: "/analytics/explore?source=ads",
          },
        ]
      : []),
  ];

  /**
   * One entry per source that has data.
   *
   * A source with nothing in it is left out entirely rather than given a tab
   * showing an empty state: the not-connected and still-importing notices
   * above the explorer already say so, and a tab is a promise that there is
   * something behind it.
   *
   * Both modes of every source are rendered here, on the server. See
   * `SourceExplorer` for why, and for what that costs.
   */
  const sources: ExplorerSource[] = [
    ...(analytics
      ? [
          {
            id: "analytics",
            // Named for the channel, not the vendor, so a card and the detail
            // view below it are visibly the same thing. The source is still
            // said on the card and in `summary`.
            label: "Website traffic",
            summary: "Who reached your site, and what they did once they were on it.",
            chart: (
              <div className="flex flex-col gap-4">
                {sessionsSeries.points.length > 1 && (
                  <section className="min-w-0 rounded-lg border border-border bg-surface p-4">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold tracking-tight text-ink">
                          Google Analytics
                        </h3>
                        <p className="mt-0.5 text-sm text-ink-soft">
                          {sessionsSeries.hasPrior
                            ? "Daily sessions comparison"
                            : "Daily sessions"}
                        </p>
                      </div>
                      {/* The comparison is half the reported days against the
                          other half, which is NOT the range in the chip at the
                          top of the page. Saying so here is the difference
                          between a reader trusting the two numbers and
                          wondering which one is wrong. */}
                      {sessionsSeries.hasPrior && <Note>Comparison window differs from full imported range.</Note>}
                    </div>
                    <LineChart
                      points={sessionsSeries.points}
                      currentLabel={`Recent ${sessionsSeries.periodDays} days`}
                      priorLabel={`Previous ${sessionsSeries.periodDays} days`}
                      caption={
                        sessionsSeries.hasPrior
                          ? `Sessions per day over ${sessionsSeries.periodDays} days, against the ${sessionsSeries.periodDays} before`
                          : `Sessions per day over ${sessionsSeries.points.length} days`
                      }
                    />
                  </section>
                )}

                <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
                {/* Devices as a proportion. A ranked bar says which is biggest;
                    only a share says whether this is a mobile site. */}
                {analytics.devices.length > 1 && (
                  <div className="rounded-lg border border-border bg-surface p-4">
                    <h3 className="text-sm font-bold text-ink">Device share</h3>
                    <p className="mb-4 mt-0.5 text-xs text-ink-soft">Share of sessions by device type.</p>
                    <SplitDonut data={analytics.devices} unitLabel="sessions" />
                  </div>
                )}
                {/* The breakdowns live in the chart mode only, and that is not
                    an omission: a ranked bar prints the exact number beside
                    every label, so it is ALREADY the data view of that
                    dimension. Re-tabulating it would add a header row and
                    nothing a reader did not have. */}
                {breakdowns.length > 0 && <BreakdownPanel views={breakdowns} />}
                </div>
              </div>
            ),
            // The data mode lists the named things, not the dates.
            //
            // A by-day table sat above this and is gone, here and in every
            // other source. It answered "what happened on Tuesday", which the
            // chart mode already answers and answers better — and it pushed
            // the table someone actually came for below the fold, which read
            // as that table being missing. So: pages here, queries under
            // Search Console, campaigns under Advertising. Each row is
            // something with a name.
            table: (
              <div className="flex flex-col gap-2">
                <div>
                  <h4 className="text-sm font-medium text-ink">Pages</h4>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {analytics.pages.length}{" "}
                    {analytics.pages.length === 1 ? "page" : "pages"} people landed on.
                  </p>
                </div>
                <PageTable rows={analytics.pages} />
              </div>
            ),
          },
        ]
      : []),
    ...(hasSearch
      ? [
          {
            id: "search",
            label: "Search visibility",
            summary: "What people searched to find you, and where you ranked when they did.",
            chart: (
              <div className="flex flex-col gap-4">
                <MetricCards
                  cards={[
                    {
                      icon: "search",
                      label: "Click-through rate",
                      description: "Share of impressions that resulted in a click.",
                      value: percent(search.ctr),
                    },
                    {
                      icon: "bars",
                      label: "Average position",
                      description: "Your average ranking position in search results — lower is better.",
                      // Null, not 0 — see `summariseSearch`. Rank zero does not
                      // exist, and rendering it would read as the best possible.
                      value: search.position === null ? null : search.position.toFixed(1),
                    },
                    {
                      icon: "list",
                      label: "Ranking queries",
                      description: "Queries where your site appeared, top 100 by clicks.",
                      value: formatCount(queries.length),
                    },
                  ]}
                />
                {searchClicksSeries.points.length > 1 && (
                  <section className="min-w-0 rounded-lg border border-border bg-surface p-4">
                    <h3 className="mb-4 text-sm font-bold text-ink">Search clicks (daily)</h3>
                  <LineChart
                    points={searchClicksSeries.points}
                    tone="good"
                    currentLabel={`Recent ${searchClicksSeries.periodDays} days`}
                    priorLabel={`Previous ${searchClicksSeries.periodDays} days`}
                    caption={
                      searchClicksSeries.hasPrior
                        ? `Clicks from search per day over ${searchClicksSeries.periodDays} days, against the ${searchClicksSeries.periodDays} before`
                        : `Clicks from search per day over ${searchClicksSeries.points.length} days`
                    }
                  />
                  </section>
                )}
                {queries.length > 0 && (
                  <section className="min-w-0 rounded-lg border border-border bg-surface p-4">
                    <h3 className="text-sm font-bold text-ink">Top search queries</h3>
                    <p className="mb-4 mt-0.5 text-xs text-ink-soft">
                      Queries that drove impressions and clicks to your site.
                    </p>
                    <KeywordTable queries={queries} />
                  </section>
                )}
              </div>
            ),
            // Queries, not dates — see the note on the Analytics panel above.
            table: (
              <div className="flex flex-col gap-2">
                <div>
                  <h4 className="text-sm font-medium text-ink">Queries you rank for</h4>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {queries.length} {queries.length === 1 ? "query" : "queries"}, the top 100 by
                    clicks.
                  </p>
                </div>
                <KeywordTable queries={queries} />
              </div>
            ),
          },
        ]
      : []),
    ...(withAdsData.length > 0
      ? [
          {
            id: "ads",
            label: "Paid advertising",
            // Each ad account reports in its own currency and the insight rows
            // do not carry one, so amounts are shown unlabelled rather than
            // under a symbol we would be guessing at.
            summary:
              "What your campaigns spent and what came back. Amounts are in each account's own currency.",
            chart: (
              <div className="flex flex-col gap-4">
                {/* Both platforms first, side by side: "what did each account
                    do" is one question, and stacking a platform's four figures
                    on top of its three charts made it two screens apart from
                    the other account's. */}
                <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
                  {withAdsData.map((platform) => (
                    <section
                      key={platform.platform}
                      className="min-w-0 rounded-lg border border-border bg-surface p-4"
                    >
                      <div className="mb-4 flex items-center gap-3">
                        {/* The platform's own mark. Both cards carried the
                            same grey megaphone, so the only thing telling
                            Google Ads from Meta Ads was the heading — on a row
                            whose whole job is comparing the two. */}
                        <span
                          aria-hidden="true"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface"
                        >
                          <PlatformLogo platform={platform.platform} className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-base font-bold tracking-tight text-ink">
                            {platform.label}
                          </h3>
                          <p className="mt-0.5 text-xs text-ink-soft">
                            {platform.campaigns.length}{" "}
                            {platform.campaigns.length === 1 ? "campaign" : "campaigns"}
                          </p>
                        </div>
                      </div>
                      <MetricLedger entries={adsLedger(platform)} />
                    </section>
                  ))}
                </div>

                {/* Said once, under both accounts: every ad row's `currency`
                    column comes back empty, and the two accounts need not be
                    reporting in the same one. */}
                <p className="-mt-1 text-xs text-ink-soft">
                  Amounts are source-reported; currencies unavailable.
                </p>

                {/* One card per account, not a heading over three loose ones.
                    Two platforms' charts stacked in a flat list read as six
                    charts about one thing; inside a card each account's
                    material is visibly its own, and the logo says whose at a
                    glance rather than after reading a label. */}
                {withAdsData.map((platform) => (
                  <section
                    key={platform.platform}
                    className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-4"
                  >
                    <h3 className="flex items-center gap-3 text-base font-bold tracking-tight text-ink">
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface"
                      >
                        <PlatformLogo platform={platform.platform} className="h-6 w-6" />
                      </span>
                      {platform.label}
                    </h3>
                    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-3">
                      {/* Which campaigns buy a conversion cheapest — the
                          question a spend chart cannot answer, since the
                          biggest spender is not the worst campaign. */}
                      <CampaignEfficiency rows={platform.campaigns} />

                      {platform.daily.length > 1 && (
                        <section className="min-w-0 rounded-lg border border-border bg-surface p-4">
                          <h4 className="mb-4 text-sm font-bold text-ink">
                            Daily spend comparison
                          </h4>
                          <LineChart
                            points={
                              withPriorPeriod(
                                platform.daily.map((day) => ({
                                  label: shortDate(day.date),
                                  value: day.spend,
                                })),
                              ).points
                            }
                            tone="warn"
                            minWidth={260}
                            caption={`${platform.label} spend per day, against the period before`}
                          />
                        </section>
                      )}

                      {/* Where the money went, by campaign type. The table can
                          be sorted by spend; only this says what share each
                          type took of the whole budget. */}
                      <section className="min-w-0 rounded-lg border border-border bg-surface p-4">
                        <h4 className="mb-4 text-sm font-bold text-ink">Spend by campaign type</h4>
                        <SplitDonut data={spendByKind(platform.campaigns)} unitLabel="spent" />
                      </section>
                    </div>
                  </section>
                ))}
              </div>
            ),
            table: (
              <div className="flex flex-col gap-8">
                {withAdsData.map((platform) => (
                  <section
                    key={platform.platform}
                    className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-4"
                  >
                    <h3 className="flex items-center gap-3 text-base font-bold tracking-tight text-ink">
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface"
                      >
                        <PlatformLogo platform={platform.platform} className="h-6 w-6" />
                      </span>
                      {platform.label}
                    </h3>
                    <MetricLedger entries={adsLedger(platform)} />

                    {/* Campaigns, and only campaigns.
                        A day-by-day table sat above this and is gone. It could
                        not carry a campaign column — its rows are every
                        campaign summed — so the ads data mode opened on a bare
                        Date column and looked like the campaign names were
                        missing. The daily shape is already on screen twice, as
                        a lane in the timeline and as this platform's spend
                        chart, and neither of those pretends to name a campaign.
                        Per-campaign days live in the row drawer. */}
                    {platform.campaigns.length > 0 && (
                      <section className="min-w-0 rounded-lg border border-border bg-surface p-4">
                        <div className="mb-4">
                          <h4 className="text-sm font-bold text-ink">Every campaign</h4>
                          <p className="mt-0.5 text-xs text-ink-soft">
                            View and filter all {platform.campaigns.length}{" "}
                            {platform.campaigns.length === 1 ? "campaign" : "campaigns"} — click a
                            row for its own day-by-day trend.
                          </p>
                        </div>
                        <CampaignTable
                          rows={platform.campaigns}
                          platform={platform.label}
                          dailyByCampaign={platform.dailyByCampaign}
                        />
                      </section>
                    )}
                  </section>
                ))}
              </div>
            ),
          },
        ]
      : []),
  ];


  return {
    analytics,
    hasSearch,
    withAdsData,
    loadFailed,
    linkUnknown,
    linked,
    adsLinked,
    timeline,
        window,
    channels,
    sources,
  };
}

/**
 * Spend grouped by campaign type, for the donut.
 *
 * Campaigns with no type are grouped under "Unknown" rather than dropped: the
 * slices have to add up to the spend the ledger reports above them, and a donut
 * quietly missing a third of the budget is worse than one with an honest
 * unlabelled slice.
 */
function spendByKind(rows: AdCampaignRow[]): { label: string; value: number }[] {
  const byKind = new Map<string, number>();

  for (const row of rows) {
    if (row.spend === null || row.spend <= 0) continue;
    const kind = row.kind === null ? "Unknown" : row.kind.replace(/_/g, " ").toLowerCase();
    const name = kind.charAt(0).toUpperCase() + kind.slice(1);
    byKind.set(name, (byKind.get(name) ?? 0) + row.spend);
  }

  return [...byKind.entries()].map(([label, value]) => ({ label, value }));
}

/** The four figures every ad platform reports, in the shared ledger row. */
function adsLedger(platform: {
  label: string;
  campaigns: unknown[];
  totals: {
    spend: number;
    clicks: number;
    conversions: number;
    ctr: number | null;
    cpa: number | null;
    roas: number | null;
  };
}): LedgerEntry[] {
  return [
    {
      label: "Spend",
      value: formatMoney(platform.totals.spend),
      source: `${platform.campaigns.length} ${platform.campaigns.length === 1 ? "campaign" : "campaigns"}`,
    },
    {
      label: "Clicks",
      value: formatCount(platform.totals.clicks),
      // Null, not 0 — "no impressions" is not a 0% CTR.
      source:
        platform.totals.ctr === null
          ? "No impressions yet"
          : `${platform.totals.ctr.toFixed(2)}% CTR`,
    },
    {
      label: "Conversions",
      value: formatCount(platform.totals.conversions),
      source:
        platform.totals.cpa === null
          ? "No conversions yet"
          : `${formatMoney(platform.totals.cpa)} each`,
    },
    {
      label: "Return on ad spend",
      // Null rather than 0: nothing spent means unknown, not worthless.
      value: platform.totals.roas === null ? null : `${platform.totals.roas.toFixed(2)}x`,
      source: "Conversion value ÷ spend",
    },
  ];
}

