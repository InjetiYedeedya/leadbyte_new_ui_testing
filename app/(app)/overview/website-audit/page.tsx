import Link from "@/components/ui/app-link";
import { webHref } from "@/lib/data/profile-display";
import type { Metadata } from "next";
import { countOf, formatCount } from "@/lib/format";
import { Suspense } from "react";
import {
  CaretRight,
  ChartLineUp,
  Check,
  Clock,
  FileText,
  Lightbulb,
  Warning,
} from "@phosphor-icons/react/ssr";
import { PageLoading } from "@/components/ui/page-loading";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { OVERVIEW_TABS } from "@/lib/nav";
import { getWebsiteAuditRepo } from "@/lib/data/website-audit-repo";
import { EmptyState } from "@/components/ui/empty-state";
import { DownloadPdfButton } from "@/components/ui/download-pdf-button";
import { PdfReportFrame } from "@/components/ui/pdf-report-frame";
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
import { AuditFindings } from "@/components/analysis/audit-findings";
import { AuditPageTable } from "@/components/analysis/audit-page-table";
import { NextStep } from "@/components/ui/next-step";
import { readTopQueries } from "@/lib/data/search-console";
import { PageContainer } from "@/components/ui/page-container";
import { scoreTone } from "@/lib/data/overview-summary";
import {
  leadingQueries,
  pageNeedsAttention,
  pageScore,
  pageSeverities,
  planCard,
} from "@/lib/data/audit-view";
import type { WebsiteAuditPage } from "@/lib/data/types";

export const metadata: Metadata = { title: "Website audit · LeadByte" };

/**
 * Built to the approved Website audit design (2026-09-28): heading with its
 * two controls, score beside the overview tiles, category bars beside
 * technical setup, key findings, keywords beside KPI targets, the per-page
 * table and the 90-day plan.
 *
 * Pieces of that design with no data behind them are left out rather than
 * filled: a "vs last audit" change (no previous audit is kept), an analysis
 * duration (not recorded, so the third tile is the real analysis date),
 * percentage uplifts on opportunities (no source, so that card lists the
 * audit's own KPI targets), and "View all issues" / "View details" / "View
 * detailed plan" links (there is no page behind any of them).
 */

const SEVERITY_VARIANT: Record<string, BadgeVariant> = {
  critical: "confidence-low",
  high: "confidence-medium",
  medium: "confidence-partial",
  low: "confidence-high",
};

function severityBadgeVariant(severity: string): BadgeVariant {
  return SEVERITY_VARIANT[severity] ?? "confidence-partial";
}

/** Every card on this screen: white, hairline, and a shadow tinted to the ink. */
const CARD =
  "rounded-lg border border-border bg-surface p-5 shadow-[0_1px_2px_rgb(12_21_63/0.04),0_12px_32px_-18px_rgb(12_21_63/0.2)] print:shadow-none";

/**
 * A card too long to fit one printed page: it may split, and its rows hold
 * together instead (`globals.css`, the base-layer print rules). Kept whole,
 * it jumped to the next page and left the one before mostly blank.
 */
const LONG = "print:break-inside-auto";

const SECTION_LINK =
  "shrink-0 whitespace-nowrap rounded text-sm font-medium text-accent-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent print:hidden";

const RING_STROKE = {
  good: "stroke-good",
  warn: "stroke-warn",
  crit: "stroke-crit",
  neutral: "stroke-border",
} as const;

