import { cache } from "react";
import { getSession } from "@/lib/auth/session";
import { readTables, type SourceOutcome } from "@/lib/api/read-cascade";
import { revalidateTag } from "next/cache";
import { ApiTimeoutError, apiGet } from "@/lib/api/client";
import { isBackendConfigured } from "@/lib/api/config";
import { isRedirectError } from "@/lib/auth/session-expired";

/**
 * Everything n8n has saved for the signed-in account, in one call.
 *
 * ## The contract (backend team, 2026-09-03)
 *
 *   GET /api/connected-data/{google-analytics|google-search-console|all}
 *   -> { success, service, email, connected, data: { <table name>: rows[] } }
 *
 * `x-api-key` plus the JWT. **The email is not ours to send** — the backend
 * takes it from the token and queries every table by it. That is the point of
 * the route: the old path read each table by name through `/api/query/{table}/
 * {email}`, which meant the client naming production tables and passing the key
 * it wanted its own rows for.
 *
 * ## Why one call rather than eight
 *
 * The Lambda queries all the tables in parallel and answers once. Eight
 * sequential round trips through our own 8s-per-call deadline was the previous
 * shape, and any one of them timing out silently blanked a panel.
 *
 * ## `connected` is not the same question as "is there data"
 *
 * The backend sets `connected: true` when ANY row exists. A freshly connected
 * account has none for a while — n8n's ingestion runs after the OAuth row is
 * written — so `connected: false` here means "nothing yet", never "the
 * connection failed". `checkOAuthStatus` remains the authority on whether the
 * account is actually linked; these two disagreeing is the normal state for the
 * first few minutes, and the screens say "connected, no data yet" for it.
 */

/** Analytics tables, in the bundle's own spelling. */
export const GA_TABLES = [
  "google_analytics_daily",
  "google_analytics_breakdown",
  "daily_metrics_30days",
  "page_traffic",
  "session_per_source",
  "source_by_country",
] as const;

/** Search Console tables, same. */
export const GSC_TABLES = ["search_console_daily", "search_console_breakdown"] as const;

/**
 * Ad tables, same. Missing from the fallback, so every ad screen went empty
 * whenever the bundle route errored, while the tables themselves could be read
 * (audit, 2026-09-29).
 */
export const ADS_TABLES = [
  "google_ads_full_insights",
  "meta_ads_full_insights",
  "google_ads_daily",
  "meta_ads_daily",
] as const;

export type TableRows = Record<string, unknown[]>;

export interface ConnectedData {
  /** What the backend read the caller's email as. Logged, never rendered. */
  email: string;
  /** Table name → its rows. Missing tables read as an empty array. */
  tables: TableRows;
  /** True when any table had a row. */
  hasRows: boolean;
  /**
   * Did the read actually happen?
   *
   * False means we could not ask — every route failed. That is a different
   * situation from "connected with nothing in it", and it used to look
   * identical on screen because a failure was swallowed into an empty bundle.
   * A screen showing "no data yet" over a broken read is telling the customer
   * something we do not know.
   */
  ok: boolean;
  /** Why it failed, for an honest "couldn't load this" state. */
  error: string | null;
  /**
   * Per-table outcome, populated only when the row-by-row fallback ran.
   *
   * This is the `sources` map the legacy dashboard kept — one entry per table,
   * so one broken table does not make the whole screen look empty.
   */
  sources?: Record<string, SourceOutcome>;
}

const EMPTY: ConnectedData = {
  email: "",
  tables: {},
  hasRows: false,
  // An unconfigured environment is a working environment, not a failed read.
  ok: true,
  error: null,
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Reads the bundle out of the response.
 *
 * Pure, and tolerant of two things that have both already happened once on this
 * backend: a payload wrapped in `{ success, data }` versus returned bare, and a
 * table key present but null rather than absent.
 */
export function parseConnectedData(payload: unknown): ConnectedData {
  const body = record(payload);
  // `{ data: { … } }`, `{ data: { data: { … } } }`, or the table map bare.
  // Only the first was read, so the other two arrived as "no data" over a
  // bundle full of rows (audit, 2026-09-29).
  const outer = body.data !== undefined ? record(body.data) : withoutMeta(body);
  const data = outer.data !== undefined && isTableMap(record(outer.data)) ? record(outer.data) : outer;
  const tables: TableRows = {};
  let hasRows = false;

  for (const [table, rows] of Object.entries(data)) {
    const list = Array.isArray(rows) ? rows : [];
    tables[table] = list;
    if (list.length > 0) hasRows = true;
  }

  return {
    email: typeof body.email === "string" ? body.email : "",
    tables,
    hasRows,
    ok: true,
    error: null,
  };
}

/** The envelope's own fields, which are not tables. */
function withoutMeta(body: Record<string, unknown>): Record<string, unknown> {
  const { success: _s, email: _e, error: _x, message: _m, ...rest } = body;
  return rest;
}

/** A map whose values are row lists (or null) — the bundle's shape. */
function isTableMap(value: Record<string, unknown>): boolean {
  const values = Object.values(value);
  return values.length > 0 && values.every((v) => v === null || Array.isArray(v));
}

/**
 * A 200 that says `success: false` is a failed read. It was parsed as
 * "connected, no data", cached for two minutes, and never fell back to the
 * per-table reads.
 */
export class BundleRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleRefusedError";
  }
}

