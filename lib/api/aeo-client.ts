import "server-only";
/**
 * The HTTP transport for the AEO agent service.
 *
 * SERVER-ONLY. It is only ever called from Server Components and Server
 * Actions — not because it reads cookies (it does not; see below) but because
 * `AEO_API_URL` is a server variable and must stay one.
 *
 * ## Why this does not go through `lib/api/client.ts`
 *
 * `apiRequest` is built for leadbyte-api and does three things that are all
 * wrong here:
 *
 * - it attaches `x-api-key: LEADBYTE_API_KEY` whenever that key is set, and
 *   this service has never heard of it;
 * - it attaches the account's backend JWT, which is an leadbyte-api
 *   credential being handed to a different origin;
 * - it refuses with `BACKEND_NOT_CONFIGURED` based on `LEADBYTE_API_URL`, so
 *   an AEO call would fail for the wrong reason, or succeed when AEO itself
 *   was unconfigured.
 *
 * The model instead is `lib/data/locations.ts`: an open third-party origin
 * gets its own small helper with its own base URL and its own deadline. The
 * difference from that file is that these calls START WORK — so unlike a
 * location lookup, a failure here is not swallowed into an empty list. It is
 * raised, with a `kind` the screen can act on.
 *
 * ## The deadlines are per operation, not one constant
 *
 * `REQUEST_TIMEOUT_MS` in the main client is 8s because it budgets a page's
 * parallel READS. Nothing here is that. Subdomain discovery alone queries
 * Certificate Transparency logs and then checks which candidates are live,
 * documented at ~40s, so a single shared number would either cut that off or
 * make a dead poll hang for a minute. `lib/api/ads-client.ts` already made
 * this argument; this is the same table.
 */

import { AEO_API_URL, isAeoConfigured } from "@/lib/api/config";

/**
 * What went wrong, in the terms a screen actually branches on.
 *
 * `unavailable` and `not-found` are deliberately different words for the same
 * HTTP status. A 404 from a START route means the route is not deployed — the
 * service cannot be used at all. A 404 from a POLL means that audit id does
 * not exist, which is an answer about one job and nothing more. Collapsing
 * them would have one stale link reporting the whole service as down.
 */
export type AeoErrorKind =
  | "unavailable"
  | "not-found"
  | "timeout"
  | "bad-request"
  | "server";

export class AeoApiError extends Error {
  constructor(
    readonly kind: AeoErrorKind,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AeoApiError";
  }
}

/**
 * One sentence a customer can read, for each kind.
 *
 * Never the raw error. The service's own `detail` is written for whoever
 * called the API, not for the person looking at the screen.
 */
export function aeoUserMessage(error: unknown): string {
  if (!(error instanceof AeoApiError)) {
    return "We couldn't run the audit just now. Please try again.";
  }
  switch (error.kind) {
    case "unavailable":
      return "The audit service isn't available yet.";
    case "not-found":
      return "We couldn't find that audit any more.";
    case "timeout":
      return "The audit service took too long to answer. Please try again.";
    case "bad-request":
      return error.message;
    case "server":
      return "The audit service had a problem. Please try again shortly.";
  }
}

/**
 * How long each call is given.
 *
 * `discover` is the start call with `subdomain: true`: it is a different
 * budget from the same route without it, which is why the operation and not
 * the path is what picks the deadline.
 */
const TIMEOUTS = {
  start: 20_000,
  discover: 60_000,
  select: 30_000,
  approve: 30_000,
  poll: 10_000,
  /** Is GitHub connected for this site — one lookup, asked on a timer. */
  github: 15_000,
  /** Reads the repository's current files and diffs against them. */
  preview: 60_000,
  /** Writes a branch and opens the pull request. */
  deploy: 90_000,
  /** The generated report or plugin, built on request. */
  download: 60_000,
} as const;

export type AeoOperation = keyof typeof TIMEOUTS;

/**
 * Starting work needs a route that exists; a 404 there means the service is
 * not deployed. A poll or an approval names ONE audit, and its 404 ("no such
 * audit", measured 2026-09-25) is an answer about that audit alone.
 */
function missingRouteKind(operation: AeoOperation): AeoErrorKind {
  return operation === "poll" ||
    operation === "approve" ||
    operation === "preview" ||
    operation === "deploy" ||
    operation === "download"
    ? "not-found"
    : "unavailable";
}

function messageFrom(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const detail = (payload as Record<string, unknown>).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

export async function aeoRequest<T>(
  path: string,
  {
    operation,
    method = "GET",
    body,
  }: { operation: AeoOperation; method?: "GET" | "POST" | "DELETE"; body?: unknown },
): Promise<T> {
  if (!isAeoConfigured()) {
    throw new AeoApiError("unavailable", 503, "AEO_API_URL is not set");
  }

  const timeoutMs = TIMEOUTS[operation];
  let response: Response;
  try {
    response = await fetch(`${AEO_API_URL}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      // A job's state is the one thing that must never come from a cache.
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Either the deadline or the network. Both are "we did not get an answer",
    // and for a START call that means the job may still have been created —
    // the caller shows the run screen rather than claiming nothing happened.
    throw new AeoApiError("timeout", 504, `${path} did not answer in ${timeoutMs}ms`);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // A body we cannot read is only fatal if the status was not already one.
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new AeoApiError(
        missingRouteKind(operation),
        404,
        messageFrom(payload, `${path} is not available`),
      );
    }
    if (response.status >= 400 && response.status < 500) {
      throw new AeoApiError(
        "bad-request",
        response.status,
        messageFrom(payload, "The audit service rejected that request."),
      );
    }
    throw new AeoApiError(
      "server",
      response.status,
      messageFrom(payload, `the audit service returned ${response.status}`),
    );
  }

  return payload as T;
}

/**
 * A file from the service — the report HTML or the WordPress plugin — as the
 * raw response, so the caller can stream it on without parsing it.
 */
export async function aeoDownload(path: string): Promise<Response> {
  if (!isAeoConfigured()) {
    throw new AeoApiError("unavailable", 503, "AEO_API_URL is not set");
  }
  let response: Response;
  try {
    response = await fetch(`${AEO_API_URL}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUTS.download),
    });
  } catch {
    throw new AeoApiError("timeout", 504, `${path} did not answer in ${TIMEOUTS.download}ms`);
  }
  if (!response.ok) {
    throw new AeoApiError(
      response.status === 404 ? "not-found" : response.status < 500 ? "bad-request" : "server",
      response.status,
      `${path} returned ${response.status}`,
    );
  }
  return response;
}
