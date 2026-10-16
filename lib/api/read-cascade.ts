import { ApiError, apiGet } from "@/lib/api/client";
import { isRedirectError } from "@/lib/auth/session-expired";

/**
 * Reading one table three ways, and saying which silence you are looking at.
 *
 * ## The cascade (FRONTEND_BACKEND_API_CALLS.md §10)
 *
 *   GET /api/data-by-uid/{table}/{uid}   fast path — the user_id index
 *   GET /api/query/{table}/{email}       email is the partition key
 *   GET /api/scan/{table}/{email}        email is a plain attribute
 *
 * Three routes because the tables are not shaped alike: some are keyed on the
 * email, some carry it as an ordinary attribute, and some have a `user_id`
 * index. Which one answers is a fact about the table, not about the account, so
 * every read tries them in order and stops at the first that returns rows.
 *
 * ## Why the outcome is `{ ok, error, rows }` and not just rows
 *
 * "No rows" and "we could not ask" are different situations that look identical
 * once a failure has been swallowed into an empty array — and the screen then
 * shows a confident empty state over a broken read. This is the same
 * distinction the analysis screens needed for `partial_errors`: an empty state
 * has to be earned.
 *
 * Never throws. A dashboard that fetches a dozen tables must not lose all of
 * them because one 500'd.
 */

export interface SourceOutcome<T = Record<string, unknown>> {
  ok: boolean;
  /** Why the read failed, for the log and for an honest "couldn't load" state. */
  error: string | null;
  rows: T[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The rows in a reply, whatever shape it arrived in.
 *
 * A single record is wrapped into a list of one: the cascade tries a get-style
 * route and a query-style route against the same table, and one object is the
 * same answer as a list containing it.
 */
export function rowsFrom<T = Record<string, unknown>>(payload: unknown): T[] {
  return unwrapRows(payload, 0).filter(isNonEmptyRow) as T[];
}

/** The list keys a reply has been seen to carry its rows under. */
const LIST_KEYS = ["data", "Items", "items", "rows", "results", "Item", "item"] as const;

/**
 * Walks the envelope. Only reading `data` was too narrow: a reply arriving as
 * `{ data: { Items: [...] } }`, `{ Items: [...] }`, `{ data: { data: [...] } }` or
 * a JSON string read as NO rows, and the screen showed its empty state over
 * data the backend had sent (audit, 2026-09-29).
 */
function unwrapRows(payload: unknown, depth: number): unknown[] {
  if (depth > 3) return [];
  if (typeof payload === "string") {
    const text = payload.trim();
    if (!text.startsWith("{") && !text.startsWith("[")) return [];
    try {
      return unwrapRows(JSON.parse(text), depth + 1);
    } catch {
      return [];
    }
  }
  if (Array.isArray(payload)) return payload;

  const body = record(payload);
  if (body === null) return [];
  // An explicit failure is not data, even when a `data` key came with it.
  if (body.success === false) return [];

  for (const key of LIST_KEYS) {
    const value = body[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) || typeof value === "string") return unwrapRows(value, depth + 1);
    const inner = record(value);
    if (inner === null) continue;
    // A wrapper around the list (`data.Items`, `data.data`), or the one record.
    if (LIST_KEYS.some((k) => inner[k] !== undefined)) return unwrapRows(inner, depth + 1);
    return [inner];
  }
  return [];
}

/** `{}` is not a row. `{ success: true, data: {} }` used to count as one and stopped the cascade before the route that had the data. */
function isNonEmptyRow(row: unknown): boolean {
  const r = record(row);
  return r !== null && Object.keys(r).length > 0;
}

/** Turns a cascade's result into the outcome a screen can branch on. */
export function readSourceOutcome<T = Record<string, unknown>>(result: {
  rows: T[];
  error: unknown;
}): SourceOutcome<T> {
  if (result.rows.length > 0) {
    // Rows in hand are rows, even if a later route in the cascade then failed.
    return { ok: true, error: null, rows: result.rows };
  }
  if (result.error !== null && result.error !== undefined) {
    const error =
      result.error instanceof Error ? result.error.message : String(result.error);
    return { ok: false, error, rows: [] };
  }
  return { ok: true, error: null, rows: [] };
}

/**
 * Reads a table by uid, then by email query, then by email scan.
 *
 * The LAST error is kept, not the first: with no rows anywhere, the most
 * specific failure is the one from the route most likely to have been right.
 * A route that answers 404 or empty is not an error — it is that table telling
 * us it is not shaped that way.
 */
export async function readTable<T = Record<string, unknown>>(
  table: string,
  keys: { uid?: string; email: string },
): Promise<SourceOutcome<T>> {
  // The table name is encoded too. Every caller so far passes a safe
  // identifier, where this is a no-op — but `ads-website details` has a SPACE
  // in it, and an unencoded space makes the request a different URL than the
  // one intended.
  const name = encodeURIComponent(table);
  const paths = [
    ...(keys.uid ? [`/api/data-by-uid/${name}/${encodeURIComponent(keys.uid)}`] : []),
    `/api/query/${name}/${encodeURIComponent(keys.email)}`,
    `/api/scan/${name}/${encodeURIComponent(keys.email)}`,
  ];

  let error: unknown = null;
  // Whether ANY route answered. One that answered with no rows makes "no rows"
  // the true answer, whatever an earlier route threw. Keeping that earlier
  // error marked every agent dashboard "isn't available — Could not resolve
  // userId to email" on the live site: the uid route refuses accounts it has
  // no mapping for, and the email routes after it answered fine
  // (seen live, 2026-09-29).
  let answered = false;

  for (const path of paths) {
    try {
      const rows = rowsFrom<T>(await apiGet<unknown>(path));
      answered = true;
      if (rows.length > 0) return readSourceOutcome({ rows, error: null });
    } catch (caught) {
      // A dead session leaves as a redirect, never as a failed table. This
      // cascade exists to turn a route that cannot answer into an empty
      // state, and that is exactly the wrong response to "sign in again" —
      // swallowing it here is what left every one of these six tables logging
      // "every route failed" while the customer watched a blank dashboard.
      if (isRedirectError(caught)) throw caught;
      // A 404 is the table saying it is not shaped for this route — the
      // documented meaning above — not a failure.
      if (caught instanceof ApiError && caught.status === 404) continue;
      error = caught;
    }
  }

  const outcome = readSourceOutcome<T>({ rows: [], error: answered ? null : error });
  if (!outcome.ok) {
    console.error(`[read-cascade] every route failed for ${table}:`, error);
  }
  return outcome;
}

/**
 * Reads several tables at once, keeping a per-table outcome.
 *
 * This is the `sources` map the legacy dashboard had: one entry per table, so
 * a tab can say "nothing yet" where the read succeeded and "couldn't load
 * this" where it did not, instead of showing the same empty state for both.
 */
export async function readTables(
  tables: readonly string[],
  keys: { uid?: string; email: string },
): Promise<Record<string, SourceOutcome>> {
  const outcomes = await Promise.all(tables.map((table) => readTable(table, keys)));
  return Object.fromEntries(tables.map((table, i) => [table, outcomes[i]!]));
}
