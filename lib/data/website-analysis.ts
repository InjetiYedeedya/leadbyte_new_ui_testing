import { cache } from "react";
import { ApiError, apiRequest } from "@/lib/api/client";
import { isRedirectError } from "@/lib/auth/session-expired";
import { absoluteUrl } from "@/lib/data/profile-display";
import { readAnalysisEnvelope } from "@/lib/data/analysis-cache";
import { analysisBelongsTo, analysisOwner } from "@/lib/data/analysis-owner";
import { getSession } from "@/lib/auth/session";
import { readJobProgress } from "@/lib/data/analysis-job";
import type { SectionFailure } from "@/lib/data/analysis-errors";
import type {
  ActionPlanCategory,
  ActionPlanMonth,
  BrandDetails,
  AiBotAccess,
  BusinessProfile,
  BotAccess,
  DetailedIssue,
  FindingSeverity,
  GeoAnalysis,
  GeoAnalysisPage,
  GeoSignal,
  KpiTarget,
  WebsiteAudit,
  WebsiteAuditFinding,
  WebsiteAuditPage,
} from "./types";
import { countOf } from "@/lib/format";

/**
 * Reads the stored website analysis and maps it onto our audit and GEO types.
 *
 * CONTRACT (backend, 2026-08-27 — second revision):
 *
 *   GET /api/website-analyze/latest        -> the last stored analysis
 *   GET /api/website-analyze/status/{job}  -> progress of a running job
 *   POST /api/website-analyze              -> 202 { job_id }, async
 *
 * All three require `Authorization: Bearer <jwt>` as well as the gateway key,
 * and the user is taken from the token — `user_id` must NOT be sent in the
 * body. The earlier synchronous, 220-second, `user_id`-in-body version is
 * gone.
 *
 * This module only READS. Triggering a fresh analysis needs the job/poll UI,
 * which is separate work.
 */

interface AnalysisPayload {
  brand_profile?: unknown;
  seo?: unknown;
  geo?: unknown;
  analyzed_at?: string;
  analysedAt?: string;
}

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Fetches the stored analysis.
 *
 * Wrapped in React `cache()`: three separate callers ask for this during one
 * page render — the audit repo, the GEO repo, and `computeStageInputs()` via
 * PageShell. Without memoisation that is three identical round trips per page.
 *
 * "No analysis yet" is the normal state for a new account, NOT an error. The
 * backend says so with a 404, so that case returns null quietly. Only genuine
 * failures — auth, timeouts, 5xx — are logged, because a stack trace for an
 * expected empty state trains people to ignore the console.
 */
export const fetchLatestAnalysis = cache(async function fetchLatestAnalysis(
  businessId: string,
  timeoutMs?: number,
): Promise<AnalysisPayload | null> {
  // Both arguments ALWAYS passed on, explicitly. React `cache()` keys on the
  // argument list, so `f(id)` and `f(id, undefined)` are two different entries
  // and each does its own round trip. That is not a micro-optimisation here:
  // when the backend times out, a duplicated read costs another full 8
  // seconds of a page that is already blank.
  return (await fetchLatestEnvelope(businessId, timeoutMs)).data;
})

/**
 * The same read with the cross-request cache stepped over.
 *
 * For the ONE caller that is asking "has it finished yet?": the `/analysing`
 * poll. A cached answer there is not merely stale, it is the wrong question
 * answered — the poll exists to notice the moment a payload appears, and a
 * remembered `null` would hold the wait screen on its last step for the whole
 * TTL while the finished analysis sat behind it. That is the bug the cache
 * would have introduced, and it looks exactly like the crawl having hung.
 *
 * Every other caller wants the cheap answer and should use
 * `fetchLatestAnalysis`.
 */
export async function fetchLatestAnalysisFresh(
  businessId: string,
  timeoutMs?: number,
): Promise<AnalysisPayload | null> {
  return (await fetchLatestEnvelope(businessId, timeoutMs, { fresh: true })).data;
}

/**
 * The same read, with the envelope kept.
 *
 * `/latest` returns `{ success, data, analyzed_at, website_url, job_id }`. Only
 * `data` is mapped onto our types, but `job_id` is the only way to reach
 * `partial_errors` — that map lives on the STATUS response, not here, and it is
 * what distinguishes "the audit step failed" from "never analysed". Fetching
 * both from one cached call keeps that at zero extra round trips.
 */
