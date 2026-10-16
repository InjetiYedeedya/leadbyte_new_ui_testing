import { ApiError, ApiTimeoutError, apiRequest } from "@/lib/api/client";
import { isBackendConfigured } from "@/lib/api/config";
import { isRedirectError } from "@/lib/auth/session-expired";
import {
  parseWordpressStatus,
  wordpressErrorMessage,
  type WordpressInput,
  type WordpressStatus,
} from "@/lib/data/wordpress-connection";

/**
 * The three WordPress calls on leadbyte-api_v1 (live 2026-10-03). Server-only:
 * `apiRequest` adds the API key and the customer's login token, and the
 * account comes from that token, so no user id is ever sent.
 *
 * The Application Password goes out in the PUT body and nowhere else: it is
 * not logged (the log redactor hides any `*password*` key), not returned by
 * the status read, and not kept by this app.
 */

const PATH = "/api/wordpress/credentials";
/** The save logs in to the customer's site first; the backend gives that 10s. */
const SAVE_TIMEOUT_MS = 25_000;

/** Never throws (except a dead-session redirect): a failed read is "unknown". */
export async function readWordpressStatus(): Promise<WordpressStatus> {
  if (!isBackendConfigured()) return { kind: "unavailable" };
  try {
    return parseWordpressStatus(await apiRequest<unknown>(PATH));
  } catch (error) {
    if (isRedirectError(error)) throw error;
    // No row yet may arrive as a 404 rather than `connected: false`.
    if (error instanceof ApiError && error.status === 404) return { kind: "not-connected" };
    console.error("[wordpress] status check failed:", error instanceof Error ? error.message : error);
    return { kind: "unknown" };
  }
}

export type WordpressSaveResult =
  | { ok: true; status: Extract<WordpressStatus, { kind: "connected" }> }
  | { ok: false; message: string };

/**
 * Saves the login. The backend checks it against the site first, so a wrong
 * login comes back as a refusal and nothing is stored.
 */
export async function saveWordpressCredentials(input: WordpressInput): Promise<WordpressSaveResult> {
  if (!isBackendConfigured()) {
    return { ok: false, message: "Connecting WordPress isn't switched on in this environment." };
  }
  try {
    const reply = await apiRequest<unknown>(PATH, {
      method: "PUT",
      body: { wp_url: input.wpUrl, user_name: input.userName, app_password: input.appPassword },
      timeoutMs: SAVE_TIMEOUT_MS,
    });
    const status = parseWordpressStatus(reply);
    // A 200 that does not say connected is still a saved login: the backend
    // only answers 200 after the check passed. Describe it from the input.
    return {
      ok: true,
      status:
        status.kind === "connected"
          ? status
          : { kind: "connected", wpUrl: input.wpUrl, userName: input.userName, updatedAt: null },
    };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof ApiTimeoutError) {
      return { ok: false, message: "Your site took too long to answer. Check it's online, then try again." };
    }
    if (error instanceof ApiError) {
      return { ok: false, message: wordpressErrorMessage(error.status, error.code, error.message) };
    }
    console.error("[wordpress] save failed:", error instanceof Error ? error.message : error);
    return { ok: false, message: "We couldn't connect WordPress. Please try again." };
  }
}

/** Forgets the saved login. Throws on failure so the caller can say so. */
export async function disconnectWordpress(): Promise<void> {
  await apiRequest<unknown>(PATH, { method: "DELETE" });
}
