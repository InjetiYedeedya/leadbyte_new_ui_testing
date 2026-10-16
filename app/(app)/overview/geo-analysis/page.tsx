import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "@/components/ui/app-link";
import { PageLoading } from "@/components/ui/page-loading";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import { OVERVIEW_TABS } from "@/lib/nav";
import { getGeoAnalysisRepo } from "@/lib/data/geo-analysis-repo";
import { getBusinessProfileRepo } from "@/lib/data/business-profile-repo";
import { EmptyState } from "@/components/ui/empty-state";
import { PdfReportFrame } from "@/components/ui/pdf-report-frame";
import { firstFilled } from "@/lib/data/profile-display";
import { AnalysisStatus } from "@/components/analysis/analysis-status";
import { RetryAnalysis } from "@/components/analysis/retry-analysis";
import {
  AnalysingState,
  AnalysisFailedState,
  SectionUnavailableState,
} from "@/components/ui/states";
import { analysisSectionFailures } from "@/lib/data/website-analysis";
import { failureFor } from "@/lib/data/analysis-errors";
import { analysisState } from "@/lib/data/analysis-job";
import { ConnectGoogle } from "@/components/analysis/connect-google";
import { PageContainer } from "@/components/ui/page-container";
import { getWebsiteAuditRepo } from "@/lib/data/website-audit-repo";
import { GeoDashboard } from "@/components/analysis/geo-dashboard";

export const metadata: Metadata = { title: "GEO analysis · LeadByte" };

async function GeoAnalysisPageBody() {
  const businessId = await currentBusinessId();
  const [geo, profile, phase, failures, audit] = await Promise.all([
    getGeoAnalysisRepo().get(businessId),
    getBusinessProfileRepo().get(businessId),
    analysisState(),
    analysisSectionFailures(businessId),
    // The severity tiles: severities exist only on the audit's findings.
    // Same analysis, so this read is the one the audit page makes too.
    getWebsiteAuditRepo().get(businessId).catch(() => null),
  ]);
  // The same backend step produces the audit and this page, so a failure
  // arrives under the `audit` key for both.
  const geoFailure = failureFor(failures, "audit") ?? failureFor(failures, "geo");

  return (
    <>
      <PageContainer>
        {/* The branded frame the PDF prints inside; invisible on screen. */}
        <PdfReportFrame reportName="GEO Analysis">
        {/* The reading order's way on, as on every Overview page. With an
            analysis it sits in the dashboard's own action row, so it does
            not cost the one-screen report a row of its own. */}
        {!geo && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-lg font-bold text-ink">GEO analysis</h1>
            <div className="print:hidden">
              <ConnectGoogle label="Next" variant="quiet" />
            </div>
          </div>
        )}

        <p className="mb-3 hidden text-sm text-ink-soft print:block">
          GEO analysis · how visible this site is inside generative answer engines · printed{" "}
          {new Date().toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
        <AnalysisStatus running={phase.phase === "running"} />

        {!geo && phase.phase === "running" && <AnalysingState what="your site" />}
        {!geo && phase.phase === "failed" && (
          <AnalysisFailedState message={phase.message} action={<RetryAnalysis />} />
        )}
        {!geo && phase.phase === "idle" && geoFailure && (
          <div>
            <SectionUnavailableState label="The GEO analysis" reason={geoFailure.reason} />
          </div>
        )}
        {!geo && phase.phase === "idle" && !geoFailure && (
          <div>
            <EmptyState
              title="No GEO analysis yet"
              description="Nobody has measured how readable this site is to AI answer engines."
              note="This comes from the same analysis as the website audit — once one runs, both pages fill in."
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
          </div>
        )}
        {geo && (
          <GeoDashboard
            name={firstFilled(profile?.businessName, profile?.websiteUrl) ?? "your site"}
            geo={geo}
            audit={audit}
            next={<ConnectGoogle label="Next" variant="quiet" />}
          />
        )}
      </PdfReportFrame>
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
export default function GeoAnalysisPage() {
  return (
    <PageShell activeTab="/overview" currentStageId="audit" subTabs={OVERVIEW_TABS} subTabActive="/overview/geo-analysis">
      <Suspense fallback={<PageLoading title="GEO analysis" />}>
        <GeoAnalysisPageBody />
      </Suspense>
    </PageShell>
  );
}
