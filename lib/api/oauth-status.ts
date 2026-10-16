import { isRedirectError } from "@/lib/auth/session-expired";
import { readTable, rowsFrom } from "@/lib/api/read-cascade";
import { cache } from "react";
import { ApiTimeoutError, apiGet } from "./client";
import { numericRowId } from "./row-id";
import { readIntegrations, type IntegrationKey, type IntegrationState } from "./integrations-status";
import { accountDetailsFromRows, NO_DETAILS, type AccountDetails } from "@/lib/data/account-details";
import {
  grantedGoogleProducts,
  hasGoogleProduct,
  type GoogleProduct,
} from "@/lib/data/google-products";

/**
 * Reads the backend's "Frontend Check" tables, which record whether a user has
 * completed an OAuth connection for a given platform.
 *
 * CONFIRMED contract (2026-08-27), from the previous app's
 * `src/services/oauthCheck.js` plus the Lambda's TABLE_ALIASES map:
 *
 * - One row per user, keyed by **email**.
 * - Row shape: `{ email, useremailid, Status, Expiry_date }`.
 * - `Status` must be exactly `"Done"`. Anything else means not connected.
 * - The expiry field is spelled inconsistently across tables, so all the
 *   known spellings are tried: Expiry_data / Expiry_date / expiry_data /
 *   expiry_date / ExpiryData.
 * - `"never"` (case-insensitive) means it does not expire.
 * - Otherwise it is `YYYY-MM-DD` and must be later than today.
 * - A row with `Status: "Done"` but no expiry field is treated as NOT
 *   connected, matching the previous app.
 */

/** Opaque table aliases. The backend maps these to real DynamoDB names. */
export const OAUTH_CHECK_TABLES = {
  googleAnalytics: "t54560ec50", // Google_website_Frontend_check
  googleAds: "t8f16b7a60", // Google_Ads_Frontend_Check
  metaAds: "t1128ab18f", // Meta_ads_Frontend_Check
  linkedInAds: "t7a06fce48", // Linkedin-Frontend_Check
  instagram: "t3bfd02d64", // Instagram_Frontend_Check_Social
  facebook: "t8030f74d9", // Facebook_Frontend_Check_Social
  /**
   * The RAW table name, not an alias — the odd one out, on purpose.
   *
   * No alias has been published for YouTube (the parity inventory names the
   * table but not its `t…` key), and inventing one would address a table that
   * does not exist. Raw names are addressable on the generic data API: the
   * Search Console breakdown tables are read that way for exactly this
   * reason, and `confirmAdsConnected` posts real names to
   * `/api/oauth/check-status`.
   *
   * TODO: swap to the alias when the backend team publishes it. Nothing else
   * changes — this is the only place the name appears.
   */
  youtube: "Youtube_Frontend_Check",
} as const;

export type OAuthPlatform = keyof typeof OAUTH_CHECK_TABLES;

/**
 * Browser entry points for starting each OAuth flow.
 *
 * VERIFIED 2026-08-27: these are exempt from the `x-api-key` gate and return
 * a clean 302 to the n8n flow with no headers, so a plain link works.
 *
 * Note `googleAds` is `/api/oauth/google-connect`, NOT `/api/oauth/google-ads`
 * — that path 404s. Corrected by the backend team.
 */
export const OAUTH_START_PATHS: Record<OAuthPlatform, string> = {
  googleAnalytics: "/api/oauth/google-analytics",
  googleAds: "/api/oauth/google-connect",
  metaAds: "/api/oauth/meta-ads",
  linkedInAds: "/api/oauth/linkedin-ads",
  instagram: "/api/oauth/instagram",
  facebook: "/api/oauth/facebook",
  // From the parity inventory §3.6, which lists the legacy app's own OAuth
  // starts. Unverified against `leadbyte-api_v1` — as are the two above it.
  youtube: "/api/oauth/youtube",
};

/**
 * `pending` is a consent with the account still unchosen: the customer
 * approved us, then left before picking WHICH property, site or page this
 * workspace uses (`awaitingChoice` on the row, written by the Google and
 * social callbacks). Nothing can run against it, so it is not `valid`; it is
 * not `not-connected` either, because consent was given. Screens say
 * "Finish setup".
 */
