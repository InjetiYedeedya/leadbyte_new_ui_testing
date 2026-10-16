import {
  ArrowRight,
  CaretRight,
  CheckCircle,
  Code,
  FileText,
  Globe,
  Info,
  Lightning,
  MinusCircle,
  ShieldCheck,
  Stack,
  TrendUp,
  Warning,
  WarningCircle,
  WarningOctagon,
  Wrench,
  XCircle,
} from "@phosphor-icons/react/ssr";
import Link from "@/components/ui/app-link";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { webHref } from "@/lib/data/profile-display";
import { DownloadPdfButton } from "@/components/ui/download-pdf-button";
import {
  categoryRows,
  enginesChecked,
  extractabilityBuckets,
  overallVerdict,
  quickWins,
  scoreTone,
  subScoreVerdict,
  type Tone,
} from "@/lib/data/geo-dashboard";
import type { GeoAnalysis, GeoAnalysisPage, GeoSignal, WebsiteAudit } from "@/lib/data/types";

/**
 * The GEO analysis screen, built to the reference dashboard (2026-10-09):
 *
 *   1. the question beside a picture of the engines checked, and the score;
 *   2. the website audit's severity tiles beside the four sub-scores;
 *   3. three columns — issues by category; crawler access, what engines can
 *      and cannot read, and the hard-to-read pages; every page's score;
 *   4. the three quick wins.
 *
 * A Server Component: every figure is a read of one analysis. Expanding a
 * category or the rest of the page list is native `<details>`, no script.
 *
 * ## What the reference showed that is not here, and why
 *
 * - **Severity per category** ("13 critical • 6 high") and the severity
 *   filter chips: the backend grades findings for the site as a whole, never
 *   per GEO category. Each row shows its measured gaps and passing checks.
 * - **Content quality, Technical, Links & social**: the GEO signals come in
 *   three groups, and those three are the rows.
 * - **The engines' own logos**: theirs to use, not ours. The chips name the
 *   engines, and only those whose crawler the analysis actually checked.
 * - **"High impact"** on the quick wins: nothing computes impact. They are
 *   ranked by how many pages each fix reaches, and say so.
 *
 * Score colours and words use the product's bands (80 / 50, as on the
 * Overview and the Website audit).
 */

const CARD = "rounded-lg border border-border/70 bg-surface shadow-[0_1px_2px_rgb(12_21_63/0.04),0_8px_24px_-12px_rgb(12_21_63/0.12)]";
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const TONE_TEXT: Record<Tone, string> = { good: "text-good", warn: "text-warn", crit: "text-crit" };
const TONE_BAR: Record<Tone, string> = { good: "bg-good", warn: "bg-warn", crit: "bg-crit" };
const TONE_PILL: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  crit: "bg-crit-soft text-crit",
};

