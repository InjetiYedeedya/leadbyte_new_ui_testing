import Link from "@/components/ui/app-link";
import { readSignedText } from "@/lib/signed-text";
import { FlashNotice } from "@/components/ui/flash-notice";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import { OVERVIEW_TABS } from "@/lib/nav";
import { getBusinessProfileRepo } from "@/lib/data/business-profile-repo";
import { firstFilled } from "@/lib/data/profile-display";
import { AnalysisStatus } from "@/components/analysis/analysis-status";
import { ProfileStory } from "@/components/analysis/profile-story";
import { buildStoryChapters } from "@/lib/data/profile-story";
import { RetryAnalysis } from "@/components/analysis/retry-analysis";
import { AnalysingState, AnalysisFailedState, EmptyState } from "@/components/ui/states";
import { NextStep } from "@/components/ui/next-step";
import { analysisState } from "@/lib/data/analysis-job";
import { analysedAtOf, fetchLatestAnalysis } from "@/lib/data/website-analysis";
import { ProfileEditForm } from "@/components/analysis/profile-edit-form";
import { removeProfileImage, saveBusinessProfile } from "./actions";
import { PageContainer } from "@/components/ui/page-container";
import { readSection } from "@/lib/data/profile-sections";

export const metadata: Metadata = { title: "Business profile · LeadByte" };

async function BusinessProfilePageBody({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; problems?: string; saved?: string }>;
}) {
  const { edit, problems: rawProblems, saved } = await searchParams;
  // Signed by the action that redirected here; a link carrying any other text
  // shows nothing rather than words someone else chose (audit, 2026-09-29).
  const problems = readSignedText(rawProblems) ?? undefined;
  const businessId = await currentBusinessId();
  const [profile, phase, payload] = await Promise.all([
    getBusinessProfileRepo().get(businessId),
    analysisState(),
    // Free: `fetchLatestAnalysis` is React-`cache()`d and the profile repo
    // has already asked for it on this render. This is the only place the
    // date behind the profile is available at all — `BusinessProfile` does
    // not carry one.
    fetchLatestAnalysis(businessId),
  ]);

  /*
   * Formatted HERE, on the server, and handed down as a string.
   *
   * `toLocaleDateString` resolves against whichever locale the runtime has,
   * so a client island formatting it itself renders one date during SSR and
   * possibly a different one on hydration. Undefined when the payload
   * carried no date, and then the story simply omits the line rather than
   * showing a date it invented.
   */
  const stamp = payload ? analysedAtOf(payload) : undefined;
  const parsed = stamp ? new Date(stamp) : null;
  const analysedAt =
    parsed && !Number.isNaN(parsed.getTime())
      ? parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : undefined;

  // A row can exist with only the website URL on it — that is not "extracted".
  const hasDetails =
    profile !== null &&
    (firstFilled(
      profile.businessName,
      profile.businessType,
      profile.industry,
      profile.description,
    ) !== null ||
      profile.brand !== undefined);

  const section = readSection(edit);
  const editing = section !== null;

  const chapters = hasDetails && profile ? buildStoryChapters(profile) : [];
  const showStory = hasDetails && profile !== null && !editing;

  /*
   * The introduction, and nothing else.
   *
   * It briefly carried a "Profile review, 2 of 6" bar and a panel offering the
   * next tab. Both are gone: the progress bar scored the reader rather than
   * telling them anything, and a second way out at the top competed with the
   * one at the foot of the document, which is where finishing actually
   * happens.
   *
   * It is built here but RENDERED in two different places: handed to the
   * story, so it sits at the top of the reading column with the contents rail
   * beside it, and rendered on its own in every other state, where there is no
   * rail for it to line up with.
   */
  const intro = (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 max-w-4xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">
          Business profile
        </p>
        <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">
          Here&apos;s what we learned about your business
        </h1>
        {/* 10px under the heading: a description belongs to its heading and
            must sit closer to it than the 16px the container puts between
            unrelated blocks. */}
        <p className="mt-2.5 max-w-prose text-sm leading-relaxed text-ink-soft">
          Review and correct anything that&apos;s wrong. This information feeds your
          strategy and agents.
        </p>
      </div>
      {/* Top right, on arrival: "where do I go after this?" is asked before
          the story is read, not only at its end. The end keeps its own. */}
      <NextStep current="/overview/business-profile" />
    </div>
  );

  return (
    <>
      <PageContainer>
        {!showStory && intro}
        <AnalysisStatus running={phase.phase === "running"} />

        {!hasDetails && phase.phase === "running" && <AnalysingState what="your website" />}
        {!hasDetails && phase.phase === "failed" && (
          <AnalysisFailedState message={phase.message} action={<RetryAnalysis />} />
        )}
        {/* This page had NO no-data branch at all before: with nothing
            extracted it rendered its heading over a blank panel. */}
        {!hasDetails && phase.phase === "idle" && (
          <EmptyState
            title="No website details yet"
            description="We haven't extracted your brand, products or positioning yet."
            note="Once an analysis runs this fills in automatically, along with the SEO and GEO sections."
            action={
              // The Website audit tab has no start control, which is where this
              // used to send people. `/?setup=1` is the entry form, with the
              // website pre-filled and Analyze beside it.
              <Link
                href="/?setup=1"
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
              >
                Analyse your website
              </Link>
            }
          />
        )}
        {saved && (
          <FlashNotice clear={["saved"]} className="rounded-lg bg-good-soft px-4 py-3 text-sm text-good">
            Saved. The strategy agent and the ad agents will use this from now on.
          </FlashNotice>
        )}

        {/* The page has always said "edit anything that's wrong"; until now
            there was nothing to edit it with. `?edit=1` rather than a toggle:
            a URL can be returned to, and a toggle would need an island to hold
            the state. */}
        {hasDetails && profile && editing ? (
          <ProfileEditForm
            profile={profile}
            section={section!}
            problems={problems ? problems.split(" | ").filter(Boolean) : []}
            action={saveBusinessProfile}
          />
        ) : (
          hasDetails && profile && (
            /* The board of cards became a scroll story on 2026-09-21. The
               data, the reads and the edit flow are unchanged: this is a way
               of READING the profile, not a second data layer. Chapters are
               built by a tested pure module so "we found nothing here" can
               never quietly become a blank heading. */
            <ProfileStory
              profile={profile}
              chapters={chapters}
              intro={intro}
              editBase={editing ? undefined : "/overview/business-profile"}
              analysedAt={analysedAt}
              onRemoveImage={removeProfileImage}
              completionAction={<NextStep current="/overview/business-profile" tone="solid" />}
            />
          )
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
export default function BusinessProfilePage(
  props: Parameters<typeof BusinessProfilePageBody>[0],
) {
  return (
    <PageShell activeTab="/overview" currentStageId="audit" subTabs={OVERVIEW_TABS} subTabActive="/overview/business-profile">
      <Suspense fallback={<PageLoading title="Business profile" />}>
        <BusinessProfilePageBody {...props} />
      </Suspense>
    </PageShell>
  );
}
