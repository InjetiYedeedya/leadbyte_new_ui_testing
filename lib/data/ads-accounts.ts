import { ApiError, ApiTimeoutError, apiDelete, apiRequest } from "@/lib/api/client";
import { refusalOf } from "@/lib/api/refusal";
import { OAUTH_CHECK_TABLES } from "@/lib/api/oauth-status";
import { dropConnectedDataCache } from "@/lib/data/connected-data";
import { isBackendConfigured } from "@/lib/api/config";
import { isRedirectError } from "@/lib/auth/session-expired";

/**
 * Steps 3–4 of the ad-platform connect flow: save the chosen account, confirm
 * it landed.
 *
 * ## The contract (backend team, 2026-09-03)
 *
 *   Google Ads   GET  /api/webhook/google-ads-selected-account?email=&account=
 *   Meta Ads     POST /api/webhook/meta-ads-selected-account   { email, account_id }
 *   LinkedIn Ads POST /api/webhook/linkedin-account-selection
 *                     { adAccountId, adAccountName, organizationReference, email, userId }
 *
 *   both:        POST /api/oauth/check-status { businessId, tableName }
 *
 * **The select methods are not symmetric, and it is not a mistake.** Google
 * selects with GET, Meta with POST. That is the fact most likely to be
 * "corrected" into a 404 by someone making the two platforms look alike, which
 * is why it is written down once, here, and never repeated in a page.
 *
 * `user_id` is injected from the JWT by the backend on both select routes and
 * wins over anything in the request, so it is not sent from here.
 *
 * ## There is no step 2, because there is nothing to call
 *
 * The documented flow has a "list ad accounts" call. Probed on 2026-09-03, it
 * is not a data source:
 *
 *   GET  /api/webhook/meta-ads-accounts   -> 200 {"received":true}
 *   POST /api/webhook/google-ad-accounts  -> 404 "webhook not registered"
 *
 * The first is a webhook ACK, not a list — and calling it on a page render
 * triggered an n8n workflow as a side effect of someone opening a screen, which
 * is the worse half of the bug. The accounts only ever arrive one way: n8n
 * appends them to the return URL, exactly as the Google Analytics flow appends
 * properties. `/connections/ads/callback` reads them there and hands them on in
 * a cookie; `parseAccountsParam` is that reader.
 *
 * If the backend later registers a real list endpoint, this is the file to add
 * it to — as a fallback for someone landing on the picker cold, never as the
 * primary source.
 */

export type AdsPlatform = "googleAds" | "metaAds" | "linkedInAds";

interface PlatformCalls {
  label: string;
  /** How this platform saves the chosen account. */
  select: { path: string; method: "GET" | "POST" };
  /** The Frontend_Check table `check-status` reads. Spelling is the backend's. */
  statusTable: string;
  /** Where the consent flow starts, for the "connect first" case. */
  connectHref: string;
}

export const ADS_PLATFORMS: Record<AdsPlatform, PlatformCalls> = {
  googleAds: {
    label: "Google Ads",
    select: { path: "/api/webhook/google-ads-selected-account", method: "GET" },
    statusTable: "Google_Ads_Frontend_Check",
    connectHref: "/api/ads/connect?platform=google-ads",
  },
  metaAds: {
    label: "Meta Ads",
    select: { path: "/api/webhook/meta-ads-selected-account", method: "POST" },
    // Note the lower-case `ads`. The Google table capitalises it and this one
    // does not; both spellings are the backend's own.
    statusTable: "Meta_ads_Frontend_Check",
    connectHref: "/api/ads/connect?platform=meta-ads",
  },
  linkedInAds: {
    label: "LinkedIn Ads",
    // The legacy app's call (LINKEDIN_ADS_FLOW.md 1.4), which it fired and
    // never checked. It is what tells n8n which ad account campaigns go into,
    // so here it is awaited like the other two.
    select: { path: "/api/webhook/linkedin-account-selection", method: "POST" },
    // Hyphenated and capitalised differently again: the backend's own name.
    statusTable: "Linkedin-Frontend_Check",
    connectHref: "/api/ads/connect?platform=linkedin-ads",
  },
};

/** The slug used in our own URLs, so a route param maps to a platform. */
export const ADS_SLUGS: Record<string, AdsPlatform> = {
  "google-ads": "googleAds",
  "meta-ads": "metaAds",
  "linkedin-ads": "linkedInAds",
};

