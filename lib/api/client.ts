import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { LEADBYTE_API_KEY, LEADBYTE_API_URL, isBackendConfigured } from "./config";
import { getSession, setAccessToken } from "@/lib/auth/session";
import { STALE_LOGIN_PATH, SUPERSEDED_LOGIN_PATH } from "@/lib/auth/session-expired";
import { isTokenExpired } from "@/lib/auth/token-expiry";
import { devGlobal } from "@/lib/dev-global";

/**
 * HTTP client for the live `leadbyte-api` Lambda.
 *
 * SERVER-ONLY. This reads httpOnly cookies and attaches bearer tokens, so it
 * must only ever be called from Server Components, Server Actions, or Route
 * Handlers — never from a Client Component. Importing it into a "use client"
 * module will fail at runtime when `cookies()` is unavailable.
 *
 * Note on CORS: the backend rejects requests carrying a disallowed `Origin`
 * header, but passes through server-to-server calls that send none. Node's
 * fetch sends no Origin, which is exactly the path we want.
 */

/**
 * Deadline for a single backend call.
 *
 * Tuned for data reads, where a page fires several in parallel. Calls that are
 * legitimately slow — an agent thinking, a crawl — pass their own `timeoutMs`;
 * see `sendStrategyMessage`, whose agent takes ~6s on a trivial reply and far
 * longer to actually build a strategy, and which this 8s deadline aborted.
 *
 * 20s, raised from 8s on 2026-09-28. The backend's gateway answers in under
 * a second, but its authenticated reads (`/api/website-analyze/latest`, the
 * Frontend Check queries) usually take ~3s and sometimes run past 8s. At 8s
 * those surfaced as "couldn't load" / "Unknown" screens and, for the cached
 * analysis read, as a failed background refresh Next logs as an error. Every
 * read on a page sits behind its own <Suspense>, so a slow one holds only its
 * own section on the loader, not the page.
 */
const REQUEST_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  /**
   * The start of the reply body, for LOGS only — never shown to a customer.
   * When the backend answers with no readable reason (a plain-text or HTML
   * error page, or JSON without `error`/`message`), the message is a bare
   * "leadbyte-api returned 500" and this is the only trace of what it said.
   * The Meta Ads account save failed exactly that way with nothing to go on.
   */
  bodySnippet?: string;

  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Thrown when OUR deadline expired, not when the backend refused.
 *
 * The distinction is the whole point of the class. A request we abandoned may
 * still be running, and for a write it may already have committed — n8n stores
 * the row and then keeps the connection open, so a slow save and a failed save
 * look identical from here. Callers that write MUST treat this as "unknown,
 * probably landed" and verify, never as failure. `saveGoogleSelection` is the
 * worked example.
 *
 * It also stops a raw `DOMException` reaching a screen: "The operation was
 * aborted due to timeout" is our own plumbing talking, and it was being shown
 * to customers as the reason their Google connection failed.
 */
export class ApiTimeoutError extends ApiError {
  constructor(
    readonly path: string,
    readonly timeoutMs: number,
  ) {
    super(504, "TIMEOUT", `${path} did not answer within ${timeoutMs}ms`);
    this.name = "ApiTimeoutError";
  }
}

/**
 * Whether an error is a deadline or cancellation rather than a real failure.
 *
 * `AbortSignal.timeout` rejects with a `DOMException` named `TimeoutError`, a
 * manual abort gives `AbortError`, and undici sometimes surfaces either one
 * wrapped in a `TypeError: fetch failed` whose `cause` holds the original. All
 * three have to count, or the wrapped case silently becomes "failed".
 *
 * A bare `TypeError: fetch failed` is NOT an abort: the connection was refused,
 * nothing was written, and calling it a timeout would invent a success.
 */
export function isAbortError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "TimeoutError" || name === "AbortError") return true;
  const cause = (error as { cause?: unknown } | null)?.cause;
  if (cause === undefined || cause === null) return false;
  return isAbortError(cause);
}

/**
 * Thrown when the backend reports this session was superseded by a newer
 * login elsewhere (single-session enforcement). Callers should clear the
 * session and force a re-login rather than retrying.
 */
