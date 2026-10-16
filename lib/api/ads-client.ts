import "server-only";
import { isBackendConfigured } from "./config";
import { ApiError, apiRequest } from "./client";
import { adsUserId } from "@/lib/data/ads-identity";
import { AdsApiError, parseAdsError } from "@/lib/data/ads-errors";
import type {
  AdviseCampaign,
  AdviseResult,
  AdsCampaignRequest,
  CampaignOptionsResult,
  CampaignsResult,
  ConversionEventsResult,
  ConversionDocumentResult,
  CreateResult,
  GenerateBrief,
  GenerateResult,
  ImageJob,
  ImageRequest,
  ImageStatus,
  KeysResult,
  PrepareResult,
  ReportRow,
  SaveKeyResult,
  TrackingResult,
  UploadImageResult,
  VerifyResult,
  WebsiteDataResult,
  WebsiteRead,
  WhoAmI,
} from "@/lib/data/ads-types";

/**
 * The ChatGPT Ads service's transport.
 *
 * SERVER ONLY. It carries a service-scope key that can act for every customer,
 * so it must never be imported from a `"use client"` module. `lib/api/client.ts`
 * is not this: that one talks to the leadbyte-api Lambda and attaches our JWT.
 * These are two different backends with two different keys.
 *
 * ## One endpoint, one method, no paths
 *
 * Everything is `POST <ADS_API_URL>` with `{"action": "...", ...}`. What
 * changes between calls is the `action` field and nothing else — which is
 * convenient for the service and dangerous for us, because a typo in a string
 * is a 400 rather than a compile error. Hence `AdsActions`: the action names
 * and each one's request and response shape are one map, so `adsCall("advies")`
 * does not build.
 */

/**
 * Every action, with the body it takes and what it answers.
 *
 * `user_id` appears in NONE of the request types on purpose — it is injected
 * below, from the session, and a caller that cannot express it cannot get it
 * wrong. See `ads-identity.ts`.
 */
export interface AdsActions {
  whoami: { req: Record<never, never>; res: WhoAmI };
  verify: { req: { api_key: string; tracking_connected?: boolean }; res: VerifyResult };
  save_key: { req: { email: string; api_key: string; label?: string }; res: SaveKeyResult };
  keys: { req: Record<never, never>; res: KeysResult };
  delete_key: { req: { email: string }; res: { deleted?: boolean } };
  tracking_status: { req: { events_seen?: boolean }; res: TrackingResult };
  setup_tracking: {
    req: {
      /** `leads` | `sales` | `app` ONLY — awareness and traffic answer 422. */
      goal: string;
      /** Names the pixel and the event. Defaults to "Client" when absent. */
      brand_name?: string;
      /** Overrides the goal's default. SINGULAR — several events is several calls. */
      event_type?: string;
      /** Also mints a server-to-server Conversions API key. */
      with_api_key?: boolean;
      /** Returns that key's secret. Shown ONCE. Never logged. */
      include_secret?: boolean;
    };
    res: TrackingResult;
  };
  /** The install document for a site, covering the events that exist. */
  conversion_document: {
    req: { website_url?: string };
    res: ConversionDocumentResult;
  };
  /**
   * Stage 2's whole screen, in one lookup. Pure — no model, no spend — so the
   * goal cards, their objectives and each one's bid strategies are rendered
   * from THIS, never from a table of ours that would drift.
   *
   * `tracking_connected` is true when stage 1 came back with any conversion
   * events; it decides whether a goal is `downgraded`.
   */
  campaign_options: {
    req: { tracking_connected?: boolean };
    res: CampaignOptionsResult;
  };
  /** Stage 4. Usually already on the session from `save_key`. */
  conversion_events: { req: Record<never, never>; res: ConversionEventsResult };
  /**
   * Stage 5, semi only: the customer's own PNG or JPEG, base64-encoded.
   *
   * The bytes go in the BODY, not to S3 from the browser — so this is the one
   * action whose request can be megabytes, and its deadline is sized for that.
   */
  upload_image: { req: { image_base64: string }; res: UploadImageResult };
  read_website: { req: { url: string; brand_name?: string }; res: WebsiteRead };
  website_data: { req: { website_url?: string }; res: WebsiteDataResult };
  advise: {
    req: { campaign: AdviseCampaign; feedback?: string; history?: unknown[] };
    res: AdviseResult;
  };
  generate: { req: { brief: GenerateBrief }; res: GenerateResult };
  generate_image: { req: ImageRequest; res: ImageJob };
  image_status: { req: { output_key: string; job_id?: string }; res: ImageStatus };
  prepare: { req: { request: AdsCampaignRequest }; res: PrepareResult };
  create: { req: { request: AdsCampaignRequest; output_key?: string }; res: CreateResult };
  campaigns: { req: Record<never, never>; res: CampaignsResult };
  set_status: { req: { campaign_id: string; status: "active" | "paused" }; res: unknown };
  report: {
    req: {
      entity_type: "campaign" | "ad_group" | "ad";
      entity_id: string;
      granularity?: "daily";
      limit?: number;
    };
    res: ReportRow[];
  };
}