export function platformFromSlug(slug: string): AdsPlatform | null {
  return ADS_SLUGS[slug] ?? null;
}

const SLUG_OF: Record<AdsPlatform, string> = {
  googleAds: "google-ads",
  metaAds: "meta-ads",
  linkedInAds: "linkedin-ads",
};

export function slugOf(platform: AdsPlatform): string {
  return SLUG_OF[platform];
}

/**
 * One ad account, as offered to the customer and as sent back on select.
 *
 * Every field the select call needs is carried, not just the id. An earlier
 * version kept `id`, `name` and one display string and dropped the rest — so
 * the save could only ever send an account id, and the backend was missing
 * `currency` and `business_name` for a row it had just handed us in full.
 * Anything we might have to send back has to survive the round trip through
 * the cookie.
 */
export interface AdAccount {
  /** What the select call identifies the account by. */
  id: string;
  /** What the customer reads. Falls back to the id when unnamed. */
  name: string;
  /** ISO currency, e.g. `USD`. Empty when the platform did not say. */
  currency: string;
  /** The owning business, e.g. `AI AGENT LLC`. Often empty — many accounts have none. */
  businessName: string;
  /** Meta's prefixed form, e.g. `act_100000000000002`. */
  resourceId: string;
  /**
   * The Facebook user id the account hangs off.
   *
   * Carried because `Meta_ads_Frontend_Check` is keyed on it, not on email —
   * `check-status` with an email answers "The provided key element does not
   * match the schema". Sending it back is what lets the backend write a row we
   * can later find.
   */
  fbUserId: string;
  /**
   * LinkedIn's owning organisation, e.g. `urn:li:organization:12345`.
   *
   * The LinkedIn select call sends it back, so it has to survive the round
   * trip through the cookie like everything else here. Empty elsewhere.
   */
  organizationReference: string;
  /**
   * The platform's own account state, e.g. LinkedIn's `ACTIVE`. Shown so a
   * paused or closed account is not chosen by mistake. Empty when not sent.
   */
  status: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate.trim();
    if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  }
  return "";
}

/** How deep to look for a nested `accounts` array before giving up. */
const MAX_DEPTH = 4;

/**
 * Finds the account rows inside whatever shape arrived.
 *
 * The real Meta payload is an array wrapping ONE object that holds both the
 * list and the connecting user:
 *
 *   [ { accounts: [ … ], user: { id, name } } ]
 *
 * so the rows are two levels down, and an array is not automatically the list.
 * Rather than hard-code that, this walks: an array of objects that carry ids is
 * the list; an object with an `accounts` / `data` / `items` array is a wrapper
 * to descend into. A shape change, or n8n sending `$json` instead of
 * `$json.accounts`, therefore needs no change here.
 */
function findRows(node: unknown, depth = 0): unknown[] {
  if (depth > MAX_DEPTH || node === null || typeof node !== "object") return [];

  if (Array.isArray(node)) {
    // An array of things that look like accounts IS the list. An array of
    // wrappers (the real Meta shape) is not — descend into each.
    const direct = node.filter((row) => accountId(record(row)) !== "");
    if (direct.length > 0) return direct;

    for (const row of node) {
      const found = findRows(row, depth + 1);
      if (found.length > 0) return found;
    }
    return [];
  }

  const fields = record(node);
  for (const key of ["accounts", "data", "items", "result", "adaccounts"]) {
    const found = findRows(fields[key], depth + 1);
    if (found.length > 0) return found;
  }
  return [];
}

/** Every spelling either platform uses for the account's own id. */
function accountId(r: Record<string, unknown>): string {
  return str(
    r.account_id,
    r.accountId,
    r.id,
    r.customer_id,
    r.customerId,
    r.customer,
    r.ad_account_id,
    // LinkedIn's spelling.
    r.adAccountId,
  );
}

/**
 * Turns whatever arrived into accounts.
 *
 * Read defensively on purpose: the two platforms name things differently —
 * Google Ads speaks of a customer id and a descriptive name, Meta of an
 * `act_…` resource id. Anything without an id is dropped rather than rendered
 * as a radio button that cannot be submitted.
 *
 * Note `account_id` is preferred over `id`: Meta sends both, identical, but the
 * select call is documented on `account_id` and taking the field that is named
 * for the job leaves less to go wrong if they ever diverge.
 */