/** The score as a ring. Server-rendered; no animation, nothing to hydrate. */
function ScoreRing({ score }: { score: number | null }) {
  const radius = 42;
  const length = 2 * Math.PI * radius;
  const filled = score === null ? 0 : (Math.max(0, Math.min(100, score)) / 100) * length;
  return (
    <div className="relative size-32 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" className="stroke-surface-raised" />
        {score !== null && (
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${length}`}
            className={RING_STROKE[scoreTone(score)]}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold leading-none tabular-nums text-ink">{score ?? "—"}</span>
        <span className="mt-1 text-xs text-ink-soft">/100</span>
      </div>
    </div>
  );
}

/** The plan's three month colours, in the design's order. */
const PLAN_TONES = [
  {
    card: "border-accent/15 bg-accent-soft/40",
    badge: "bg-accent-soft text-accent-ink",
    tick: "text-accent",
    tag: "text-accent-ink",
  },
  {
    card: "border-violet/15 bg-violet-soft/50",
    badge: "bg-violet-soft text-violet",
    tick: "text-violet",
    tag: "text-violet",
  },
  {
    card: "border-good/15 bg-good-soft/40",
    badge: "bg-good-soft text-good",
    tick: "text-good",
    tag: "text-good",
  },
] as const;

/** The KPI rows' icon tiles, cycled so neighbouring rows are told apart. */
const KPI_TONES = [
  "bg-good-soft text-good",
  "bg-accent-soft text-accent",
  "bg-violet-soft text-violet",
  "bg-info-soft text-info",
  "bg-crit-soft text-crit",
] as const;

function shortDate(iso: string): string | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// No `searchParams`. The Google connect flow used to return here and set
// `?google=connected`; it lands on the dashboard now, where the numbers it
// enables actually are. See `GOOGLE_RESULT_PATH`.
async function WebsiteAuditPageBody() {
  const businessId = await currentBusinessId();
  const [audit, phase, queries, failures] = await Promise.all([
    getWebsiteAuditRepo().get(businessId),
    analysisState(),
    // The keyword table alone, not the whole connected-data bundle.
    readTopQueries(businessId),
    // One backend step produces the audit AND the GEO analysis, so both
    // screens read the same `audit` key.
    analysisSectionFailures(businessId),
  ]);
  const auditFailure = failureFor(failures, "audit") ?? failureFor(failures, "seo");

  const analysedOn = audit?.analysedAt ? shortDate(audit.analysedAt) : null;
  const pages = audit?.pages ?? [];
  const technical = audit?.technicalChecks ?? [];
  const hasTechnical = technical.length > 0 || Boolean(audit?.quickWin);
  const hasCategories = (audit?.categoryScores.length ?? 0) > 0;
  const kpis = audit?.kpiTargets ?? [];
  const sortedQueries = leadingQueries(queries);

  return (
    <>
      <PageContainer>
        {/* The branded frame the PDF prints inside; invisible on screen. */}
        <PdfReportFrame reportName="SEO Audit">
        <header className="relative">
          {/* The design's soft blue light behind the heading's right side. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-16 -z-10 h-64 w-[36rem] max-w-full bg-[radial-gradient(closest-side,rgb(29_63_209/0.13),transparent)] print:hidden"
          />
          <nav aria-label="Breadcrumb" className="print:hidden">
            <ol className="flex items-center gap-1.5 text-xs text-ink-soft">
              <li>
                <Link href="/overview" className="hover:text-ink">
                  Business overview
                </Link>
              </li>
              <li aria-hidden="true">
                <CaretRight size={12} />
              </li>
              <li aria-current="page" className="text-ink">
                Website audit
              </li>
            </ol>
          </nav>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-4xl font-bold tracking-tight text-ink">
                Website <span className="text-accent-vivid">Audit</span>
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
                We analyzed your website to find technical issues, SEO gaps, and opportunities to improve
                visibility and performance.
              </p>
            </div>
            {/* One takes the report away, one moves on. Download only once
                there is a report: a PDF of an empty state is a page of nothing. */}
            <div className="flex flex-wrap items-center gap-3">
              {audit && <DownloadPdfButton />}
              <NextStep current="/overview/website-audit" tone="solid" />
            </div>
          </div>
        </header>

        {/* Print only: a PDF arrives without the app's header, so it has to
            say what it is and which site it is about. */}
        <p className="hidden text-sm text-ink-soft print:block">
          Website audit · {audit?.pagesCrawled ?? 0} pages · printed{" "}
          {new Date().toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>

        {/* One job feeds all three Intelligence screens, so each one mounts the
            poller and comes alive when that job finishes. */}
        <AnalysisStatus running={phase.phase === "running"} />

        {!audit && phase.phase === "running" && <AnalysingState what="your site" />}
        {!audit && phase.phase === "failed" && (
          <AnalysisFailedState message={phase.message} action={<RetryAnalysis />} />
        )}
        {/* An analysis that RAN and came back without its audit section is not
            the same as an account that has never been analysed. Saying "nobody
            has run an audit" there is false, and sends the reader to press Run
            analysis again against a step that is not going to answer. */}
        {!audit && phase.phase === "idle" && auditFailure && (
          <div>
            <SectionUnavailableState label="The website audit" reason={auditFailure.reason} />
          </div>
        )}
        {!audit && phase.phase === "idle" && !auditFailure && (
          <div>
            <EmptyState
              title="No audit yet"
              description="Nobody has run an audit for this account, so there are no scores or findings to show."
              note="Once an audit runs, its score, category breakdown and findings appear here automatically."
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

        {audit && (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              {/* The LLM SEO score, not the health score: the backend asked us
                  to drop the latter. Null is "not scored yet", never 0; see
                  `website-analysis.ts`. */}
              <section className={CARD}>
                <h2 className="text-lg font-bold tracking-tight text-ink">LLM SEO Score</h2>
                <div className="mt-4 flex flex-wrap items-center gap-6">
                  <ScoreRing score={audit.score} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-md bg-crit-soft px-3 py-1.5 text-xs font-semibold text-crit">
                        {audit.criticalCount} Critical {audit.criticalCount === 1 ? "issue" : "issues"}
                      </span>
                      <span className="rounded-md bg-warn-soft px-3 py-1.5 text-xs font-semibold text-warn">
                        {audit.highCount} High {audit.highCount === 1 ? "issue" : "issues"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-ink-soft">
                      {countOf(audit.pagesCrawled, "page")} crawled · {countOf(audit.totalIssues, "issue")} found
                    </p>
                    {audit.score === null && <p className="mt-1 text-xs text-ink-soft">Not scored yet.</p>}
                  </div>
                </div>
              </section>

              <section className={CARD}>
                <h2 className="text-lg font-bold tracking-tight text-ink">Audit overview</h2>
                <dl className={`mt-4 grid gap-3 ${analysedOn ? "grid-cols-3" : "grid-cols-2"}`}>
                  <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border px-2 py-4 text-center">
                    <FileText size={28} className="text-accent" aria-hidden="true" />
                    <dd className="text-2xl font-bold tabular-nums text-ink">{formatCount(audit.pagesCrawled)}</dd>
                    <dt className="order-last text-xs text-ink-soft">Pages crawled</dt>
                  </div>
                  <div className="flex flex-col items-center gap-1.5 rounded-lg border border-crit/15 bg-crit-soft/50 px-2 py-4 text-center">
                    <Warning size={28} className="text-crit" aria-hidden="true" />
                    <dd className="text-2xl font-bold tabular-nums text-ink">{formatCount(audit.totalIssues)}</dd>
                    <dt className="order-last text-xs text-ink-soft">Total issues</dt>
                  </div>
                  {analysedOn && (
                    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border px-2 py-4 text-center">
                      <Clock size={28} className="text-accent" aria-hidden="true" />
                      <dd className="text-lg font-bold leading-8 text-ink">{analysedOn}</dd>
                      <dt className="order-last text-xs text-ink-soft">Last analysed</dt>
                    </div>
                  )}
                </dl>
              </section>
            </div>

            {(hasCategories || hasTechnical) && (
              <div className={`grid gap-4 ${hasCategories && hasTechnical ? "lg:grid-cols-2" : ""}`}>
                {hasCategories && (
                  <section className={CARD}>
                    <h2 className="text-lg font-bold tracking-tight text-ink">Category breakdown</h2>
                    <ul className="mt-4 space-y-3.5">
                      {audit.categoryScores.map((c) => (
                        <li
                          key={c.category}
                          className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-4 text-sm"
                        >
                          <span className="truncate text-ink">{c.category}</span>
                          <span className="h-2 rounded-full bg-surface-raised" aria-hidden="true">
                            <span
                              className="block h-2 rounded-full bg-accent-vivid"
                              style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }}
                            />
                          </span>
                          <span className="text-right font-semibold tabular-nums text-ink">{c.score}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {hasTechnical && (
                  <section className={`${CARD} flex flex-col gap-4`}>
                    {technical.length > 0 && (
                      <div>
                        <h2 className="text-lg font-bold tracking-tight text-ink">Technical setup</h2>
                        {/* Pass/fail signals, kept apart from the score because
                            each is a different job for a different person. */}
                        <ul className="mt-4 flex flex-wrap gap-2.5">
                          {technical.map((c) => (
                            <li
                              key={c.label}
                              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium ${
                                c.pass ? "border-good/20 bg-good-soft/60" : "border-crit/20 bg-crit-soft/60"
                              }`}
                            >
                              <span
                                aria-hidden="true"
                                className={`size-2 rounded-full ${c.pass ? "bg-good" : "bg-crit"}`}
                              />
                              <span className="text-ink">{c.label}</span>
                              <span className={c.pass ? "text-good" : "text-crit"}>
                                {c.pass ? "present" : "missing"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {/* The single highest-leverage fix, written by the analyzer. */}
                    {audit.quickWin && (
                      <div className="mt-auto flex gap-4 rounded-lg border border-good/20 bg-good-soft p-4">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-good/15 text-good">
                          <Lightbulb size={22} weight="fill" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-good">Quick win</p>
                          {audit.quickWin.title !== "" && (
                            <h3 className="mt-0.5 text-base font-bold text-ink">{audit.quickWin.title}</h3>
                          )}
                          {audit.quickWin.text !== "" && (
                            <p className="mt-1 text-sm text-ink">{audit.quickWin.text}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}

            {/* `#findings`: where the GEO page's severity tiles land. */}
            <section id="findings" className={`${CARD} ${LONG} scroll-mt-40`}>
              <h2 className="text-2xl font-bold tracking-tight text-ink">Key findings</h2>
              <div className="mt-4">
                {audit.findings.length > 0 ? (
                  <AuditFindings
                    findings={audit.findings}
                    pagesCrawled={audit.pagesCrawled}
                    pagesAnchor={pages.length > 0 ? "page-recommendations" : undefined}
                  />
                ) : (
                  <p className="text-sm text-ink-soft">This audit found nothing to fix.</p>
                )}
              </div>
            </section>

            {(sortedQueries.length > 0 || kpis.length > 0) && (
              <div
                className={`grid items-start gap-4 ${
                  sortedQueries.length > 0 && kpis.length > 0
                    ? "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
                    : ""
                }`}
              >
                {/* What the site already ranks for: measured reality, so it
                    comes before the analyzer's targets. The five with the most
                    clicks on screen, every one on paper. */}
                {sortedQueries.length > 0 && (
                  <section className={`${CARD} ${LONG}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-bold tracking-tight text-ink">Keyword performance</h2>
                        <p className="mt-0.5 text-sm text-ink-soft">
                          From Google Search Console. Position is an average — lower is better.
                        </p>
                      </div>
                      <Link href="/analytics/explore?source=search" className={SECTION_LINK}>
                        View all keywords →
                      </Link>
                    </div>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[480px] text-sm">
                        <thead>
                          <tr className="border-b border-border text-xs text-ink-soft">
                            <th scope="col" className="py-2.5 pr-3 text-left font-medium">
                              Query
                            </th>
                            <th scope="col" className="px-3 py-2.5 text-right font-medium">
                              Clicks
                            </th>
                            <th scope="col" className="px-3 py-2.5 text-right font-medium">
                              Impressions
                            </th>
                            <th scope="col" className="px-3 py-2.5 text-right font-medium">
                              CTR
                            </th>
                            <th scope="col" className="py-2.5 pl-3 text-right font-medium">
                              Avg. position
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedQueries.map((q, i) => (
                            <tr
                              key={q.query}
                              className={`border-b border-border last:border-b-0 ${i >= 5 ? "hidden print:table-row" : ""}`}
                            >
                              <td className="max-w-[14rem] truncate py-3 pr-3 text-ink" title={q.query}>
                                {q.query}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-ink">{formatCount(q.clicks)}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-ink">
                                {formatCount(q.impressions)}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-ink">
                                {(q.ctr * 100).toFixed(1)}%
                              </td>
                              <td className="py-3 pl-3 text-right tabular-nums text-ink">
                                {q.position > 0 ? q.position.toFixed(1) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {/* Where the design lists opportunities with uplift figures,
                    this lists the audit's own measurable targets: the uplift
                    percentages had no source, these do. */}
                {kpis.length > 0 && (
                  <section className={CARD}>
                    <h2 className="text-lg font-bold tracking-tight text-ink">KPI targets</h2>
                    <p className="mt-0.5 text-sm text-ink-soft">What this audit sets out to change by month 3.</p>
                    <ul className="mt-4 space-y-4">
                      {kpis.map((k, i) => (
                        <li key={k.kpi} className="flex items-center gap-3">
                          <span
                            className={`flex size-10 shrink-0 items-center justify-center rounded-md ${KPI_TONES[i % KPI_TONES.length]}`}
                            aria-hidden="true"
                          >
                            <ChartLineUp size={20} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-ink">{k.kpi}</p>
                            <p className="text-xs text-ink-soft">
                              {[k.current !== "" ? `Now ${k.current}` : "", k.tool !== "" ? `measured with ${k.tool}` : ""]
                                .filter((part) => part !== "")
                                .join(" · ")}
                            </p>
                          </div>
                          {k.month3 !== "" && (
                            <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-good">
                              {k.month3}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}

            {/* Per-URL detail and the analyzer's written recommendations. */}
            {pages.length > 0 && (
              <section id="page-recommendations" className={`${CARD} ${LONG} scroll-mt-40`}>
                <h2 className="text-2xl font-bold tracking-tight text-ink">Page-level recommendations</h2>
                <p className="mt-0.5 text-sm text-ink-soft">{countOf(pages.length, "page")} analysed</p>
                <div className="mt-4">
                  <AuditPageTable
                    rows={pages.map((page) => {
                      const score = pageScore(page);
                      return {
                        key: page.url,
                        path: page.shortUrl,
                        issues: page.issueCount,
                        score,
                        needsAttention: pageNeedsAttention(score, page.issueCount),
                        severities: pageSeverities(page),
                        detail: <PageReport page={page} />,
                      };
                    })}
                  />
                </div>
              </section>
            )}

            {/* The backend's own 30/60/90 plan, written from this audit. */}
            {audit.actionPlan && audit.actionPlan.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold tracking-tight text-ink">Your 90-day plan</h2>
                <p className="mt-0.5 text-sm text-ink-soft">
                  Written from this audit — sequenced so the highest-severity blockers clear first.
                </p>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  {audit.actionPlan.map((month, index) => {
                    const tone = PLAN_TONES[index % PLAN_TONES.length]!;
                    const card = planCard(month);
                    return (
                      <article key={month.month} className={`flex flex-col rounded-lg border p-5 ${tone.card}`}>
                        <div className="flex items-start gap-4">
                          <span
                            className={`flex size-11 shrink-0 items-center justify-center rounded-full text-lg font-bold ${tone.badge}`}
                          >
                            {month.month}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs text-ink-soft">Month {month.month}</p>
                            <h3 className="text-base font-bold leading-snug text-ink">{month.title}</h3>
                            {month.subtitle !== "" && (
                              <p className="mt-0.5 text-xs text-ink-soft">{month.subtitle}</p>
                            )}
                          </div>
                        </div>
                        {card.items.length > 0 && (
                          <ul className="mt-4 space-y-2 pl-1">
                            {card.items.map((item, i) => (
                              <li key={i} className="flex gap-2.5 text-sm text-ink">
                                <Check
                                  size={16}
                                  weight="bold"
                                  className={`mt-0.5 shrink-0 ${tone.tick}`}
                                  aria-hidden="true"
                                />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {card.tag !== "" && (
                          <p className={`mt-auto pt-4 text-right text-xs font-semibold ${tone.tag}`}>{card.tag}</p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </PdfReportFrame>
      </PageContainer>
    </>
  );
}

/** One crawled page's full report, opened from its row in the table. */
function PageReport({ page }: { page: WebsiteAuditPage }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <a
            href={webHref(page.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm text-accent-ink"
          >
            {page.shortUrl}
          </a>
          {page.pageType && <span className="ml-2 text-xs text-ink-soft">{page.pageType}</span>}
        </div>
      </div>

      {page.contentQuality && <p className="mb-4 text-sm text-ink-soft">{page.contentQuality}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {page.recommendedTitle && (
          <div>
            <div className="mb-1 text-xs font-medium text-ink-soft">Recommended title</div>
            <p className="rounded border border-border bg-surface px-3 py-2 text-sm text-ink">
              {page.recommendedTitle}
            </p>
            {page.title !== "" && <p className="mt-1 text-xs text-ink-soft">Currently: {page.title}</p>}
          </div>
        )}
        {page.recommendedMetaDescription && (
          <div>
            <div className="mb-1 text-xs font-medium text-ink-soft">Recommended meta description</div>
            <p className="rounded border border-border bg-surface px-3 py-2 text-sm text-ink">
              {page.recommendedMetaDescription}
            </p>
          </div>
        )}
      </div>

      {page.priorityActions && page.priorityActions.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-xs font-medium text-ink-soft">Priority actions</div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
            {page.priorityActions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Each issue with WHY it matters and HOW to fix it. These arrive as
          objects, not strings: the most actionable content in the payload. */}
      {page.detailedIssues && page.detailedIssues.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium text-ink-soft">
            {countOf(page.detailedIssues.length, "issue")} explained
          </div>
          <div className="divide-y divide-border rounded border border-border bg-surface">
            {page.detailedIssues.map((d, i) => (
              <details key={i} className="group px-3 py-2">
                <summary className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                  <Badge variant={severityBadgeVariant(d.severity)}>{d.severity}</Badge>
                  <span className="font-medium">{d.issue}</span>
                </summary>
                {d.whyItMatters !== "" && (
                  <p className="mt-2 text-sm text-ink-soft">
                    <span className="font-medium text-ink">Why it matters. </span>
                    {d.whyItMatters}
                  </p>
                )}
                {d.howToFix !== "" && (
                  <p className="mt-1.5 text-sm text-ink-soft">
                    <span className="font-medium text-ink">How to fix. </span>
                    {d.howToFix}
                  </p>
                )}
              </details>
            ))}
          </div>
        </div>
      )}

      {page.targetKeywords && page.targetKeywords.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-xs font-medium text-ink-soft">Target keywords</div>
          <div className="flex flex-wrap gap-1.5">
            {page.targetKeywords.map((k) => (
              <span key={k} className="rounded bg-surface px-2 py-1 font-mono text-xs text-ink">
                {k}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The page's own reads sit behind a boundary so the frame does not wait on
 * them. Without it the whole screen — header, tabs, rail — was held back until
 * the slowest backend read landed, and a click showed the previous page for
 * the entire wait. See the note on `PageShell`; this is NOT a route-level
 * `loading.tsx` (rule 0).
 */
export default function WebsiteAuditPage() {
  return (
    <PageShell
      activeTab="/overview"
      currentStageId="audit"
      subTabs={OVERVIEW_TABS}
      subTabActive="/overview/website-audit"
    >
      <Suspense fallback={<PageLoading title="Website audit" />}>
        <WebsiteAuditPageBody />
      </Suspense>
    </PageShell>
  );
}
