/**
 * What a ChatGPT Ads failure means, and what the customer is told about it.
 *
 * ## Why this is a module and not a `catch` at each call site
 *
 * The service's contract draws a line most APIs do not, and it is the whole
 * reason this file exists: **400, 401 and 403 are OUR bug, not the customer's,
 * and its words must never reach them.** The person at the screen cannot fix a
 * missing field in a request they did not compose or a misconfigured service
 * key. Showing them "unauthorised" sends them hunting for a login problem that
 * does not exist, and they will try signing out and back in — which changes
 * nothing and loses their draft.
 *
 * 422 and 402 are the opposite: those texts are actionable and must survive
 * intact. "The image could not be downloaded from …" tells someone exactly what
 * to fix. Paraphrasing it into "something went wrong" throws away the only
 * useful sentence in the response.
 *
 * One classifier, so that distinction cannot be made differently on seven
 * screens.
 *
 * ## Why the parsing is defensive
 *
 * This runs inside the error path. A 422 with no `fields`, a 409 with no
 * `created`, an HTML error page from a proxy — every one of those has to
 * produce a usable error rather than throwing, or the customer sees a blank
 * screen instead of the problem. Same rule as `analysis-job.ts`: the thing that
 * interprets failure may not fail.
 */

export type AdsErrorKind =
  /** Ours. Log it, say so generically, never quote the service. */
  | "bug"
  /** No payment method on the ad account — their words, verbatim. */
  | "billing"
  /** Bad input, usually with a per-field breakdown. Show it. */
  | "input"
  /** Part of the campaign was created. Never retry. */
  | "partial"
  /** Busy or upstream failure. Worth one retry. */
  | "retry"
  /** We stopped waiting. Whether it landed is genuinely unknown. */
  | "unknown";

/** One row of a 422's `fields` array. The key is `message`, NOT `problem`. */
export interface AdsFieldProblem {
  field: string;
  message: string;
}

export class AdsApiError extends Error {
  constructor(
    readonly status: number,
    /** The service's own `type`, e.g. `AuthError`, `BadImageError`. */
    readonly type: string | undefined,
    /** The verbatim `error` string. For logs, and for the kinds we may show. */
    readonly detail: string,
    /** From a 422. Empty when the failure was not per-field. */
    readonly fields: AdsFieldProblem[],
    /** From a 409: what DID get created before it failed. */
    readonly created: Record<string, string> | null,
  ) {
    super(detail);
    this.name = "AdsApiError";
  }

  get kind(): AdsErrorKind {
    // OUR OWN sentinel, not the service's answer: `ADS_API_URL` /
    // is unset, so the request never left the building and
    // retrying cannot help. It borrows 503, which `classifyAds` reads as an
    // overloaded service — so the screen said "busy right now, try again",
    // sending people into a loop that could never succeed. Separated by
    // `type`, because the STATUS genuinely is shared with the real thing.
    if (this.type === "NotConfigured") return "bug";
    return classifyAds(this.status);
  }
}

/**
 * What our own abandoned request means.
 *
 * 504 is ours, not the service's — the request may well have completed after
 * we stopped listening. On a read that is merely a retry; on `create` it is the
 * difference between "nothing happened" and "a campaign exists and is
 * spending", which is why `kind` is `unknown` and never `retry`.
 */
export const ADS_TIMEOUT_STATUS = 504;

export function classifyAds(status: number): AdsErrorKind {
  if (status === 402) return "billing";
  if (status === 409) return "partial";
  if (status === 422) return "input";
  if (status === 429 || status === 502) return "retry";
  if (status === ADS_TIMEOUT_STATUS) return "unknown";
  if (status === 400 || status === 401 || status === 403) return "bug";
  // Anything undocumented is treated as ours rather than theirs. A 500 we
  // cannot explain is not something to ask the customer to act on.
  return status >= 500 ? "retry" : "bug";
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The `fields` array, or empty. Rows missing either half are dropped. */
function readFields(value: unknown): AdsFieldProblem[] {
  if (!Array.isArray(value)) return [];

  const problems: AdsFieldProblem[] = [];
  for (const row of value) {
    if (typeof row !== "object" || row === null) continue;
    const record = row as Record<string, unknown>;
    const field = str(record.field);
    // `message` is the documented key. `problem` is tried too because it is
    // the name that reads right and is therefore the one a future version is
    // most likely to switch to — a field problem with no text is useless.
    const message = str(record.message) || str(record.problem);
    if (field === "" || message === "") continue;
    problems.push({ field, message });
  }
  return problems;
}

/** The `created` block from a 409, as flat strings. */
function readCreated(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null) return null;

  const created: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const text = typeof entry === "string" ? entry : typeof entry === "number" ? String(entry) : "";
    if (text !== "") created[key] = text;
  }
  return Object.keys(created).length > 0 ? created : null;
}

