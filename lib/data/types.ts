export interface BusinessProfile {
  businessId: string;
  businessName: string;
  businessType: string;
  industry: string;
  websiteUrl: string;
  description: string;
  websiteAuditScore: number;
  geoVisibilityScore: number;
  /** Extracted brand identity. Absent in mock mode. */
  brand?: BrandDetails;
}

/**
 * `opportunity` is not a severity we invented — it is what the backend's
 * `siteSynthesis.keyFindings[].severity` actually emits, alongside `critical`
 * and `high`. `medium`/`low` are kept for the mock fixtures.
 */
export type FindingSeverity = "critical" | "high" | "medium" | "low" | "opportunity";

export interface WebsiteAuditFinding {
  id: string;
  severity: FindingSeverity;
  title: string;
  category: string;
  affectedPages: number;
  /** The backend's explanatory sentence, where one exists. */
  detail?: string;
}

export interface WebsiteAudit {
  businessId: string;
  /** Null when the backend has not computed one — see `website-analysis.ts`. */
  score: number | null;
  /**
   * Pages actually crawled. The backend has no notion of a fixed check count,
   * so this replaces the mock's invented "142 checks".
   */
  pagesCrawled: number;
  totalIssues: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  categoryScores: { category: string; score: number }[];
  findings: WebsiteAuditFinding[];
  /**
   * Five technical signals the backend reports as plain booleans. Rendered as
   * pass/fail rather than folded into the score, because each one is a
   * different job for a different person.
   */
  technicalChecks?: { label: string; pass: boolean }[];
  /** The single highest-leverage fix, written by the backend. */
  quickWin?: { title: string; text: string };
  /** The backend's own 30/60/90 plan. */
  actionPlan?: ActionPlanMonth[];
  /** Measurable targets per KPI, with the tool that measures each. */
  kpiTargets?: KpiTarget[];
  /**
   * Per-URL detail, including the LLM-written recommendations. One entry per
   * crawled page. Both sampled sites crawled a single page, so this is
   * currently the site report — but it is an array by contract.
   */
  pages?: WebsiteAuditPage[];
  /** ISO timestamp of the analysis, when the backend reports one. */
  analysedAt?: string;
}

/** One crawled URL, with the analyzer's written recommendations for it. */
export interface WebsiteAuditPage {
  url: string;
  shortUrl: string;
  title: string;
  description: string;
  issueCount: number;
  issues: string[];
  status: string;
  /**
   * The analyzer's LLM report. This is the highest-value payload in the whole
   * response and went unrendered until 2026-09-02.
   */
  seoScore?: number;
  pageType?: string;
  contentQuality?: string;
  strengths?: string[];
  recommendedTitle?: string;
  recommendedMetaDescription?: string;
  targetKeywords?: string[];
  priorityActions?: string[];
  /**
   * The analyzer's per-issue explanation. Objects, NOT strings — each carries
   * why the issue matters and how to fix it, which is the most actionable
   * content in the whole payload.
   */
  detailedIssues?: DetailedIssue[];
}

export interface DetailedIssue {
  issue: string;
  severity: FindingSeverity;
  whyItMatters: string;
  howToFix: string;
}

/** One month of the backend's 30/60/90 plan. */
export interface ActionPlanMonth {
  month: number;
  title: string;
  subtitle: string;
  categories: ActionPlanCategory[];
}

export interface ActionPlanCategory {
  category: string;
  goal: string;
  actions: string[];
  /** "P1" | "P2" as sent; kept as a string so a new tier still renders. */
  priority: string;
  timeframe: string;
}

/** One row of the backend's KPI target table. */
export interface KpiTarget {
  kpi: string;
  current: string;
  month1: string;
  month3: string;
  tool: string;
}

/**
 * Everything `brand_profile` extracts beyond a name and a description.
 *
 * All optional: the analyzer returns what it can find, and a field it could not
 * find comes back empty rather than absent. Empties are stripped at map time so
 * the page can branch on presence.
 */
export interface BrandDetails {
  logo?: string;
  colors?: { label: string; hex: string }[];
  fonts?: { label: string; name: string }[];
  keywords?: string[];
  /**
   * `calls_to_action` — the buttons and links the site asks visitors to press.
   *
   * This used to be called `commonQuestions`, on the assumption that a site's
   * CTAs are in practice its FAQ questions. They are not: a real account
   * returned `‹`, `›` and `Subscribe` — carousel arrows and a mailing-list
   * button. The name is now the field's own, so nothing downstream can go on
   * treating them as questions.
   */
  callsToAction?: string[];
  brandValues?: string[];
  brandAesthetic?: string;
  toneOfVoice?: string;
  emails?: string[];
  phones?: string[];
  socialLinks?: { platform: string; url: string }[];
  /** Images the crawler captured, already mirrored to S3 by the backend. */
  images?: string[];
  /**
   * `brand_profile.competitors` — who the analysis thinks you are up against.
   *
   * The backend sends `{ name, url, reason }`. `name` is the only part that
   * has to be there: a competitor with no link is still worth naming, and a
   * `reason` the model left blank is not worth inventing one for.
   */
  competitors?: { name: string; url?: string; reason?: string }[];
  appStats?: {
    store: string;
    downloads?: string;
    rating?: string;
    ratingsCount?: string;
    url?: string;
  }[];
  /**
   * `brand_profile.facts.business_details` — where the business says it is.
   *
   * Every part is optional and routinely empty: a SaaS with no premises lists
   * no address and no opening hours, and that is a correct answer rather than
   * a failed read. The card is only rendered when something here is present,
   * so an online-only business is not shown a row of blanks about its offices.
   */
  location?: {
    /** Postal addresses, as written on the site. */
    addresses?: string[];
    /** Opening hours, verbatim — formats vary far too much to parse. */
    hours?: string[];
    /** Google Maps (and similar) links the crawler found. */
    mapLinks?: string[];
  };
  /**
   * The lines the site leads with — its own headline and search description.
   *
   * Taken from the HOMEPAGE's crawl entry, not from whichever page happened to
   * come back first: a subpage's H1 presented as "your messaging" would be
   * wrong in a way the customer cannot tell from the screen.
   *
   * `kind` is the label shown beside the line ("H1", "Meta description"), and
   * it is a short word rather than an enum because the set grows with whatever
   * the crawl reports.
   */
  messaging?: { kind: string; text: string }[];
}

