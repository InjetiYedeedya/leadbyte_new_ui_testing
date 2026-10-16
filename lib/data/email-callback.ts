import { cache } from "react";
import { cookies } from "next/headers";
import { ApiError, apiGet, apiPost } from "@/lib/api/client";
import { refusalOf } from "@/lib/api/refusal";
import { isBackendConfigured } from "@/lib/api/config";
import { getSession } from "@/lib/auth/session";
import { isRedirectError } from "@/lib/auth/session-expired";

/**
 * The mailbox n8n names when it sends the browser back.
 *
 * ## The contract
 *
 * n8n is configured with one stable URL per environment and appends what it
 * learned from the provider:
 *
 *   /connections/email/callback?status=success&platform=gmail
 *     &email={{ $json.gmail_address }}&name={{ encodeURIComponent($json.name) }}
 *
 * from a payload of `[{ "gmail_address": "apps@ntimes.ai", "name": "apps
 * ntimes" }]` (observed 2026-09-04). So the mailbox arrives as query
 * parameters, the same way the Google account list does — there is no read
 * endpoint to ask afterwards.
 *
 * ## Why it is handed on in a cookie
 *
 * The callback's job is to absorb n8n's URL and get out of the way, so it
 * redirects to the Connections page — and a redirect drops the query string.
 * An httpOnly cookie survives that hop, keeps the address out of our own URL
 * and history, and still says the right thing after a reload. Exactly the
 * mechanism the Google account list already uses, and for the same reason.
 *
 * Long-lived on purpose: this cookie IS the app's memory of which mailbox is
 * connected. n8n stores the token backend-side, but no endpoint we have will
 * tell us the address back, so if the cookie expires the card goes quiet until
 * the customer reconnects. Thirty days beats an hour for that, and the moment a
 * read endpoint exists this becomes a cache rather than the record.
 */
export const EMAIL_COOKIE = "leadbyte_email_connected";

/** Thirty days. See above — this is the record, not a hand-off. */
export const EMAIL_MAX_AGE = 30 * 24 * 60 * 60;

export interface ConnectedMailbox {
  /**
   * The mailbox's address. EMPTY when a backend row says a mailbox is
   * connected but does not name it — still connected, just unnamed. Callers
   * must fall back (`||`, not `??`) rather than print or send an empty value.
   */
  address: string;
  /** The mailbox's display name. Empty when the provider sent none. */
  name: string;
}

function str(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Reads the mailbox out of the callback's parameters.
 *
 * Returns null unless the provider actually reported success AND named an
 * address: `status=error`, or a success with nothing in `email`, is not a
 * connection, and showing one would be worse than showing none.
 *
 * `name` is already percent-encoded by n8n and decoded by `URLSearchParams`,
 * so it needs no handling here — but it is never trusted to be present.
 */
export function readEmailCallback(params: URLSearchParams): ConnectedMailbox | null {
  if (str(params.get("status")) !== "success") return null;

  const address = str(params.get("email"));
  if (address === "") return null;

  return { address, name: str(params.get("name")) };
}

/**
 * Why a callback carried no mailbox — read only once `readEmailCallback` has
 * said there is none.
 *
 * Google's consent screen lets people untick single permissions, and the
 * backend refuses to save a Gmail token that lacks `gmail.send` or
 * `gmail.modify` (one cannot send, the other cannot read replies). It is told
 * to say so as `status=error&reason=missing_scope`. The value is matched
 * loosely, and under `error` as well as `reason`, because the spelling had
 * not been confirmed when this was written and a near-miss would otherwise
 * fall back to the generic "didn't complete" line, which does not tell the
 * customer what to do differently.
 */
export type EmailCallbackFailure = "missing-scope" | "failed";

export function readEmailCallbackFailure(params: URLSearchParams): EmailCallbackFailure {
  const reason = `${str(params.get("reason"))} ${str(params.get("error"))}`.toLowerCase();
  return /scope/.test(reason) ? "missing-scope" : "failed";
}

/** Parses the cookie back. Never throws — a bad value simply means "unknown". */
export function parseEmailCookie(raw: string | undefined): ConnectedMailbox | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { address?: unknown; name?: unknown };
    const address = typeof parsed.address === "string" ? parsed.address.trim() : "";
    if (address === "") return null;
    return { address, name: typeof parsed.name === "string" ? parsed.name : "" };
  } catch {
    return null;
  }
}

export function serialiseMailbox(mailbox: ConnectedMailbox): string {
  return JSON.stringify(mailbox);
}

/** The cookie's options — one place, so both ways in write the same cookie. */
export const EMAIL_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: EMAIL_MAX_AGE,
} as const;

