import { cache } from "react";
import { isBackendConfigured } from "@/lib/api/config";
import { readTables, type SourceOutcome } from "@/lib/api/read-cascade";
import { getLeadActivity, type LeadActivity } from "@/lib/data/lead-qualification";

/**
 * What each agent has actually DONE, read from the dashboard tables.
 *
 * The agents screen listed every agent and its setup state and nothing about
 * how any of them was performing. The previous site had that — a dashboard
 * reading per-agent tables out of DynamoDB — and this is those sections,
 * mapped onto the tables named in the dashboard integration guide.
 *
 * ## Why there is no new API client
 *
 * The guide's read pattern — query by email, fall back to a scan when the
 * table has `email` as a plain attribute rather than its key — is already
 * `readTable()` in `lib/api/read-cascade.ts`, against the same base URL. The
 * only thing missing was the table-to-section mapping.
 *
 * ## Why every section carries a `SourceOutcome`
 *
 * The guide's own rule: a table can come back empty because the customer has
 * not run that agent yet, OR because the read failed. Those need different
 * words on screen, so `ok` travels with the rows instead of being flattened
 * into "no data". An empty state has to be earned.
 *
 * ## Where the rest of the dashboard lives
 *
 * This module is now only what the On-Page SEO tab reads, plus the mappers
 * other tabs reuse (`mapCompetitors`). The tabbed dashboard (2026-09-30,
 * `lib/data/dashboard/`, `components/agents/dashboard/`) gives every other tab
 * its own reader. The Meta and Google Ads tabs read the SAME `connected-data`
 * bundle as the Performance screens, never a second copy of the tables, so
 * the two screens cannot disagree about a campaign's numbers.
 */

/** Agents that have a dashboard. Anything else shows nothing rather than a guess. */
export const DASHBOARD_AGENT_IDS = [
  "lead-qualification",
  "social-media",
  "on-page-seo",
  "off-page-seo",
] as const;

export type DashboardAgentId = (typeof DASHBOARD_AGENT_IDS)[number];

export function isDashboardAgent(id: string): id is DashboardAgentId {
  return (DASHBOARD_AGENT_IDS as readonly string[]).includes(id);
}

/**
 * The tables each agent's dashboard reads.
 *
 * Names are the guide's, verbatim, including the inconsistent casing — these
 * are raw DynamoDB table names, not an alias map, so `Facebook_Analytics` and
 * `social_media_twitter` really are spelled differently.
 */
export const AGENT_TABLES: Record<DashboardAgentId, readonly string[]> = {
  "lead-qualification": ["lead_qualification"],
  "social-media": [
    "Facebook_Analytics",
    "Instagram_analytics",
    "social_media_twitter",
    "Youtube_analytics",
  ],
  "on-page-seo": ["keywo_details"],
  /**
   * `off_page_seo` is NOT here, and that is not an oversight.
   *
   * Its partition key `email` is the OUTREACH TARGET's address
   * (`media@ibm.com`), not the account's — the account is a non-key attribute
   * called `user_email`. So every route this app can call
   * (`/api/query|scan/{table}/{accountEmail}`) matches nothing, and measured
   * against a live account both return 0 rows while the table holds 96.
   *
   * Reading it needs a scan filtered on `user_email`, or a GSI on it. The
   * backend team confirmed neither exists yet (2026-09-16). Listing the table
   * here would render a permanently empty "Emails sent / Replies" pair that
   * looks like an agent nobody has run, which is the one thing this module's
   * empty states exist to avoid saying falsely.
   */
  "off-page-seo": ["comp_details"],
};

/* ---------- reading a row defensively ---------- */

/**
 * A figure, whatever type DynamoDB handed back.
 *
 * The guide is explicit that these arrive as strings OR numbers. `null` rather
 * than 0 for anything missing: a count of zero is a fact, and printing one the
 * backend never sent is the mistake rule 6 is about.
 */
export function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/,/g, "");
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The first row, for the tables that hold one record per account. */
function firstRow(outcome: SourceOutcome | undefined): Record<string, unknown> {
  return outcome?.rows[0] ?? {};
}

/**
 * Sum a column across rows.
 *
 * Returns null when NO row carried the field, rather than 0 — the difference
 * between "nobody has sent an email" and "this column is not in the payload",
 * which read identically as a zero and send people looking for a bug.
 */
function sumOf(rows: Record<string, unknown>[], key: string): number | null {
  let total = 0;
  let seen = false;
  for (const row of rows) {
    const value = num(row[key]);
    if (value !== null) {
      total += value;
      seen = true;
    }
  }
  return seen ? total : null;
}

/* ---------- section shapes ---------- */