export type OAuthStatus = "valid" | "pending" | "expired" | "not-connected" | "error";

export interface OAuthCheckResult {
  status: OAuthStatus;
  /** `"never"`, a `YYYY-MM-DD` string, or null when unknown. */
  expiryDate: string | null;
}

const NOT_CONNECTED: OAuthCheckResult = { status: "not-connected", expiryDate: null };

function readExpiry(record: Record<string, unknown>): string | null {
  for (const key of ["Expiry_data", "Expiry_date", "expiry_data", "expiry_date", "ExpiryData"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    // An epoch number is an expiry too; it read as "no expiry", so "not connected".
    if (typeof value === "number" && Number.isFinite(value)) return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  }
  return null;
}

/**
 * Decides whether an expiry value is still in the future.
 *
 * Pure and exported so the date-boundary behaviour is testable without a
 * network call — "expires today" is the case most likely to be got wrong.
 */
export function isExpiryValid(expiry: string, now: Date): boolean {
  if (expiry.toLowerCase() === "never") return true;
  // `YYYY-MM-DD` is good until the end of that day. A full timestamp
  // ("2026-10-29T10:00:00Z") used to become `…T10:00:00ZT23:59:59` — invalid,
  // so an account with a live token read as expired (audit, 2026-09-29).
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(expiry);
  const expiresAt = dateOnly ? new Date(`${expiry}T23:59:59`) : new Date(expiry);
  if (Number.isNaN(expiresAt.getTime())) return false;
  if (!dateOnly) return expiresAt > now;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return expiresAt > startOfToday;
}

/**
 * Judges every row the query route returns and keeps the best answer.
 *
 * A query answers with a LIST where the item route answered with an object,
 * and production tables already hold SEVERAL rows per account: ids used to be
 * random, so every reconnect wrote another one instead of updating.
 *
 * Picking "the newest" is not available. A random id carries no ordering, and
 * these rows have no timestamp — sorting by id would be guessing. What the
 * caller actually asks is "can this account use Google right now", and the
 * honest reading of several rows is the best one: a live connection is not
 * cancelled by an expired row sitting beside it from a previous consent.
 * `valid` beats `expired` beats `not-connected`.
 *
 * Exported because which row wins is exactly the kind of thing that is
 * silently wrong for months.
 */
export function bestOfRows(data: unknown, now: Date): OAuthCheckResult {
  if (!Array.isArray(data)) return interpretOAuthRecord(data, now);
  if (data.length === 0) return NOT_CONNECTED;

  const rank = (status: OAuthStatus) =>
    status === "valid" ? 4 : status === "pending" ? 3 : status === "expired" ? 2 : status === "error" ? 1 : 0;

  const results = data.map((row) => interpretOAuthRecord(row, now));
  return results.reduce((best, next) => (rank(next.status) > rank(best.status) ? next : best), NOT_CONNECTED);
}

/** Interprets one Frontend Check record. Pure, so it can be tested directly. */
export function interpretOAuthRecord(item: unknown, now: Date): OAuthCheckResult {
  if (!item || typeof item !== "object") return NOT_CONNECTED;
  const record = item as Record<string, unknown>;

  const status = record.Status ?? record.status;
  // "done", "DONE" or "Done " are the same answer; only the exact spelling was.
  if (typeof status !== "string" || status.trim().toLowerCase() !== "done") {
    return { status: "not-connected", expiryDate: null };
  }

  const expiry = readExpiry(record);
  if (expiry === null) return NOT_CONNECTED;

  if (!isExpiryValid(expiry, now)) return { status: "expired", expiryDate: expiry };
  // Consent given, account not yet chosen (see `OAuthStatus`).
  const awaiting = record.awaitingChoice;
  if (awaiting === true || awaiting === "true") return { status: "pending", expiryDate: expiry };
  return { status: "valid", expiryDate: expiry };
}

/**
 * Looks up one platform's connection status for a user.
 *
 * Never throws: a connections panel that cannot reach the backend should show
 * "unknown", not take the page down.
 *
 * Memoised per render — the Connections and Advertising panels both ask about
 * the same platforms on a single page, and each ask is an HTTP round trip.
 */
/**
 * The rows under one account in one Frontend Check table. Throws on a failed
 * read. Memoised per render, so the status check and the per-product Google
 * check below share one round trip.
 */
const readCheckRows = cache(async function readCheckRows(
  platform: OAuthPlatform,
  email: string,
): Promise<unknown[]> {
  // `/api/query`, NOT `/api/data`. These tables have a composite key —
  // `email` partitions and a numeric `id` sorts — and the item route is a
  // GetItem, which needs BOTH halves. We only ever know the email, so that
  // route could never return a row: it is why every account read as "not
  // connected" no matter how many times someone completed consent. The query
  // route matches on the partition key alone and returns the rows under it.
  // (Schema confirmed by the backend team, 2026-09-08.)
  const payload = await apiGet<{ data?: unknown }>(
    `/api/query/${OAUTH_CHECK_TABLES[platform]}/${encodeURIComponent(email)}`,
  );
  // Every envelope the backend uses (`data`, `Items`, `data.Items`, bare),
  // not just `data`, which read the others as "not connected".
  return rowsFrom(payload);
});

/** Our platform ids under the new endpoint's names. */
const INTEGRATION_KEY: Record<OAuthPlatform, IntegrationKey> = {
  googleAnalytics: "google-analytics",
  googleAds: "google-ads",
  metaAds: "meta-ads",
  linkedInAds: "linkedin-ads",
  instagram: "instagram",
  facebook: "facebook",
  youtube: "youtube",
};

/** The endpoint's answer in this module's terms. */
export function resultFromIntegration(state: IntegrationState, needsChoice = false): OAuthCheckResult {
  // Connected with no account chosen is not usable: an ad or social platform
  // runs against ONE account, and the backend saying none is picked is the
  // one source that can say so (`accountChoice` below).
  const status: OAuthStatus =
    state.status === "connected"
      ? needsChoice && state.accountChosen === false
        ? "pending"
        : "valid"
      : state.status === "not-connected"
        ? "not-connected"
        : state.status;
  // `expiryDate` is only shown next to a live or expired connection; a
  // connection with no expiry on record reads as non-expiring, as before.
  const expiryDate =
    status === "valid" || status === "pending" || status === "expired" ? (state.expiresAt ?? "never") : null;
  return { status, expiryDate };
}

/**
 * The new one-call endpoint's answer for a platform, when it is deployed and
 * covers it (`integrations-status.ts`); null means read the tables.
 */
async function fromIntegrations(key: IntegrationKey): Promise<IntegrationState | null> {
  const map = await readIntegrations();
  return map?.[key] ?? null;
}

export const checkOAuthStatus = cache(async function checkOAuthStatus(
  platform: OAuthPlatform,
  email: string,
  now: Date = new Date(),
): Promise<OAuthCheckResult> {
  try {
    // The backend's own verdict, once it is live: token present and not
    // expired, from the real OAuth tables. Until then, the Frontend Check rows.
    const integration = await fromIntegrations(INTEGRATION_KEY[platform]);
    // Google Analytics is not an account pick of this kind: its property
    // choice is read from the row (`awaitingChoice`), not the endpoint.
    if (integration) return resultFromIntegration(integration, platform !== "googleAnalytics");
    return bestOfRows(await readCheckRows(platform, email), now);
  } catch (error) {
    // A dead session leaves as a redirect to sign in, not as this call's
    // own failure (audit, 2026-09-29).
    if (isRedirectError(error)) throw error;
    // A timeout is a slow backend, and it is handled: the answer is "error",
    // which blocks nothing. A warning, not an error: `console.error` from a
    // Server Component raises Next's red panel in development, which read as
    // the agent page failing when it had loaded fine (2026-09-28).
    if (error instanceof ApiTimeoutError) {
      console.warn(`[oauth-status] ${platform} check timed out for ${email}: ${error.message}`);
    } else {
      console.error(`[oauth-status] ${platform} check failed for ${email}:`, error);
    }
    return { status: "error", expiryDate: null };
  }
})

/**
 * One Google PRODUCT's status — Analytics or Search Console.
 *
 * Both live in the same `googleAnalytics` row, and it used to be read as
 * "both connected". They are separate grants (`lib/data/google-products.ts`),
 * so a valid row counts for a product only when that product was granted.
 * Anything short of `valid` is returned as it is: an expired or unreadable
 * Google connection is that for both products.
 */
export async function checkGoogleProduct(
  product: GoogleProduct,
  email: string,
  now: Date = new Date(),
): Promise<OAuthCheckResult> {
  // Once the endpoint is live, each product has its own entry — Search
  // Console has its own table (`google_console_auth`), so this is exact.
  const integration = await fromIntegrations(
    product === "analytics" ? "google-analytics" : "google-search-console",
  );
  if (integration) return resultFromIntegration(integration);
  const google = await checkOAuthStatus("googleAnalytics", email, now);
  if (google.status !== "valid") return google;
  try {
    const valid = (await readCheckRows("googleAnalytics", email)).filter(
      (row) => interpretOAuthRecord(row, now).status === "valid",
    );
    const granted = grantedGoogleProducts(valid);
    // A row from before `googleProducts` existed says nothing about WHICH
    // product was granted. It used to read as both, so an Analytics-only
    // account showed Search Console connected too. For such a row, the
    // product's own data arriving is the evidence (a failed read counts as
    // yes — an outage is no reason to un-connect someone).
    if (granted === "all") return (await productDataArrived(product, email)) ? google : NOT_CONNECTED;
    return hasGoogleProduct(granted, product) ? google : NOT_CONNECTED;
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { status: "error", expiryDate: null };
  }
}

/** Has any of this Google product's data landed? One small table. */
const productDataArrived = cache(async function productDataArrived(
  product: GoogleProduct,
  email: string,
): Promise<boolean> {
  const table = product === "analytics" ? "google_analytics_daily" : "search_console_daily";
  const outcome = await readTable(table, { email });
  return !outcome.ok || outcome.rows.length > 0;
});

/**
 * What this account has already granted, for the Google callback to add to
 * rather than overwrite. A failed read counts as nothing granted: writing
 * only what was just approved can hide an earlier grant (the screen then asks
 * again, which costs a click), but must never claim one.
 */
export async function readGrantedGoogleProducts(
  email: string,
  now: Date = new Date(),
): Promise<Set<GoogleProduct> | "all"> {
  // Read twice before giving up. The result is written straight back as the
  // whole list, so a failed read taken as "nothing granted" ERASED the other
  // product: connecting Search Console on a slow backend wiped Analytics
  // (2026-10-12, customers connecting the two separately).
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      // A consent awaiting its property pick still granted what it granted.
      const valid = (await readCheckRows("googleAnalytics", email)).filter((row) => {
        const status = interpretOAuthRecord(row, now).status;
        return status === "valid" || status === "pending";
      });
      return valid.length === 0 ? new Set() : grantedGoogleProducts(valid);
    } catch (error) {
      if (isRedirectError(error)) throw error;
      console.warn(`[oauth-status] could not read granted Google products for ${email} (attempt ${attempt}):`, error);
    }
  }
  return new Set();
}

