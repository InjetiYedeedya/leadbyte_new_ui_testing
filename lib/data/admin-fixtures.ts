import type { Row } from "@/lib/admin/fields";
import { ADMIN_TABLES, AGENT_CONFIG_TABLES, COMPANY_ANALYTICS_EMAIL, USER_DASHBOARD_TABLES } from "@/lib/admin/tables";

/**
 * Seed rows for the admin panel in mock mode — an unconfigured environment is a
 * working one, so every admin screen needs something to show with no backend.
 *
 * Every date is relative to `now`, so "new clients this week" and the
 * analytics windows stay meaningful however long after writing this runs.
 * These are demo accounts on reserved `.test` / `example` domains, never real
 * customers.
 */

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(now: number, days: number): string {
  return new Date(now - days * DAY).toISOString();
}

/** GA's own `YYYYMMDD` spelling, which the real table uses. */
function gaDay(now: number, days: number): string {
  return new Date(now - days * DAY).toISOString().slice(0, 10).replace(/-/g, "");
}

export function buildAdminFixtures(now: number = Date.now()): Record<string, Row[]> {
  const users: Row[] = [
    { user_id: "u-rhea", email: "rhea@novaflow.io", displayName: "Rhea Kapoor", provider: "google.com", emailVerified: true, created_at: daysAgo(now, 2), last_login: daysAgo(now, 0.1), subscription_status: "active", subscription_end_date: daysAgo(now, -300), subscribed_agents: ["lead-qualification", "meta-ads"] },
    { user_id: "u-arjun", email: "arjun@brightpath.test", displayName: "Arjun Mehta", provider: "password", emailVerified: true, created_at: daysAgo(now, 5), last_login: daysAgo(now, 1) },
    { user_id: "u-lena", email: "lena@harbourcafe.test", displayName: "Lena Fischer", provider: "google.com", emailVerified: false, created_at: daysAgo(now, 18), last_login: daysAgo(now, 3) },
    { user_id: "u-omar", email: "omar@fieldworks.test", displayName: "Omar Haddad", provider: "password", emailVerified: true, created_at: daysAgo(now, 40), last_login: daysAgo(now, 12), subscription_status: "active", subscription_end_date: daysAgo(now, 5), subscribed_agents: ["google-ads"] },
    { user_id: "u-mei", email: "mei@lanternstudio.test", displayName: "Mei Tanaka", provider: "google.com", emailVerified: true, created_at: daysAgo(now, 75), last_login: daysAgo(now, 30) },
    { user_id: "u-priya", email: "priya@example.com", provider: "google.com", created_at: daysAgo(now, 120) },
  ];

  const overallDetails: Row[] = [
    { email: "rhea@novaflow.io", companyName: "NovaFlow" },
    { email: "arjun@brightpath.test", companyName: "BrightPath Tutoring" },
    { email: "lena@harbourcafe.test", companyName: "Harbour Café" },
    { email: "omar@fieldworks.test", company_name: "Fieldworks Landscaping" },
    { email: "mei@lanternstudio.test", companyName: "Lantern Studio" },
  ];

  const configs: Record<string, Row[]> = {
    "Lead Qualification": [
      { email: "rhea@novaflow.io", companyName: "NovaFlow", websiteUrl: "https://novaflow.io", outreachEmail: "hello@novaflow.io", icp: "B2B SaaS, 20-200 staff", created_at: daysAgo(now, 2) },
      { email: "arjun@brightpath.test", companyName: "BrightPath Tutoring", websiteUrl: "brightpath.test", outreachEmail: "arjun@brightpath.test", icp: "Parents of year 10-12 students", created_at: daysAgo(now, 4) },
    ],
    "Meta Ads": [
      { email: "rhea@novaflow.io", campaign_goal: "Leads", daily_budget: 1500, location: "Bengaluru, India" },
    ],
    "Google Ads": [
      { email: "omar@fieldworks.test", campaign_goal: "Calls", daily_budget: 900, location: "Leeds, United Kingdom" },
      { email: "rhea@novaflow.io", campaign_goal: "Website traffic", daily_budget: 2000, location: "India" },
    ],
    "On-Page SEO": [
      { email: "lena@harbourcafe.test", wordpress_url: "https://harbourcafe.test/wp-admin", wordpress_username: "lena", wordpress_password: "demo-password", target_keywords: "brunch, specialty coffee" },
    ],
  };

  const orders: Row[] = [
    { order_id: "ord-1001", email: "rhea@novaflow.io", status: "completed", cart_items: [{ id: "lead-qualification" }, { id: "meta-ads" }], created_at: daysAgo(now, 2) },
    { order_id: "ord-1002", email: "arjun@brightpath.test", status: "pending", cart_items: JSON.stringify([{ id: "google-ads" }]), created_at: daysAgo(now, 4) },
  ];

  const adminUsers: Row[] = [
    { email: "ops@ntimes.test", status: "active", invited_by: "thilak@ntimes.ai", invited_at: daysAgo(now, 30), claimed_at: daysAgo(now, 29), created_at: daysAgo(now, 30) },
    { email: "newhire@ntimes.test", status: "pending", token: "demo-invite-token", invited_by: "thilak@ntimes.ai", invited_at: daysAgo(now, 1), created_at: daysAgo(now, 1) },
  ];

  const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
  const safari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
  const edge = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Edg/128.0";
  const activity: Row[] = [
    { logId: "log-1", email: "rhea@novaflow.io", action: "login", userAgent: chrome, timestamp: daysAgo(now, 0.1) },
    { logId: "log-2", email: "arjun@brightpath.test", action: "login", userAgent: safari, timestamp: daysAgo(now, 1) },
    { logId: "log-3", email: "arjun@brightpath.test", action: "logout", userAgent: safari, timestamp: daysAgo(now, 0.9) },
    { logId: "log-4", email: "lena@harbourcafe.test", action: "login", userAgent: edge, timestamp: daysAgo(now, 3) },
    { logId: "log-5", email: "omar@fieldworks.test", action: "login", userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0", timestamp: daysAgo(now, 12) },
  ];

  const notifications: Row[] = [
    { notificationId: "notif-1", type: "new_user", read: false, email: "rhea@novaflow.io", displayName: "Rhea Kapoor", provider: "google.com", timestamp: daysAgo(now, 2) },
    { notificationId: "notif-2", type: "new_user", read: false, email: "arjun@brightpath.test", displayName: "Arjun Mehta", provider: "password", timestamp: daysAgo(now, 5) },
    { notificationId: "notif-3", type: "new_user", read: true, email: "lena@harbourcafe.test", displayName: "Lena Fischer", provider: "google.com", timestamp: daysAgo(now, 18) },
  ];

  const errors: Row[] = [
    { errorId: "err-501", priority: "critical", agentType: "Meta Ads", workflowName: "metaads-executor", errorMessage: "Ad account access token expired — campaign creation stopped.", timestamp: daysAgo(now, 0.3) },
    { errorId: "err-502", priority: "high", agentType: "Lead Qualification", workflowName: "lead-outreach", errorMessage: "SMTP rejected the outreach mailbox credentials.", timestamp: daysAgo(now, 1.2) },
    { errorId: "err-503", priority: "medium", agentType: "On-Page SEO", workflowName: "onpage-publish", errorMessage: "WordPress returned 403 when publishing a draft.", timestamp: daysAgo(now, 2) },
    { errorId: "err-504", priority: "low", agentType: "Google Ads", workflowName: "googleads-report", errorMessage: "Daily report skipped: no spend yesterday.", timestamp: daysAgo(now, 4), status: "Cleared", cleared: true },
    { errorId: "err-505", severity: "HIGH", type: "Social Media", workflow_name: "social-scheduler", error_message: "Instagram rate limit reached; 3 posts deferred.", created_at: daysAgo(now, 6) },
  ];

  const requests: Row[] = [
    { requestId: "req-1", email: "omar@fieldworks.test", platform: "google-ads", requestType: "disconnect", status: "pending", message: "Connected the wrong ad account.", createdAt: daysAgo(now, 1) },
    { requestId: "req-2", email: "lena@harbourcafe.test", platform: "instagram", requestType: "change", status: "pending", createdAt: daysAgo(now, 3) },
    { requestId: "req-3", email: "arjun@brightpath.test", platform: "business-details", requestType: "change", status: "completed", createdAt: daysAgo(now, 9), completedAt: daysAgo(now, 8) },
    { requestId: "req-4", email: "mei@lanternstudio.test", platform: "meta-ads", requestType: "disconnect", status: "rejected", createdAt: daysAgo(now, 20), completedAt: daysAgo(now, 19) },
  ];

  // 60 days of LeadByte's own traffic, with a weekday rhythm so the chart and
  // the prior-period comparison have a shape to show.
  const daily: Row[] = [];
  for (let d = 59; d >= 0; d -= 1) {
    const weekday = new Date(now - d * DAY).getUTCDay();
    const base = 180 + Math.round((59 - d) * 1.8) + (weekday === 0 || weekday === 6 ? -60 : 25);
    daily.push({
      email: COMPANY_ANALYTICS_EMAIL,
      metric_dates: gaDay(now, d),
      active_users: base,
      new_users: Math.round(base * 0.62),
      page_views: Math.round(base * 2.9),
      sessions: Math.round(base * 1.3),
    });
  }
  const sources: Row[] = [
    ["google", 4210], ["(direct)", 2130], ["linkedin.com", 880], ["chatgpt.com", 410], ["bing", 260], ["newsletter", 190],
  ].map(([session_source, sessions]) => ({ email: COMPANY_ANALYTICS_EMAIL, session_source, sessions }));
  const countries: Row[] = [
    ["India", 5120], ["United States", 1840], ["United Kingdom", 760], ["United Arab Emirates", 420], ["Singapore", 310], ["Germany", 190], ["Canada", 150],
  ].map(([country, active_users]) => ({ email: COMPANY_ANALYTICS_EMAIL, country, active_users }));

  // One customer with a full dashboard behind them; everyone else is empty,
  // which is the common case on a real account and has to look right too.
  const rhea = "rhea@novaflow.io";
  const rheaDaily: Row[] = daily.slice(-30).map((row) => ({
    ...row,
    email: rhea,
    active_users: Math.round(Number(row.active_users) / 4),
    new_users: Math.round(Number(row.new_users) / 4),
    page_views: Math.round(Number(row.page_views) / 4),
    sessions: Math.round(Number(row.sessions) / 4),
  }));

  const tables: Record<string, Row[]> = {
    [ADMIN_TABLES.users]: users,
    [ADMIN_TABLES.overallDetails]: overallDetails,
    [ADMIN_TABLES.orders]: orders,
    [ADMIN_TABLES.adminUsers]: adminUsers,
    [ADMIN_TABLES.activityLog]: activity,
    [ADMIN_TABLES.adminNotifications]: notifications,
    [ADMIN_TABLES.errorNotifications]: errors,
    [ADMIN_TABLES.integrationRequests]: requests,
    [USER_DASHBOARD_TABLES.dailyMetrics]: [...daily, ...rheaDaily],
    [USER_DASHBOARD_TABLES.sessionPerSource]: sources,
    [USER_DASHBOARD_TABLES.sourceByCountry]: countries,
    [USER_DASHBOARD_TABLES.pageTraffic]: [],
    [USER_DASHBOARD_TABLES.competitors]: [
      { email: rhea, name: "Flowly" }, { email: rhea, name: "Streamline HQ" }, { email: rhea, name: "Pipedrive" },
    ],
    [USER_DASHBOARD_TABLES.keywords]: Array.from({ length: 24 }, (_, i) => ({ email: rhea, keyword: `keyword ${i + 1}` })),
    [USER_DASHBOARD_TABLES.blogPosting]: [{ email: rhea, title: "How to qualify inbound leads" }],
    [USER_DASHBOARD_TABLES.offPageSeo]: [{ email: rhea, sent_mails: 42, reply_mails: 6, current_backlinks: 18 }],
    [USER_DASHBOARD_TABLES.instagram]: [{ email: rhea }, { email: rhea }],
    [USER_DASHBOARD_TABLES.facebook]: [{ email: rhea }],
    [USER_DASHBOARD_TABLES.twitter]: [],
    [USER_DASHBOARD_TABLES.youtube]: [],
    [USER_DASHBOARD_TABLES.metaAds]: [
      { email: rhea, campaign_name: "Lead gen — Bengaluru", clicks: 534, spend: 205.4 },
      { email: rhea, campaign_name: "Retargeting", clicks: 120, spend: 64 },
    ],
    [USER_DASHBOARD_TABLES.leadQualificationData]: [
      { email: rhea, no_of_email_sent_to_leads: 120, no_of_responses_from_leads: 14, salesteam_sent_email_sent_count: 5 },
    ],
  };

  // Agent config tables. Google Ads' alias is ALSO the user-dashboard Google
  // Ads table (the legacy app read campaigns from the config row), so merge.
  for (const { name, table } of AGENT_CONFIG_TABLES) {
    tables[table] = [...(tables[table] ?? []), ...(configs[name] ?? [])];
  }

  return tables;
}

/** The api-keys screen in mock mode: two keys set, two not. */
export function buildApiKeyFixtures(now: number = Date.now()): Row[] {
  return [
    { key_name: "n8n_api_key", masked_value: "••••••••••••9f2c", has_value: true, updated_at: daysAgo(now, 20), updated_by: "thilak@ntimes.ai", synced_to_n8n: true },
    { key_name: "openai", masked_value: "••••••••••••a71b", has_value: true, updated_at: daysAgo(now, 6), updated_by: "thilak@ntimes.ai", synced_to_n8n: true },
    { key_name: "claude", masked_value: null, has_value: false, synced_to_n8n: false },
  ];
}