function assertBundle(payload: unknown): unknown {
  const body = record(payload);
  if (body.success === false) {
    throw new BundleRefusedError(
      typeof body.error === "string" && body.error !== "" ? body.error : "The bundle read was refused.",
    );
  }
  return payload;
}

/** Rows for one table, empty when the bundle did not carry it. */
export function tableRows(data: ConnectedData, table: string): unknown[] {
  return data.tables[table] ?? [];
}

/**
 * Fetches the whole bundle.
 *
 * `cache()`d because the Analytics screen, the Search Console keyword table and
 * the connect prompt all want it inside one render, and it is a single call
 * for all of them.
 *
 * Never throws: a backend that cannot answer must leave the screens in their
 * empty state, not take the page down. The failure is logged, because
 * "connected but blank" and "the call failed" look identical on screen and are
 * different problems.
 */
export const getConnectedData = cache(async function getConnectedData(): Promise<ConnectedData> {
  if (!isBackendConfigured()) return EMPTY;

  try {
    const payload = await readBundle();
    const parsed = parseConnectedData(payload);

    if (!parsed.hasRows) {
      // Names the tables that came back so an email-keying mismatch is
      // diagnosable from the log alone — the backend flagged that risk, and it
      // looks exactly like "no data yet" from the UI.
      console.log(
        `[connected-data] no rows for ${parsed.email || "unknown email"} — ` +
          `tables: ${Object.keys(parsed.tables).join(", ") || "none returned"}`,
      );
    }

    return parsed;
  } catch (error) {
    // A dead session is not a broken bundle route, and retrying every table
    // individually would only fail twelve more times before showing the same
    // empty dashboard. Let the "sign in again" redirect straight out.
    if (isRedirectError(error)) throw error;
    console.error("[connected-data] /api/connected-data/all failed:", error);
    // A TIMEOUT is not a broken route, it is a slow backend — and answering
    // it with twelve to twenty-four more calls (the fallback reads each table
    // through a three-step cascade) makes the backend slower still, for every
    // page at once. Only a route that actually answered with an error is
    // worth routing around. The screens show their "couldn't load" state.
    if (error instanceof ApiTimeoutError) {
      return { ...EMPTY, ok: false, error: error.message };
    }
    // The bundle route is one call for a dozen tables, which makes it one point
    // of failure for the whole dashboard. Fall back to reading the tables
    // individually through the documented three-way cascade (uid index → email
    // query → email scan): slower, and it keeps the screens alive when the
    // bundle route is the only thing that is broken.
    return readTablesIndividually(error);
  }
});

const bundleTag = (businessId: string) => `connected-data:${businessId}`;

/**
 * The bundle, read fresh.
 *
 * It was wrapped in `unstable_cache` for two minutes per account. In
 * production that did nothing but cost memory: the app runs on Cloudflare
 * Workers through OpenNext, and `open-next.config.ts` configures no shared
 * cache, so every read missed — while Next still turned the whole reply into
 * a string twice per read on its way into a cache that stored nothing. This
 * is the biggest reply the app handles (every connected table, no date
 * limit), and those copies helped push requests past the Worker's 128 MB
 * limit ("Error 1102", 2026-10-05). React `cache()` on `getConnectedData`
 * still dedupes it within one render.
 *
 * If a real shared cache is ever configured, a cached read can come back —
 * with the account in the key, because every account hits the SAME url.
 */
async function readBundle(): Promise<unknown> {
  return assertBundle(await apiGet<unknown>("/api/connected-data/all"));
}

/**
 * Tell Next this account's connected data changed.
 *
 * Nothing is kept across requests any more (see `readBundle`), but
 * `revalidateTag` also marks the browser's router cache stale, so a screen is
 * re-read after a connection changes. Only from a Server Action or Route
 * Handler.
 */
export function dropConnectedDataCache(businessId: string): void {
  revalidateTag(bundleTag(businessId));
}

/**
 * The fallback: every table, read the long way, with a per-table outcome.
 *
 * `ok` is true when ANY table answered — the dashboard is partly alive, and
 * saying "couldn't load" over tables that did load would be as wrong as the
 * empty state this replaces.
 */
async function readTablesIndividually(bundleError: unknown): Promise<ConnectedData> {
  const session = await getSession();
  if (!session) {
    return {
      ...EMPTY,
      ok: false,
      error: bundleError instanceof Error ? bundleError.message : String(bundleError),
    };
  }

  const names = [...GA_TABLES, ...GSC_TABLES, ...ADS_TABLES];
  const sources = await readTables(names, {
    uid: session.userId,
    email: session.businessId,
  });

  const tables: TableRows = {};
  let hasRows = false;
  for (const name of names) {
    const rows = sources[name]?.rows ?? [];
    tables[name] = rows;
    if (rows.length > 0) hasRows = true;
  }

  const anyOk = Object.values(sources).some((outcome) => outcome.ok);
  const firstError = Object.values(sources).find((outcome) => !outcome.ok)?.error ?? null;

  return {
    email: session.businessId,
    tables,
    hasRows,
    ok: anyOk,
    error: anyOk ? null : firstError,
    sources,
  };
}
