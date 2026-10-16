import {
  checkGoogleProduct,
  checkOAuthStatus,
  chosenAccountDetails,
  readGoogleTargets,
  type OAuthPlatform,
} from "@/lib/api/oauth-status";
import { PLATFORMS } from "@/lib/data/connections";
import { getConnectedMailbox } from "@/lib/data/email-callback";
import { mailboxLabel } from "@/components/agents/mailbox-note";
import { readGithubConnection } from "@/lib/data/github-connection";
import { readWordpressStatus } from "@/lib/data/wordpress-repo";
import { wordpressLabel } from "@/lib/data/wordpress-connection";
import { SOCIAL_PLATFORMS } from "@/lib/data/agent-social-gate";
import { getSocialOffer, isSocialDeclined } from "@/lib/data/social-accounts";
import { socialAccountName } from "@/lib/data/social-connections";
import type { AccountDetails } from "@/lib/data/account-details";
import { agentRowStatuses } from "@/lib/data/agent-live-status";
import { opensDashboard } from "@/lib/data/dashboard/locked-tabs";
import { ROW_ACTION_LABEL, type AgentRowStatus } from "@/lib/data/agent-row-status";
import { getSession } from "@/lib/auth/session";
import { getAnalytics } from "@/lib/data/analytics-repo";
import { getSearchDays, summariseSearch } from "@/lib/data/search-console";
import { getAdsInsights } from "@/lib/data/ads-insights";
import { isBackendConfigured } from "@/lib/api/config";
import { readTables } from "@/lib/api/read-cascade";
import { adsTotals, isActiveStatus, mapAdCampaigns } from "@/lib/data/dashboard/ads-campaigns";
import { formatCount, formatMoney } from "@/lib/format";
import { headers } from "next/headers";
import { getPriceSheet } from "@/lib/billing/live-pricing";
import { defaultCurrency, type PriceSheet } from "@/lib/billing/price-sheet";
import { getEntitlements } from "@/lib/entitlements";

/**
 * One slide of the feature card's slideshow: a headline figure and what it
 * means. Only ever made from a real read — a slide with nothing true to say
 * is left out, never filled with a placeholder.
 */
export type MenuSlide = {
  kicker: string;
  value: string;
  label: string;
  body: string;
  tone: "accent" | "good" | "warn" | "crit";
};

/**
 * What the top menu's Agents and Integrations panels show (2026-10-14): each
 * agent's two buttons, and each integration's state and account.
 *
 * Read ONLY when a panel is opened (`app/(app)/nav-menu-actions.ts`), never on
 * page load: the header is on every page, and these are the same reads the
 * Agents and Connections pages make — a dozen backend calls each view.
 *
 * Every answer comes from the readers those pages use, with the same rules,
 * so the menu can never call something connected that its page does not.
 */

export type MenuIntegrationState = "connected" | "not-connected" | "finish-setup" | "expired" | "unknown";

export type MenuIntegration = {
  key: string;
  state: MenuIntegrationState;
  /** Who it is connected as: the login email where one is recorded, else the account's name. */
  account: string;
};

export type MenuAgent = {
  id: string;
  status: AgentRowStatus;
  /** "Run agent", "Set up", "Unlock", "Open" — or "" (coming soon). */
  actionLabel: string;
  actionHref: string;
  /** Null where the agent has no dashboard to open (locked, coming soon). */
  dashboardHref: string | null;
};

// Run and set up from a popup on the Agents page, which `?configure=` opens.
const POPUP_AGENTS = new Set(["lead-qualification", "on-page-seo", "off-page-seo"]);

/**
 * The buttons alone — one status read per agent, and the part a menu cannot
 * open without. Kept apart from the slides, whose reads (leads, outreach, ad
 * tables) are slower, so the buttons never wait on them.
 */
export async function readAgentRows(businessId: string): Promise<MenuAgent[]> {
  return agentRows(await agentRowStatuses(businessId));
}

/**
 * How many agents this account HAS — bought, or free to use. Locked (not
 * bought) and coming-soon agents are not counted. The same statuses the
 * Agents menu and its buttons come from (`agentRowStatuses`).
 */
