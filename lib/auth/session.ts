import "server-only";
import { cookies } from "next/headers";
import { signValue, verifyValue } from "@/lib/auth/signed-cookie";

const SESSION_COOKIE = "leadbyte_session";
const OWNER_COOKIE = "leadbyte_owner";
const ACCESS_TOKEN_COOKIE = "leadbyte_at";
const REFRESH_TOKEN_COOKIE = "leadbyte_rt";
const USER_ID_COOKIE = "leadbyte_uid";

// All cookies are httpOnly: the leadbyte-api JWTs must never be readable
// from JavaScript. This is the whole point of running the Next.js app as a
// BFF rather than calling the Lambda straight from the browser — the
// browser holds a session cookie, not a bearer token.
// `secure` matters now that these carry real backend JWTs rather than a mock
// businessId. It is off in development so the cookies still work over
// http://localhost.
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

/**
 * Token lifetimes, CONFIRMED by the backend 2026-08-27.
 *
 * `tokens.expiresIn` is in SECONDS (86400 = 24h) and applies to the access
 * token. The refresh token has its own, longer life: 7 days
 * (`REFRESH_TOKEN_TTL`, overridable server-side).
 *
 * The session and owner cookies match the refresh window — there is no point
 * holding an identity we can no longer mint tokens for.
 *
 * So does the ACCESS cookie (2026-10-01). It was given the token's own 24h,
 * which means the browser DELETED it a day after sign-in — and a session with
 * no access token reads as stale (`isStaleSession`), so everyone was sent back
 * to sign in once a day although the 7-day refresh token could have renewed it
 * silently. The token inside still expires at 24h; `apiRequest` refreshes it
 * on the first 401. The cookie only has to outlive it.
 */
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface Session {
  businessId: string;
  ownerId: string;
  /**
   * The Firebase uid.
   *
   * Kept separately from `businessId` because the two are different facts:
   * `businessId` is the account EMAIL (the backend's tables are email-keyed),
   * while rows in `Leadbyte_User_Overall_Details` also carry a `userId`, and
   * nothing else in a request tells us what it is. Absent in mock mode.
   */
  userId?: string;
  /** Absent in mock mode (no real backend configured). */
  accessToken?: string;
  refreshToken?: string;
}

/**
 * The signed-in identity, or null.
 *
 * The three identity cookies are SIGNED (`lib/auth/signed-cookie.ts`), and a
 * value whose signature does not match reads as absent. They were plain
 * values until 2026-09-25, and anyone could edit their own email into an
 * admin's in DevTools. An old unsigned cookie therefore means "signed out",
 * which costs every existing session one sign-in after that deploy.
 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const [businessId, ownerId, userId] = await Promise.all([
    verifyValue(SESSION_COOKIE, store.get(SESSION_COOKIE)?.value),
    verifyValue(OWNER_COOKIE, store.get(OWNER_COOKIE)?.value),
    verifyValue(USER_ID_COOKIE, store.get(USER_ID_COOKIE)?.value),
  ]);
  if (!businessId || !ownerId) return null;
  return {
    businessId,
    ownerId,
    userId: userId ?? undefined,
    accessToken: store.get(ACCESS_TOKEN_COOKIE)?.value,
    refreshToken: store.get(REFRESH_TOKEN_COOKIE)?.value,
  };
}

export async function setSession(
  businessId: string,
  ownerId: string,
  tokens?: { accessToken: string; refreshToken: string; expiresIn?: number },
  userId?: string,
): Promise<void> {
  const store = await cookies();
  const identityOptions = { ...COOKIE_OPTIONS, maxAge: REFRESH_TOKEN_MAX_AGE };
  store.set(SESSION_COOKIE, await signValue(SESSION_COOKIE, businessId), identityOptions);
  store.set(OWNER_COOKIE, await signValue(OWNER_COOKIE, ownerId), identityOptions);
  if (userId) {
    store.set(USER_ID_COOKIE, await signValue(USER_ID_COOKIE, userId), identityOptions);
  }
  if (tokens) {
    store.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      ...COOKIE_OPTIONS,
      // The refresh window, not the token's `expiresIn` — see above.
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });
    store.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });
  }
}

/** Replaces only the access token, after a successful /auth/refresh-token. */
export async function setAccessToken(accessToken: string): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_TOKEN_COOKIE, accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
}

/**
 * Demo mode only: points the session at another seeded business.
 *
 * With a backend configured the session's business IS the account email, and
 * letting a form choose it would let anyone become anyone — the caller
 * (`settings/actions.ts`) refuses there, and this refuses again.
 */
export async function switchBusiness(businessId: string): Promise<void> {
  if (process.env.LEADBYTE_API_URL) {
    throw new Error("Switching business is not available with a live backend.");
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, await signValue(SESSION_COOKIE, businessId), {
    ...COOKIE_OPTIONS,
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
}

/**
 * Signing out lives in `lib/auth/sign-out.ts`, not here.
 *
 * There was a `clearSession()` that deleted the five cookies above and nothing
 * else, which is what left the flow's own state — the analysis job especially —
 * in the browser for the next account to pick up. `clearAllAccountCookies()`
 * replaced it, and this module deliberately no longer offers a way to clear
 * *only* the session: doing that is the bug.
 */
