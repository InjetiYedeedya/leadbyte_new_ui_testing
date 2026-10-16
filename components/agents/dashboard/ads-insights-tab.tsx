import { LoadFailed, NothingYet, SectionHeader } from "@/components/agents/dashboard/parts";
import { AdsInsightsView } from "@/components/agents/dashboard/ads/ads-insights-view";
import { PlatformLogo } from "@/components/analytics/platform-logo";
import { mapAdsDaysByCampaign } from "@/lib/data/ads-insights";
import { isBackendConfigured } from "@/lib/api/config";
import { readTables } from "@/lib/api/read-cascade";
import { mapAdCampaigns, newestUpdate } from "@/lib/data/dashboard/ads-campaigns";
import type { DashboardTabProps } from "@/lib/data/dashboard/tabs";

/**
 * Meta Ads and Google Ads — Campaign Insights (guide §5.4). One component for
 * both platforms; only the table names and a few words differ.
 *
 * ## Where the rows come from
 *
 * This platform's own two tables, read directly: `*_ads_full_insights` (one
 * row per campaign with its all-time totals) and `*_ads_daily` (one row per
 * campaign per day).
 *
 * It used to take them from the `/api/connected-data/all` bundle, which is
 * EVERY connected table — Analytics, Search Console's per-query-per-day rows
 * and both ad platforms, with no date limit — to show one of them. On
 * Cloudflare that one read is large enough to push a request past the
 * Worker's memory limit ("Error 1102", 2026-10-05), so the tab now asks for
 * only what it shows.
 *
 * ## Three states before any campaign is shown
 *
 * - **The read failed** — the campaign table's own read says `ok: false`.
 *   Said as a connection problem, never as an empty account.
 * - **The read worked and there are no campaigns** — "No campaigns found yet."
 * - **Campaigns** — handed to the island, mapped on the server so the raw
 *   rows' credentials never reach the browser.
 *
 * The page's single loader covers the wait; there is no spinner of our own.
 */
export async function AdsInsightsTab({ tab, platform, email }: DashboardTabProps & { platform: "meta" | "google" }) {
  const table = `${platform}_ads_full_insights`;
  const dailyTable = `${platform}_ads_daily`;
  // By email only, as the legacy app reads them: the uid route is a GET of
  // ONE record, and the cascade stops at the first route with rows — so with
  // a uid this showed one campaign out of a hundred.
  const sources = isBackendConfigured() ? await readTables([table, dailyTable], { email }) : {};
  const campaigns = mapAdCampaigns(sources[table]?.rows ?? [], platform);
  const failed = sources[table]?.ok === false;

  const updated = newestUpdate(campaigns);
  const subtitle = updated === null ? tab.subtitle : `${tab.subtitle} · Updated ${updated}`;
  // The platform's own mark fills the header chip: an opaque square on white,
  // rounded to the chip's own radius so no accent shows at the corners.
  const icon = <PlatformLogo platform={platform} className="size-9 rounded-md" />;

  if (campaigns.length === 0) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <SectionHeader icon={icon} title={tab.title} subtitle={subtitle} />
        {failed ? (
          <LoadFailed what="campaign insights" />
        ) : (
          <NothingYet
            title="No campaigns found yet."
            description={`Campaigns appear here once your ${platform === "google" ? "Google Ads" : "Meta Ads"} account's first report arrives.`}
          />
        )}
      </div>
    );
  }

  return (
    <AdsInsightsView
      platform={platform}
      icon={icon}
      title={tab.title}
      subtitle={subtitle}
      campaigns={campaigns}
      dailyByCampaign={mapAdsDaysByCampaign(sources[dailyTable]?.rows ?? [])}
    />
  );
}