/**
 * Meta's `account_status` is a number, and "1" means nothing to a reader.
 * These are Meta's documented codes. LinkedIn already sends words
 * (`ACTIVE`), which pass through; an unknown code is dropped rather than
 * shown as a bare number.
 */
const META_ACCOUNT_STATUS: Record<string, string> = {
  "1": "ACTIVE",
  "2": "DISABLED",
  "3": "UNSETTLED",
  "7": "PENDING RISK REVIEW",
  "8": "PENDING SETTLEMENT",
  "9": "IN GRACE PERIOD",
  "100": "PENDING CLOSURE",
  "101": "CLOSED",
};

function accountStatus(raw: string): string {
  if (!/^\d+$/.test(raw)) return raw;
  return META_ACCOUNT_STATUS[raw] ?? "";
}

export function parseAdAccounts(payload: unknown): AdAccount[] {
  const rows = findRows(payload);
  const seen = new Set<string>();
  const accounts: AdAccount[] = [];

  for (const row of rows) {
    const r = record(row);
    const id = accountId(r);
    if (id === "" || seen.has(id)) continue;
    seen.add(id);

    accounts.push({
      id,
      name:
        str(
          r.name,
          r.account_name,
          r.accountName,
          r.descriptive_name,
          r.descriptiveName,
          r.adAccountName,
          r.title,
        ) || id,
      currency: str(r.currency, r.currency_code, r.currencyCode),
      businessName: str(r.business_name, r.businessName, r.business),
      resourceId: str(r.resource_id, r.resourceId),
      fbUserId: str(r.fb_user_id, r.fbUserId, r.user_id),
      organizationReference: str(r.organizationReference, r.organization_reference),
      status: accountStatus(str(r.status, r.account_status)),
    });
  }

  return accounts;
}

export class AdsSelectError extends Error {
  constructor(
    message: string,
    readonly userMessage?: string,
    /** OUR deadline ran out — the save may well have landed. See `ApiTimeoutError`. */
    readonly timedOut = false,
  ) {
    super(message);
    this.name = "AdsSelectError";
  }
}

/**
 * Saves the chosen account.
 *
 * Given its own deadline for the same reason `saveGoogleSelection` has one:
 * this hands off to an n8n flow that writes DynamoDB before answering, and the
 * 8s read deadline aborts it — which then reads to the customer as a failure
 * for a save that succeeded.
 */
const SELECT_TIMEOUT_MS = 30_000;

export async function selectAdAccount(
  platform: AdsPlatform,
  { email, userId, account }: { email: string; userId?: string; account: AdAccount },
): Promise<void> {
  const { select } = ADS_PLATFORMS[platform];

  let reply: unknown;
  try {
    if (platform === "linkedInAds") {
      // LinkedIn's body is its own, in LinkedIn's field names (legacy
      // `Integrations.jsx`). `userId` IS sent here: this route is the legacy
      // app's, and it was never documented as reading the uid from the JWT.
      // Left off rather than sent empty when the session predates the uid.
      reply = await apiRequest<unknown>(select.path, {
        method: "POST",
        body: {
          adAccountId: account.id,
          adAccountName: account.name,
          organizationReference: account.organizationReference,
          email,
          ...(userId ? { userId } : {}),
        },
        timeoutMs: SELECT_TIMEOUT_MS,
      });
    } else if (select.method === "POST") {
      // The whole account, not just its id. The backend hands us `currency`,
      // `business_name` and the rest when it offers the list, and needs them
      // back to write a complete row — sending the id alone left it guessing.
      // `user_id` is deliberately absent: the backend injects it from the JWT
      // and its value wins over anything here.
      reply = await apiRequest<unknown>(select.path, {
        method: "POST",
        body: metaSelectBody(email, account),
        timeoutMs: SELECT_TIMEOUT_MS,
      });
    } else {
      // Google selects with GET, so the same fields travel as query
      // parameters. Empty ones are left off rather than sent blank — a blank
      // `business_name` is not the same statement as no business name.
      const query = new URLSearchParams({ email, account: account.id });
      if (account.name) query.set("name", account.name);
      if (account.currency) query.set("currency", account.currency);
      if (account.businessName) query.set("business_name", account.businessName);
      reply = await apiRequest<unknown>(`${select.path}?${query.toString()}`, {
        timeoutMs: SELECT_TIMEOUT_MS,
      });
    }
  } catch (error) {
    // A dead session leaves as a redirect, not as this call's own
    // failure — see isRedirectError in session-expired.ts.
    if (isRedirectError(error)) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    // What the backend actually said, for the log. Without it a failed save
    // reached the log as "leadbyte-api returned 500" and nothing else.
    const body = error instanceof ApiError && error.bodySnippet ? ` — reply: ${error.bodySnippet}` : "";
    throw new AdsSelectError(
      `${select.path} failed: ${detail}${body}`,
      humanMessage(detail),
      error instanceof ApiTimeoutError,
    );
  }
  // A 200 refusal is a failed selection — it used to read as saved.
  const refusal = refusalOf(reply);
  if (refusal !== null) {
    throw new AdsSelectError(`${select.path} was refused: ${refusal}`, humanMessage(refusal));
  }
}

