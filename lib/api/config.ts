import "server-only";
/**
 * Configuration for the live `leadbyte-api` Lambda backend.
 *
 * Every value here is read from the environment, never hardcoded — the API
 * base URL is not a secret, but keeping it in env means dev/staging/prod
 * differ by configuration rather than by code.
 */

/** Base URL of the leadbyte-api Lambda Function URL (no trailing slash). */
export const LEADBYTE_API_URL = (process.env.LEADBYTE_API_URL ?? "").replace(/\/+$/, "");

/**
 * Gateway API key sent as the `x-api-key` header.
 *
 * The newer backend (`leadbyte-api_v1`, env var `API_ACCESS_KEYS`) gates
 * *every* route behind this before routing even runs — an unknown path
 * returns 401 rather than 404. Production (`leadbyte-api`) has no such
 * layer, so this is optional: when unset, no header is sent and the older
 * backend behaves normally.
 *
 * Server-side only. This must never be prefixed NEXT_PUBLIC_ — it would
 * end up in the browser bundle and defeat the gate entirely.
 */
export const LEADBYTE_API_KEY = process.env.LEADBYTE_API_KEY ?? "";

/**
 * Whether the real backend is wired up.
 *
 * When false, every repository falls back to its Mock* implementation and
 * the app runs exactly as it does today. This is what lets us migrate
 * page by page instead of in one big-bang switchover — an unconfigured
 * environment is a working environment, not a broken one.
 */
export function isBackendConfigured(): boolean {
  return LEADBYTE_API_URL.length > 0;
}

/**
 * The ChatGPT Ads service needs no configuration of its own.
 *
 * It used to: a second backend with its own `ADS_API_URL` and key, and then
 * briefly a raw Lambda Invoke endpoint signed with AWS credentials. Both are
 * gone. The backend team put `POST /api/openai-ads` on the leadbyte-api Lambda
 * (verified 2026-09-15) — it invokes `openai-ads-automation-dev` and returns
 * its output — so the ads client rides `LEADBYTE_API_URL`, the `x-api-key` and
 * the JWT the app already has.
 *
 * That is why there are no `ADS_*` variables here, and why no AWS access key
 * lives on this server: there is nothing left for one to sign.
 * `isBackendConfigured()` is the only gate the ads client needs.
 */

/**
 * The AEO agent service — a SECOND backend, and unlike the ads service it
 * really is separate.
 *
 * It is its own FastAPI Lambda behind a Function URL: it audits a site for how
 * AI answer engines read it, and it knows nothing about leadbyte-api, its
 * `x-api-key` or its JWTs. Those routes are currently open.
 *
 * The note above records that the ads service stopped needing its own base URL
 * once the backend team proxied it through `POST /api/openai-ads`. That is the
 * better arrangement and worth asking for here too — one origin, one key, one
 * place a request can be refused. It does not exist yet, so this ships direct,
 * and the day a proxy route appears this constant is the only thing to delete.
 *
 * Server-side only. Never NEXT_PUBLIC_.
 */
export const AEO_API_URL = (process.env.AEO_API_URL ?? "").replace(/\/+$/, "");

/**
 * Whether the AEO service is wired up.
 *
 * Unlike `isBackendConfigured()` there is no mock behind this one, so a false
 * here is not "a working environment on fixtures" — it is the AEO screens
 * saying plainly that the service is not available. That was the deliberate
 * choice: this agent's data has no seeded equivalent, and a fabricated audit
 * score would be the one number on this app nobody could check.
 */
export function isAeoConfigured(): boolean {
  return AEO_API_URL.length > 0;
}

/**
 * This app's own public origin, no trailing slash.
 *
 * Needed because we hand Google's OAuth flow a `redirect_uri` pointing back at
 * us, and an absolute URL cannot be derived safely from the incoming request:
 * the `Host` header is attacker-controlled, and using it would turn our own
 * callback into an open redirect.
 *
 * Set it per environment. Falls back to localhost so dev works untouched.
 */
export const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

// Every OAuth, Stripe, invite and callback link is built from this. Missing in
// production, they all point at localhost and nothing else says so (audit,
// 2026-09-29) — so it is said loudly, once, at start-up.
if (process.env.NODE_ENV === "production" && !process.env.APP_URL) {
  console.error("[config] APP_URL is not set — every OAuth and payment return link points at localhost.");
}

/** Where n8n should return the browser after Google consent. */
export function googleCallbackUrl(): string {
  return `${APP_URL}/connections/google/callback`;
}

/**
 * Where n8n should return the browser after Facebook, Instagram or YouTube
 * consent.
 *
 * One route for all three: the callback reads the platform from the query, the
 * same way `connections/ads/callback` serves both ad platforms.
 *
 * The legacy app returned to `{origin}/integrations` — a PAGE. This returns to
 * a Route Handler instead, which is the house rule: n8n is configured with
 * these URLs per environment, so a page path in its config becomes an external
 * contract that cannot be renamed. `/intelligence/*` → `/overview/*` moved a
 * whole section on 2026-09-02 without touching n8n precisely because of this
 * indirection.
 *
 * Built from `APP_URL` for the reason above it: never from the request.
 */
export function socialCallbackUrl(): string {
  return `${APP_URL}/connections/social/callback`;
}

/**
 * Where n8n should return the browser after ad-platform consent.
 *
 * Sent for all three ad platforms. Every `/api/oauth/*` start forwards
 * `redirect_uri` to n8n (probed 2026-09-30). LinkedIn's `Login_url` and Meta's
 * `meta-connect` both carry it through consent — Meta puts it in the OAuth
 * `state` — and return there. Google Ads' `google-connect` currently drops it
 * and returns to whatever its n8n workflow has configured; sending it is
 * harmless there and correct the day it is honoured.
 */
export function adsCallbackUrl(): string {
  return `${APP_URL}/connections/ads/callback`;
}

/**
 * Where n8n should return the browser after Gmail consent.
 *
 * `gmail_connect` does not honour `redirect_uri` yet (probed 2026-09-30: the
 * Google consent `state` carries only the email), so the return is whatever
 * the n8n workflow has configured. Sent anyway, for the same reason as above.
 */
export function emailCallbackUrl(): string {
  return `${APP_URL}/connections/email/callback`;
}

/**
 * Demo mode is allowed to UNLOCK things (everyone an admin, every agent
 * entitled, sign-in without a credential) only on a developer's machine.
 *
 * "No backend configured" used to be enough on its own, so a production
 * deploy that lost `LEADBYTE_API_URL` would have signed everyone in without a
 * password as super admin. A production build now fails closed instead:
 * nothing unlocked, and the missing variable is loud in the log.
 */
export function demoUnlocksAllowed(): boolean {
  return !isBackendConfigured() && process.env.NODE_ENV !== "production";
}
