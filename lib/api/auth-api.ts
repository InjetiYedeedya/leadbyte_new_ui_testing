import { apiPost } from "./client";

/**
 * Typed wrappers for the backend's four public `/auth/*` routes.
 *
 * These are the only routes that take no bearer token — they are what
 * produces one.
 */

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * The user record the backend returns on sign-in.
 *
 * CONFIRMED against a live sign-in 2026-08-27. The observed keys were exactly:
 * `userId, email, name, profileImage, emailVerified, provider`.
 *
 * NOTE the identifier is **`userId`**, not `uid`. `uid` was our earlier
 * inference and it was wrong — reading it returned undefined and broke every
 * sign-in. `uid` is kept below only as a defensive fallback in case another
 * deployment of the API spells it that way; `userId` is what production
 * actually sends.
 */
export interface AuthUser {
  userId?: string;
  /** Fallback spelling — not what the live API returns. See note above. */
  uid?: string;
  /**
   * A third spelling, from FRONTEND_BACKEND_API_CALLS.md, which documents this
   * field as `user_id`. Live production sends `userId` (confirmed by reading a
   * real response, and sign-in works today), so this is insurance against a
   * deployment that matches the doc rather than the observation — losing the
   * uid silently breaks every uid-keyed read, including the lead activity
   * table.
   */
  user_id?: string;
  email: string;
  name?: string;
  profileImage?: string;
  emailVerified?: boolean;
  provider?: string;
}

export interface SignInResponse {
  success?: boolean;
  user: AuthUser;
  tokens: AuthTokens;
  /**
   * True when this sign-in created the account.
   *
   * CONFIRMED 2026-08-27 by reading the previous app
   * (D:\leadbyte-changes/src/services/authService.js), which reads
   * `data.isNewUser` off this same response. Its presence answers the
   * provisioning question: the backend does create its own user record on
   * first sign-in, so a new Firebase account does not produce a session
   * pointing at nothing.
   */
  isNewUser?: boolean;
}

/**
 * Exchanges a Firebase idToken (obtained client-side by the Firebase Web
 * SDK) for leadbyte-api's own JWTs. Minting a new session here supersedes
 * any other active session for this user — the backend enforces one.
 *
 * CONFIRMED against the live backend 2026-08-26: posting `{}` returns
 * 400 `{"success":false,"error":"Missing idToken"}`, so `{ idToken }` is
 * the expected body.
 */
export function googleSignIn(idToken: string): Promise<SignInResponse> {
  return apiPost<SignInResponse>("/auth/google-signin", { idToken }, false);
}

export function emailSignIn(idToken: string): Promise<SignInResponse> {
  return apiPost<SignInResponse>("/auth/email-signin", { idToken }, false);
}

/**
 * Reports whether this access token's session is still the active one.
 * Returns false once another device has signed in as the same user.
 */
export async function validateSession(): Promise<boolean> {
  const res = await apiPost<{ valid: boolean }>("/auth/validate-session", {});
  return res.valid === true;
}
