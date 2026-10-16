import { dropConnectedDataCache } from "@/lib/data/connected-data";
import { apiPost } from "./client";
import { refusalOf } from "./refusal";
import { OAUTH_CHECK_TABLES, type OAuthPlatform } from "./oauth-status";
import { numericRowId } from "./row-id";

/**
 * Writes the "Frontend Check" row that marks a platform as connected.
 *
 * ## Why this exists, which is the whole point
 *
 * Nothing in this app wrote that row. `oauth-status.ts` only ever READ it, and
 * the note on the Google callback route said the row was "written by a separate
 * downstream step" of n8n. That was wrong. There is no such step: in the legacy
 * production app the FRONTEND writes it, in `Integrations.jsx`:
 *
 *     syncFrontendCheckConnect('google-analytics', user?.email, user?.uid)
 *       → saveToDynamoDB(table, { email, userId, Status: 'Done',
 *                                 Expiry_data: 'never' })
 *       → POST /api/data/{table}
 *
 * When the app was rewritten, the read was carried across and the write was
 * not. The consequence is not subtle: consent succeeds, Google hands back the
 * property list, and the account still reads "Not connected" forever, because
 * the only thing that ever said otherwise was never called. Observed live
 * 2026-09-08 — a completed `google-unified` consent returning 3 properties and
 * 2 sites, with the row still absent minutes later.
 *
 * ## Why POST with the key in the body
 *
 * `POST /api/data/{table}` creates a row and takes the partition key IN the
 * body — that is the shape the legacy app uses in production. `PUT` is the
 * update, and it takes the key in the URL and must NOT repeat it in the body
 * (see CLAUDE.md: sending it is what broke sign-in on 2026-09-02).
 *
 * ## Why Search Console has no call of its own
 *
 * It has no Frontend Check table: Analytics and Search Console share the
 * `googleAnalytics` row. They are NOT one grant, though — each Google flow asks
 * for its own scopes — so the Google callback also writes `googleProducts`,
 * saying which of the two this account has granted
 * (`lib/data/google-products.ts`).
 */

/** The row shape, confirmed by the backend team 2026-09-08. */
interface ConnectionRecord {
  email: string;
  /** The sort key. A NUMBER — see `connectionRowId`. */
  id: number;
  userId: string;
  Status: "Done";
  /**
   * `Expiry_date`, with an E — not `Expiry_data`.
   *
   * The legacy app writes `Expiry_data` and this copied it. The real column is
   * `Expiry_date`; the reader tolerates both spellings, so the misspelling
   * would have written a row that read back as connected while leaving the
   * actual expiry column empty.
   *
   * `"never"` because these connections are refreshed by n8n, not re-consented.
   */
  Expiry_date: "never";
  /** Present only when a specific account was chosen, matching the legacy app. */
  selectedAccount?: string;
  /** Google only: which products were granted, e.g. `analytics,search_console`. */
  googleProducts?: string;
  /**
   * Consent given, account not yet chosen. Written by a callback that is
   * about to send the customer to a picker, and dropped when the pick is
   * saved (the same row is rewritten — its id comes from the email). Read as
   * "Finish setup", never "Connected" (`OAuthStatus` in `oauth-status.ts`).
   * `Status` stays "Done" on purpose: n8n reads this row when the pick is
   * saved and answers "No connected Google account found" without it.
   */
  awaitingChoice?: "true";
}

/**
 * Records a completed OAuth connection.
 *
 * Returns whether the write landed rather than throwing. A failure here must
 * not take down the callback the customer is mid-way through: they HAVE
 * approved us at Google, and dropping them on an error page loses that. The
 * honest outcome of a failed write is that the app goes on reporting "not
 * connected", which is what the screens already say and is true until the row
 * exists — so nothing here can turn a failure into a false success.
 */
export async function recordOAuthConnection(
  platform: OAuthPlatform,
  email: string,
  userId?: string,
  selectedAccount?: unknown,
  extra: { googleProducts?: string; awaitingChoice?: boolean } = {},
): Promise<boolean> {
  if (!email) return false;

  const record: ConnectionRecord = {
    email,
    id: numericRowId(email),
    userId: userId ?? "",
    Status: "Done",
    Expiry_date: "never",
  };
  if (selectedAccount !== undefined) {
    record.selectedAccount = JSON.stringify(selectedAccount);
  }
  if (extra.googleProducts !== undefined) {
    record.googleProducts = extra.googleProducts;
  }
  if (extra.awaitingChoice) record.awaitingChoice = "true";

  try {
    const reply = await apiPost<unknown>(`/api/data/${OAUTH_CHECK_TABLES[platform]}`, record);
    // A 200 refusal is a failed write, not a recorded connection.
    const refusal = refusalOf(reply);
    if (refusal !== null) throw new Error(refusal);
    console.log(`[oauth-connect] recorded ${platform} for ${email}`);
    // A new connection means new data on its way: the next read of the
    // bundle must not be the two-minute-old one that predates it.
    dropConnectedDataCache(email);
    return true;
  } catch (error) {
    // Loud, because the screens will now say "not connected" about an account
    // that just finished consent, and that gap is otherwise unexplainable from
    // the outside.
    console.error(`[oauth-connect] could not record ${platform} for ${email}:`, error);
    return false;
  }
}