export function ownedAgentCount(statuses: Iterable<AgentRowStatus>): number {
  let n = 0;
  for (const status of statuses) if (status !== "locked" && status !== "coming-soon") n += 1;
  return n;
}

function agentRows(statuses: ReadonlyMap<string, AgentRowStatus>): MenuAgent[] {
  return [...statuses].map(([id, status]) => ({
    id,
    status,
    actionLabel: ROW_ACTION_LABEL[status],
    actionHref:
      status === "locked"
        ? "/pricing"
        : POPUP_AGENTS.has(id) && status !== "blocked"
          ? `/agents?configure=${id}`
          : `/agents/${id}`,
    dashboardHref: opensDashboard(id, status) ? `/agents?agent=${id}` : null,
  }));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/**
 * Spend across the Meta and Google campaigns — the two ad tables the
 * campaign dashboards read, not the whole connected-data bundle. Null when
 * there are no campaigns with spend to report.
 */
async function readAdSpendSlide(email: string): Promise<MenuSlide | null> {
  if (!isBackendConfigured()) return null;
  const sources = (await readTables(["meta_ads_full_insights", "google_ads_full_insights"], { email }).catch(
    () => ({}),
  )) as Record<string, { rows: unknown[] } | undefined>;
  const campaigns = [
    ...mapAdCampaigns(sources.meta_ads_full_insights?.rows ?? [], "meta"),
    ...mapAdCampaigns(sources.google_ads_full_insights?.rows ?? [], "google"),
  ];
  const totals = adsTotals(campaigns);
  if (campaigns.length === 0 || totals.spend === null) return null;
  const active = campaigns.filter((c) => isActiveStatus(c.status)).length;
  return {
    kicker: "Ad spend",
    value: formatMoney(totals.spend),
    label: `spent across ${plural(campaigns.length, "campaign")}`,
    body: [
      `${active} active now`,
      totals.clicks !== null && plural(totals.clicks, "click"),
      totals.conversions !== null && plural(Math.round(totals.conversions), "conversion"),
    ]
      .filter(Boolean)
      .join(" · "),
    tone: "accent",
  };
}

/** Strategy: what it is built from, and how much of that is connected. */
export function strategySlides(rows: readonly MenuIntegration[], spend: MenuSlide | null): MenuSlide[] {
  const by = new Map(rows.map((row) => [row.key, row.state]));
  const ads = ["googleAds", "metaAds", "linkedInAds"].filter((key) => by.get(key) === "connected").length;
  const sources = ["googleAnalytics", "searchConsole", "googleAds", "metaAds", "linkedInAds"].filter(
    (key) => by.get(key) === "connected",
  ).length;
  const slides: MenuSlide[] = [
    {
      kicker: "Strategy inputs",
      value: `${sources} of 5`,
      label: "data sources feeding your strategy",
      body:
        sources === 5
          ? "Built on your website, search and every ad platform."
          : "Each source you connect makes the recommendations more specific.",
      tone: sources >= 3 ? "good" : "accent",
    },
    {
      kicker: "Advertising",
      value: `${ads} of 3`,
      label: "ad platforms in the plan",
      body:
        ads === 0
          ? "Without an ad account, budget and channel advice cannot use real results."
          : "Budget and channel advice uses these accounts' real results.",
      tone: ads === 0 ? "warn" : "accent",
    },
  ];
  if (spend) slides.push(spend);
  return slides;
}

/**
 * The Pricing menu: the Pricing page's own board, fed the same price sheet
 * and the same "already purchased" read, in the currency that page would
 * open in. Checkout, the billing toggle and autopay are the board's own.
 */
export async function readPricingMenu(
  businessId: string,
  asked?: unknown,
): Promise<{ sheet: PriceSheet; ownedIds: string[] }> {
  const currency = defaultCurrency(asked, (await headers()).get("cf-ipcountry"));
  const [sheet, ownedIds] = await Promise.all([
    getPriceSheet(currency),
    isBackendConfigured() ? getEntitlements(businessId).then((e) => e.agents) : Promise.resolve<string[]>([]),
  ]);
  return { sheet, ownedIds };
}

/** One of the three Performance cards in the Agents menu. */
export type MenuPerfCard = {
  id: "traffic" | "ads" | "cross";
  title: string;
  /** Where its View goes: the Performance page, at this section. */
  href: string;
  stats: { label: string; value: string }[];
  /** Daily series for the preview, oldest first — one line each. */
  series: { label: string; values: number[] }[];
  /** Said instead of figures when there are none. */
  note: string | null;
};

/** The last N days of a series: a preview, not the whole import. */
const PREVIEW_DAYS = 30;
const tail = (values: number[]) => values.slice(-PREVIEW_DAYS);

/**
 * Website traffic, paid advertising and the cross-channel view, from the
 * Performance page's OWN cached readers (`getAnalytics`, `getSearchDays`,
 * `getAdsInsights` — one shared connected-data read between them), so a figure
 * here is the figure on that page. That read is the largest the app makes, so
 * the menu asks for it only when the Agents menu opens, and keeps it.
 */
export async function readPerformanceCards(businessId: string): Promise<MenuPerfCard[]> {
  const [analytics, searchDays, ads] = await Promise.all([
    getAnalytics(businessId),
    getSearchDays(),
    getAdsInsights(),
  ]);
  const search = summariseSearch(searchDays);
  const withAds = ads.filter((platform) => platform.hasData);
  const meta = withAds.find((platform) => platform.platform === "metaAds");
  const totalSpend = withAds.reduce((sum, platform) => sum + platform.totals.spend, 0);
  const spendByDay = new Map<string, number>();
  for (const platform of withAds) {
    for (const day of platform.daily) spendByDay.set(day.date, (spendByDay.get(day.date) ?? 0) + day.spend);
  }
  const spendSeries = [...spendByDay].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value);
  const sessions = analytics ? analytics.daily.map((day) => day.sessions) : [];

  return [
    {
      id: "traffic",
      title: "Website traffic",
      href: "/analytics/explore?source=analytics",
      stats: analytics
        ? [
            { label: "Sessions", value: formatCount(analytics.summary.sessions) },
            { label: "Page views", value: formatCount(analytics.summary.pageViews) },
          ]
        : [],
      series: analytics ? [{ label: "Sessions", values: tail(sessions) }] : [],
      note: analytics ? null : "No Google Analytics data yet.",
    },
    {
      id: "ads",
      title: "Paid advertising",
      href: "/analytics/explore?source=ads",
      stats:
        withAds.length > 0
          ? [
              meta
                ? { label: "Meta spend", value: formatMoney(meta.totals.spend) }
                : { label: "Ad spend", value: formatMoney(totalSpend) },
              { label: "Campaigns", value: formatCount(withAds.reduce((n, p) => n + p.campaigns.length, 0)) },
              { label: "Conversions", value: formatCount(Math.round(withAds.reduce((n, p) => n + p.totals.conversions, 0))) },
            ]
          : [],
      series: withAds.length > 0 ? [{ label: "Ad spend", values: tail(spendSeries) }] : [],
      note: withAds.length > 0 ? null : "No campaign data yet.",
    },
    {
      id: "cross",
      title: "Cross-channel",
      href: "/analytics#cross-channel",
      stats: [
        analytics && { label: "Sessions", value: formatCount(analytics.summary.sessions) },
        searchDays.length > 0 && { label: "Search", value: formatCount(search.clicks) },
        withAds.length > 0 && { label: "Ad spend", value: formatMoney(totalSpend) },
      ].filter((stat): stat is { label: string; value: string } => Boolean(stat)),
      series: [
        ...(analytics ? [{ label: "Sessions", values: tail(sessions) }] : []),
        ...(searchDays.length > 0 ? [{ label: "Search clicks", values: tail(searchDays.map((d) => d.clicks)) }] : []),
        ...(withAds.length > 0 ? [{ label: "Ad spend", values: tail(spendSeries) }] : []),
      ],
      note: !analytics && searchDays.length === 0 && withAds.length === 0 ? "Connect a source to compare channels." : null,
    },
  ];
}