const fetchLatestEnvelope = cache(async function fetchLatestEnvelope(
  businessId: string,
  timeoutMs?: number,
  // Read by nothing inside: a fresh call passes a NEW object, which is a new
  // `cache()` key, so it skips the copy this render may already hold.
  _options: { fresh?: boolean } = {},
): Promise<{ data: AnalysisPayload | null; jobId: string | null }> {
  try {
    // The default 8s is a page-render budget. The wait screen passes more,
    // because right after a crawl this endpoint is slow to serve the payload
    // for the first time — and a timeout there reads as "not ready yet",
    // which left the screen stuck on its last step until a manual reload.
    //
    // NOT cached across requests: on Cloudflare there is no shared cache, and
    // the `unstable_cache` that used to wrap this only added copies of a big
    // reply (Error 1102, 2026-10-05 — see `analysis-cache.ts`). React
    // `cache()` above still dedupes it within one render.
    const payload = await apiRequest<unknown>("/api/website-analyze/latest", {
      method: "GET",
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    }).then(readAnalysisEnvelope);
    const data = record(payload.data);
    const jobId = payload.jobId;
    if (Object.keys(data).length === 0) return { data: null, jobId };
    // Never show one account another's business (2026-10-16): see
    // `analysis-owner.ts`. Treated exactly like "nothing analysed yet".
    const uid = (await getSession())?.userId;
    if (!analysisBelongsTo(data, uid)) {
      console.error(
        `[website-analysis] /latest for ${businessId} (uid ${uid}) returned an analysis ` +
          `owned by uid ${analysisOwner(data)} — refused. This is a backend fault.`,
      );
      return { data: null, jobId: null };
    }
    return { data: data as AnalysisPayload, jobId };
  } catch (error) {
    // Checked before the 404: a dead session must reach the login page, not
    // become the "nothing analysed yet" empty state on three screens.
    if (isRedirectError(error)) throw error;
    if (error instanceof ApiError && error.status === 404) {
      return { data: null, jobId: null }; // Nothing analysed yet. Expected.
    }
    console.error(`[website-analysis] latest fetch failed for ${businessId}:`, error);
    return { data: null, jobId: null };
  }
})

/**
 * Which sections of the stored analysis could not be produced.
 *
 * Reached through the stored job's status, because `/latest` carries the data
 * but not the `partial_errors` that explain what is missing from it. Returns []
 * for every failure of its own — a screen that cannot say WHY a section is
 * missing falls back to the plain empty state, which is the honest outcome.
 *
 * The backend's raw text is logged here and never rendered: it is an AWS
 * diagnostic (`Function not found: arn:aws:lambda:…:seo-geo-auditor`), which
 * tells a customer nothing and reads as a fault they caused.
 */
export const analysisSectionFailures = cache(async function analysisSectionFailures(
  businessId: string,
  timeoutMs?: number,
): Promise<SectionFailure[]> {
  // Same argument list as every other caller, for the cache-key reason above.
  const { jobId } = await fetchLatestEnvelope(businessId, timeoutMs);
  if (jobId === null) return [];

  // Second round trip, and it only buys an explanation for an empty screen. Not
  // worth another 8-second timeout on a backend that has already failed to
  // answer, so it is skipped unless the envelope actually arrived.
  const progress = await readJobProgress(jobId);
  const failures = progress.partialErrors ?? [];

  for (const failure of failures) {
    // `warn`, not `error`: this is the backend reporting a fault in one of its
    // own steps, which the screen already handles. As `error` it also lit up
    // Next's dev "1 issue" badge on a page that is behaving correctly.
    console.warn(
      `[website-analysis] ${businessId}: the ${failure.section} section failed — ${failure.message}`,
    );
  }
  return failures;
})

/** The backend emits critical | high | opportunity. Anything else is coerced. */
function severityOf(raw: unknown): FindingSeverity {
  const value = str(raw).toLowerCase();
  if (value === "critical" || value === "high" || value === "opportunity") return value;
  if (value === "medium" || value === "low") return value;
  return "opportunity";
}

/**
 * Derives per-category scores from the real per-page counts.
 *
 * The backend has no category breakdown of its own. These are computed as
 * "share of crawled pages without this problem" — an aggregation of real
 * numbers, not an invented score. Returns [] when nothing was crawled, so the
 * page shows no breakdown rather than a row of misleading 100s.
 */

/**
 * Reading the backend's scores, and telling a real zero from an absent one.
 *
 * ## The history, because it has flipped twice
 *
 * When these screens were built every axis came back 0 — seven independent
 * scores at exactly zero — and rendering `0/100` in red told customers their
 * site had failed everything. So every zero became null, "not scored yet".
 *
 * The auditor was restored on 2026-09-07 and now returns real numbers. On
 * go.chefgaa.com: `geoScore` 37, `crawlabilityScore` 100, `contentScore` 47,
 * `avgExtractabilityScore` 62, `avgLlmSeoScore` 60 — and `healthScore` 0.
 * That zero is NOT missing: the same payload says 22 pages crawled,
 * `pagesWithZeroIssues` 0, and all 22 pages missing canonical tags, OG tags
 * and schema. Not one clean page, so zero is the correct verdict, and hiding
 * it behind "not scored yet" throws away the finding the page exists to
 * report.
 *
 * So the rule is contextual and `score()` takes the section's other scores:
 * a zero among real numbers is a real zero; a zero among nothing but zeros is
 * still the old symptom of a calculation that did not run.
 */
/**
 * Was ANYTHING in this set scored?
 *
 * The question a zero has to answer is not "is this field zero" but "did the
 * scoring run at all", and that is a fact about the payload rather than about
 * one number. See `score()`.
 */
function anyScored(values: readonly unknown[]): boolean {
  return values.some((value) => num(value) > 0);
}

/**
 * A score, or null when nothing was scored.
 *
 * ## Why a zero is no longer automatically null
 *
 * This used to map every 0 to null, because every axis the backend sent came
 * back 0 — six independent scores at exactly zero is a calculation that does
 * not exist yet, and rendering `0/100` in red told customers their site had
 * failed everything.
 *
 * That is no longer the situation. Measured on go.chefgaa.com (2026-09-07,
 * after the auditor was restored): `healthScore` 0 beside `avgLlmSeoScore` 60,
 * `geoScore` 37, `contentScore` 47, `avgExtractabilityScore` 62. And the
 * audit's own counts explain the zero — 22 pages crawled, `pagesWithZeroIssues`
 * 0, all 22 missing canonical, OG tags AND schema. Not one clean page, so a
 * health score of zero is the CORRECT answer, and hiding it behind "not scored
 * yet" throws away a real verdict the customer needs to see.
 *
 * So `companions` carries the other scores from the same section: a zero among
 * real numbers is a real zero, and a zero among nothing but zeros is still the
 * old symptom of a calculation that did not run.
 */