/**
 * Has this account chosen WHICH account a platform should use — the ad
 * account a campaign is created in? `chosen`, `not-chosen`, or `unknown`.
 *
 * ONLY the backend's endpoint can say `not-chosen`: it reads the real OAuth
 * tables and treats a login with a single account as chosen. The Frontend
 * Check row can prove a choice (`selectedAccount`, written by our picker) but
 * never its absence — Google Ads' consent returns wherever n8n is configured,
 * not to our picker, so most Google connections carry no pick even when the
 * campaign has an account to go to. Blocking on that absence stopped every
 * such Google Ads campaign before it reached the backend (2026-09-30), so a
 * missing pick there is `unknown`, which the page mentions and does not block.
 * A check that cannot be read is `unknown` too. Never throws but for redirects.
 */
export type AccountChoice = "chosen" | "not-chosen" | "unknown";

export async function accountChoice(
  platform: OAuthPlatform,
  email: string,
  now: Date = new Date(),
): Promise<AccountChoice> {
  try {
    const integration = await fromIntegrations(INTEGRATION_KEY[platform]);
    if (integration && integration.accountChosen !== null) {
      return integration.accountChosen ? "chosen" : "not-chosen";
    }
    const rows = await readCheckRows(platform, email);
    return rows.some((row) => interpretOAuthRecord(row, now).status === "valid" && rowHasChosenAccount(row))
      ? "chosen"
      : "unknown";
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return "unknown";
  }
}