/**
 * Meta's account-save body. Pure, so it is tested.
 *
 * The documented contract is `{ email, account_id }` (backend, 2026-09-03);
 * the rest is what the account list handed us, sent back so the backend can
 * write a complete row. Two things went wrong with it:
 * - blank fields were sent as `""`, which is a different statement to the
 *   workflow than an absent one — now left off, the way Google's are;
 * - an id that already carried Meta's `act_` prefix became `act_act_…`.
 * `user_id` stays absent: the backend injects it from the JWT.
 */
export function metaSelectBody(email: string, account: AdAccount): Record<string, string> {
  const bareId = account.id.replace(/^act_/, "");
  const body: Record<string, string> = {
    email,
    account_id: bareId,
    resource_id: account.resourceId || `act_${bareId}`,
  };
  if (account.name) body.name = account.name;
  if (account.currency) body.currency = account.currency;
  if (account.businessName) body.business_name = account.businessName;
  if (account.fbUserId) body.fb_user_id = account.fbUserId;
  return body;
}

/** Anything that looks like a bare status line is ours to phrase, so it is hidden. */
function humanMessage(detail: string): string | undefined {
  const trimmed = detail.trim();
  if (trimmed === "" || /^leadbyte-api returned \d+$/.test(trimmed)) return undefined;
  if (/did not answer within/.test(trimmed)) return undefined;
  return trimmed.slice(0, 200);
}

/**
 * Step 4: did the row land?
 *
 * `POST /api/oauth/check-status` answers `{ exists, data: { Status } }`. Only
 * an exact `"Done"` counts — the same rule `interpretOAuthRecord` follows for
 * the tables it reads directly.
 *
 * Never throws. A status check that cannot be made is reported as "not
 * confirmed yet", never as a failure: the select may well have succeeded, and
 * telling someone their connection failed sends them back through consent for
 * nothing.
 */
export async function confirmAdsConnected(
  platform: AdsPlatform,
  businessId: string,
): Promise<boolean> {
  if (!isBackendConfigured()) return false;

  try {
    const payload = await apiRequest<unknown>("/api/oauth/check-status", {
      method: "POST",
      body: { businessId, tableName: ADS_PLATFORMS[platform].statusTable },
    });

    const data = record(record(payload).data);
    return str(data.Status, data.status) === "Done";
  } catch (error) {
    // A dead session leaves as a redirect, not as this call's own
    // failure — see isRedirectError in session-expired.ts.
    if (isRedirectError(error)) throw error;
    console.error(`[ads-accounts] check-status for ${platform} failed:`, error);
    return false;
  }
}

/**
 * Platform names as n8n spells them in the return URL.
 *
 * The redirect says `platform=meta` and `platform=google`, our own routes say
 * `meta-ads` and `google-ads`, and `ADS_PLATFORMS` is keyed on `metaAds` /
 * `googleAds`. All three name the same two things, so every spelling anyone
 * actually sends is accepted here rather than in each caller.
 */
const PLATFORM_ALIASES: Record<string, AdsPlatform> = {
  meta: "metaAds",
  "meta-ads": "metaAds",
  meta_ads: "metaAds",
  metaads: "metaAds",
  facebook: "metaAds",
  google: "googleAds",
  "google-ads": "googleAds",
  google_ads: "googleAds",
  googleads: "googleAds",
  // n8n's LinkedIn redirect says `platform=linkedin`.
  linkedin: "linkedInAds",
  "linkedin-ads": "linkedInAds",
  linkedin_ads: "linkedInAds",
  linkedinads: "linkedInAds",
};