function score(value: unknown, companions: readonly unknown[] = []): number | null {
  const n = num(value);
  if (n > 0) return n;
  return anyScored(companions) ? 0 : null;
}

function categoryScores(audit: Record<string, unknown>): { category: string; score: number }[] {
  const pages = num(audit.crawledPages);
  if (pages <= 0) return [];

  const pct = (bad: number) => Math.max(0, Math.round(((pages - bad) / pages) * 100));
  const checklist = record(audit.technicalChecklist);
  const technicalPassed = ["httpsSecure", "robotsTxtFound", "sitemapFound", "ga4Detected", "gtmDetected"]
    .filter((key) => checklist[key] === true).length;

  return [
    { category: "Technical setup", score: Math.round((technicalPassed / 5) * 100) },
    { category: "Page titles", score: pct(num(audit.pagesWithMissingTitle)) },
    { category: "Meta descriptions", score: pct(num(audit.pagesWithMissingDesc)) },
    { category: "Headings (H1)", score: pct(num(audit.pagesWithMissingH1)) },
    // From `pagesWithNoSchema` — a different field from GEO's
    // `pagesWithSchema`, so the two legitimately differ. Named for what it
    // measures rather than for the whole subject, which is what let a reader
    // take 100% here and 1-of-17 there as a contradiction.
    { category: "Schema coverage", score: pct(num(audit.pagesWithNoSchema)) },
    { category: "Social (OG tags)", score: pct(num(audit.pagesWithMissingOg)) },
    { category: "Canonical tags", score: pct(num(audit.pagesWithMissingCanonical)) },
    { category: "Image alt text", score: pct(num(audit.pagesWithMissingAlt)) },
  ];
}

/**
 * Placeholder values the analyzer returns instead of real data.
 *
 * CONFIRMED (BACKEND.md A8): `/api/website-analyze` answers "Unknown Business"
 * and "General" for sites with plenty of content, while `brand_profile` on the
 * same response extracts the company name correctly. Rendering a placeholder is
 * worse than rendering nothing — it looks like a wrong answer rather than a
 * missing one.
 */
const PLACEHOLDERS = new Set([
  "unknown business",
  "general",
  "unknown",
  "n/a",
  "none",
  // `perPageReport` uses these where a page simply has no such tag. Observed
  // live on leadbyte.ai, whose home page has no meta description and reported
  // the literal string "Missing".
  "missing",
  "not found",
  "not available",
]);

function meaningful(value: unknown): string {
  const text = str(value).trim();
  return PLACEHOLDERS.has(text.toLowerCase()) ? "" : text;
}

/** First value that is non-empty after placeholder filtering. */
function pick(...values: unknown[]): string {
  for (const value of values) {
    const text = meaningful(value);
    if (text !== "") return text;
  }
  return "";
}

/**
 * Maps `data.brand_profile` (+ the `seo` section) onto our BusinessProfile.
 *
 * WHY THIS EXISTS: `brand_profile` was declared on AnalysisPayload from the
 * start but never mapped, so the Business profile screen read only
 * `Leadbyte_User_Overall_Details`. A brand-new account whose analysis had
 * completed still showed "No website details yet", because the analysis does
 * not write the fields that table is read for.
 *
 * Field names are read defensively across the documented spellings. The
 * contract gives `company_name` and a nested `brand_profile.facts`, but no
 * redacted sample has ever been supplied (BACKEND.md S4) and field-name
 * guesses have caused three separate bugs here. `businessType`/`industry` are
 * only on `seo`, and are placeholder-filtered.
 */
const COLOUR_ROLES: [string, string][] = [
  ["primary", "Primary"],
  ["secondary", "Secondary"],
  ["accent", "Accent"],
  ["background", "Background"],
  ["text", "Text"],
];

/** A CSS hex, or null. Guards against the empty strings the payload contains. */
function hex(value: unknown): string | null {
  const v = str(value).trim();
  return /^#[0-9a-f]{3,8}$/i.test(v) ? v : null;
}

function brandColours(colours: Record<string, unknown>): { label: string; hex: string }[] {
  const out: { label: string; hex: string }[] = [];
  const seen = new Set<string>();
  for (const [key, label] of COLOUR_ROLES) {
    const value = hex(colours[key]);
    if (value && !seen.has(value.toLowerCase())) {
      seen.add(value.toLowerCase());
      out.push({ label, hex: value });
    }
  }
  // `dominant_visual` repeats the named roles for most sites; only a genuinely
  // new colour earns another swatch.
  const dominant = Array.isArray(colours.dominant_visual) ? colours.dominant_visual : [];
  for (const raw of dominant) {
    const value = hex(raw);
    if (value && !seen.has(value.toLowerCase())) {
      seen.add(value.toLowerCase());
      out.push({ label: "Also used", hex: value });
    }
  }
  return out;
}

function brandFonts(fonts: Record<string, unknown>): { label: string; name: string }[] {
  const out: { label: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const [key, label] of [
    ["primary", "Headings"],
    ["secondary", "Body"],
    ["button", "Buttons"],
  ] as [string, string][]) {
    const name = str(fonts[key]).trim();
    // Most sites use one family for all three; listing it once is honest.
    if (name !== "" && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      out.push({ label, name });
    }
  }
  return out;
}