/**
 * A response body we could not use → a typed error. Never throws.
 *
 * `payload` is whatever came back: the documented `{error, type, fields?}`, a
 * bare string from a proxy, or null from an empty body.
 */
export function parseAdsError(status: number, payload: unknown): AdsApiError {
  const record =
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};

  const detail =
    str(record.error) ||
    str(record.message) ||
    str(record.detail) ||
    (typeof payload === "string" ? payload.trim() : "") ||
    `the ads service returned ${status}`;

  return new AdsApiError(
    status,
    str(record.type) || undefined,
    detail,
    readFields(record.fields),
    readCreated(record.created),
  );
}

/**
 * What our side is doing wrong, said once, in a way that stops someone
 * troubleshooting their own account.
 *
 * "Nothing has been charged" is in it deliberately: a failure on a screen about
 * advertising spend, with no statement either way, is read as money possibly
 * gone. Every status that maps to `bug` happens BEFORE the service does
 * anything billable — it rejects the request at the gate.
 */
const BUG_MESSAGE =
  "Something on our side isn't set up correctly. We've logged it — nothing has been charged.";

const RETRY_MESSAGE = "The ads service is busy right now. Please try again in a moment.";

const UNKNOWN_MESSAGE =
  "We didn't get an answer in time. It may still have gone through — check your campaigns before trying again.";

/**
 * The sentence to put on the screen.
 *
 * For `input` and `billing` this is the service's own wording, because it names
 * the actual cause. For everything else it is ours.
 */
/**
 * The service's own words, or null when all it gave was a status echo.
 *
 * `parseAdsError` fills `detail` with a generic sentence when the body carried
 * no reason, and repeating that back ("the ads service returned 500") tells a
 * reader nothing they cannot see. Anything else came from the service and
 * names the actual cause.
 */
function serviceDetail(error: AdsApiError): string | null {
  // OUR credentials, not the customer's. "This key was rejected" said about
  // our service key reads as though THEIRS is the bad one, and sends them to
  // re-issue a key that was never the problem.
  if (error.status === 401 || error.status === 403) return null;
  // Our own sentinel, whose text names env vars nobody outside this repo can
  // act on.
  if (error.type === "NotConfigured") return null;
  const detail = error.detail.trim();
  if (detail === "") return null;
  if (/^(the ads service|leadbyte-api) returned \d+$/i.test(detail)) return null;
  return detail;
}

export function adsUserMessage(error: unknown): string {
  if (!(error instanceof AdsApiError)) {
    // A thrown TypeError from fetch, or anything else unplanned. It is ours by
    // definition — the service never got to answer.
    return BUG_MESSAGE;
  }

  const detail = serviceDetail(error);

  switch (error.kind) {
    case "billing":
    case "input":
      // Verbatim. `BadImageError` and `WebsiteError` are the reason this
      // function does not paraphrase.
      return error.detail;
    case "partial":
      return "Part of this campaign was created before something went wrong. Check what exists before trying again — retrying would create a second campaign.";
    case "retry":
      // A real reason, KEPT. "The ads service is busy right now" was shown for
      // a `save_key` that had failed for a specific, stated reason — three
      // separate investigations ended at a generic sentence hiding the
      // service's own (2026-09-15/16). The invitation to retry stays, because
      // a 5xx may still be transient.
      return detail ? `${detail} Please try again in a moment.` : RETRY_MESSAGE;
    case "unknown":
      return UNKNOWN_MESSAGE;
    default:
      // Same rule, and "nothing has been charged" is kept either way: on a
      // screen about advertising spend, silence about money reads as money
      // gone.
      return detail ? `${detail} Nothing has been charged.` : BUG_MESSAGE;
  }
}

/** Per-field problems to render under the inputs, or empty. */
export function adsFieldProblems(error: unknown): AdsFieldProblem[] {
  return error instanceof AdsApiError ? error.fields : [];
}

/**
 * Whether the screen may offer "try again".
 *
 * `partial` is the one that matters: the contract says do not retry, because
 * the campaign half-exists and a second attempt makes a second one. A disabled
 * button is not enough — there should be no button.
 */
export function adsCanRetry(error: unknown): boolean {
  if (!(error instanceof AdsApiError)) return false;
  return error.kind === "retry" || error.kind === "input";
}
