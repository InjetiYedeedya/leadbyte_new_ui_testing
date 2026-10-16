/**
 * WordPress as a place the Blog Posting agent publishes to (2026-10-09).
 *
 * The customer gives three things — the site's address, their WordPress
 * username, and a WordPress **Application Password** (not their login
 * password) — and `PUT /api/wordpress/credentials` on leadbyte-api_v1 checks
 * the login against the site's REST API, encrypts the password and keeps one
 * row per account. There is no separate test call: a wrong login is a 400 and
 * nothing is saved, so "test" and "save" are one press.
 *
 * Pure: reading the form, reading the status reply, and turning the backend's
 * error codes into sentences. The calls themselves are `wordpress-repo.ts`.
 */

export type WordpressStatus =
  | { kind: "connected"; wpUrl: string; userName: string; updatedAt: string | null }
  | { kind: "not-connected" }
  /** We asked and did not get an answer — never shown as "not connected". */
  | { kind: "unknown" }
  /** No backend in this environment. */
  | { kind: "unavailable" };

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * `{ connected, wp_url, user_name, updated_at }`, bare or under `data` — the
 * backend wraps some answers and not others. The password is never in it.
 */
export function parseWordpressStatus(raw: unknown): WordpressStatus {
  const outer = record(raw);
  const body = outer.data !== undefined ? record(outer.data) : outer;
  if (body.connected !== true) return { kind: "not-connected" };
  const wpUrl = str(body.wp_url);
  if (wpUrl === "") return { kind: "not-connected" };
  return { kind: "connected", wpUrl, userName: str(body.user_name), updatedAt: str(body.updated_at) || null };
}

export interface WordpressInput {
  wpUrl: string;
  userName: string;
  appPassword: string;
}

/**
 * The form's three answers, tidied, or what is wrong with them.
 *
 * A bare host gets `https://` (people type `example.com`); an `http://`
 * address is refused, because the backend only accepts https and the password
 * must never travel in the clear. Any path is kept — WordPress can live under
 * `/blog`. The Application Password keeps its spaces: the backend strips them,
 * and WordPress shows it with them.
 */
export function readWordpressInput(
  raw: { wpUrl: string; userName: string; appPassword: string },
): { ok: true; input: WordpressInput } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  let wpUrl = raw.wpUrl.trim().replace(/\/+$/, "");
  if (wpUrl !== "" && !/^[a-z]+:\/\//i.test(wpUrl)) wpUrl = `https://${wpUrl}`;

  if (wpUrl === "") {
    problems.push("Enter your WordPress site's address.");
  } else if (!/^https:\/\//i.test(wpUrl)) {
    problems.push("Use your site's https:// address.");
  } else {
    try {
      const url = new URL(wpUrl);
      if (!url.hostname.includes(".")) problems.push("Enter your site's full address, like https://example.com.");
    } catch {
      problems.push("Enter your site's full address, like https://example.com.");
    }
  }

  const userName = raw.userName.trim();
  if (userName === "") problems.push("Enter your WordPress username.");

  const appPassword = raw.appPassword.trim();
  if (appPassword.replace(/\s+/g, "") === "") problems.push("Paste the Application Password from WordPress.");

  return problems.length > 0 ? { ok: false, problems } : { ok: true, input: { wpUrl, userName, appPassword } };
}

/** The backend's error codes, said for the person who has to fix them. */
const MESSAGES: Record<string, string> = {
  WP_LOGIN_FAILED:
    "WordPress didn't accept that username and Application Password. Check both, and make sure it's an Application Password, not your login password.",
  WP_NO_PERMISSION:
    "That WordPress user can't publish posts. Use an account with the Author, Editor or Administrator role.",
  WP_API_NOT_FOUND:
    "We couldn't find WordPress at that address. Check the URL is your WordPress site.",
  WP_REDIRECT: "That address redirects somewhere else. Use your site's final address, exactly as it shows in the browser.",
  INVALID_INPUT: "Something is missing, or the address isn't https://. Check all three fields.",
  WP_UNREACHABLE: "Your site didn't answer in time. Check it's online, then try again.",
  ENCRYPTION_UNAVAILABLE: "We couldn't save it safely just now. Nothing was saved; please try again in a few minutes.",
};

/**
 * A sentence for a failed save. The code wins; then the backend's own words
 * when it gave any; then a sentence by status.
 */
export function wordpressErrorMessage(status: number, code: string | undefined, message: string): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (status === 401) return "Your session expired. Please sign in again.";
  const own = message.trim();
  if (own !== "" && !/^leadbyte-api returned \d+$/i.test(own)) return own;
  if (status === 502 || status === 504) return MESSAGES.WP_UNREACHABLE!;
  return "We couldn't connect WordPress. Please try again.";
}

/** `https://www.example.com/blog` → `example.com/blog`, for a label. */
export function wordpressLabel(wpUrl: string): string {
  return wpUrl.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
}