function socialLinks(links: Record<string, unknown>): { platform: string; url: string }[] {
  return Object.entries(links)
    .map(([platform, url]) => ({ platform, url: str(url).trim() }))
    .filter((l) => l.url.startsWith("http"));
}

/**
 * `brand_profile.competitors`, which the backend sends as
 * `[{ name, url, reason }]`.
 *
 * `name` is required — a row with nothing to call it cannot be rendered — and
 * everything else is optional. The url goes through `absoluteUrl` because the
 * payload is not guaranteed to carry a scheme, and a scheme-less href is a
 * RELATIVE path: `bourkestreetbakery.com.au` in an anchor navigates to
 * `/overview/bourkestreetbakery.com.au` on our own site. Same bug as the
 * header chip's (fixed 2026-09-07).
 */
function competitors(value: unknown): BrandDetails["competitors"] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map((entry) => {
      const row = record(entry);
      const name = str(row.name).trim();
      const url = absoluteUrl(str(row.url).trim());
      return { name, url: url || undefined, reason: str(row.reason).trim() || undefined };
    })
    .filter((row) => {
      if (row.name === "" || seen.has(row.name.toLowerCase())) return false;
      seen.add(row.name.toLowerCase());
      return true;
    })
    .slice(0, 8);
}

function appStats(stats: Record<string, unknown>): BrandDetails["appStats"] {
  const labels: Record<string, string> = {
    google_play: "Google Play",
    app_store: "App Store",
  };
  return Object.entries(stats)
    .map(([key, raw]) => {
      const a = record(raw);
      return {
        store: labels[key] ?? key.replace(/_/g, " "),
        downloads: str(a.downloads).trim() || undefined,
        rating: str(a.rating).trim() || undefined,
        ratingsCount: str(a.ratings_count).trim() || str(a.reviews).trim() || undefined,
        url: str(a.url).trim() || undefined,
      };
    })
    .filter((a) => a.downloads || a.rating || a.ratingsCount || a.url);
}

/**
 * Everything `brand_profile` extracts beyond the name and description.
 *
 * `tagline` is deliberately NOT mapped: the scraper truncates it mid-word
 * ("Voice-fir" for zippygo.ai), so rendering it would show the customer
 * mangled text about their own brand.
 */
function brandDetails(
  root: Record<string, unknown>,
  seoRoot: Record<string, unknown>,
): BrandDetails | undefined {
  const inner = record(root.brand_profile);
  const facts = record(inner.facts);
  const inferred = record(inner.inferred);
  const contact = record(root.contact_details);

  const details: BrandDetails = {
    logo: str(facts.logo).trim() || undefined,
    colors: brandColours(record(root.colour_patterns ?? facts.colors)),
    fonts: brandFonts(record(facts.fonts)),
    keywords: strList(facts.keywords, 12),
    // The crawler's button/link detector picks up carousel arrows ("‹", "›")
    // alongside real calls to action — they read as buttons to whatever found
    // them, but they are not something a visitor is being asked to do. Pure
    // punctuation with no letter or digit in it is the honest line to drop
    // them on, without touching a real CTA that happens to open with a symbol.
    callsToAction: strList(facts.calls_to_action, 8).filter((cta) => /[\p{L}\p{N}]/u.test(cta)),
    brandValues: strList(inferred.brand_values, 8),
    brandAesthetic: str(inferred.brand_aesthetic).trim() || undefined,
    toneOfVoice: str(inferred.tone_of_voice).trim() || undefined,
    emails: strList(contact.emails, 6),
    phones: strList(contact.phones, 6),
    socialLinks: socialLinks(record(contact.social_links ?? facts.social_links)),
    images: strList(root.image_urls, 12),
    competitors: competitors(inner.competitors),
    appStats: appStats(record(inner.app_stats)),
    location: businessLocation(record(facts.business_details)),
    messaging: homepageMessaging(seoRoot),
  };

  const hasAnything = Object.values(details).some((v) =>
    Array.isArray(v) ? v.length > 0 : v !== undefined,
  );
  return hasAnything ? details : undefined;
}

export function mapBrandProfile(
  businessId: string,
  brandProfile: unknown,
  seo: unknown,
): BusinessProfile | null {
  const root = record(brandProfile);
  const seoRoot = record(seo);
  if (Object.keys(root).length === 0 && Object.keys(seoRoot).length === 0) return null;

  // The payload nests a second `brand_profile` inside the first.
  const inner = record(root.brand_profile);
  const facts = record(inner.facts);
  const inferred = record(inner.inferred);

  const businessName = pick(root.company_name, root.companyName, seoRoot.businessName);
  const businessType = pick(seoRoot.businessType, root.business_type, root.businessType);
  const industry = pick(seoRoot.industry, root.industry, inferred.industry);
  const description = pick(
    facts.business_overview,
    facts.businessOverview,
    root.description,
    inferred.description,
  );
  const websiteUrl = pick(root.website_url, root.websiteUrl, seoRoot.websiteUrl);

  const brand = brandDetails(root, seoRoot);
  if (
    businessName === "" &&
    businessType === "" &&
    industry === "" &&
    description === "" &&
    brand === undefined
  ) {
    return null;
  }

  return {
    businessId,
    businessName,
    businessType,
    industry,
    websiteUrl,
    description,
    // Scores belong to the audit and GEO sections, not here.
    websiteAuditScore: 0,
    geoVisibilityScore: 0,
    brand,
  };
}