export async function readStrategyMenu(businessId: string): Promise<{ slides: MenuSlide[] }> {
  const email = (await getSession())?.businessId ?? businessId;
  const [rows, spend] = await Promise.all([readIntegrationRows(businessId), readAdSpendSlide(email)]);
  return { slides: strategySlides(rows, spend) };
}

const INTEGRATION_LABELS: Record<string, string> = {
  googleAnalytics: "Google Analytics",
  searchConsole: "Search Console",
  googleAds: "Google Ads",
  metaAds: "Meta Ads",
  linkedInAds: "LinkedIn Ads",
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  email: "Email",
  github: "GitHub",
  wordpress: "WordPress",
};

/**
 * What the connections mean, worked out from the rows alone (no further
 * reads): how many are connected, which need a fix, and which agents are
 * waiting on one. A row we could not check counts as neither. Pure.
 */
export function integrationSlides(rows: readonly MenuIntegration[]): MenuSlide[] {
  const by = new Map(rows.map((row) => [row.key, row.state]));
  const isOff = (key: string) => by.get(key) === "not-connected" || by.get(key) === "expired";
  const label = (key: string) => INTEGRATION_LABELS[key] ?? key;
  const connected = rows.filter((row) => row.state === "connected").length;
  const slides: MenuSlide[] = [
    {
      kicker: "Connections",
      value: `${connected} of ${rows.length}`,
      label: "accounts connected",
      body:
        connected === rows.length
          ? "Every account is connected and reporting."
          : `${rows.length - connected} still to connect — each one gives your agents more to work with.`,
      tone: connected === rows.length ? "good" : "accent",
    },
  ];

  const fixes = rows.filter((row) => row.state === "expired" || row.state === "finish-setup");
  if (fixes.length > 0) {
    slides.push({
      kicker: "Issues",
      value: String(fixes.length),
      label: fixes.length === 1 ? "connection needs a fix" : "connections need a fix",
      body: fixes
        .slice(0, 3)
        .map((row) => `${label(row.key)}: ${row.state === "expired" ? "expired, reconnect" : "finish setup"}`)
        .join(" · "),
      tone: "crit",
    });
  }

  const blocked: string[] = [];
  if (isOff("email")) blocked.push("Lead Qualification and Off-Page SEO can't send email until a mailbox is connected.");
  if (isOff("github") && isOff("wordpress")) blocked.push("Blog Posting has nowhere to publish — connect GitHub or WordPress.");
  for (const key of ["googleAds", "metaAds", "linkedInAds"]) {
    if (isOff(key)) blocked.push(`The ${label(key)} agent needs your ${label(key)} account.`);
  }
  if (["facebook", "instagram", "youtube"].every(isOff)) {
    blocked.push("Social Media needs Facebook, Instagram or YouTube to post to.");
  }
  if (isOff("googleAnalytics")) blocked.push("Performance has no website traffic without Google Analytics.");
  blocked.slice(0, 3).forEach((body) =>
    slides.push({ kicker: "Unlock more", value: "", label: "Waiting on a connection", body, tone: "warn" }),
  );
  return slides;
}

