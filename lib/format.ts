/**
 * Number formatting, with the locale pinned.
 *
 * ## Why this exists
 *
 * `value.toLocaleString()` with no locale uses whatever locale the runtime
 * defaults to — Node's on the server, the browser's on the client. They
 * disagree, and React then throws a hydration mismatch and re-renders the
 * subtree: the server sent `1,97,508` and Chrome expected `197,508`.
 *
 * It only shows above 100,000, because that is where Indian and Western
 * grouping first differ (`1,97,508` vs `197,508`). Every table in the app had
 * the latent bug; ad impressions were simply the first numbers big enough to
 * trip it.
 *
 * So the locale is explicit, in one place. `en-IN` matches what the app already
 * chose for ad money and the account's own reporting currency (INR, per
 * Settings) — but the value here is that it is FIXED, not which one it is.
 */
const NUMBER_LOCALE = "en-IN";

/**
 * What to say beside a money figure when we cannot name its currency.
 *
 * `formatAmount`'s own note claims "the section heading says whose currency it
 * is instead". It did not: an audit on 2026-09-15 found "Ad spend 3,334" and
 * "3.14 cost per conversion" with no unit anywhere on either screen. A bare
 * number reads as dollars to one person and rupees to another, and this
 * workspace genuinely has accounts in both.
 *
 * So the omission is stated rather than left to be noticed. It is deliberately
 * short and quiet — this is a caveat on a figure, not a warning about it.
 */
export const CURRENCY_UNKNOWN = "in your ad account's currency";

/** A count — impressions, clicks, sessions. No decimals. */
export function formatCount(value: number): string {
  return value.toLocaleString(NUMBER_LOCALE);
}

/**
 * A count with its noun, pluralised.
 *
 * `countOf(1, "issue")` is "1 issue" and `countOf(4, "issue")` is "4 issues".
 * Pass the plural where an `s` will not do: `countOf(n, "entry", "entries")`.
 *
 * ## Why this is a helper and not `${n} issues`
 *
 * Because the app shipped "1 issues explained", "1 pages", "1 rows" and, worst
 * of the set, "1 of 1 pages have no Schema.org markup" as advice a customer
 * was meant to act on. Every one of them was a template literal where the
 * count happened never to be 1 on the author's screen. An audit on 2026-09-23
 * found five.
 *
 * The number goes through `formatCount`, so a four-figure count is grouped:
 * "1,284 issues", not "1284 issues".
 */
export function countOf(n: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(n)} ${n === 1 ? singular : plural}`;
}

/**
 * A money amount, without a currency symbol.
 *
 * Ad accounts report in their own currency and the insight rows do not carry
 * one — this workspace has accounts in both USD and INR — so printing a symbol
 * would be a guess in the one place a guess is least welcome. The section
 * heading says whose currency it is instead.
 */
export function formatAmount(value: number): string {
  return value.toLocaleString(NUMBER_LOCALE, { maximumFractionDigits: 0 });
}

/**
 * A money amount that might not exist, and might be small.
 *
 * Two failures on the live Advertising screen, both from formatting rather
 * than arithmetic:
 *
 * - **`null` printed as `0`.** `ads-insights` deliberately returns `null` for
 *   a CPA with no conversions behind it, because "it costs nothing" and "we
 *   have nothing to divide by" are opposite claims. The repo then coerced it
 *   to `0` and the page printed `₹0`, which reads as a triumph.
 * - **`0.38` printed as `0`.** Rounding to whole units is right for spend and
 *   wrong for a cost per click: ₹205 across 534 clicks became a cost per click
 *   of nothing.
 *
 * So: an absent figure is an em dash, an amount under ten keeps two decimals
 * because that is where they still say something, and anything larger rounds.
 * No currency symbol — see `formatAmount`.
 */
export function formatMoney(value: number | null): string {
  if (value === null) return "—";

  const decimals = value !== 0 && Math.abs(value) < 10 ? 2 : 0;
  return value.toLocaleString(NUMBER_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