export type AdsAction = keyof AdsActions;

/**
 * How long each action gets.
 *
 * The repo's own `REQUEST_TIMEOUT_MS` of 8s is a READ deadline, sized for a
 * page firing six calls in parallel. None of these are that: they are one call
 * a person is waiting on, several of them run a language model, and the
 * contract publishes its own typicals. Each figure below is roughly three times
 * the documented typical, because the cost of being impatient is not a slow
 * screen — on `create` it is a campaign whose existence we no longer know.
 */
const TIMEOUTS: Record<AdsAction, number> = {
  // "under 100 ms"
  whoami: 5_000,
  keys: 5_000,
  delete_key: 5_000,
  website_data: 5_000,
  campaigns: 5_000,
  // Cheap, but they touch the platform.
  tracking_status: 8_000,
  image_status: 8_000,
  save_key: 10_000,
  setup_tracking: 10_000,
  // Pure lookup, no model behind it.
  campaign_options: 8_000,
  // NOT a pure lookup, whatever the grouping above suggests: it decrypts the
  // stored key and asks the platform, so it is priced like `verify`. At 8s it
  // timed out against a live account with eight events (2026-09-21), and the
  // screen then said the account had none — see `conversionEvents`.
  conversion_events: 15_000,
  // Creates a pixel and an event setting against the platform, one per call.
  conversion_document: 15_000,
  // Megabytes of base64 travel in the body.
  upload_image: 60_000,
  set_status: 10_000,
  // "under 1 s"
  prepare: 10_000,
  // "1–3 s"
  verify: 15_000,
  report: 15_000,
  create: 20_000,
  // Returns at once — only the handoff is timed, not the 15-minute render.
  generate_image: 15_000,
  // "1–10 s"
  read_website: 25_000,
  // "2–10 s", and both run a model
  advise: 30_000,
  generate: 30_000,
};

/** One retry, after this long. Long enough for a 429's window to move on. */
const RETRY_AFTER_MS = 1500;

/**
 * Actions that must never be retried automatically, whatever the caller asks.
 *
 * `create` is the whole list, and it is not a style choice: the contract's own
 * 409 exists because creation is not atomic, so a second attempt after an
 * ambiguous first one is how a customer ends up with two campaigns spending the
 * same budget. A human deciding to try again is fine; a `for` loop is not.
 */
const NEVER_RETRY: ReadonlySet<AdsAction> = new Set<AdsAction>(["create"]);

/**
 * One call, through our own backend's proxy.
 *
 * ## Why this is not a direct Lambda invoke any more
 *
 * It was, briefly, and it was signed with SigV4 — because the contract handed
 * over named the raw Invoke endpoint. The backend team then put
 * `POST /api/openai-ads` in front of it (verified 2026-09-15), which invokes
 * `openai-ads-automation-dev` synchronously and returns its JSON. That is
 * strictly better and the signing was deleted with it: this route rides the
 * `x-api-key` and JWT the app already holds, so no long-lived AWS credentials
 * have to exist on this server at all.
 *
 * ## The two envelopes
 *
 * The proxy answers `{ success, data }`, where `data` is the ads Lambda's own
 * body. A `success: false` is a FAILURE the transport has to raise — it
 * arrives with HTTP 200, so returning it would hand callers an object whose
 * every field is undefined and surface the fault far from its cause.
 */