/**
 * The connected mailbox: the account's backend record (`MAILBOX_TABLE`)
 * first, and this browser's cookie only when the backend cannot be asked.
 *
 * It was the other way round, and the 30-day cookie then outlived the
 * mailbox itself: removed or revoked on the server, it still read
 * "Connected" in the browser that connected it. The record is what n8n sends
 * from, so it is the authority — a record that is gone (404) or says it is
 * not connected is "not connected" whatever the cookie says.
 *
 * `cache()`d: the agents page, the gate and the popups all ask in one render.
 * Never throws.
 */
export const getConnectedMailbox = cache(async function getConnectedMailbox(): Promise<ConnectedMailbox | null> {
  const store = await cookies();
  const fromCookie = parseEmailCookie(store.get(EMAIL_COOKIE)?.value);
  if (!isBackendConfigured()) return fromCookie;

  const session = await getSession();
  if (!session?.businessId) return fromCookie;
  try {
    const payload = await apiGet<{ data?: unknown }>(
      `/api/data/${MAILBOX_TABLE}/${encodeURIComponent(session.businessId)}`,
    );
    return parseMailboxRecord(payload?.data);
  } catch (error) {
    // A dead session leaves as a redirect, not as "no mailbox".
    if (isRedirectError(error)) throw error;
    if (error instanceof ApiError && error.status === 404) return null;
    // Could not ask: this browser's own record is the best answer left.
    console.error("[email] could not read the mailbox record:", error);
    return fromCookie;
  }
});

/**
 * Save the connected mailbox on the backend, the way the legacy app did.
 * Returns whether it landed; the callback must not fail over it — the cookie
 * still covers this browser.
 *
 * Called for BOTH ways in: the Gmail callback, and `connectEmail` once the
 * backend confirms an IONOS / Yahoo / custom-server login. The second was
 * missing, so a mailbox connected with a password was never recorded here and
 * the Connections page went on saying "Not connected" (2026-09-30).
 */
export async function saveMailboxRecord(
  email: string,
  userId: string | undefined,
  mailbox: ConnectedMailbox,
): Promise<boolean> {
  try {
    // POST with the key in the body, like every legacy Frontend Check write
    // (a PUT must not repeat the partition key — see CLAUDE.md).
    const reply = await apiPost<unknown>(`/api/data/${MAILBOX_TABLE}`, {
      email,
      userId: userId ?? "",
      Status: "Done",
      Expiry_data: "never",
      selectedAccount: JSON.stringify({ gmail_address: mailbox.address, name: mailbox.name }),
      // Flat as well, under the name the backend is moving to (2026-09-30):
      // a record without it will read as "incomplete".
      email_address: mailbox.address,
    });
    const refusal = refusalOf(reply);
    if (refusal !== null) throw new Error(refusal);
    return true;
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[email] could not save the mailbox record:", error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// The backend record — so a connection survives sign-out, other browsers and
// other devices.
// ---------------------------------------------------------------------------

/**
 * `email_fronted_details`, the legacy app's "Email Frontend Check" table,
 * keyed by the account email. The cookie above was the app's ONLY memory of a
 * connected mailbox, and signing out clears every `leadbyte_` cookie — so
 * after each sign-in (or on a second browser) every mail-gated agent asked the
 * customer to connect a mailbox they had already connected. The legacy app
 * wrote this row on connect and read it on every visit; this does the same.
 */
export const MAILBOX_TABLE = "tce90bc91e";

function field(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

/**
 * The mailbox a stored row describes, or null for no row.
 *
 * Legacy rows keep the account as JSON in `selectedAccount` (`{ gmail_address,
 * name }`); some keep it flat. A row with no address at all still means
 * connected — the legacy app treated any row as connected — so it comes back
 * with an empty address rather than an invented one.
 */
export function parseMailboxRecord(raw: unknown): ConnectedMailbox | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  // A row that SAYS it is not connected is not a connection. The legacy rule
  // (any row counts) passed the mailbox gates for a failed or revoked
  // mailbox. The positive spellings are listed rather than the negative
  // ones, so an unknown status fails closed; no status at all still counts.
  const status = field(row, "Status", "status").toLowerCase();
  if (!["", "done", "connected", "active"].includes(status)) return null;
  let account: Record<string, unknown> = {};
  if (typeof row.selectedAccount === "string") {
    try {
      const parsed: unknown = JSON.parse(row.selectedAccount);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        account = parsed as Record<string, unknown>;
      }
    } catch {
      // A malformed account is still a connection.
    }
  }
  // `row.email` is deliberately NOT read: it is the table's key, the ACCOUNT's
  // address, which is not necessarily the mailbox connected to it.
  const address =
    field(account, "gmail_address", "email", "address", "login_email", "loginEmail") ||
    field(row, "gmail_address", "email_address", "mailbox", "login_email", "loginEmail");
  // Empty when unknown — never a placeholder. A placeholder here was sent as
  // Off-Page SEO's outreach address and printed as the mailbox on screen.
  return { address, name: field(account, "name") || field(row, "name") };
}