/** For the run gate: false ONLY when the backend says nothing is chosen. */
export async function hasChosenAccount(
  platform: OAuthPlatform,
  email: string,
  now: Date = new Date(),
): Promise<boolean> {
  return (await accountChoice(platform, email, now)) !== "not-chosen";
}

/** A row's `selectedAccount`, when it names one. Pure, so it is tested. */
export function rowHasChosenAccount(row: unknown): boolean {
  if (!row || typeof row !== "object") return false;
  const raw = (row as Record<string, unknown>).selectedAccount;
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const id = (parsed as Record<string, unknown>).id;
        return (typeof id === "string" && id.trim() !== "") || typeof id === "number";
      }
      return false;
    } catch {
      return false;
    }
  }
  if (raw && typeof raw === "object") {
    const id = (raw as Record<string, unknown>).id;
    return (typeof id === "string" && id.trim() !== "") || typeof id === "number";
  }
  return false;
}

/**
 * The ISO currency of the ad account this platform's campaigns are created in
 * (`INR`), or "" when nothing says. From the endpoint once live, else the
 * `selectedAccount` our picker saved — an `AdAccount`, which carries it. Sent
 * beside the budget so an amount is never a bare number in an unknown
 * currency (legacy flow guide §10). Never throws.
 */
export async function chosenAccountCurrency(platform: OAuthPlatform, email: string): Promise<string> {
  try {
    const integration = await fromIntegrations(INTEGRATION_KEY[platform]);
    if (integration?.selectedCurrency) return integration.selectedCurrency;
    for (const row of rowsForAccountName(await readCheckRows(platform, email), email, new Date())) {
      const raw = (row as Record<string, unknown> | null)?.selectedAccount;
      const account = typeof raw === "string" ? safeJson(raw) : raw;
      const currency = account && typeof account === "object" ? (account as Record<string, unknown>).currency : null;
      if (typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency.trim())) return currency.trim().toUpperCase();
    }
    return "";
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return "";
  }
}