export class SessionInvalidatedError extends ApiError {
  constructor() {
    super(401, "SESSION_INVALIDATED", "Session was superseded by another login");
    this.name = "SessionInvalidatedError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Set false for the auth endpoints themselves, which take no bearer. */
  authenticated?: boolean;
  /** Override the deadline for a route that is meant to take a while. */
  timeoutMs?: number;
}

async function rawFetch(
  path: string,
  { method = "GET", body, authenticated = true, timeoutMs = REQUEST_TIMEOUT_MS }: RequestOptions,
  accessToken?: string,
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // The gateway key gates every route including the public /auth/* ones, so
  // it is sent regardless of `authenticated` — unlike the bearer token.
  if (LEADBYTE_API_KEY) {
    headers["x-api-key"] = LEADBYTE_API_KEY;
  }
  if (authenticated && accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  try {
    return await fetch(`${LEADBYTE_API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // Backend data is per-user and changes on write; never serve it from a
      // shared cache.
      cache: "no-store",
      // A page renders several of these in parallel. Without a deadline, one
      // slow table read holds the whole page hostage — the user sees a spinner
      // with no idea anything is wrong. Failing fast lets the repo fall back to
      // an empty state and log the problem.
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // Classified here, once, rather than at each call site — every caller that
    // has to tell "we gave up" apart from "it refused" gets the same answer.
    if (isAbortError(error)) throw new ApiTimeoutError(path, timeoutMs);
    throw error;
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Builds a typed error from the backend's response.
 *
 * CONFIRMED shape (live probe 2026-08-26): errors are
 * `{"success": false, "error": "<message>"}`. Success responses are NOT
 * uniformly wrapped — `/api/n8n-health` returns a bare `{"healthy":true}` —
 * so only the error envelope can be relied on.
 */
export function errorFrom(status: number, payload: unknown): ApiError {
  const record = typeof payload === "object" && payload !== null
    ? (payload as Record<string, unknown>)
    : {};
  const code = typeof record.code === "string" ? record.code : undefined;

  /**
   * The reason, wherever the backend put it.
   *
   * `/api/openai-ads` wraps EVERY answer as `{ success, data }`, so when it
   * refuses something the sentence explaining why is at `data.error` — one
   * level below where this used to look. The result was a real 400 arriving on
   * screen as "leadbyte-api returned 400", which tells the reader nothing and
   * cost a round trip to diagnose (2026-09-15). One level down is checked, not
   * an arbitrary search: deeper would start inventing meaning from unrelated
   * fields.
   */
  const nested = typeof record.data === "object" && record.data !== null
    ? (record.data as Record<string, unknown>)
    : {};
  const firstString = (...values: unknown[]): string | undefined =>
    values.find((value): value is string => typeof value === "string" && value.trim() !== "");

  const message =
    firstString(record.error, record.message, nested.error, nested.message) ??
    `leadbyte-api returned ${status}`;

  if (code === "SESSION_INVALIDATED" || message.includes("SESSION_INVALIDATED")) {
    return new SessionInvalidatedError();
  }
  const error = new ApiError(status, code, message);
  const raw = typeof payload === "string" ? payload : safeStringify(payload);
  if (raw) error.bodySnippet = raw.replace(/\s+/g, " ").trim().slice(0, 300);
  return error;
}

function safeStringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/**
 * Exchanges the stored refresh token for a fresh access token.
 *
 * CONFIRMED by FRONTEND_BACKEND_API_CALLS.md: the body is `{ refreshToken }`
 * and the reply is `{ success, tokens: { accessToken, expiresIn } }`, with
 * `{ success: false, code: "SESSION_INVALIDATED" }` when a newer login has
 * superseded this session. This was previously an inference.
 */
/**
 * One refresh per expired token per request, however many calls hit the 401.
 *
 * A page fans out several backend calls at once, and with an expired token
 * every one of them got its own 401 and did its own refresh — N refreshes and
 * N retries for one render. The refreshed token cannot be written back from a
 * render, so that repeated on every page until an action ran. `cache()` makes
 * the concurrent callers share the first refresh.
 */
const refreshAccessToken = cache(refreshAccessTokenOnce);

async function refreshAccessTokenOnce(refreshToken: string): Promise<string | null> {
  const res = await rawFetch(
    "/auth/refresh-token",
    { method: "POST", body: { refreshToken }, authenticated: false },
  );
  const payload = await parseBody(res);
  if (!res.ok) {
    throw errorFrom(res.status, payload);
  }
  const record = payload as Record<string, unknown> | null;
  const tokens = record?.tokens as Record<string, unknown> | undefined;
  const next = (tokens?.accessToken ?? record?.accessToken) as string | undefined;
  return next ?? null;
}

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/**
 * Renewed access tokens, kept per server instance and keyed by the refresh
 * token that minted them.
 *
 * A page render cannot write a cookie, so a token renewed during one was used
 * for that request and then thrown away — and the next page renewed it again.
 * Every page after a session's first day therefore paid for a renewal, and on
 * Cloudflare's 10ms-per-request CPU budget that extra work is not free (253
 * renewals in the 2026-10-10 log). Keeping the result here lets every later
 * request on this instance reuse it until it expires. The cookie still catches
 * up the next time a Server Action or Route Handler runs.
 *
 * Keyed by the refresh token, which only its owner holds, so one account can
 * never be handed another's token. Through `devGlobal`, as all mutable server
 * state must be (CLAUDE.md).
 */
const renewedTokens = devGlobal("renewed_access_tokens", () => new Map<string, string>());
const RENEWED_TOKENS_MAX = 500;

function rememberRenewed(refreshToken: string, accessToken: string): void {
  if (renewedTokens.size >= RENEWED_TOKENS_MAX) renewedTokens.clear();
  renewedTokens.set(refreshToken, accessToken);
}

function rememberedToken(refreshToken: string): string | undefined {
  const token = renewedTokens.get(refreshToken);
  if (token && isTokenExpired(token, Date.now())) {
    renewedTokens.delete(refreshToken);
    return undefined;
  }
  return token;
}

/**
 * A working access token for this session, renewing it if needed.
 *
 * Never returns without one: a dead session redirects to sign-in (`redirect`
 * throws), and any other failure is rethrown.
 */
async function renewAccessToken(session: Session & { refreshToken: string }): Promise<string> {
  const kept = rememberedToken(session.refreshToken);
  if (kept) return kept;

  let refreshed: string | null = null;
  try {
    refreshed = await refreshAccessToken(session.refreshToken);
  } catch (error) {
    // A superseded session is not a read failure, and must not be reported
    // as one. The refresh token is dead — every subsequent call in this
    // render and every one after it will fail the same way — so the honest
    // answer is to ask the customer to sign in again rather than hand the
    // caller an error it will turn into an empty state. Before this, the
    // error was raised and caught by nobody: the whole app rendered blank
    // with only the server log saying why (observed live 2026-09-18).
    //
    // `redirect` THROWS, so the catch-alls between here and Next's boundary
    // have to let it past — see `isRedirectError` in session-expired.ts.
    if (error instanceof SessionInvalidatedError) {
      console.warn(
        `[auth] the session for "${session.businessId}" was superseded by a ` +
          "newer login — sending the user to sign in again.",
      );
      redirect(SUPERSEDED_LOGIN_PATH);
    }
    // The refresh token itself was refused ("Invalid refresh token", user
    // not found, a re-keyed backend). Same outcome as superseded: nothing
    // this session holds can mint a working token again. Rethrowing made
    // every table read report "every route failed", so EVERY agent
    // dashboard said "couldn't load — a connection problem", and no number
    // of refreshes helped, because the dead token stays in the cookie. Seen
    // live 2026-10-05, once the access cookie was made to outlive its token
    // (2026-10-01) and this path became the everyday one.
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      console.warn(
        `[auth] the refresh token for "${session.businessId}" was refused ` +
          `(${error.status}: ${error.message}) — sending the user to sign in again.`,
      );
      redirect(STALE_LOGIN_PATH);
    }
    throw error;
  }
  if (!refreshed) {
    // A 200 with no token in it is no more use than a refusal, and carrying
    // on would send the expired token again and fail the same way.
    console.warn(
      `[auth] the refresh for "${session.businessId}" returned no access token — ` +
        "sending the user to sign in again.",
    );
    redirect(STALE_LOGIN_PATH);
  }

  rememberRenewed(session.refreshToken, refreshed);
  try {
    await setAccessToken(refreshed);
  } catch {
    // Most reads happen during an ordinary page render, not a Server Action
    // or Route Handler — and Next refuses to write a cookie from there. The
    // renewed token still works for this request, and `renewedTokens` keeps
    // it for the next ones. (This used to log a warning with a stack on
    // every page; it is the expected path, not a fault.)
  }
  return refreshed;
}

/**
 * Calls the backend, transparently refreshing an expired access token once.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!isBackendConfigured()) {
    throw new ApiError(
      503,
      "BACKEND_NOT_CONFIGURED",
      "LEADBYTE_API_URL is not set — the app is running against mock repositories",
    );
  }

  const session = await getSession();
  let accessToken = session?.accessToken;
  const renewable =
    options.authenticated !== false && session?.refreshToken
      ? { ...session, refreshToken: session.refreshToken }
      : null;

  // A token we can SEE has expired is renewed before the call, not after a
  // 401 — skipping a request we know will be refused, on every read the page
  // makes.
  if (renewable && isTokenExpired(accessToken, Date.now())) {
    accessToken = await renewAccessToken(renewable);
  }

  let res = await rawFetch(path, options, accessToken);

  if (res.status === 401 && renewable) {
    // The refused reply is never read. Close it before asking again: an
    // unread body keeps its connection open, and Cloudflare cancels those
    // ("A stalled HTTP response was canceled", 128 times in the 2026-10-10
    // log) after making the Worker wait.
    await res.body?.cancel().catch(() => {});
    // Whatever we sent was refused — including a token kept from an earlier
    // renewal — so forget it and renew from the refresh token.
    renewedTokens.delete(renewable.refreshToken);
    accessToken = await renewAccessToken(renewable);
    res = await rawFetch(path, options, accessToken);
  }

  const payload = await parseBody(res);
  if (!res.ok) {
    const error = errorFrom(res.status, payload);
    // The same verdict can arrive on the request itself rather than on the
    // refresh — a session with no stored refresh token never reaches the
    // block above, and the backend can answer any call this way. One dead
    // session, one destination.
    if (error instanceof SessionInvalidatedError) {
      console.warn(
        `[auth] the session for "${session?.businessId ?? "unknown"}" was ` +
          "superseded by a newer login — sending the user to sign in again.",
      );
      redirect(SUPERSEDED_LOGIN_PATH);
    }
    throw error;
  }
  return payload as T;
}

/**
 * The same call with the bearer token handed in, rather than read from a
 * cookie.
 *
 * This exists for ONE caller shape: a read wrapped in `unstable_cache`, which
 * may not touch cookies at all. `apiRequest` both reads them (`getSession`)
 * and, on a 401, writes one (`setAccessToken`) — either would throw inside a
 * cache scope. So the caller resolves the session first, outside the cache,
 * and passes the token in.
 *
 * The consequence is that this does NOT refresh an expired token: refreshing
 * means writing a cookie, which is the thing that cannot happen here. A 401
 * therefore throws, and it is the caller's job to fall back to the uncached
 * path. That is also why a failure must never be cached.
 */
export async function apiRequestWithToken<T>(
  path: string,
  options: RequestOptions = {},
  accessToken?: string,
): Promise<T> {
  if (!isBackendConfigured()) {
    throw new ApiError(
      503,
      "BACKEND_NOT_CONFIGURED",
      "LEADBYTE_API_URL is not set — the app is running against mock repositories",
    );
  }

  const res = await rawFetch(path, options, accessToken);
  const payload = await parseBody(res);
  if (!res.ok) {
    throw errorFrom(res.status, payload);
  }
  return payload as T;
}

export const apiGet = <T>(path: string): Promise<T> => apiRequest<T>(path);

export const apiPost = <T>(path: string, body?: unknown, authenticated = true): Promise<T> =>
  apiRequest<T>(path, { method: "POST", body, authenticated });

export const apiPut = <T>(path: string, body?: unknown): Promise<T> =>
  apiRequest<T>(path, { method: "PUT", body });

export const apiDelete = <T>(path: string): Promise<T> =>
  apiRequest<T>(path, { method: "DELETE" });
