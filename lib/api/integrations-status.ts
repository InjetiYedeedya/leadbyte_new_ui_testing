import { cache } from "react";
import { isRedirectError } from "@/lib/auth/session-expired";
import { devGlobal } from "@/lib/dev-global";
import { ApiError, apiGet } from "./client";
import { isBackendConfigured } from "./config";

/**
 * `GET /api/integrations/status` — the backend's one-call connection check.
 *
 * ## Why it is read when it may not exist yet
 *
 * The backend built it to replace our seven Frontend Check reads: it decides
 * "connected" from the real OAuth tables (a token present, not expired) and
 * says WHICH account is selected. On 2026-09-30 it was built and tested but
 * not deployed ("Route not found"). So this is read first and, the moment it
 * answers, every connection check in the app uses it — no deploy on our side.
 * Until then it answers 404 and `oauth-status.ts` reads the tables exactly as
 * before.
 *
 * A 404 is remembered for five minutes (per server process) so a route that
 * does not exist yet does not cost a round trip on every page.
 *
 * ## The shape (backend README + reply, 2026-09-30)
 *
 *   { success, data: { "google-ads": { status, connected, accounts: [...],
 *       selected_account? }, "meta-ads": …, "google-search-console": … } }
 *
 * `status` is connected | expired | revoked | not_connected | incomplete |
 * error. Account ids are strings. Tokens never appear.
 */

export type IntegrationKey =
  | "google-ads"
  | "meta-ads"
  | "linkedin-ads"
  | "google-analytics"
  | "google-search-console"
  | "instagram"
  | "facebook"
  | "youtube";

export type IntegrationStatus = "connected" | "expired" | "not-connected" | "error";

export interface IntegrationState {
  status: IntegrationStatus;
  /**
   * Whether an account is chosen: true / false, or null when the reply did
   * not say (an older deploy without `selected_account`).
   */
  accountChosen: boolean | null;
  /** The chosen account's name, when there is one. */
  selectedName: string | null;
  /** The chosen account's id, when the reply says. */
  selectedId?: string | null;
  /** The chosen account's ISO currency (`INR`), when the reply says. */
  selectedCurrency: string | null;
  /** `expires_at` of the chosen (or first) account, ISO, or null. */
  expiresAt: string | null;
}

export type IntegrationsMap = Partial<Record<IntegrationKey, IntegrationState>>;

const KEYS: readonly IntegrationKey[] = [
  "google-ads",
  "meta-ads",
  "linkedin-ads",
  "google-analytics",
  "google-search-console",
  "instagram",
  "facebook",
  "youtube",
];

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Their words, ours. `revoked` is access removed on Google's or Facebook's
 * side — for the customer that is the same as expired: reconnect. An
 * `incomplete` connection (a mailbox saved without its address) cannot be used
 * yet, so it reads as not connected. Anything unrecognised is "error", which
 * blocks nothing — the same rule as an unreadable check.
 */
function statusOf(raw: unknown): IntegrationStatus {
  switch (str(raw).toLowerCase()) {
    case "connected":
      return "connected";
    case "expired":
    case "revoked":
      return "expired";
    case "not_connected":
    case "not-connected":
    case "incomplete":
      return "not-connected";
    default:
      return "error";
  }
}

function parseState(raw: unknown): IntegrationState | null {
  const state = record(raw);
  if (!state) return null;
  const accounts = Array.isArray(state.accounts) ? state.accounts.map(record).filter(Boolean) : [];
  const flagged = accounts.find((a) => a?.selected === true) ?? null;
  const selected = record(state.selected_account) ?? flagged;
  // `selected_account: null` is an explicit "nobody picked"; a reply with no
  // such key and no `selected` flags predates the field and says nothing.
  const said = "selected_account" in state || accounts.some((a) => a && "selected" in a);
  const shown = selected ?? accounts[0] ?? null;
  return {
    status: statusOf(state.status),
    accountChosen: said ? selected !== null : null,
    selectedName: selected ? str(selected.name) || str(selected.account_id) || null : null,
    selectedId: selected ? str(selected.account_id) || str(selected.id) || null : null,
    selectedCurrency: selected ? str(selected.currency).toUpperCase() || null : null,
    expiresAt: shown ? str(shown.expires_at) || null : null,
  };
}

/** The reply, mapped. Pure, so the backend's shape is pinned by tests. */
export function parseIntegrations(payload: unknown): IntegrationsMap | null {
  const body = record(payload);
  if (!body || body.success === false) return null;
  const data = record(body.data);
  if (!data) return null;
  const map: IntegrationsMap = {};
  for (const key of KEYS) {
    const state = parseState(data[key]);
    if (state) map[key] = state;
  }
  return map;
}

/**
 * OFF since 2026-10-12. The endpoint went live that day and answered the
 * same account, seconds apart, with EVERY platform "connected" and then
 * EVERY platform "not_connected" — alternating within one page load. Trusted
 * as the final word, it told a customer who had just connected Google that
 * Analytics was not connected. Until the backend team fixes it, every check
 * reads the Frontend Check tables in the backend database — what the legacy
 * app reads, and what this app read until that morning. Flip this back once
 * `summariseIntegrations` (logged below) shows stable answers.
 */
const ENDPOINT_ENABLED = false;

const NOT_DEPLOYED_FOR_MS = 5 * 60_000;
const probe = devGlobal("integrations_status_probe", () => ({ notDeployedUntil: 0 }));

/**
 * This account's connections from the new endpoint, or null when it is not
 * there (not deployed, refused, or unreachable) — callers then read the
 * Frontend Check tables as they always have. Never throws, except to let a
 * dead session leave as a redirect. Memoised per render.
 */
export const readIntegrations = cache(async function readIntegrations(): Promise<IntegrationsMap | null> {
  if (!ENDPOINT_ENABLED || !isBackendConfigured() || Date.now() < probe.notDeployedUntil) return null;
  try {
    const payload = await apiGet<unknown>("/api/integrations/status");
    const map = parseIntegrations(payload);
    // Status words only — what the backend decided per platform, never
    // account details. This is the line that says why a screen reads
    // "not connected" while a consent just finished.
    console.log(`[integrations] ${summariseIntegrations(payload)}`);
    return map;
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof ApiError && error.status === 404) {
      probe.notDeployedUntil = Date.now() + NOT_DEPLOYED_FOR_MS;
    } else {
      console.warn("[integrations] status endpoint unavailable, reading the tables:", error);
    }
    return null;
  }
});

/** `key=status` for every entry in the reply, plus any keys we do not read. */
export function summariseIntegrations(payload: unknown): string {
  const body = record(payload);
  const data = record(body?.data);
  if (!body || !data) return `unreadable reply (success ${String(body?.success)})`;
  return Object.entries(data)
    .map(([key, value]) => `${key}=${str(record(value)?.status) || "?"}${(KEYS as readonly string[]).includes(key) ? "" : " (not read)"}`)
    .join(", ");
}
