/**
 * Every table the admin panel reads, by the alias the Lambda resolves.
 *
 * These are the aliases the legacy app's `aws.ts` uses, copied rather than
 * translated into real table names: the backend maps an alias to its table
 * before it routes (`resolveTableAlias`), so the alias is the contract that is
 * known to work in production. A real name passes through unchanged, which is
 * why the few v1-only tables (`leadbyte_openai_ads`) can sit beside them.
 */

export const ADMIN_TABLES = {
  adminUsers: "t70f27c14b", // leadbyte_admin_users, PK email
  activityLog: "td8ce89a96", // leadbyte_user_activity_log, PK logId
  adminNotifications: "t801d93f2f", // leadbyte_admin_notifications, PK notificationId
  errorNotifications: "t45dbf9aaf", // LeadByteErrorNotifications, PK errorId
  integrationRequests: "t45f92881b", // PK requestId
  users: "tf96ffabb6", // leadbyte_users, PK user_id
  orders: "t6b4ec5643",
  overallDetails: "t36c087b3a", // Leadbyte_User_Overall_Details
} as const;

/**
 * The agent configuration tables, in the order the Agents screen lists them.
 *
 * The legacy nine, plus OpenAI Ads, which exists only in this app — leaving it
 * out would under-count every configuration total on the Overview.
 */
export const AGENT_CONFIG_TABLES: readonly { name: string; table: string }[] = [
  { name: "Lead Qualification", table: "t851880042" },
  { name: "Social Media", table: "t09dbf9f15" },
  { name: "On-Page SEO", table: "t08739eb8f" },
  { name: "Off-Page SEO", table: "td8b2d361f" },
  { name: "Meta Ads", table: "t4b8d87fcb" },
  { name: "Google Ads", table: "t93bd28ae9" },
  { name: "LinkedIn Ads", table: "t8fddf209c" },
  { name: "OpenAI Ads", table: "leadbyte_openai_ads" },
  { name: "Podcast", table: "t0337fab55" },
  { name: "Custom Agent", table: "t7247cc9bc" },
];

/**
 * A platform's Frontend Check table — deleting a customer's row there is what
 * "disconnect" means. Keys are the `platform` values integration requests
 * carry.
 */
export const FRONTEND_CHECK_TABLES: Readonly<Record<string, string>> = {
  "google-ads": "t8f16b7a60",
  "meta-ads": "t1128ab18f",
  "linkedin-ads": "t7a06fce48",
  "google-analytics": "t54560ec50",
  instagram: "t3bfd02d64",
  facebook: "t8030f74d9",
  youtube: "t68af8eea8",
  linkedin: "t93372cebd",
  email: "tce90bc91e",
};

/** The per-customer tables behind the User Dashboard screen. */
export const USER_DASHBOARD_TABLES = {
  dailyMetrics: "tabecbb80a",
  pageTraffic: "t0c569f2c1",
  sessionPerSource: "t4c8ed46fc",
  sourceByCountry: "t1d3dcc308",
  competitors: "td69f404de",
  keywords: "tb655fffbb",
  blogPosting: "tb5e3dda86",
  offPageSeo: "ta8cad81e8",
  facebook: "tef4100e6a",
  instagram: "tc0873ef6d",
  twitter: "ta6b090f77",
  youtube: "t967b90d7c",
  googleAds: "t93bd28ae9",
  metaAds: "t1ea824a72",
  leadQualificationData: "t77a76971c",
  leadQualificationConfig: "t851880042",
} as const;

/**
 * The account whose own website the Website Analytics screen reports on —
 * LeadByte's, not a customer's. Same constant as the legacy panel.
 */
export const COMPANY_ANALYTICS_EMAIL = "apps@ntimes.ai";