/**
 * Where the business says it is, from `facts.business_details`.
 *
 * Returns undefined rather than an empty object when nothing is listed. That
 * distinction is the whole point: the card renders on this being PRESENT, and
 * an empty object would put a "Location" heading above nothing on every
 * online-only business — which is most of them. A SaaS with no premises has
 * no address, and that is a correct answer, not a failed read.
 *
 * Opening hours are kept verbatim. Sites write them a dozen ways ("Mon-Fri
 * 9-6", "24/7", "By appointment"), and a parser would turn the ones it did
 * not recognise into blanks.
 */
function businessLocation(details: Record<string, unknown>): BrandDetails["location"] {
  const addresses = strList(details.location ?? details.addresses, 4);
  const hours = strList(details.business_hours ?? details.businessHours, 8);
  const mapLinks = strList(details.map_links ?? details.mapLinks, 4);

  if (addresses.length === 0 && hours.length === 0 && mapLinks.length === 0) return undefined;

  return {
    addresses: addresses.length > 0 ? addresses : undefined,
    hours: hours.length > 0 ? hours : undefined,
    mapLinks: mapLinks.length > 0 ? mapLinks : undefined,
  };
}

/**
 * The headline and search description the HOMEPAGE leads with.
 *
 * Picking the right page is the entire difficulty. `perPageReport` is every
 * crawled URL in crawl order, so the first entry is whatever the crawler
 * reached first — on a real site that is as likely to be `/pricing` as the
 * home page, and a subpage's H1 shown as "your messaging" is a confident
 * wrong answer the customer cannot tell from a right one.
 *
 * So: the page the LLM report labels `Homepage`, else the SHORTEST url, which
 * is the site root by construction rather than by guess. Neither exists on an
 * empty crawl, and then there is no card.
 */
function homepageMessaging(seoRoot: Record<string, unknown>): BrandDetails["messaging"] {
  const pages = Array.isArray(seoRoot.perPageReport)
    ? (seoRoot.perPageReport as unknown[]).map(record)
    : [];
  if (pages.length === 0) return undefined;

  const labelled = pages.find((page) => str(record(page.llmReport).pageType).toLowerCase() === "homepage");
  const home =
    labelled ??
    [...pages].sort((a, b) => str(a.url).length - str(b.url).length)[0] ??
    pages[0]!;

  const lines: { kind: string; text: string }[] = [];
  const h1 = readable(strList(home.h1Tags, 1)[0]);
  if (h1) lines.push({ kind: "H1", text: h1 });
  const description = readable(home.description);
  if (description) lines.push({ kind: "Meta", text: description });

  return lines.length > 0 ? lines : undefined;
}

/**
 * A line fit to show a customer, or "".
 *
 * Two ways the crawl produces text that is worse than nothing:
 *
 * - **A sentinel.** A page with no meta description reports the literal string
 *   "Missing", and rendered that says the description IS the word "Missing".
 *   `meaningful` already owns that list.
 * - **Words run together.** leadbyte.ai's "Automate. Optimize. Outgrow." came
 *   back as "automateoptimizeoutgrow,". A real headline has spaces in it, so a
 *   long unbroken run is extraction damage, not a title. Twenty characters is
 *   the cut: it clears ordinary single-word headings ("Pricing", "About") and
 *   catches the concatenations, and erring towards dropping is right here —
 *   this card claims to show the customer their own words.
 */
function readable(value: unknown): string {
  const text = meaningful(value);
  if (text.length > 20 && !/\s/.test(text)) return "";
  return text;
}

/** String array, filtered to entries that actually say something. */
function strList(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((v) => str(v).trim())
        .filter((v) => v.length > 0),
    ),
  ).slice(0, limit);
}

/**
 * Human labels for `siteWideAudit.technicalChecklist`.
 *
 * The backend sends raw camelCase keys. Anything it adds later still renders,
 * de-camelised, rather than being silently dropped.
 */
const TECHNICAL_LABELS: Record<string, string> = {
  httpsSecure: "HTTPS",
  robotsTxtFound: "robots.txt",
  ga4Detected: "Google Analytics 4",
  gtmDetected: "Tag Manager",
  sitemapFound: "Sitemap",
};

function technicalChecks(audit: Record<string, unknown>): { label: string; pass: boolean }[] {
  const list = record(audit.technicalChecklist);
  return Object.entries(list).map(([key, value]) => ({
    label: TECHNICAL_LABELS[key] ?? key.replace(/([A-Z])/g, " $1").toLowerCase(),
    pass: value === true,
  }));
}

/**
 * `detailedIssues` entries are OBJECTS, not strings — `{ issue, severity,
 * whyItMatters, howToFix }`. Reading them with a string helper silently yields
 * nothing, which is why this needs its own mapper.
 */
function detailedIssues(value: unknown): DetailedIssue[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const d = record(raw);
      return {
        issue: str(d.issue).trim(),
        severity: severityOf(d.severity),
        whyItMatters: str(d.whyItMatters).trim(),
        howToFix: str(d.howToFix).trim(),
      };
    })
    .filter((d) => d.issue !== "");
}

