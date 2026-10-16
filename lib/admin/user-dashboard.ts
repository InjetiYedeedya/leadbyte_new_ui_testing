import { pickNumber, pickString, type Row } from "./fields";
import { dailyTotals } from "./site-analytics";

/**
 * What an admin sees when opening one customer's dashboard: five groups of
 * figures, each from its own tables.
 *
 * Every figure is `number | null`. Null means the table had nothing for this
 * customer (or could not be read) and renders as an em dash; zero means the
 * rows were there and summed to zero. The legacy screen printed 0 for both,
 * which told an admin a customer's campaigns had no clicks when in fact we had
 * never read them.
 */

export interface UserDashboardSources {
  dailyMetrics: Row[];
  pageTraffic: Row[];
  competitors: Row[];
  keywords: Row[];
  blogPosting: Row[];
  offPageSeo: Row[];
  facebook: Row[];
  instagram: Row[];
  twitter: Row[];
  youtube: Row[];
  googleAds: Row[];
  metaAds: Row[];
  leadQualificationData: Row[];
  leadQualificationConfig: Row[];
}

export interface Figure {
  label: string;
  value: number | null;
  /** How to print it: a plain count, or money. */
  kind?: "count" | "money";
}

export interface DashboardGroup {
  id: "website" | "seo" | "social" | "ads" | "leads";
  title: string;
  figures: Figure[];
  /** Plain facts about the setup, shown above the figures. */
  facts: { label: string; value: string }[];
  /** True when every source for this group came back empty. */
  empty: boolean;
}

function sum(rows: readonly Row[], ...keys: string[]): number | null {
  if (rows.length === 0) return null;
  return rows.reduce((total, row) => total + (pickNumber(row, ...keys) ?? 0), 0);
}

function count(rows: readonly Row[]): number | null {
  return rows.length === 0 ? null : rows.length;
}

function first(rows: readonly Row[]): Row | null {
  return rows[0] ?? null;
}

export function buildUserDashboard(sources: UserDashboardSources): DashboardGroup[] {
  const days = dailyTotals(sources.dailyMetrics);
  const hasDays = days.length > 0;
  const viewsFromDays = hasDays ? days.reduce((t, d) => t + d.pageViews, 0) : null;
  const viewsFromPages = sum(sources.pageTraffic, "views", "page_views");
  const pageViews =
    viewsFromDays === null && viewsFromPages === null
      ? null
      : Math.max(viewsFromDays ?? 0, viewsFromPages ?? 0);

  const offPage = first(sources.offPageSeo);
  const lq = first(sources.leadQualificationData);
  const lqConfig = first(sources.leadQualificationConfig);

  const website: DashboardGroup = {
    id: "website",
    title: "Website analytics",
    facts: [],
    figures: [
      { label: "Active users", value: hasDays ? days.reduce((t, d) => t + d.activeUsers, 0) : null },
      { label: "New users", value: hasDays ? days.reduce((t, d) => t + d.newUsers, 0) : null },
      { label: "Page views", value: pageViews },
      { label: "Sessions", value: hasDays ? days.reduce((t, d) => t + d.sessions, 0) : null },
    ],
    empty: !hasDays && sources.pageTraffic.length === 0,
  };

  const seo: DashboardGroup = {
    id: "seo",
    title: "SEO",
    facts: [],
    figures: [
      { label: "Competitors", value: count(sources.competitors) },
      { label: "Keywords", value: count(sources.keywords) },
      { label: "Blog posts", value: count(sources.blogPosting) },
      { label: "Outreach mails", value: offPage ? pickNumber(offPage, "sent_mails") : null },
      { label: "Replies", value: offPage ? pickNumber(offPage, "reply_mails") : null },
      { label: "Backlinks", value: offPage ? pickNumber(offPage, "current_backlinks", "backlink") : null },
    ],
    empty:
      sources.competitors.length === 0 &&
      sources.keywords.length === 0 &&
      sources.blogPosting.length === 0 &&
      offPage === null,
  };

  const social: DashboardGroup = {
    id: "social",
    title: "Social media",
    facts: [],
    figures: [
      { label: "Instagram posts", value: count(sources.instagram) },
      { label: "Facebook posts", value: count(sources.facebook) },
      { label: "X posts", value: count(sources.twitter) },
      { label: "YouTube videos", value: count(sources.youtube) },
    ],
    empty:
      sources.instagram.length === 0 &&
      sources.facebook.length === 0 &&
      sources.twitter.length === 0 &&
      sources.youtube.length === 0,
  };

  const ads: DashboardGroup = {
    id: "ads",
    title: "Advertising",
    facts: [],
    figures: [
      { label: "Google campaigns", value: count(sources.googleAds) },
      { label: "Google clicks", value: sum(sources.googleAds, "clicks") },
      { label: "Google impressions", value: sum(sources.googleAds, "impressions") },
      { label: "Meta campaigns", value: count(sources.metaAds) },
      { label: "Meta clicks", value: sum(sources.metaAds, "clicks") },
      { label: "Meta spend", value: sum(sources.metaAds, "spend"), kind: "money" },
    ],
    empty: sources.googleAds.length === 0 && sources.metaAds.length === 0,
  };

  const siteUrl = lqConfig ? pickString(lqConfig, "websiteUrl").replace(/^https?:\/\//, "") : "";
  const leads: DashboardGroup = {
    id: "leads",
    title: "Lead qualification",
    facts: lqConfig
      ? [
          { label: "Company", value: pickString(lqConfig, "companyName") },
          { label: "Website", value: siteUrl.length > 40 ? `${siteUrl.slice(0, 39)}…` : siteUrl },
          { label: "Outreach email", value: pickString(lqConfig, "outreachEmail") },
        ].filter((fact) => fact.value !== "")
      : [],
    figures: [
      { label: "Emails sent", value: lq ? pickNumber(lq, "no_of_email_sent_to_leads") : null },
      { label: "Responses", value: lq ? pickNumber(lq, "no_of_responses_from_leads") : null },
      { label: "Sent to sales", value: lq ? pickNumber(lq, "salesteam_sent_email_sent_count") : null },
    ],
    empty: lq === null && lqConfig === null,
  };

  return [website, seo, social, ads, leads];
}