export interface KpiFigure {
  label: string;
  value: number | null;
}

export interface SocialPost {
  platform: string;
  link: string;
  likes: number | null;
  comments: number | null;
  /** Views, reach or impressions — whichever that platform reports. */
  audience: number | null;
  audienceLabel: string;
}

export interface KeywordRow {
  keyword: string;
  priority: string;
  searchVolume: number | null;
}

export interface CompetitorRow {
  name: string;
  authorityScore: number | null;
  referringDomains: number | null;
}

/* ---------- the mappers (pure, so they are tested without a network) ---------- */

export function mapLeadQualification(
  outcome: SourceOutcome | undefined,
  activity: LeadActivity[] = [],
): KpiFigure[] {
  const row = firstRow(outcome);

  /**
   * The KPI row wins; the activity rows fill what it does not carry.
   *
   * `lead_qualification` holds these four as stored totals, but an account can
   * have a full outreach history and no row in it at all — measured: 124
   * activity rows, 0 KPI rows. Four em dashes over a live campaign is not what
   * the screen knows, so each figure falls back to the same fact counted from
   * the per-lead rows.
   *
   * These are not guesses. `sent` is a row carrying `last_sent_at`, `replied`
   * is one carrying `lead_reply`/`response` — both measured on the live table
   * before being trusted. Where no field answers a figure (sales-team sends has
   * none), it stays null rather than borrowing a number that means something
   * else.
   */
  const counted = (predicate: (row: LeadActivity) => boolean): number | null =>
    activity.length === 0 ? null : activity.filter(predicate).length;

  return [
    {
      label: "Leads emailed",
      value: num(row["no_of_client_lead_email"]) ?? counted((r) => r.sent),
    },
    {
      label: "Emails sent",
      value: num(row["no_of_email_sent_to_leads"]) ?? counted((r) => r.sent && !r.failed),
    },
    {
      label: "Responses",
      value: num(row["no_of_responses_from_leads"]) ?? counted((r) => r.replied),
    },
    {
      label: "Sales team sends",
      value: num(row["salesteam_sent_email_sent_count"]),
    },
  ];
}

/**
 * Each platform reports its audience under a different name, so the column is
 * normalised AND labelled — "Views 1,200" and "Reach 1,200" are different
 * claims, and a shared unlabelled column would silently equate them.
 */
const SOCIAL_SOURCES: {
  table: string;
  platform: string;
  audienceKey: string;
  audienceLabel: string;
}[] = [
  {
    table: "Facebook_Analytics",
    platform: "Facebook",
    audienceKey: "views_count",
    audienceLabel: "Views",
  },
  {
    table: "Instagram_analytics",
    platform: "Instagram",
    audienceKey: "reach_count",
    audienceLabel: "Reach",
  },
  {
    table: "social_media_twitter",
    platform: "X",
    audienceKey: "views_count",
    audienceLabel: "Views",
  },
  {
    table: "Youtube_analytics",
    platform: "YouTube",
    audienceKey: "views_count",
    audienceLabel: "Views",
  },
];

/**
 * The first present value under any of these keys. Each column was read under
 * ONE spelling (`Keyword`, `Competitor_name`, `post_link`…), and a row
 * written as `keyword` or `competitor_name` was dropped as blank — the
 * dashboard said "nothing yet" over its rows (audit, 2026-09-29).
 */
function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

export function mapSocialPosts(
  outcomes: Record<string, SourceOutcome | undefined>,
): SocialPost[] {
  return SOCIAL_SOURCES.flatMap((source) =>
    (outcomes[source.table]?.rows ?? []).map((row) => ({
      platform: source.platform,
      link: str(pick(row, "post_link", "postLink", "permalink", "url")),
      likes: num(pick(row, "likes_count", "likes", "likeCount")),
      comments: num(pick(row, "comment_count", "comments_count", "comments", "commentCount")),
      audience: num(pick(row, source.audienceKey, source.audienceKey.replace(/_count$/, ""))),
      audienceLabel: source.audienceLabel,
    })),
  );
}

export function mapKeywords(outcome: SourceOutcome | undefined): KeywordRow[] {
  // A row with no keyword is dropped rather than rendered blank. Rule 5.
  return (outcome?.rows ?? [])
    .map((row) => ({
      keyword: str(pick(row, "Keyword", "keyword")),
      priority: str(pick(row, "Priority", "priority")),
      searchVolume: num(pick(row, "SearchVolume", "search_volume", "searchVolume", "Search_Volume")),
    }))
    .filter((row) => row.keyword !== "")
    .filter(firstOf((row) => row.keyword.toLowerCase()));
}