/**
 * A month's tasks, gathered under each category heading.
 *
 * ## Why this exists
 *
 * The backend's plan is a flat list of tasks and `category` is a LABEL on each
 * one, not an identity — month 1 of a live plan carries two tasks both headed
 * "On-page SEO":
 *
 *     On-page SEO · P1 · Week 1 — Add missing meta descriptions for all pages
 *     On-page SEO · P1 · Week 2 — Implement Open Graph tags
 *
 * Rendered straight, that is the same heading twice with no explanation, which
 * reads as a rendering fault. React said so too: keyed on `category`, the two
 * collided and it warned about duplicate keys.
 *
 * Merging them would be the wrong fix. They are two scheduled pieces of work
 * with different timeframes, and flattening them into one would lose a week of
 * sequencing — the thing the plan is FOR. So the heading appears once and its
 * tasks sit beneath it, each keeping its own priority and timeframe.
 *
 * Insertion order is preserved, for both groups and the tasks inside them: the
 * backend sequences the plan and sorting it here would be overriding that.
 */
export interface PlanGroup {
  category: string;
  tasks: ActionPlanCategory[];
}

export function groupPlanCategories(categories: ActionPlanCategory[]): PlanGroup[] {
  const groups: PlanGroup[] = [];

  for (const task of categories) {
    // An untitled task keeps its own group rather than joining a "" bucket
    // with every other untitled one.
    const existing = task.category === "" ? undefined : groups.find((g) => g.category === task.category);
    if (existing === undefined) groups.push({ category: task.category, tasks: [task] });
    else existing.tasks.push(task);
  }

  return groups;
}

/** Maps `siteSynthesis.actionPlan` — the backend's own 30/60/90 plan. */
function actionPlan(value: unknown): ActionPlanMonth[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const m = record(raw);
      const categories = (Array.isArray(m.categories) ? m.categories : [])
        .map((c) => {
          const cat = record(c);
          return {
            category: str(cat.category).trim(),
            goal: str(cat.goal).trim(),
            actions: strList(cat.actions),
            priority: str(cat.priority).trim(),
            timeframe: str(cat.timeframe).trim(),
          };
        })
        .filter((c) => c.category !== "" || c.actions.length > 0);

      return {
        month: num(m.month),
        title: str(m.monthTitle).trim(),
        subtitle: str(m.monthSubtitle).trim(),
        categories,
      };
    })
    .filter((m) => m.categories.length > 0 || m.title !== "");
}

/**
 * The KPI table, minus the health score.
 *
 * The backend sends a `Health Score` row (`0% -> 30% -> 75%`), and we were
 * asked to stop showing that metric. Dropping it from the headline tile but
 * leaving it in this table would put the same discarded number back on the
 * same screen, four rows down — and the customer would reasonably ask which
 * of the two we meant. Not shown means not shown anywhere.
 */
function kpiTargets(value: unknown): KpiTarget[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const k = record(raw);
      return {
        kpi: str(k.kpi).trim(),
        current: str(k.current).trim(),
        month1: str(k.month1).trim(),
        month3: str(k.month3).trim(),
        tool: str(k.tool).trim(),
      };
    })
    .filter((k) => k.kpi !== "" && !/health\s*score/i.test(k.kpi));
}

/**
 * Maps one entry of `perPageReport` (falling back to `allPageDetails`, which
 * carries the same LLM report under different key names for the basics).
 */
function mapAuditPage(raw: unknown): WebsiteAuditPage | null {
  const page = record(raw);
  const url = str(page.url) || str(page.pageUrl);
  if (url === "") return null;

  const llm = record(page.llmReport);

  return {
    url,
    shortUrl: str(page.shortUrl) || url,
    title: str(page.title) || str(page.metaTitle),
    description: str(page.description) || str(page.metaDesc),
    issueCount: num(page.issueCount),
    issues: strList(page.issues),
    status: str(page.status),
    seoScore: typeof llm.seoScore === "number" ? llm.seoScore : undefined,
    pageType: str(llm.pageType) || undefined,
    contentQuality: str(llm.contentQuality) || undefined,
    strengths: strList(llm.strengths),
    recommendedTitle: str(llm.recommendedTitle) || undefined,
    recommendedMetaDescription: str(llm.recommendedMetaDescription) || undefined,
    targetKeywords: strList(llm.targetKeywords),
    priorityActions: strList(llm.priorityActions),
    detailedIssues: detailedIssues(llm.detailedIssues),
  };
}

