import { cookies } from "next/headers";
import { normaliseCurrency } from "./openai-currency";

/**
 * What `verify` told us about the connected ad account, kept for the screens
 * that come after the key form.
 *
 * ## Why a cookie, and why alongside the key rather than inside it
 *
 * `verify` returns the account's currency, its brand-review status and a
 * suggested country — read once, while the key was in hand. The setup form two
 * screens later needs the currency (the budget is typed in it) and the country
 * (to prefill the target), and nothing sends the key again to ask. So the
 * summary rides an httpOnly cookie, the same mechanism `openai-key.ts` uses and
 * for the same reason: no endpoint gives it back.
 *
 * It is a SUMMARY, not the credential — currency, a country code, an account
 * name and a status. Nothing here is secret; the value of keeping it is saving
 * a second `verify` round trip, not hiding anything.
 *
 * ## The name is load-bearing
 *
 * The `leadbyte_` prefix is what makes `lib/auth/sign-out.ts` sweep it on sign
 * out — the same prefix rule that keeps one account's state from leaking to the
 * next person on the browser. The key is cleared with it, and this must go too:
 * a stale currency belongs to the previous account, not this one.
 */
export const OPENAI_ACCOUNT_COOKIE = "leadbyte_openai_account";

/** Matches the key cookie — the two are written and cleared together. */
const MAX_AGE = 30 * 24 * 60 * 60;

export interface OpenAiAccount {
  /** ISO code, already normalised — `USD` when the account did not report one. */
  currency: string;
  /** Two-letter guess from the account timezone, or "" — the user confirms it. */
  country: string;
  /** The advertiser account's own name, for the connected-key note. */
  name: string;
  /** `approved`, `pending`, … — shown on the connected note, never a gate here. */
  reviewStatus: string;
  /** The advertiser account's id, e.g. `adacct_…`. Shown, never sent anywhere. */
  accountId: string;
  /** `active`, … — the account's own status. */
  status: string;
  /** IANA zone the account bills in, e.g. `America/New_York`. */
  timezone: string;
  /**
   * How many conversion events the account has (the save reply's
   * `conversion_events`, or `account.event_count`). Leads and App installs
   * optimise for a conversion, so they are offered only when this is above
   * zero (2026-10-03).
   */
  conversionEventCount: number;
  /**
   * The service's readiness verdicts (`checks` in the verify/save reply):
   * `key_valid`, `account_active`, `brand_approved`, `tracking`. Shown on
   * the "Ready to run" card. `informational` ones are facts, not failures —
   * the service's own word for `tracking` (see `AdsCheck`).
   */
  checks: OpenAiCheck[];
}

export interface OpenAiCheck {
  key: string;
  ok: boolean;
  informational: boolean;
  value: string;
}

/** The checks from a reply, kept small enough for a cookie. Never throws. */
export function checksFrom(raw: unknown): OpenAiCheck[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => ({
      key: str(c.key),
      ok: c.ok === true,
      informational: c.informational === true,
      value: str(c.value).slice(0, 60),
    }))
    .filter((c) => c.key !== "")
    .slice(0, 8);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Build the summary from a verify/save reply's `account` block plus the
 * top-level `country_suggested`. Defensive: every field is optional upstream,
 * and a missing currency becomes the default rather than an empty label.
 */
export function accountFromVerify(source: {
  account?: {
    currency?: string;
    name?: string;
    review_status?: string;
    account_id?: string;
    status?: string;
    timezone?: string;
    event_count?: unknown;
  };
  country_suggested?: string;
  conversion_events?: unknown;
  checks?: unknown;
}): OpenAiAccount {
  const listed = Array.isArray(source.conversion_events) ? source.conversion_events.length : null;
  const counted = typeof source.account?.event_count === "number" ? source.account.event_count : 0;
  return {
    currency: normaliseCurrency(source.account?.currency),
    country: str(source.country_suggested).toUpperCase(),
    name: str(source.account?.name),
    reviewStatus: str(source.account?.review_status),
    accountId: str(source.account?.account_id),
    status: str(source.account?.status),
    timezone: str(source.account?.timezone),
    // The list itself wins when it came back; the count stands in when not.
    conversionEventCount: Math.max(0, listed ?? counted),
    checks: checksFrom(source.checks),
  };
}

/** Parse the cookie back, or null. Never throws — a torn value is "not set". */
export function parseAccountCookie(raw: string | undefined): OpenAiAccount | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<OpenAiAccount>;
    if (typeof value !== "object" || value === null) return null;
    return {
      currency: normaliseCurrency(value.currency),
      country: str(value.country).toUpperCase(),
      name: str(value.name),
      reviewStatus: str(value.reviewStatus),
      accountId: str(value.accountId),
      status: str(value.status),
      timezone: str(value.timezone),
      conversionEventCount:
        typeof value.conversionEventCount === "number" && value.conversionEventCount > 0
          ? value.conversionEventCount
          : 0,
      checks: checksFrom(value.checks),
    };
  } catch {
    return null;
  }
}

/** Safe anywhere — reading cookies has no restriction. */
export async function getOpenAiAccount(): Promise<OpenAiAccount | null> {
  const store = await cookies();
  return parseAccountCookie(store.get(OPENAI_ACCOUNT_COOKIE)?.value);
}

/**
 * Stores the summary. Writable ONLY from a Server Action or Route Handler,
 * the same restriction as every other cookie write.
 */
export async function setOpenAiAccount(account: OpenAiAccount): Promise<void> {
  const store = await cookies();
  store.set(OPENAI_ACCOUNT_COOKIE, JSON.stringify(account), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** Forgets it — called wherever the key is forgotten, so the two stay in step. */
export async function clearOpenAiAccount(): Promise<void> {
  const store = await cookies();
  store.delete(OPENAI_ACCOUNT_COOKIE);
}
