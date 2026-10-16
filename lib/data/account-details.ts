/**
 * What the Connections page says about the account behind a connected row:
 * its name, its id, and whatever else identifies it (currency, business,
 * the signed-in login). Pure, so every shape the backend has written is
 * pinned by tests.
 *
 * Read from two places in a check row, because two different writers fill it:
 * - `selectedAccount` — the account our pickers and callbacks saved, as a
 *   JSON string or an object (`AdAccount`, a social account, Google targets);
 * - the row's own top-level fields — what n8n writes when IT records the
 *   connection. Their spellings are not documented (BACKEND.md S4 asks for a
 *   sample), so the plausible ones are all tried, and nothing is invented
 *   when none is present.
 */
export interface AccountDetails {
  name: string;
  id: string;
  /** Short identifying facts, already worded: "USD", "Business: Acme Ltd". */
  facts: string[];
}

export const NO_DETAILS: AccountDetails = { name: "", id: "", facts: [] };

function text(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function parsed(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "string") {
    try {
      const value: unknown = JSON.parse(raw);
      return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

/** One check row's account details. */
export function accountDetailsFromRow(row: unknown): AccountDetails {
  const top = parsed(row);
  if (!top) return NO_DETAILS;
  const chosen = parsed(top.selectedAccount) ?? {};

  const name = text(
    chosen.name,
    chosen.title,
    chosen.property,
    chosen.site,
    top.account_name,
    top.accountName,
    top.ad_account_name,
    top.adAccountName,
    top.page_name,
    top.pageName,
    top.channel_name,
    top.property_name,
    top.site_url,
  );
  const id = text(
    chosen.propertyId,
    chosen.id,
    chosen.account_id,
    chosen.channel_id,
    top.account_id,
    top.accountId,
    top.ad_account_id,
    top.adAccountId,
    top.customer_id,
    top.page_id,
    top.property_id,
  );

  const facts: string[] = [];
  const currency = text(chosen.currency, top.currency);
  if (/^[A-Za-z]{3}$/.test(currency)) facts.push(currency.toUpperCase());
  const business = text(chosen.businessName, chosen.business_name, top.business_name);
  if (business && business !== name) facts.push(`Business: ${business}`);
  // Google: a row can name both the Analytics property and the site.
  const site = text(chosen.site);
  if (site && site !== name) facts.push(`Site: ${site}`);
  const login = text(top.google_email, top.googleEmail, top.fb_user_name, chosen.fb_user_name);
  if (login) facts.push(`Signed in as ${login}`);

  // An id that only repeats the name (accounts with no name fall back to it)
  // says nothing twice.
  return { name, id: id === name ? "" : id, facts };
}

/** The first row that names an account; rows without one are leftovers. */
export function accountDetailsFromRows(rows: readonly unknown[]): AccountDetails {
  let best = NO_DETAILS;
  for (const row of rows) {
    const details = accountDetailsFromRow(row);
    if (details.name) return details;
    if (!best.id && details.id) best = details;
  }
  return best;
}