async function sendOnce(
  action: AdsAction,
  // `object`, not `Record<string, unknown>`: an interface has no index
  // signature, so the typed request bodies do not satisfy that and every call
  // site would need a cast — which is the one place a cast could hide a field.
  payload: object,
  timeoutMs: number,
): Promise<unknown> {
  let envelope: { success?: boolean; data?: unknown };
  try {
    envelope = await apiRequest<{ success?: boolean; data?: unknown }>("/api/openai-ads", {
      method: "POST",
      // The gate. Without it the route answers 400 rather than invoking.
      body: { openai_ads: true, ...payload },
      timeoutMs,
    });
  } catch (error) {
    // `apiRequest` throws `ApiError` with the HTTP status; everything below
    // narrows on `AdsApiError`, so it is translated here once rather than at
    // every call site.
    if (error instanceof ApiError) {
      throw parseAdsError(error.status, { error: error.message });
    }
    throw new AdsApiError(
      502,
      "NetworkError",
      error instanceof Error ? error.message : String(error),
      [],
      null,
    );
  }

  const data = envelope?.data;
  // 200 with `success: false` is the ads Lambda reporting its own failure —
  // a missing API key on that function, say. Raised, never returned.
  if (envelope?.success === false) {
    throw parseAdsError(500, data ?? envelope);
  }
  // `data` is the Lambda's body. Absent means the proxy answered a shape we do
  // not know, which is ours to notice rather than to paper over.
  return data === undefined ? envelope : data;
}

/** A JSON string, or the string itself when it is not JSON. */
function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Call the ads service.
 *
 * Throws `AdsApiError` for everything, including our own timeout and a dropped
 * connection, so a caller has exactly one type to narrow and
 * `adsUserMessage(error)` always has something to say.
 */
export async function adsCall<A extends AdsAction>(
  action: A,
  body: AdsActions[A]["req"],
  options: { timeoutMs?: number; retries?: 0 | 1 } = {},
): Promise<AdsActions[A]["res"]> {
  if (!isBackendConfigured()) {
    throw new AdsApiError(
      503,
      "NotConfigured",
      "LEADBYTE_API_URL is not set — the ads proxy route lives on that backend",
      [],
      null,
    );
  }

  const userId = await adsUserId();
  if (userId === null) {
    // No session means no customer to act for. With a service-scope key,
    // guessing here would act for whoever the service defaults to.
    throw new AdsApiError(401, "NoSession", "no signed-in account to act for", [], null);
  }

  // `action` and `user_id` are spread LAST, so nothing a caller passes — or
  // anything nested that came back from the service and is being echoed — can
  // shadow the two fields that decide what runs and whose account it runs on.
  const payload = { ...body, action, user_id: userId };

  // The body actually going out, every time.
  //
  // This is the only way to answer "is that our fault or theirs" without
  // guessing: a 400 with no request beside it in the log sent us round the
  // houses twice (2026-09-15/16) — once for a missing call, once for an
  // unreadable message. Server-side console only, in a BFF whose logs never
  // reach a browser.
  //
  // `api_key` is redacted rather than omitted, because WHETHER it was sent is
  // exactly what one of those investigations turned on. Its value never
  // belongs in a log line.
  console.log(`[ads-api] -> ${action}`, JSON.stringify(redactKeys(payload)));

  const timeoutMs = options.timeoutMs ?? TIMEOUTS[action];
  const allowRetry = !NEVER_RETRY.has(action) && (options.retries ?? 1) > 0;

  try {
    return (await sendOnce(action, payload, timeoutMs)) as AdsActions[A]["res"];
  } catch (error) {
    const retryable = error instanceof AdsApiError && error.kind === "retry";
    if (!allowRetry || !retryable) throw error;

    console.warn(`[ads-api] ${action} returned ${(error as AdsApiError).status}; retrying once`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS));
    return (await sendOnce(action, payload, timeoutMs)) as AdsActions[A]["res"];
  }
}

/**
 * A payload safe to print: any credential replaced by its shape.
 *
 * Takes `object`, not `Record<string, unknown>`, for the reason `sendOnce`
 * gives: an interface has no index signature, so the typed request bodies do
 * not satisfy that and the call site would need a cast.
 *
 * Only the top level is walked. That is where `api_key` lives, and a recursive
 * scrub would be a licence to log arbitrarily deep customer data on the theory
 * that it had been cleaned.
 */
function redactKeys(payload: object): Record<string, unknown> {
  const SECRET = new Set(["api_key", "apiKey", "image_base64"]);
  const safe: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(payload)) {
    if (!SECRET.has(name)) {
      safe[name] = value;
      continue;
    }
    safe[name] =
      typeof value === "string" ? `[redacted ${value.length} chars]` : "[redacted]";
  }
  return safe;
}