const SIGNED_IN = "Signed in as ";
const named = (details: AccountDetails | undefined) => Boolean(details && (details.name || details.id));
/** The login email when the details carry one ("Signed in as …"), else the account's name. */
function whoOf(details: AccountDetails): string {
  const login = details.facts.find((fact) => fact.startsWith(SIGNED_IN))?.slice(SIGNED_IN.length) ?? "";
  return login || details.name || details.id;
}

function stateOf(status: string): MenuIntegrationState {
  if (status === "valid") return "connected";
  if (status === "pending") return "finish-setup";
  if (status === "expired") return "expired";
  if (status === "error") return "unknown";
  return "not-connected";
}

/** Mirrors `app/(app)/intelligence/connections/page.tsx`, row for row. */
export async function readIntegrationMenu(
  businessId: string,
): Promise<{ integrations: MenuIntegration[]; slides: MenuSlide[] }> {
  const integrations = await readIntegrationRows(businessId);
  return { integrations, slides: integrationSlides(integrations) };
}

async function readIntegrationRows(businessId: string): Promise<MenuIntegration[]> {
  const [statuses, mailboxRecord, github, wordpress, googleTargets, searchConsole] = await Promise.all([
    Promise.all(
      PLATFORMS.map(async (platform) => ({
        platform,
        result:
          platform.id === "googleAnalytics"
            ? await checkGoogleProduct("analytics", businessId)
            : await checkOAuthStatus(platform.id, businessId),
      })),
    ),
    getConnectedMailbox(),
    readGithubConnection(businessId),
    readWordpressStatus(),
    readGoogleTargets(businessId),
    checkGoogleProduct("search_console", businessId),
  ]);

  const socialOffers: Partial<Record<OAuthPlatform, boolean>> = {};
  const socialDeclined: Partial<Record<OAuthPlatform, boolean>> = {};
  for (const platform of SOCIAL_PLATFORMS) {
    socialOffers[platform] = (await getSocialOffer(platform)).length > 0;
    socialDeclined[platform] = await isSocialDeclined(platform);
  }

  const rows = await Promise.all(
    statuses.map(async ({ platform, result }): Promise<MenuIntegration> => {
      // A refused platform reads Not connected; one with a page still to pick, Finish setup.
      if (socialDeclined[platform.id]) return { key: platform.id, state: "not-connected", account: "" };
      if (socialOffers[platform.id] || result.status === "pending") {
        return { key: platform.id, state: "finish-setup", account: "" };
      }
      if (result.status !== "valid") return { key: platform.id, state: stateOf(result.status), account: "" };

      const details = await chosenAccountDetails(platform.id, businessId);
      let shown: AccountDetails = details;
      if (platform.id === "googleAnalytics") {
        shown = { name: googleTargets.property, id: googleTargets.propertyId, facts: details.facts };
      } else if ((SOCIAL_PLATFORMS as readonly OAuthPlatform[]).includes(platform.id)) {
        shown = { ...details, name: (await socialAccountName(platform.id, businessId)) || details.name };
      }
      // Connected only when we can say WHICH account (the page's rule, 2026-10-06).
      if (!named(shown)) return { key: platform.id, state: "not-connected", account: "" };
      return { key: platform.id, state: "connected", account: whoOf(shown) };
    }),
  );

  const scConnected = searchConsole.status === "valid" && Boolean(googleTargets.site);
  const searchConsoleRow: MenuIntegration = {
    key: "searchConsole",
    state: scConnected ? "connected" : searchConsole.status === "valid" ? "not-connected" : stateOf(searchConsole.status),
    account: scConnected ? googleTargets.site : "",
  };

  // A mailbox we cannot name is not shown as connected.
  const mailbox = mailboxRecord && mailboxLabel(mailboxRecord) !== null ? mailboxRecord : null;
  const emailRow: MenuIntegration = {
    key: "email",
    state: mailbox ? "connected" : "not-connected",
    account: mailbox ? mailbox.address || mailbox.name : "",
  };

  const githubRow: MenuIntegration =
    github.kind === "connected"
      ? {
          key: "github",
          state: "connected",
          account:
            [...new Set(github.repos.map((repo) => repo.split("/")[0] ?? "").filter(Boolean))].join(", ") ||
            github.domain,
        }
      : { key: "github", state: github.kind === "unknown" || github.kind === "unavailable" ? "unknown" : "not-connected", account: "" };

  const wordpressRow: MenuIntegration =
    wordpress.kind === "connected"
      ? {
          key: "wordpress",
          state: "connected",
          account: wordpress.userName
            ? `${wordpress.userName} · ${wordpressLabel(wordpress.wpUrl)}`
            : wordpressLabel(wordpress.wpUrl),
        }
      : { key: "wordpress", state: wordpress.kind === "not-connected" ? "not-connected" : "unknown", account: "" };

  return [...rows, searchConsoleRow, emailRow, githubRow, wordpressRow];
}