export function mapWebsiteAudit(
  businessId: string,
  seo: unknown,
  analysedAt?: string,
): WebsiteAudit | null {
  const root = record(seo);
  if (Object.keys(root).length === 0) return null;

  const audit = record(root.siteWideAudit);
  const synthesis = record(root.siteSynthesis);
  const rawFindings = Array.isArray(synthesis.keyFindings) ? synthesis.keyFindings : [];

  const findings: WebsiteAuditFinding[] = rawFindings.map((raw, i) => {
    const f = record(raw);
    return {
      id: `f${i}`,
      severity: severityOf(f.severity),
      title: str(f.title) || "Untitled finding",
      category: "Site-wide",
      // The backend reports findings at site level, not per page, so an
      // affected-page count would be fabricated. 0 means "not reported".
      affectedPages: 0,
      detail: str(f.text) || undefined,
    };
  });

  const severityCount = (severity: FindingSeverity) =>
    findings.filter((f) => f.severity === severity).length;

  return {
    businessId,
    // `avgLlmSeoScore`, NOT `healthScore`. The backend asked us to stop showing
    // the health score (2026-09-07) and the payload shows why: on
    // go.chefgaa.com it is 0 while every page has a perfect title, meta
    // description, H1, alt text and viewport — all 101 issues sit in three
    // categories (no canonical, no OG, no schema). A single number that reads
    // 0 for a site that is largely well-built is not a verdict anyone can act
    // on. `avgLlmSeoScore` is the quality rating the auditor actually computes
    // per page — 61 on the same site — and it is what this tile now shows.
    score: score(audit.avgLlmSeoScore),
    pagesCrawled: num(audit.crawledPages),
    totalIssues: num(audit.totalIssuesFound),
    criticalCount: severityCount("critical"),
    highCount: severityCount("high"),
    mediumCount: severityCount("medium"),
    lowCount: severityCount("low"),
    categoryScores: categoryScores(audit),
    findings,
    technicalChecks: technicalChecks(audit),
    actionPlan: actionPlan(synthesis.actionPlan),
    kpiTargets: kpiTargets(audit.kpiTargets),
    quickWin: (() => {
      const win = record(synthesis.quickWin);
      const title = str(win.title).trim();
      const text = str(win.text).trim();
      return title !== "" || text !== "" ? { title, text } : undefined;
    })(),
    pages: (Array.isArray(root.perPageReport) && root.perPageReport.length > 0
      ? root.perPageReport
      : Array.isArray(root.allPageDetails)
        ? root.allPageDetails
        : []
    )
      .map(mapAuditPage)
      .filter((p): p is WebsiteAuditPage => p !== null),
    analysedAt,
  };
}

/**
 * CONFIRMED by the backend team 2026-08-28: `aiBotStatus` values are
 * `allowed` and `"not specified"`, and probably `blocked`.
 *
 * `"not specified"` means robots.txt is silent about that crawler — which by
 * the robots convention means it MAY crawl. It is reported as `unknown` rather
 * than folded into either extreme, so the UI never claims a block that has not
 * been established.
 */
function toBotAccess(raw: unknown): BotAccess {
  const value = str(raw).toLowerCase().trim();
  if (value === "allowed") return "allowed";
  if (value === "blocked" || value === "disallowed" || value === "denied") return "blocked";
  return "unknown";
}

function botAccess(raw: unknown): AiBotAccess[] {
  const bots = record(raw);
  return Object.entries(bots).map(([bot, status]) => ({ bot, access: toBotAccess(status) }));
}


/**
 * The per-page GEO signals, in a fixed, grouped order.
 *
 * ## Why these exist as their own thing
 *
 * `geoWideAudit` carries eleven per-page counts that explain the four scores,
 * and the page rendered none of them: "entity clarity 0" with no indication
 * that it means no schema, no knowledge-graph markup and no linked social
 * profiles. A score without its evidence is not actionable.
 *
 * ## Two rules
 *
 * - **Absent is not zero.** A key the payload never sent is omitted, because
 *   "0 of 22" for something never measured invents a failing grade. `num()`
 *   would turn a missing key into 0, so presence is checked first.
 * - **No pages crawled means no signals.** Every one of these is "N of the
 *   pages we crawled"; with no denominator the fraction is a lie.
 *
 * The order is fixed rather than sorted by score: it groups causes under the
 * axis they belong to, which is how someone fixing the site would read it.
 */
const GEO_SIGNALS: { key: string; label: string; group: GeoSignal["group"] }[] = [
  { key: "pagesWithQuestionHeadings", label: "Questions as headings", group: "Structure" },
  { key: "pagesWithEarlyAnswer", label: "Answer near the top", group: "Structure" },
  // Was "Any structured data", which read as the broad claim and contradicted
  // the Website Audit's own Structured data score on the same account — 1 of 17
  // beside 100%, with Entity and Knowledge-graph markup at 17 of 17 underneath.
  // They are four different backend fields: this one is `geoWideAudit
  // .pagesWithSchema`, the audit's is `websiteAudit.pagesWithNoSchema`. Naming
  // this one "any" made a narrower count claim the wider ground.
  { key: "pagesWithSchema", label: "Schema.org markup", group: "Markup" },
  { key: "pagesWithFaqSchema", label: "FAQ or Article schema", group: "Markup" },
  { key: "pagesWithEntityMarkup", label: "Entity markup", group: "Markup" },
  { key: "pagesWithKnowledgeGraph", label: "Knowledge-graph markup", group: "Markup" },
  { key: "pagesWithAuthor", label: "Author named", group: "Trust & authorship" },
  { key: "pagesWithPublishedDate", label: "Published date", group: "Trust & authorship" },
  { key: "pagesWithOutboundCitations", label: "Cites its sources", group: "Trust & authorship" },
  { key: "pagesWithSocialProfiles", label: "Social profiles linked", group: "Trust & authorship" },
  { key: "pagesWithEditorialPolicy", label: "Editorial policy", group: "Trust & authorship" },
  { key: "pagesWithEeatDepth", label: "Experience & expertise depth", group: "Trust & authorship" },
];

function geoSignals(audit: Record<string, unknown>, total: number): GeoSignal[] {
  if (total <= 0) return [];

  return GEO_SIGNALS.flatMap(({ key, label, group }) => {
    const raw = audit[key];
    // Presence first: `num(undefined)` is 0, which would report a signal the
    // auditor never looked at as a total failure.
    if (typeof raw !== "number" || !Number.isFinite(raw)) return [];
    return [{ label, pages: Math.max(0, Math.round(raw)), total, group }];
  });
}

