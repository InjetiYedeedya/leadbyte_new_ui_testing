import type { Session } from "@/lib/auth/session";

/**
 * A session cookie that survived the backend being switched on.
 *
 * ## The failure it names
 *
 * `mockSignIn()` writes `leadbyte_session` and `leadbyte_owner` and no tokens,
 * because in mock mode there are none to write. Set `LEADBYTE_API_URL` later
 * and that cookie is still in the browser and still passes every "are you
 * signed in" check — while every authenticated read answers
 * `401 Authentication required`. The app does not look signed out. It looks
 * broken.
 *
 * ## Why this is a module rather than the `if` it started as
 *
 * The check lived inline in `app/(app)/layout.tsx`, which covers every
 * authenticated page — and `/` is the one signed-in screen that is NOT in that
 * route group. So a stale session was caught everywhere except on the page
 * people land on, where it surfaced as a logged 401 from
 * `fetchLatestAnalysis` and a Stage 01 screen that could never complete: every
 * stage input read fails, `allComplete` is therefore never true, and the
 * redirect to `/overview` never fires. Observed 2026-09-21.
 *
 * One exported predicate, used by both, so a third signed-in entry point
 * cannot be added without the question being asked.
 *
 * ## An expired token is NOT stale
 *
 * Only a session with NO token at all is — neither an access token nor a
 * refresh token (2026-10-01). A missing access token beside a refresh token
 * is the 24h access cookie having lapsed, and `apiRequest` mints a new one on
 * the first 401; treating it as stale sent every customer back to sign in
 * once a day. A token that exists and has expired is refreshed by
 * `apiRequest` on its first 401, and sending that user back to sign in would
 * be throwing away a session that was about to repair itself. The one path
 * that cannot refresh — `apiRequestWithToken`, inside `unstable_cache` — falls
 * back rather than throwing, precisely so this stays true.
 */
export function isStaleSession(
  session: Pick<Session, "accessToken" | "refreshToken"> | null,
  backendConfigured: boolean,
): boolean {
  if (session === null) return false;
  return backendConfigured && !session.accessToken && !session.refreshToken;
}

/** Where a stale session is sent. `/login` skips its "already signed in"
 *  redirect when it sees this, because the cookie saying they are signed in is
 *  the very thing being replaced. `why` carries the one-time message — see
 *  `STALE_LOGIN_PATH`. */
export const STALE_SESSION_PATH = "/login?stale=1&why=expired";
