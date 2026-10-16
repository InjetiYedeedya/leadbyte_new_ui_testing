/**
 * When a backend access token (a JWT) stops working, read from the token.
 *
 * No signature check — the backend does that on every call. This only lets
 * us skip a call we already know will be refused: an expired token sent to
 * the backend comes back 401, and a page sends several at once, so every page
 * after the first day of a session paid for a round of refusals before the
 * renewal (253 "refreshed the access token" warnings in the 2026-10-10 log).
 */

/** The token's expiry in ms since the epoch, or null when it carries none we can read. */
export function tokenExpiresAt(token: string | undefined): number | null {
  if (!token) return null;
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="))) as {
      exp?: unknown;
    };
    return typeof json.exp === "number" && Number.isFinite(json.exp) ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Whether the token is known to be expired (or within `marginMs` of it).
 *
 * An unreadable token is NOT expired: we cannot tell, so the call goes ahead
 * and the backend's 401 decides, exactly as before this existed.
 */
export function isTokenExpired(token: string | undefined, now: number, marginMs = 30_000): boolean {
  const expiresAt = tokenExpiresAt(token);
  return expiresAt !== null && expiresAt - marginMs <= now;
}
