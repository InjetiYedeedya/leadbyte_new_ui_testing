import { redactSecrets } from "@/lib/log-redact";
import { ApiTimeoutError, apiRequest } from "@/lib/api/client";
import { refusalOf } from "@/lib/api/refusal";
import type { GoogleProperty } from "@/lib/data/google-properties";
import type { GoogleSite } from "@/lib/data/google-sites";
import { isRedirectError } from "@/lib/auth/session-expired";

/**
 * Records what the customer chose after Google consent — step 3 of the
 * backend's flow.
 *
 * ## The contract (backend team, 2026-09-03)
 *
 *   POST /api/webhook/google-analytics-selected   an Analytics property
 *   POST /api/webhook/search-console-selected     a Search Console site
 *   POST /api/webhook/google-unified-selected     both, in one call
 *
 * All three go through the Lambda and need `x-api-key`, which `apiPost`
 * attaches. The endpoint follows what the customer actually picked, not which
 * flow they started: someone can run the combined consent and then have only
 * one product's list come back.
 *
 * ## What was wrong before
 *
 * Two mistakes, both worth naming because each produced a confident-looking
 * failure. The Search Console path was guessed as
 * `google-search-console-selected` — the real one has no `google-` prefix. And
 * when the Analytics call 404'd, the conclusion was that the Lambda had no such
 * route and the save was moved to n8n's `google_save_selection` webhook. n8n
 * answered `{"status":"error","message":"No connected Google account found"}`,
 * which read like a contract mismatch but was simply true: the login being
 * tested had never completed a real consent. The route was right all along.
 */
/**
 * How long to wait for the save.
 *
 * The default 8s is tuned for data reads, where a page fires several at once.
 * This is not a read: the Lambda hands off to an n8n flow that writes DynamoDB
 * and answers only when that finishes, and on a real account it routinely takes
 * longer than 8s. The read deadline was aborting it and the customer was told
 * "The operation was aborted due to timeout" — our own plumbing, quoted at
 * them, about a save that had in fact succeeded.
 *
 * Same lesson as `sendStrategyMessage`: a route that is legitimately slow needs
 * its own deadline, not the one meant for table reads.
 */
const SAVE_TIMEOUT_MS = 30_000;

export class GoogleSaveError extends Error {
  constructor(
    message: string,
    readonly userMessage?: string,
    /**
     * True when WE stopped waiting, rather than the backend refusing.
     *
     * n8n commits the row and then keeps the connection open, so a save that
     * outruns our deadline has very likely landed. The caller must verify
     * rather than report a failure — see `selectGoogleTargets`.
     */
    readonly timedOut: boolean = false,
  ) {
    super(message);
    this.name = "GoogleSaveError";
  }
}

export async function saveGoogleSelection({
  email,
  userId,
  property,
  site,
}: {
  email: string;
  /** The Firebase uid. Required by all three save endpoints (backend,
      2026-09-03) — the rows carry it alongside the email. */
  userId?: string;
  property?: GoogleProperty;
  site?: GoogleSite;
}): Promise<void> {
  if (!property && !site) {
    throw new GoogleSaveError("nothing was selected");
  }

  const path =
    property && site
      ? "/api/webhook/google-unified-selected"
      : property
        ? "/api/webhook/google-analytics-selected"
        : "/api/webhook/search-console-selected";

  const body: Record<string, unknown> = { email, business_id: email };

  // Sessions minted before the uid was stored have none. Sending an empty
  // `user_id` is worse than omitting it — it writes a row that looks attributed
  // and is not — so it is left out and logged instead.
  if (userId) {
    body.user_id = userId;
  } else {
    console.warn(
      `[google-save] no userId on the session for ${email} — sending without user_id`,
    );
  }

  if (property) {
    body.account_name = property.accountName;
    // Sent exactly as it arrived. The two flows spell it differently
    // (`508182301` vs `properties/517246553`) and we do not know which one the
    // backend stores, so normalising here could silently write the wrong key.
    body.property_id = property.propertyId;
    body.property_name = property.propertyName;
    // The legacy app's body for the same webhook (n8n `added_console`):
    // `{ name, id, websiteUrl: "", email }`. The workflow reads `id`, so a
    // body carrying only `property_id` saved no property, and the account
    // then read "not connected" though the save answered success
    // (2026-10-12). Sent under the legacy names as well — some branch reads
    // each spelling (CLAUDE.md, "the same fact goes out under several names").
    body.id = property.propertyId;
    body.websiteUrl = "";
  }

  if (site) {
    body.site_url = site.siteUrl;
    body.permission_level = site.permissionLevel;
  }

  // The Google account, which may differ from the LeadByte login — someone can
  // sign in as one address and own these under another.
  const googleEmail = property?.email || site?.email || "";
  if (googleEmail) body.google_email = googleEmail;
  // The legacy body's `name` is the Analytics ACCOUNT name first.
  const googleName = property?.accountName || property?.name || site?.name || "";
  if (googleName) body.name = googleName;

  console.log(`[google-save] POST ${path} ${JSON.stringify(redactSecrets(body))}`);

  let reply: unknown;
  try {
    reply = await apiRequest<unknown>(path, { method: "POST", body, timeoutMs: SAVE_TIMEOUT_MS });
  } catch (error) {
    // A dead session leaves as a redirect, not as this call's own
    // failure — see isRedirectError in session-expired.ts.
    if (isRedirectError(error)) throw error;
    // A deadline is not a refusal. Kept distinguishable all the way up so the
    // action can check the table n8n writes instead of announcing a failure.
    if (error instanceof ApiTimeoutError) {
      throw new GoogleSaveError(`${path} timed out after ${SAVE_TIMEOUT_MS}ms`, undefined, true);
    }
    // The backend's message says WHY, and a status alone does not: a 404 here
    // is "no such route" and "no connected Google account for this email" at
    // once. Its wording is written for a person and is more use than anything
    // generic we could substitute, so it is carried to the screen.
    const detail = error instanceof Error ? error.message : String(error);
    throw new GoogleSaveError(`${path} failed: ${detail}`, humanMessage(detail));
  }
  // A 200 refusal is a failed save — it used to read as saved.
  const refusal = refusalOf(reply);
  if (refusal !== null) {
    throw new GoogleSaveError(`${path} was refused: ${refusal}`, humanMessage(refusal));
  }
}

/** The backend replies `{ success: false, error: "..." }`, and `apiPost` throws
    with that text in the message. Anything that looks like a bare status line
    is ours to phrase, so it is not shown. */
function humanMessage(detail: string): string | undefined {
  const trimmed = detail.trim();
  if (trimmed === "" || /^leadbyte-api returned \d+$/.test(trimmed)) return undefined;
  return trimmed.slice(0, 200);
}