/**
 * Keeps the first row for each key. The agent tables hold a row per RUN, so
 * the same keyword or competitor arrived once per run — repeated rows, and
 * duplicate React keys (rule 6; audit, 2026-09-29).
 */
function firstOf<T>(keyOf: (row: T) => string): (row: T) => boolean {
  const seen = new Set<string>();
  return (row) => {
    const key = keyOf(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}

export function mapCompetitors(outcome: SourceOutcome | undefined): CompetitorRow[] {
  return (outcome?.rows ?? [])
    .map((row) => ({
      name: str(pick(row, "Competitor_name", "competitor_name", "competitor", "name")),
      authorityScore: num(pick(row, "authority_score", "Authority_score", "authorityScore")),
      // `Reffering_domain` is the backend's spelling, not a typo here.
      referringDomains: num(
        pick(row, "Reffering_domain", "Referring_domain", "referring_domains", "referringDomains"),
      ),
    }))
    .filter((row) => row.name !== "")
    .filter(firstOf((row) => row.name.toLowerCase()));
}

export function mapOffPageMail(outcome: SourceOutcome | undefined): KpiFigure[] {
  const rows = outcome?.rows ?? [];
  return [
    { label: "Emails sent", value: sumOf(rows, "sent_mails") },
    { label: "Replies", value: sumOf(rows, "reply_mails") },
  ];
}

/* ---------- the dashboard for one agent ---------- */

export interface AgentDashboard {
  agentId: DashboardAgentId;
  /** Per table, so a failed read is not rendered as an empty one. */
  outcomes: Record<string, SourceOutcome>;
  kpis: KpiFigure[];
  /**
   * Per-lead outreach, from `leadbyte_lead_activity`.
   *
   * A different table to the `lead_qualification` KPI row and read a different
   * way (its key is `user_email`), so it is carried separately rather than
   * folded into `kpis`. An account routinely has one and not the other — this
   * one has 123 activity rows and no KPI row — and a dashboard that only read
   * the KPI table said "nothing to report" over all of it.
   */
  activity: LeadActivity[];
  posts: SocialPost[];
  keywords: KeywordRow[];
  competitors: CompetitorRow[];
}

export function buildAgentDashboard(
  agentId: DashboardAgentId,
  outcomes: Record<string, SourceOutcome>,
  activity: LeadActivity[] = [],
): AgentDashboard {
  return {
    agentId,
    outcomes,
    activity,
    // `mapOffPageMail` is kept and tested, ready for the day `off_page_seo`
    // becomes readable by account — see the note on AGENT_TABLES.
    kpis:
      agentId === "lead-qualification"
        ? mapLeadQualification(outcomes["lead_qualification"], activity)
        : [],
    posts: agentId === "social-media" ? mapSocialPosts(outcomes) : [],
    keywords: agentId === "on-page-seo" ? mapKeywords(outcomes["keywo_details"]) : [],
    competitors:
      agentId === "off-page-seo" ? mapCompetitors(outcomes["comp_details"]) : [],
  };
}

/** True when a table was reachable but had nothing, as opposed to failing. */
export function sectionFailed(dashboard: AgentDashboard): string | null {
  for (const table of AGENT_TABLES[dashboard.agentId]) {
    const outcome = dashboard.outcomes[table];
    if (outcome && !outcome.ok) return outcome.error ?? "The read failed.";
  }
  return null;
}

/**
 * One agent's dashboard, read from its own tables.
 *
 * Only the SELECTED agent is read. Reading all four up front would be seven
 * table calls to render one, against a backend whose 8s deadline the
 * Connections page already strains with six.
 *
 * Unconfigured is a working environment, the same rule as every repo here: with
 * no backend the sections are empty rather than broken.
 */
export const getAgentDashboard = cache(
  async (agentId: DashboardAgentId, email: string, uid?: string): Promise<AgentDashboard> => {
    const tables = AGENT_TABLES[agentId];
    if (!isBackendConfigured()) {
      return buildAgentDashboard(
        agentId,
        Object.fromEntries(
          tables.map((table) => [table, { ok: true, error: null, rows: [] }]),
        ),
      );
    }

    // Lead Qualification alone has a second source. `getLeadActivity` is
    // `cache()`d and never throws, so asking for it here costs nothing on the
    // screens that already read it.
    const [outcomes, activity] = await Promise.all([
      // The uid as well: the cascade tries the uid index first, and tables
      // keyed by the account's uid read as empty by email alone.
      readTables(tables, { email, ...(uid ? { uid } : {}) }),
      agentId === "lead-qualification" ? getLeadActivity(email) : Promise.resolve([]),
    ]);

    return buildAgentDashboard(agentId, outcomes, activity);
  },
);