export interface GeoEngineCoverage {
  engine: string;
  cited: number;
  outOf: number;
}

/**
 * One AI crawler's access, read from robots.txt by the backend.
 *
 * THREE states, not two. The backend emits `"not specified"` when robots.txt
 * simply doesn't mention that crawler — which is not the same as blocking it.
 * Collapsing that into a boolean told customers a crawler was blocked when
 * nothing of the kind had been established.
 */
export type BotAccess = "allowed" | "blocked" | "unknown";

export interface AiBotAccess {
  bot: string;
  access: BotAccess;
}

export interface GeoAnalysis {
  businessId: string;
  /** Null when the backend has not computed one — see `website-analysis.ts`. */
  score: number | null;
  /**
   * Per-engine CITATION counts. The live backend does not measure this — it
   * measures readability instead (see `subScores`/`aiBots`). This stays in the
   * type for the mock fixtures and is empty in live mode; the page hides the
   * block rather than showing zeros we cannot substantiate.
   */
  engineCoverage: GeoEngineCoverage[];
  /** Live readiness breakdown: can AI engines read and trust this site. */
  /** null = not scored yet (see `score()` in website-analysis.ts). */
  subScores?: { label: string; score: number | null }[];
  /**
   * The per-page counts BEHIND the scores.
   *
   * `subScores` says "content 47"; these say why — 14 of 22 pages use question
   * headings, none name an author, none carry FAQ schema. The backend has sent
   * them all along and the page showed none of them, which left four numbers
   * with nothing to act on.
   *
   * Only signals the payload actually measured appear: absent is not zero, and
   * "0 of 22" for something never checked invents a failing grade.
   */
  signals?: GeoSignal[];
  /** `totalGeoIssues` — 225 on a site with 101 SEO issues. Its own headline. */
  totalIssues?: number;
  aiBots?: AiBotAccess[];
  llmsTxtFound?: boolean;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  risks: string[];
  /** Per-URL GEO detail, including the analyzer's written citation guidance. */
  pages?: GeoAnalysisPage[];
  analysedAt?: string;
}

/** One crawled URL, with the analyzer's citation-readiness guidance. */
/** One measured GEO signal: how many crawled pages carry it. */
export interface GeoSignal {
  label: string;
  pages: number;
  total: number;
  /** Which of the four scores this one feeds. */
  group: "Structure" | "Markup" | "Trust & authorship";
}

export interface GeoAnalysisPage {
  url: string;
  shortUrl: string;
  /** null = not scored yet. */
  extractabilityScore: number | null;
  geoIssueCount: number;
  geoIssues: string[];
  status: string;
  /** The LLM-written report. Unrendered until 2026-09-02. */
  geoScore?: number;
  citationReadiness?: string;
  missingSignals?: string[];
  /** A paragraph the site could publish so engines have something to quote. */
  suggestedAnswerSnippet?: string;
  /** Ready-to-paste JSON-LD. Rendered verbatim, never interpolated. */
  suggestedFaqSchema?: string;
  priorityActions?: string[];
}

export interface ConnectionsState {
  businessId: string;
  googleAnalyticsConnected: boolean;
  skipped: boolean;
}

export interface AdPlatformSummary {
  platform: "google" | "meta" | "linkedin";
  label: string;
  connected: boolean;
  detail: string;
}

export interface AdvertisingData {
  businessId: string;
  platforms: AdPlatformSummary[];
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  cpc: string;
  conversions: number;
  /** Already formatted, and "—" when there were no conversions to divide by. */
  cpa: string;
  /** No backend field for this yet; null means "no target set". */
  targetCpa: number | null;
  roas: string;
}

export interface StrategyAnswers {
  primaryGoal: string | null;
  monthlyBudget: string | null;
  growthTarget: string | null;
}

export interface StrategyRecommendation {
  title: string;
  why: string;
  evidence: string;
  expectedImpact: string;
}

export interface Strategy {
  businessId: string;
  answers: StrategyAnswers;
  generated: boolean;
  headline?: string;
  executiveSummary?: string;
  recommendations?: StrategyRecommendation[];
}

export type AgentStatus = "ready" | "needs-setup" | "blocked" | "recommended";

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  whyThisAgent: string;
  /**
   * What the agent does for the customer, each as a short heading and a
   * sentence, shown under "Why this agent". Optional: only agents with
   * approved copy carry them (Meta Ads, LBS-1255).
   */
  benefits?: readonly { title: string; body: string }[];
}

export interface AgentRunLogEntry {
  time: string;
  title: string;
  detail: string;
  tag: string;
}

export interface AgentRun {
  runId: string;
  date: string;
  entries: AgentRunLogEntry[];
}

export interface AgentState {
  agentId: string;
  status: AgentStatus;
  blockedReason?: string;
  runs: AgentRun[];
}

export interface ReportSummary {
  id: string;
  title: string;
  pages: number;
  note: string;
}