/** A thin bar for a 0-100 value. */
function Meter({ value, tone, className = "" }: { value: number; tone: Tone; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-surface-raised ${className}`}>
      <div
        className={`h-full rounded-full ${TONE_BAR[tone]}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Hero: the question, the engines, the score
// ---------------------------------------------------------------------------

/**
 * The globe with the AI engines around it — the design's own artwork
 * (`public/geo-engines-globe.webp`, cut from `Global AI Network
 * Globe-Photoroom.png` to its visible area at 840px, 89 KB against 1.5 MB).
 * A static file in a plain `<img>` rather than `next/image`: resizing it per
 * request would spend the Worker's CPU budget on decoration. Decoration,
 * hidden from assistive tech; shown only once the analysis has checked
 * engines, as before.
 */
function EngineGlobe() {
  return (
    <div className="hidden w-[26rem] shrink-0 xl:block" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/geo-engines-globe.webp" alt="" width={840} height={467} loading="lazy" decoding="async" className="h-auto w-full" />
    </div>
  );
}

function ScoreCard({ score }: { score: number | null }) {
  const verdict = score === null ? null : overallVerdict(score);
  return (
    <section className={`${CARD} relative p-5`}>
      <span
        className="absolute right-4 top-4 flex size-12 items-center justify-center rounded-lg bg-accent-soft/70 text-accent"
        aria-hidden="true"
      >
        <TrendUp size={24} weight="bold" />
      </span>
      <h2 className="flex items-center gap-2 text-base font-bold text-ink">
        Overall GEO score
        <span
          // The AEO agent runs its own audit with its own score; saying so
          // here stops two different numbers reading as one being wrong.
          title="How easily AI answer engines can find, read and quote your site, from your last website analysis. The AEO agent runs separate checks, so its score will not match this one."
          className="flex size-5 cursor-help items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent"
        >
          ?
        </span>
      </h2>
      {score === null || verdict === null ? (
        <p className="mt-3 text-sm text-ink-soft">Not scored yet.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pr-14">
            <p className="flex items-baseline gap-1.5">
              <span className={`text-5xl font-bold leading-none tracking-tight tabular-nums ${TONE_TEXT[verdict.tone]}`}>
                {score}
              </span>
              <span className="text-xl text-ink-soft">/ 100</span>
            </p>
            <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${TONE_PILL[verdict.tone]}`}>
              {verdict.label}
            </span>
          </div>
          <Meter value={score} tone={verdict.tone} className="mt-4 h-2.5" />
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">{verdict.sentence}</p>
        </>
      )}
    </section>
  );
}

function Hero({
  name,
  pages,
  score,
  engines,
  next,
}: {
  name: string;
  pages: number;
  score: number | null;
  engines: string[];
  next?: React.ReactNode;
}) {
  return (
    <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,25rem)]">
      <div className="min-w-0 px-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-soft">GEO analysis</p>
        <h1 className="mt-1.5 max-w-xl text-3xl font-bold leading-[1.08] tracking-tight text-ink text-balance lg:text-[2.6rem]">
          How visible is {name} in AI search?
        </h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-soft">
          {pages > 0 ? `We analysed ${pages} ${pages === 1 ? "page" : "pages"}` : "We analysed your site"} and
          checked how easily AI engines can find, understand and quote your content.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2.5 print:hidden">
          <a
            href="#quick-wins"
            className={`inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-accent-ink ${FOCUS}`}
          >
            <Wrench size={16} weight="bold" aria-hidden="true" />
            Fix issues now
            <ArrowRight size={14} weight="bold" aria-hidden="true" />
          </a>
          <DownloadPdfButton label="Download report" />
          {next}
        </div>
      </div>
      {engines.length > 0 && <EngineGlobe />}
      <ScoreCard score={score} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Severity tiles and sub-scores
// ---------------------------------------------------------------------------

const SEVERITY: {
  key: "critical" | "high" | "medium" | "low";
  count: "criticalCount" | "highCount" | "mediumCount" | "lowCount";
  label: string;
  icon: PhosphorIcon;
  tile: string;
  chip: string;
  text: string;
  note: (n: number) => string;
}[] = [
  {
    key: "critical",
    count: "criticalCount",
    label: "Critical issues",
    icon: WarningCircle,
    tile: "bg-linear-to-br from-crit-soft to-crit-soft/30",
    chip: "bg-crit text-white",
    text: "text-crit",
    note: (n) => (n > 0 ? "Need immediate attention" : "None found"),
  },
  {
    key: "high",
    count: "highCount",
    label: "High priority",
    icon: Warning,
    tile: "bg-linear-to-br from-warn-soft to-warn-soft/30",
    chip: "bg-warn text-white",
    text: "text-warn",
    note: (n) => (n > 0 ? "Should be fixed soon" : "None found"),
  },
  {
    key: "medium",
    count: "mediumCount",
    label: "Medium priority",
    icon: Info,
    tile: "bg-linear-to-br from-warn-soft/60 to-surface",
    chip: "bg-warn-soft text-warn",
    text: "text-warn",
    note: (n) => (n > 0 ? "Minor improvements" : "Minor improvements"),
  },
  {
    key: "low",
    count: "lowCount",
    label: "Low priority",
    icon: Warning,
    tile: "bg-linear-to-br from-info-soft/70 to-surface",
    chip: "bg-info-soft text-info",
    text: "text-info",
    note: (n) => (n > 0 ? "Small refinements" : "No major issues"),
  },
];

/**
 * The website audit's graded findings — severities exist only there, so each
 * tile opens the audit filtered to it. Named as the audit's in the panel's
 * accessible label and each tile's title.
 */
function SeverityPanel({ audit }: { audit: WebsiteAudit }) {
  return (
    <section className={`${CARD} grid grid-cols-2 gap-2 p-2 sm:grid-cols-4`} aria-label="Website audit findings by severity">
      {SEVERITY.map((s) => {
        const count = audit[s.count];
        const Glyph = s.icon;
        return (
          <Link
            key={s.key}
            href={`/overview/website-audit?severity=${s.key}#findings`}
            title={`${s.label} in your website audit`}
            className={`group flex items-start gap-2.5 rounded-lg px-2.5 py-3 transition-[filter] hover:brightness-[0.97] ${s.tile} ${FOCUS}`}
          >
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg shadow-sm ${s.chip}`} aria-hidden="true">
              <Glyph size={20} weight="fill" />
            </span>
            <span className="min-w-0 flex-1">
              <span className={`flex items-center gap-1 text-xs font-semibold leading-tight ${s.text}`}>
                <span className="whitespace-nowrap">{s.label}</span>
                <CaretRight size={12} weight="bold" className="shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
              <span className={`mt-1 block text-3xl font-bold leading-none tabular-nums ${s.text}`}>{count}</span>
              <span className="mt-1.5 block text-xs leading-snug text-ink-soft">{s.note(count)}</span>
            </span>
          </Link>
        );
      })}
    </section>
  );
}

const SUB_SCORE_ICON: Record<string, PhosphorIcon> = {
  Crawlability: Globe,
  "Entity clarity": FileText,
  Content: Stack,
  Trust: ShieldCheck,
};

function SubScorePanel({ subScores }: { subScores: { label: string; score: number | null }[] }) {
  return (
    <section className={`${CARD} grid grid-cols-2 gap-2 p-2 sm:grid-cols-4`} aria-label="GEO sub-scores">
      {subScores.map((sub) => {
        const Glyph = SUB_SCORE_ICON[sub.label] ?? Globe;
        const verdict = sub.score === null ? null : subScoreVerdict(sub.score);
        return (
          <div key={sub.label} className="flex items-start gap-3 rounded-lg border border-border/70 p-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft/80 text-accent" aria-hidden="true">
              <Glyph size={22} weight="bold" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm text-ink">{sub.label}</p>
              {sub.score === null || verdict === null ? (
                <p className="mt-1 text-sm text-ink-soft">Not scored yet</p>
              ) : (
                <>
                  <p className="mt-0.5 text-[1.6rem] font-bold leading-tight tabular-nums text-ink">
                    {sub.score}
                    <span className="text-sm font-normal text-ink-soft"> /100</span>
                  </p>
                  <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${TONE_PILL[verdict.tone]}`}>
                    {verdict.label}
                  </span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 3. The three columns
// ---------------------------------------------------------------------------

const GROUP_META: Record<GeoSignal["group"], { icon: PhosphorIcon; describe: string }> = {
  Structure: { icon: Stack, describe: "Headings, page structure, answer placement" },
  Markup: { icon: Code, describe: "Schema.org, FAQ, entity and knowledge-graph markup" },
  "Trust & authorship": { icon: ShieldCheck, describe: "Author, dates, sources, credibility signals" },
};

/** One row per signal group; each opens on the checks behind its numbers. */
function CategoriesCard({ signals }: { signals: GeoSignal[] }) {
  const rows = categoryRows(signals);
  const total = signals[0]?.total ?? 0;
  const gaps = rows.reduce((sum, row) => sum + row.missing, 0);
  // The group with the most gaps: where most of the work is.
  const weakest = [...rows].sort((a, b) => b.missing - a.missing)[0]?.group;
  return (
    <section id="categories" className={`${CARD} flex scroll-mt-28 flex-col p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight text-ink">Issues by category</h2>
        <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white">
          {gaps} {gaps === 1 ? "gap" : "gaps"} across {total} pages
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {rows.map((row) => {
          const meta = GROUP_META[row.group];
          const Glyph = meta.icon;
          const tone = scoreTone(row.coverage);
          return (
            // The group with the most gaps starts open: it is where to look
            // first, and
            // its checks fill the card to its neighbours' height. All open
            // made the page longer than one screen.
            <details
              key={row.group}
              open={row.group === weakest}
              className="group rounded-lg border border-border/70 bg-surface open:bg-ground/40"
            >
              <summary className={`flex cursor-pointer list-none items-center gap-3 rounded-lg p-3 [&::-webkit-details-marker]:hidden ${FOCUS}`}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-crit-soft/70 text-crit" aria-hidden="true">
                  <Glyph size={18} weight="bold" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{row.group}</span>
                  <span className="block truncate text-xs text-ink-soft" title={meta.describe}>
                    {meta.describe}
                  </span>
                </span>
                <span className="hidden w-40 shrink-0 sm:block">
                  <span className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                    <span className="text-ink">
                      {row.missing} {row.missing === 1 ? "gap" : "gaps"}
                    </span>
                    <span className={TONE_TEXT[tone]}>
                      {row.passing} of {row.checks} pass
                    </span>
                  </span>
                  <Meter value={row.coverage} tone={tone} className="mt-1.5" />
                </span>
                <CaretRight size={14} weight="bold" className="shrink-0 text-ink-soft transition-transform group-open:rotate-90" aria-hidden="true" />
              </summary>
              <ul className="space-y-1.5 px-3 pb-3 pl-15">
                {signals
                  .filter((s) => s.group === row.group)
                  .map((signal) => {
                    const percent = signal.total > 0 ? Math.round((signal.pages / signal.total) * 100) : 0;
                    return (
                      <li key={signal.label} className="grid grid-cols-[minmax(0,1fr)_4.5rem_3rem] items-center gap-2 text-xs">
                        <span className="truncate text-ink-soft">{signal.label}</span>
                        <Meter value={percent} tone={scoreTone(percent)} />
                        {/* The count, not the percentage: "0 of 17" is the
                            sentence someone repeats to their developer. */}
                        <span className={`text-right tabular-nums ${signal.pages === 0 ? "font-semibold text-crit" : "text-ink"}`}>
                          {signal.pages}/{signal.total}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </details>
          );
        })}
      </div>
      <p className="mt-auto pt-3 text-xs text-ink-soft">Each check counted across your pages. A count in red means no page passes.</p>
    </section>
  );
}

function CrawlerCard({ bots }: { bots: NonNullable<GeoAnalysis["aiBots"]> }) {
  const allowed = bots.filter((b) => b.access === "allowed").length;
  const blocked = bots.filter((b) => b.access === "blocked").length;
  const all = allowed === bots.length;
  return (
    <section
      className={`rounded-lg border p-4 shadow-sm ${
        all ? "border-good/20 bg-linear-to-br from-good-soft/70 to-good-soft/20" : "border-border/70 bg-surface"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm ${blocked > 0 ? "bg-crit" : "bg-good"}`}
          aria-hidden="true"
        >
          {blocked > 0 ? <XCircle size={20} weight="bold" /> : <CheckCircle size={20} weight="bold" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold text-ink">AI crawler access</h2>
            <span className={`text-sm font-medium ${all ? "text-good" : "text-ink-soft"}`}>
              {allowed} of {bots.length} allowed
            </span>
          </div>
          <p className="mt-0.5 text-sm text-ink-soft">
            {all
              ? "All major AI crawlers are allowed in your robots.txt."
              : blocked > 0
                ? `${blocked} ${blocked === 1 ? "crawler is" : "crawlers are"} blocked in your robots.txt.`
                : "Some crawlers are not mentioned in your robots.txt. That usually allows them."}
          </p>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {bots.map((b) => (
          <li key={b.bot} className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-surface px-2 py-1 text-xs text-ink">
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full ${b.access === "allowed" ? "bg-good" : b.access === "blocked" ? "bg-crit" : "bg-ink-soft"}`}
            />
            {b.bot}
            {/* Not colour alone: anything not allowed says what it is. */}
            {b.access !== "allowed" && (
              <span className="text-ink-soft">{b.access === "blocked" ? "blocked" : "not set"}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Takes the middle column's spare height, its rows centred in it. */
function FindCard({ pages, totalIssues }: { pages: GeoAnalysisPage[]; totalIssues?: number }) {
  const b = extractabilityBuckets(pages);
  if (b.scored === 0) return null;
  const rows: { label: string; count: number; tone: Tone; icon: PhosphorIcon }[] = [
    { label: "Find and understand well", count: b.good, tone: "good", icon: CheckCircle },
    { label: "Partially found", count: b.partial, tone: "warn", icon: Warning },
    { label: "Can't find or understand", count: b.poor, tone: "crit", icon: Warning },
  ];
  return (
    <section className={`${CARD} flex flex-1 flex-col p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-ink">What AI engines find vs can&apos;t find</h2>
        {totalIssues !== undefined && (
          <span className="text-xs text-ink-soft">
            {totalIssues} GEO {totalIssues === 1 ? "issue" : "issues"}
          </span>
        )}
      </div>
      <ul className="my-auto space-y-3 pt-3">
        {rows.map((row) => {
          const Glyph = row.icon;
          return (
            <li key={row.label} className="grid grid-cols-[1.125rem_minmax(0,1fr)_5.5rem_3rem] items-center gap-2.5 text-sm">
              <Glyph size={18} weight={row.tone === "good" ? "fill" : "bold"} className={TONE_TEXT[row.tone]} aria-hidden="true" />
              <span className="truncate text-ink">{row.label}</span>
              <Meter value={(row.count / b.scored) * 100} tone={row.tone} />
              <span className="text-right tabular-nums text-ink-soft">
                {row.count} / {b.scored}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function HardPagesCallout({ pages }: { pages: GeoAnalysisPage[] }) {
  const poor = extractabilityBuckets(pages).poor;
  if (poor === 0) return null;
  return (
    <section className="flex items-center gap-3 rounded-lg border border-crit/20 bg-linear-to-br from-crit-soft/80 to-crit-soft/30 p-4 shadow-sm">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-crit text-white shadow-sm" aria-hidden="true">
        <WarningOctagon size={22} weight="fill" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-bold text-ink">
          {poor} {poor === 1 ? "page is" : "pages are"} hard to read
        </h2>
        <p className="text-xs text-ink-soft">They score under 50, so AI engines struggle to find or trust them.</p>
      </div>
      <a
        href="#pages"
        className={`inline-flex shrink-0 items-center gap-1 rounded-lg border border-crit/40 bg-surface px-3 py-1.5 text-sm font-semibold text-crit transition-colors hover:bg-crit-soft ${FOCUS}`}
      >
        View pages <ArrowRight size={13} weight="bold" aria-hidden="true" />
      </a>
    </section>
  );
}

const PAGE_ROWS = 8;

function PageRow({ page }: { page: GeoAnalysisPage }) {
  const score = page.extractabilityScore;
  const tone = score === null ? null : scoreTone(score);
  const href = webHref(page.url);
  const body = (
    <>
      <span className="min-w-0 flex-1 truncate text-accent-ink" title={page.url}>
        {page.shortUrl}
      </span>
      {score === null || tone === null ? (
        <span className="text-xs text-ink-soft">Not scored</span>
      ) : (
        <>
          <Meter value={score} tone={tone} className="w-16 shrink-0 sm:w-20" />
          <span className={`w-14 shrink-0 text-right text-sm font-semibold tabular-nums ${TONE_TEXT[tone]}`}>
            {score}/100
          </span>
        </>
      )}
      <CaretRight size={12} weight="bold" className="shrink-0 text-ink-soft" aria-hidden="true" />
    </>
  );
  const row = `flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm transition-colors ${FOCUS}`;
  // Through `webHref`: a crawled URL is third-party data, and only a web
  // address may reach an href.
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${row} hover:bg-surface-raised`}>
      {body}
    </a>
  ) : (
    <div className={row}>{body}</div>
  );
}

/** Every page's score; the first eight shown, the rest one click away. */
function PagesCard({ pages }: { pages: GeoAnalysisPage[] }) {
  const first = pages.slice(0, PAGE_ROWS);
  const rest = pages.slice(PAGE_ROWS);
  return (
    <section id="pages" className={`${CARD} flex scroll-mt-28 flex-col p-4 lg:col-span-2 xl:col-span-1`}>
      <h2 className="text-lg font-bold tracking-tight text-ink">Page-level analysis</h2>
      <p className="text-xs text-ink-soft">
        {pages.length} {pages.length === 1 ? "page" : "pages"} analysed · extractability
      </p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {first.map((page) => (
          <li key={page.url}>
            <PageRow page={page} />
          </li>
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="group mt-1.5">
          <summary
            className={`flex cursor-pointer list-none items-center justify-center gap-1 rounded-lg border border-border/70 px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-raised [&::-webkit-details-marker]:hidden ${FOCUS}`}
          >
            <span className="group-open:hidden">View all {pages.length} pages</span>
            <span className="hidden group-open:inline">Show fewer</span>
            <ArrowRight size={13} weight="bold" className="transition-transform group-open:-rotate-90" aria-hidden="true" />
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {rest.map((page) => (
              <li key={page.url}>
                <PageRow page={page} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 4. Quick wins
// ---------------------------------------------------------------------------

const WIN_BADGE = ["bg-crit-soft text-crit", "bg-warn-soft text-warn", "bg-warn-soft text-warn"];

export function QuickWinsCard({ signals }: { signals: GeoSignal[] }) {
  const wins = quickWins(signals, 3);
  if (wins.length === 0) return null;
  return (
    <section
      id="quick-wins"
      className={`${CARD} grid scroll-mt-28 gap-3 p-3 lg:grid-cols-[minmax(0,17rem)_repeat(3,minmax(0,1fr))] lg:items-center`}
    >
      <div className="flex items-center gap-3 px-2">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-warn-soft text-warn" aria-hidden="true">
          <Lightning size={26} weight="fill" />
        </span>
        <div>
          <h2 className="text-lg font-bold tracking-tight text-ink">Quick wins</h2>
          <p className="text-xs text-ink-soft">The fixes that reach the most pages.</p>
        </div>
      </div>
      {wins.map((win, i) => (
        <a
          key={win.title}
          href="#categories"
          className={`group flex items-center gap-3 rounded-lg border border-border/70 bg-surface px-3 py-3 transition-colors hover:bg-surface-raised ${FOCUS}`}
        >
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-full text-base font-bold ${WIN_BADGE[i] ?? WIN_BADGE[2]}`}
            aria-hidden="true"
          >
            {i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 block text-sm font-semibold leading-snug text-ink" title={win.title}>
              {win.title}
            </span>
            <span className="block truncate text-xs text-ink-soft">{win.why}</span>
          </span>
          <CaretRight size={14} weight="bold" className="shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </a>
      ))}
    </section>
  );
}

export function GeoDashboard({
  name,
  geo,
  audit,
  next,
}: {
  /** The business's name, or its website, for the headline. */
  name: string;
  geo: GeoAnalysis;
  audit: WebsiteAudit | null;
  /** The reading order's way on, set beside the hero's own actions. */
  next?: React.ReactNode;
}) {
  const pages = geo.pages ?? [];
  const signals = geo.signals ?? [];
  const subScores = geo.subScores ?? [];
  const pageCount = pages.length || signals[0]?.total || 0;
  const hasMiddle = (geo.aiBots?.length ?? 0) > 0 || pages.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <Hero name={name} pages={pageCount} score={geo.score} engines={enginesChecked(geo.aiBots ?? [])} next={next} />

      {(audit || subScores.length > 0) && (
        <div className={`grid gap-3 ${audit && subScores.length > 0 ? "xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]" : ""}`}>
          {audit && <SeverityPanel audit={audit} />}
          {subScores.length > 0 && <SubScorePanel subScores={subScores} />}
        </div>
      )}

      {/* Three columns, stretched to one height; the middle stacks its cards
          and the alert at its foot fills what is left. */}
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.95fr)]">
        {signals.length > 0 && <CategoriesCard signals={signals} />}
        {hasMiddle && (
          <div className="flex flex-col gap-3">
            {geo.aiBots && geo.aiBots.length > 0 && <CrawlerCard bots={geo.aiBots} />}
            {pages.length > 0 && <FindCard pages={pages} totalIssues={geo.totalIssues} />}
            {pages.length > 0 && <HardPagesCallout pages={pages} />}
          </div>
        )}
        {pages.length > 0 && <PagesCard pages={pages} />}
      </div>

      <QuickWinsCard signals={signals} />
    </div>
  );
}
