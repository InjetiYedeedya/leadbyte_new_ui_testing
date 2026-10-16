import { notFound } from "next/navigation";
import { isBackendConfigured } from "@/lib/api/config";
import type { Metadata } from "next";
import { countOf } from "@/lib/format";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import { getReportsRepo } from "@/lib/data/reports-repo";
import { getBusinessProfileRepo } from "@/lib/data/business-profile-repo";
import { firstFilled, joinFilled } from "@/lib/data/profile-display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer, PageHeader } from "@/components/ui/page-container";

export const metadata: Metadata = { title: "Reports · LeadByte" };

async function ReportsPageBody() {
  const businessId = await currentBusinessId();
  const [reports, profile] = await Promise.all([
    getReportsRepo().list(businessId),
    getBusinessProfileRepo().get(businessId),
  ]);

  return (
    <>
      <PageContainer>
        <PageHeader title="Reports" description="Every analysis is a shareable report." />
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-1 text-xs uppercase tracking-wide text-ink-soft">
            Marketing intelligence report
          </div>
          <h2 className="text-xl font-bold text-ink">
            {firstFilled(profile?.businessName) ?? "Your business"}
          </h2>
        </div>
        {reports.length === 0 ? (
          <EmptyState
            title="No reports yet"
            description="Reports are generated from a completed website analysis. Once one has run, it appears here as something you can share."
            note="Report generation has no backend yet, so this list stays empty on a live account."
          />
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-4"
              >
                <div>
                  <div className="font-medium text-ink">{r.title}</div>
                  {/* `joinFilled`, not ` · ` interpolation: an empty `note`
                      rendered a trailing separator. Rule 5. */}
                  <div className="text-xs text-ink-soft">
                    {joinFilled([r.pages > 0 ? countOf(r.pages, "page") : "", r.note])}
                  </div>
                </div>
                {/* The "Download PDF" button that used to sit here had no
                    onClick, no type and no form — a control that was announced
                    as a button and did nothing, once per row. There is no
                    report endpoint to wire it to (see `BACKEND_READY.reports`
                    in `tab-bar.tsx`), so it is gone until there is one. */}
              </div>
            ))}
          </div>
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
export default function ReportsPage() {
  // No backend stores these yet, so on a live site this screen could only
  // show nothing or demo content. Hidden until it has a real source.
  if (isBackendConfigured()) notFound();
  return (
    <PageShell activeTab="/reports" currentStageId="agents">
      <Suspense fallback={<PageLoading title="Reports" />}>
        <ReportsPageBody />
      </Suspense>
    </PageShell>
  );
}