export function platformFromAny(value: string | null): AdsPlatform | null {
  if (!value) return null;
  return PLATFORM_ALIASES[value.trim().toLowerCase()] ?? null;
}

/** Where a platform's offered accounts wait between the callback and the picker. */
export function adsAccountsCookie(platform: AdsPlatform): string {
  return `leadbyte_ads_accounts_${slugOf(platform)}`;
}

/**
 * How long the offered list stays valid, in seconds.
 *
 * An hour, matching the Google flow: when the window lapses the customer does
 * not merely lose the picker, they have to walk back through consent to see the
 * same list again.
 */
export const ADS_OFFER_MAX_AGE = 60 * 60;

/**
 * A cookie has to carry this, and cookies cap around 4KB.
 *
 * Each account now carries currency, business name and ids, so a row is bigger
 * than it was — 20 of them is roughly 3KB, which leaves room. Real accounts
 * come in single digits.
 */
export const MAX_ADS_ACCOUNTS = 20;

/**
 * Reads the accounts out of the callback's `accounts` parameter.
 *
 * n8n builds the value with `encodeURIComponent(JSON.stringify(accounts))`, and
 * `nextUrl.searchParams` has already decoded it once, so this receives plain
 * JSON text.
 *
 * Never throws. A malformed list must cost the customer a picker, not the
 * connection they have just approved.
 */
export function parseAccountsParam(raw: string | null): AdAccount[] {
  if (!raw || raw.trim() === "") return [];
  try {
    return parseAdAccounts(JSON.parse(raw)).slice(0, MAX_ADS_ACCOUNTS);
  } catch (error) {
    console.error("[ads-accounts] could not read the accounts parameter:", error);
    return [];
  }
}

/** Reads the list back out of the cookie the callback wrote. */
export function parseStoredAccounts(raw: string | undefined): AdAccount[] {
  return parseAccountsParam(raw ?? null);
}

/**
 * LinkedIn's second source for the list, for someone who reaches the picker
 * with nothing in the cookie (LINKEDIN_ADS_FLOW.md 1.3).
 *
 * Unlike the Meta and Google "list" calls probed at the top of this file,
 * LinkedIn's is a real one: the Lambda proxies it to n8n's `Linkedin_ads`
 * webhook and passes the array back unchanged. It still runs a workflow, so it
 * is called only when the customer presses "Load my ad accounts", never on a
 * page render.
 *
 * Never throws: an empty list is the answer to every failure, and the picker
 * says so and offers a retry.
 */
export async function fetchLinkedInAccounts(email: string): Promise<AdAccount[]> {
  if (!isBackendConfigured()) return [];
  try {
    const payload = await apiRequest<unknown>(
      `/api/webhook/linkedin-ads-accounts?email=${encodeURIComponent(email)}`,
      { timeoutMs: SELECT_TIMEOUT_MS },
    );
    return parseAdAccounts(payload).slice(0, MAX_ADS_ACCOUNTS);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[ads-accounts] could not load the LinkedIn ad accounts:", error);
    return [];
  }
}

/**
 * Removes this account's connection row, which is what "connected" means
 * everywhere in the app (LINKEDIN_ADS_FLOW.md 1.5: `DELETE /api/data/{table}/{email}`,
 * the same call the admin panel's disconnect makes).
 *
 * Returns whether it landed rather than throwing, so the caller can say
 * truthfully which happened.
 */
export async function disconnectAdsPlatform(platform: AdsPlatform, email: string): Promise<boolean> {
  if (!isBackendConfigured()) return true;
  try {
    const reply = await apiDelete<unknown>(
      `/api/data/${encodeURIComponent(OAUTH_CHECK_TABLES[platform])}/${encodeURIComponent(email)}`,
    );
    // A 200 refusal is a row still there. It was reported as "disconnected"
    // (audit, 2026-09-29). NOTE: these tables are keyed email + id
    // (BACKEND.md B4.3), so a delete by email alone may be refused until the
    // backend accepts the id too — now that is said, not hidden.
    const refusal = refusalOf(reply);
    if (refusal !== null) throw new Error(refusal);
    dropConnectedDataCache(email);
    return true;
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(`[ads-accounts] could not disconnect ${platform} for ${email}:`, error);
    return false;
  }
}