/**
 * The rows an account's NAME (and currency) may be read from, best first.
 * Pure, so it is tested.
 *
 * One email holds several rows — old legacy and n8n ones beside ours — and
 * the name used to come from the FIRST row that had one, while the status came
 * from the best row (`bestOfRows`). So a connected Meta row could be labelled
 * with an old, expired row's account: "Connected · Healzy AI" on the LeadByte
 * workspace (LBS-1246). Now only a row that is itself connected may name the
 * account: our own row first (`numericRowId(email)`), then any with an account
 * chosen in our picker, then the rest. With no connected row, only our own
 * row is trusted — it is never another workspace's leftover.
 */
export function rowsForAccountName(rows: readonly unknown[], email: string, now: Date): unknown[] {
  const ownId = numericRowId(email);
  const isOwn = (row: unknown) => Number((row as Record<string, unknown> | null)?.id) === ownId;
  const live = rows.filter((row) => interpretOAuthRecord(row, now).status === "valid");
  if (live.length === 0) return rows.filter(isOwn);
  const rank = (row: unknown) =>
    isOwn(row) ? 0 : (row as Record<string, unknown> | null)?.selectedAccount ? 1 : 2;
  return [...live].sort((a, b) => rank(a) - rank(b));
}

/**
 * The name a check row's chosen account was saved under (`selectedAccount`,
 * a JSON string or an object — both have been written). "" when no row
 * names one. Pure, so it is tested.
 */
