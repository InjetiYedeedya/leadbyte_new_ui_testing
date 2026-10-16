import { Heart, ShareNetwork, SquaresFour, Trophy } from "@phosphor-icons/react/ssr";
import {
  BarRow,
  LoadFailed,
  NothingYet,
  Panel,
  SectionHeader,
  SummaryCard,
  SummaryRow,
} from "@/components/agents/dashboard/parts";
import { isBackendConfigured } from "@/lib/api/config";
import { readTables } from "@/lib/api/read-cascade";
import { formatShare } from "@/lib/data/dashboard/fields";
import {
  buildSocialPerformance,
  SOCIAL_PLATFORMS,
  SOCIAL_TABLES,
  type PlatformPerformance,
  type SocialPerformance,
} from "@/lib/data/dashboard/social-performance";
import type { DashboardTab, DashboardTabProps } from "@/lib/data/dashboard/tabs";
import { countOf, formatCount } from "@/lib/format";
import { ContentMix } from "./social/content-mix";
import { PlatformMark } from "./social/platform-mark";
import { SocialPostsPanel } from "./social/posts-panel";

/**
 * The Social Media Agent's tab: which platform earns the most engagement for
 * what it reaches (implementation guide §5.3).
 *
 * Reads only its four platform tables, by the raw names the agent writes. A
 * Server Component; the one interaction — switching platform in the posts
 * list — is the `SocialPostsPanel` island, handed every platform's posts.
 *
 * Unconfigured is a working environment, the same rule as every repo: with no
 * backend there is nothing to read and the tab shows its empty state.
 */
export async function SocialMediaTab({ tab, email, uid }: DashboardTabProps) {
  const outcomes = isBackendConfigured()
    ? await readTables(SOCIAL_TABLES, { email, ...(uid ? { uid } : {}) })
    : {};
  return <SocialMediaView tab={tab} performance={buildSocialPerformance(outcomes)} />;
}

/** "Instagram", "Instagram and X", "Instagram, X and YouTube". */
function namesOf(platforms: PlatformPerformance[]): string {
  const names = platforms.map((p) => p.name);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The tab's body for already-read data — split out so it renders without a network. */
export function SocialMediaView({ tab, performance }: { tab: DashboardTab; performance: SocialPerformance }) {
  const { platforms, tracked, failed, ranked, best } = performance;
  const loaded = platforms.length - failed.length;
  const instagram = platforms.find((p) => p.id === "instagram");

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SectionHeader icon={<ShareNetwork size={18} weight="bold" />} title={tab.title} subtitle={tab.subtitle} />

      {/* Named per platform: the other platforms still load, and the summary
          below leaves the failed ones out — the reader has to know that. */}
      {failed.length > 0 && <LoadFailed what={`${namesOf(failed)} posts`} />}

      {loaded === 0 ? null : tracked === 0 ? (
        <NothingYet
          title={failed.length > 0 ? "No posts on the platforms that loaded" : "No social posts tracked yet"}
          description="Posts appear here once the Social Media agent has published to a connected account and synced its likes, comments and reach — usually after its next scheduled run."
        />
      ) : (
        <>
          <Summary performance={performance} />
          {ranked.length >= 2 && <PlatformPerformancePanel ranked={ranked} best={best} />}
          <SocialPostsPanel platforms={platforms} />
          {instagram?.ok && instagram.mediaMix.length > 0 && <ContentMix slices={instagram.mediaMix} />}
        </>
      )}
    </div>
  );
}

function Summary({ performance }: { performance: SocialPerformance }) {
  const { tracked, totalEngagement, best, ranked, audienceByMeasure } = performance;

  /**
   * Audience per MEASURE, never one "combined audience". Reach counts people
   * and views count plays, so "12,400 reach · 3,100 views" is the honest
   * version of "15,500 combined". Each is a sum of per-post figures — someone
   * reached by two posts counts twice — which is why it says "reach" and not
   * "people".
   */
  const audienceNote =
    audienceByMeasure.length > 0
      ? audienceByMeasure.map((m) => `${formatCount(m.total)} ${m.label.toLowerCase()}`).join(" · ")
      : "No reach or views reported yet";

  const bestNote = best
    ? `${formatShare(best.rate)} engagement rate, based on ${countOf(best.ratedPosts, "post")}${
        ranked.length === 1 ? " — the only platform with reach or views to compare" : ""
      }`
    : "Needs posts with reach or views to compare";

  return (
    <SummaryRow columns={3}>
      <SummaryCard
        label="Platforms tracked"
        value={`${tracked} / ${SOCIAL_PLATFORMS.length}`}
        note={audienceNote}
        icon={<SquaresFour size={18} weight="bold" />}
      />
      <SummaryCard
        label="Total engagements"
        value={totalEngagement === null ? null : formatCount(totalEngagement)}
        note="Likes, comments and shares combined"
        icon={<Heart size={18} weight="bold" />}
        tone="primary"
      />
      <SummaryCard
        label="Best platform"
        value={best?.name ?? null}
        note={bestNote}
        icon={<Trophy size={18} weight="bold" />}
        tone="success"
      />
    </SummaryRow>
  );
}

function PlatformPerformancePanel({
  ranked,
  best,
}: {
  ranked: PlatformPerformance[];
  best: PlatformPerformance | null;
}) {
  const max = best?.rate ?? 0;
  return (
    <Panel
      title="Platform performance"
      hint="Engagement rate: likes, comments and shares ÷ that platform's own reach or views. Best first."
    >
      <div className="flex flex-col gap-3">
        {ranked.map((platform) => (
          <BarRow
            key={platform.id}
            label={
              <span className="inline-flex min-w-0 items-center gap-2">
                <PlatformMark platform={platform.id} />
                <span className="truncate font-medium">{platform.name}</span>
                <span className="shrink-0 text-xs text-ink-soft">{countOf(platform.ratedPosts, "post")}</span>
              </span>
            }
            value={platform.rate ?? 0}
            max={max}
            display={formatShare(platform.rate)}
            tone={platform.id === best?.id ? "good" : "accent"}
            note={
              platform.ratedEngagement !== null && platform.audience !== null && platform.audienceLabel
                ? `${formatCount(platform.ratedEngagement)} engagements on ${formatCount(platform.audience)} ${platform.audienceLabel.toLowerCase()}`
                : undefined
            }
            ariaLabel={`${platform.name}: ${formatShare(platform.rate)} engagement rate over ${countOf(platform.ratedPosts, "post")}`}
          />
        ))}
      </div>
    </Panel>
  );
}

