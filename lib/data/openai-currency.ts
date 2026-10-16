import type { AdsBudgetType } from "./ads-types";

/**
 * The ad account's currency, and the budget floors that depend on it.
 *
 * The account's currency comes back from `verify` (`account.currency`, e.g.
 * `USD`). The budget the customer types is in THAT currency — the platform bills
 * in it — so the setup form has to name it and the minimums have to be read
 * against it. A minimum of "$25" enforced blindly on a rupee account would
 * reject a perfectly valid ₹25 daily budget, or wave through one a hundredth of
 * the real floor.
 *
 * Pure — no cookies, no fetch — so the floors are testable against the numbers
 * the platform actually enforces.
 */

/** Used whenever `verify` returned no currency: most accounts are USD. */
export const DEFAULT_CURRENCY = "USD";

/**
 * A currency code we can trust in a label and a lookup, or the default.
 *
 * ISO codes are three letters; anything else (empty, a symbol, a stray word)
 * is treated as "not told", which is USD — the same "unconfigured is a working
 * default" rule the rest of the app follows.
 */
export function normaliseCurrency(raw: string | null | undefined): string {
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(code) ? code : DEFAULT_CURRENCY;
}

/**
 * What each currency shows in front of an amount. The bare code is a safe
 * fallback — "USD 25" reads fine and never renders the wrong glyph.
 */
const SYMBOLS: Record<string, string> = {
  USD: "$",
  INR: "₹",
  EUR: "€",
  GBP: "£",
};

export function currencySymbol(currency: string): string {
  return SYMBOLS[normaliseCurrency(currency)] ?? normaliseCurrency(currency);
}

/** `$25`, `₹500`, or `AUD 25` — symbol when we have one, code otherwise. */
export function formatBudget(amount: number, currency: string): string {
  const symbol = currencySymbol(currency);
  // A code needs a space; a glyph does not.
  return symbol.length > 1 ? `${symbol} ${amount}` : `${symbol}${amount}`;
}

/**
 * The platform's minimum budget, per currency and budget type.
 *
 * Only USD is published by the platform so far (daily $25, lifetime $100). A
 * currency with no entry has NO extra floor here — the generic "more than
 * zero" rule in `validateAdsSetup` still applies — rather than a guessed number
 * that could reject a valid budget. Add a currency here as its real floors are
 * confirmed.
 */
const MINIMUMS: Record<string, { daily: number; lifetime: number }> = {
  USD: { daily: 25, lifetime: 100 },
};

/**
 * The minimum for this currency and budget type, or 0 when none is defined.
 *
 * Zero means "only the more-than-zero rule applies", never "free": a caller
 * compares `amount < budgetMinimum(...)` and a zero minimum can never fail that.
 */
export function budgetMinimum(currency: string, type: AdsBudgetType): number {
  const floors = MINIMUMS[normaliseCurrency(currency)];
  if (!floors) return 0;
  return type === "lifetime" ? floors.lifetime : floors.daily;
}