export function selectedNameFromRows(rows: unknown[]): string {
  for (const row of rows) {
    const raw = (row as Record<string, unknown> | null)?.selectedAccount;
    const account = typeof raw === "string" ? safeJson(raw) : raw;
    const name = account && typeof account === "object" ? (account as Record<string, unknown>).name : null;
    if (typeof name === "string" && name.trim() !== "") return name.trim();
  }
  return "";
}

/**
 * The connected account's name, from the backend (2026-10-01).
 *
 * Social page names lived only in a cookie of the browser that connected, so
 * any other browser — or the same one after signing in again — showed a
 * connected Instagram with no name. The backend's one-call status names the
 * selected account when it is deployed; the check row's `selectedAccount`
 * (written by our callback and picker) otherwise. Never throws: a name is
 * detail, and losing it must not lose the row.
 */
export async function chosenAccountName(platform: OAuthPlatform, email: string): Promise<string> {
  try {
    const integration = await fromIntegrations(INTEGRATION_KEY[platform]);
    if (integration?.selectedName) return integration.selectedName;
    return selectedNameFromRows(rowsForAccountName(await readCheckRows(platform, email), email, new Date()));
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return "";
  }
}

/** What the Google picker saved: the Analytics property and the Search Console site. */
export interface GoogleTargets {
  property: string;
  propertyId: string;
  site: string;
}

/**
 * The Google row's chosen targets (`selectedAccount`, written by the picker).
 * Pure, so it is tested. Empty strings when nothing names them — a row from
 * before the picker saved them, or one still awaiting its choice.
 */
export function googleTargetsFromRows(rows: unknown[]): GoogleTargets {
  const targets: GoogleTargets = { property: "", propertyId: "", site: "" };
  for (const row of rows) {
    const raw = (row as Record<string, unknown> | null)?.selectedAccount;
    const account = typeof raw === "string" ? safeJson(raw) : raw;
    if (!account || typeof account !== "object") continue;
    const a = account as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
    targets.property ||= text(a.property);
    targets.propertyId ||= text(a.propertyId);
    targets.site ||= text(a.site);
  }
  return targets;
}

/** The Google targets on record. Never throws: names are detail. */
export async function readGoogleTargets(email: string): Promise<GoogleTargets> {
  try {
    return googleTargetsFromRows(await readCheckRows("googleAnalytics", email));
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { property: "", propertyId: "", site: "" };
  }
}

/**
 * Everything we know about the account behind a connection: name, id and
 * identifying facts (`lib/data/account-details.ts`). The backend's one-call
 * status first once it is live, filled in from the check rows. Never throws:
 * details are detail, and losing them must not lose the row.
 */
export async function chosenAccountDetails(platform: OAuthPlatform, email: string): Promise<AccountDetails> {
  try {
    const integration = await fromIntegrations(INTEGRATION_KEY[platform]);
    const rawRows = await readCheckRows(platform, email);
    const fromRows = accountDetailsFromRows(rowsForAccountName(rawRows, email, new Date()));
    if (!integration?.selectedName) return fromRows;
    const facts = [...fromRows.facts];
    if (integration.selectedCurrency && !facts.includes(integration.selectedCurrency)) {
      facts.unshift(integration.selectedCurrency);
    }
    const id = integration.selectedId || fromRows.id;
    return { name: integration.selectedName, id: id === integration.selectedName ? "" : id, facts };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return NO_DETAILS;
  }
}

/**
 * What the backend holds for one platform, raw: the one-call status and every
 * check row. For the admin debug dump on the Connections page only. Never
 * throws; a failed read is reported in the dump rather than thrown.
 */
export async function readConnectionDebug(
  platform: OAuthPlatform,
  email: string,
): Promise<{ integration: unknown; rows: unknown }> {
  let integration: unknown = null;
  let rows: unknown;
  try {
    integration = await fromIntegrations(INTEGRATION_KEY[platform]);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    integration = { readFailed: error instanceof Error ? error.message : String(error) };
  }
  try {
    rows = await readCheckRows(platform, email);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    rows = { readFailed: error instanceof Error ? error.message : String(error) };
  }
  return { integration, rows };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