/** Every GEO score in the section: a 0 among real numbers is a real 0. */
function geoCompanions(audit: Record<string, unknown>): unknown[] {
  return [
    audit.geoScore,
    audit.crawlabilityScore,
    audit.entityScore,
    audit.contentScore,
    audit.trustScore,
    audit.avgExtractabilityScore,
  ];
}

/** Maps one entry of `geoPerPageReport`. */
function mapGeoPage(raw: unknown, companions: readonly unknown[] = []): GeoAnalysisPage | null {
  const page = record(raw);
  const url = str(page.url);
  if (url === "") return null;

  const llm = record(page.geoLlmReport);

  return {
    url,
    shortUrl: str(page.shortUrl) || url,
    extractabilityScore: score(page.extractabilityScore, companions),
    geoIssueCount: num(page.geoIssueCount),
    geoIssues: strList(page.geoIssues),
    status: str(page.status),
    geoScore: typeof llm.geoScore === "number" ? llm.geoScore : undefined,
    citationReadiness: str(llm.citationReadiness) || undefined,
    missingSignals: strList(llm.missingSignals, 15),
    suggestedAnswerSnippet: str(llm.suggestedAnswerSnippet) || undefined,
    suggestedFaqSchema: str(llm.suggestedFaqSchema) || undefined,
    priorityActions: strList(llm.priorityActions),
  };
}

export function mapGeoAnalysis(
  businessId: string,
  geo: unknown,
  analysedAt?: string,
): GeoAnalysis | null {
  const root = record(geo);
  if (Object.keys(root).length === 0) return null;

  const audit = record(root.geoWideAudit);
  const bots = botAccess(audit.aiBotStatus);
  const blocked = bots.filter((b) => b.access === "blocked");
  const allowed = bots.filter((b) => b.access === "allowed");
  const pages = num(audit.crawledPages);

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  // Only claim "all allowed" when every crawler is explicitly allowed.
  if (bots.length > 0 && allowed.length === bots.length) {
    strengths.push(`All ${bots.length} AI crawlers are allowed in robots.txt.`);
  }
  if (blocked.length > 0) {
    weaknesses.push(`Blocked in robots.txt: ${blocked.map((b) => b.bot).join(", ")}.`);
  }
  if (audit.llmsTxtFound === true) strengths.push("An llms.txt file is published.");
  else weaknesses.push("No llms.txt file — AI crawlers have no guidance file to read.");

  if (pages > 0) {
    const withSchema = num(audit.pagesWithSchema);
    if (withSchema < pages) {
      // "no structured data" was the broad claim again, on a page that lists
      // Entity and Knowledge-graph markup as present directly above it. Same
      // field as the signal row, so it now says the same narrow thing.
      weaknesses.push(
        `${pages - withSchema} of ${countOf(pages, "page")} have no Schema.org markup.`,
      );
    }
    const withAuthor = num(audit.pagesWithAuthor);
    if (withAuthor < pages) {
      weaknesses.push(
        `${pages - withAuthor} of ${countOf(pages, "page")} have no author attribution.`,
      );
    }
  }

  // `issueRanking` is a newline-separated summary the backend already ranks.
  const opportunities = str(audit.issueRanking)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 6);

  return {
    businessId,
    // NOT through `score()`: the GEO axis is computed, so a real 0 is a real
    // verdict and must be shown as one.
    // Same contextual rule as the audit's health score: a 0 beside real
    // sub-scores is a real 0 (a site that blocks every AI crawler earns one),
    // a 0 beside nothing but zeros means the scoring did not run.
    signals: geoSignals(audit, pages),
    ...(typeof audit.totalGeoIssues === "number" && Number.isFinite(audit.totalGeoIssues)
      ? { totalIssues: Math.max(0, Math.round(audit.totalGeoIssues)) }
      : {}),
    score: score(audit.geoScore, [
      audit.crawlabilityScore,
      audit.entityScore,
      audit.contentScore,
      audit.trustScore,
      audit.avgExtractabilityScore,
    ]),
    // Deliberately empty: the backend measures readability, not citations.
    engineCoverage: [],
    // Through `score()` like the headline beside them: they went through
    // `num()`, so an unscored audit read "not scored yet" in the headline
    // with four "0/100" tiles next to it (audit, 2026-09-29).
    subScores: [
      { label: "Crawlability", score: score(audit.crawlabilityScore, geoCompanions(audit)) },
      { label: "Entity clarity", score: score(audit.entityScore, geoCompanions(audit)) },
      { label: "Content", score: score(audit.contentScore, geoCompanions(audit)) },
      { label: "Trust", score: score(audit.trustScore, geoCompanions(audit)) },
    ],
    aiBots: bots,
    llmsTxtFound: audit.llmsTxtFound === true,
    strengths,
    weaknesses,
    opportunities,
    // Only a confirmed block is a risk. An unlisted crawler is not.
    risks: blocked.length > 0 ? ["Blocked crawlers cannot cite you at all."] : [],
    pages: (Array.isArray(root.geoPerPageReport) ? root.geoPerPageReport : [])
      .map((page) => mapGeoPage(page, geoCompanions(audit)))
      .filter((p): p is GeoAnalysisPage => p !== null),
    analysedAt,
  };
}

/** The timestamp the backend reports for a stored analysis, if any. */
export function analysedAtOf(payload: AnalysisPayload): string | undefined {
  return payload.analyzed_at ?? payload.analysedAt;
}
