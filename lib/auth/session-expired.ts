/**
 * What to do when the backend says this session is over.
 *
 * ## The failure this exists to stop
 *
 * The backend allows ONE live session per account: a newer login invalidates
 * the older session's refresh token, and the refresh then answers
 * `{ success: false, code: "SESSION_INVALIDATED" }`. `lib/api/client.ts` has
 * turned that into a `SessionInvalidatedError` since the refresh path was
 * written — and nothing anywhere caught it. Observed live on 2026-09-18:
 * every one of the six `/connected-data` tables logged "every route failed …
 * Session was superseded by another login", and the customer was left on a
 * Performance screen with every panel empty and nothing saying why.
 *
 * `app/(app)/layout.tsx` already has the right response for a session that
 * cannot work — redirect to `/login?stale=1` — but its guard only fires on a
 * session with NO access token. A superseded session still HAS one; it is
 * simply dead. So the guard never ran, and a signed-out customer kept being
 * shown a signed-in app.
 *
 * ## Why the redirect needs a guard to escape
 *
 * `redirect()` reports itself by THROWING a `NEXT_REDIRECT` error that Next
 * catches at the framework boundary. Every read between here and there
 * swallows its own failures deliberately — `read-cascade` turns a table it
 * cannot read into an empty outcome rather than a broken page — so those
 * catch-alls would swallow the redirect too, and the fix would silently do
 * nothing. `isRedirectError` is what those catches use to let it back out.
 *
 * Kept free of any `next/*` import on purpose: it is imported by the data
 * layer, and it is a pure predicate so it can be tested as one.
 */

/**
 * Where a dead session is sent.
 *
 * The `stale=1` flag is load-bearing, not decoration. The cookie is still
 * present — a layout cannot clear one, cookies being writable only from a
 * Server Action or Route Handler — so `/login` would see a session, run its
 * "you are already signed in" redirect, and bounce the customer straight back
 * to the page that just sent them away. The flag is what makes the login page
 * skip that check, so it stays in the address after the message has gone.
 *
 * `why` is the message, and only the message: the login page shows it once and
 * wipes `why` from the address (`FlashNotice`), so a refresh does not show it
 * again while `stale=1` keeps doing its job.
 */
export const STALE_LOGIN_PATH = "/login?stale=1&why=expired";

/**
 * Where a session the backend SUPERSEDED is sent: the backend keeps one live
 * login per account, so signing in on another device or browser signs this
 * one out. Said as that on the login page (2026-10-01) — "your session
 * expired" read as a fault, and customers reported sign-in as broken.
 */
export const SUPERSEDED_LOGIN_PATH = "/login?stale=1&why=elsewhere";

/**
 * True for the control-flow error `redirect()` throws, and nothing else.
 *
 * Next marks it with a `digest` of `NEXT_REDIRECT;<kind>;<url>;<status>;`.
 * Matched by prefix rather than equality because the destination and status
 * are part of the string, and `startsWith` rather than `includes` so a backend
 * error that merely mentions the words cannot be mistaken for one.
 *
 * Must tolerate anything: `catch (error)` binds whatever was thrown, which is
 * not necessarily an object, so a guard that assumes one throws inside the
 * catch block and loses the original failure.
 */
export function isRedirectError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}
