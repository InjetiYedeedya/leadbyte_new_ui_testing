/**
 * The tabs of the agent dashboard, in the order they are shown.
 *
 * From the legacy dashboard's implementation guide (2026-09-30): one tab per
 * agent that reports results, grouped SEO / Marketing, plus "Ads Leads
 * Details", which belongs to no single agent and is always open. The dashboard
 * stays the slide-in beside the agents list (`agent-dashboard-split.tsx`) —
 * `?agent=<tab id>` picks the tab, so a tab is a URL that survives a reload
 * and the server reads only that tab's tables.
 *
 * Client-safe: ids and words only.
 */

export type DashboardTabId =
  | "on-page-seo"
  | "off-page-seo"
  | "lead-qualification"
  | "social-media"
  | "meta-ads"
  | "google-ads"
  | "linkedin-ads"
  | "ads-leads";

export interface DashboardTab {
  id: DashboardTabId;
  /** The tab's own short label. */
  label: string;
  /** The section header inside the tab. */
  title: string;
  subtitle: string;
  group: "SEO" | "Marketing";
  /**
   * The agent this tab reports on, whose purchase unlocks it. Null for a tab
   * that is always open (Ads Leads Details).
   */
  agentId: string | null;
}

export const DASHBOARD_TABS: readonly DashboardTab[] = [
  {
    id: "on-page-seo",
    label: "On-Page SEO",
    title: "On-Page SEO Agent",
    subtitle: "The keywords the agent is working on for your site",
    group: "SEO",
    agentId: "on-page-seo",
  },
  {
    id: "off-page-seo",
    label: "Off-Page SEO",
    title: "Off-Page SEO Agent",
    subtitle: "How far outreach gets, and what it has won you",
    group: "SEO",
    agentId: "off-page-seo",
  },
  {
    id: "lead-qualification",
    label: "Lead Qualification",
    title: "Lead Qualification Agent",
    subtitle: "Your lead pipeline and email outreach",
    group: "Marketing",
    agentId: "lead-qualification",
  },
  {
    id: "social-media",
    label: "Social Media",
    title: "Social Media Agent",
    subtitle: "Which platform earns the most engagement for what it reaches",
    group: "Marketing",
    agentId: "social-media",
  },
  {
    id: "meta-ads",
    label: "Meta Ads",
    title: "Meta Ads — Campaign Insights",
    subtitle: "Facebook and Instagram campaign performance",
    group: "Marketing",
    agentId: "meta-ads",
  },
  {
    id: "google-ads",
    label: "Google Ads",
    title: "Google Ads — Campaign Insights",
    subtitle: "Search and display campaign performance",
    group: "Marketing",
    agentId: "google-ads",
  },
  {
    id: "linkedin-ads",
    label: "LinkedIn Ads",
    title: "LinkedIn Ads",
    subtitle: "Campaign performance on LinkedIn",
    group: "Marketing",
    agentId: "linkedin-ads",
  },
  {
    id: "ads-leads",
    label: "Ads Leads",
    title: "Ads Leads Details",
    subtitle: "Lead data collected from your ad campaigns",
    group: "Marketing",
    agentId: null,
  },
];

export function dashboardTabFor(id: string | undefined): DashboardTab | null {
  return DASHBOARD_TABS.find((tab) => tab.id === id) ?? null;
}

/** Whether an agent id has a dashboard tab — the row that opens one. */
export function hasDashboardTab(agentId: string): boolean {
  return DASHBOARD_TABS.some((tab) => tab.agentId === agentId);
}

/** What every tab body receives: which tab, and who is signed in. Each tab reads its own tables. */
export interface DashboardTabProps {
  /** Its own entry above — the title and subtitle for its section header. */
  tab: DashboardTab;
  /** The signed account email — the key every dashboard table is read by. */
  email: string;
  /** The Firebase uid, for the tables keyed by it. */
  uid?: string;
}
