import { MAX_ROWS, collectFromPayload } from "@/lib/data/google-callback-payload";

/**
 * The Google Analytics properties a customer can choose between.
 *
 * ## Where these come from
 *
 * After consent, n8n redirects back with `?accounts=<URI-encoded JSON>`. The
 * list arrives in that URL rather than needing a separate call — the same way
 * the legacy app receives it.
 *
 * CONFIRMED shape (backend, 2026-09-03):
 *
 *   { account_name, property_id, property_name, email, name }
 *
 * `property_id` is a GA4 property. One Google account commonly owns several,
 * across several "accounts" — including auto-created "Default Account for
 * Firebase" ones — which is exactly why the customer has to pick.
 */

/** Where the list waits between the callback and the picker. */
export const GOOGLE_PROPERTIES_COOKIE = "leadbyte_google_properties";

export interface GoogleProperty {
  accountName: string;
  propertyId: string;
  propertyName: string;
  email: string;
  name: string;
}

export interface PropertyGroup {
  accountName: string;
  properties: GoogleProperty[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Reads the property list, from either a JSON string or an already-parsed value.
 *
 * Accepts BOTH key styles: the backend's `account_name` / `property_id`, and our
 * own camelCase, because the parsed list is re-serialised into a cookie between
 * the callback and the picker and comes back through here. Reading only
 * snake_case made that round trip return an empty list, and the picker silently
 * bounced back to the audit page.
 *
 * Never throws. This runs on a redirect the customer has just completed
 * successfully; a malformed list should cost them a picker, not the connection.
 */
export function parseGoogleProperties(raw: unknown): GoogleProperty[] {
  let value = raw;

  if (typeof raw === "string") {
    if (raw.trim() === "") return [];
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (value === null || value === undefined) return [];
  const rows = Array.isArray(value) ? value : [value];

  return rows
    .map(record)
    .map((r) => ({
      accountName: str(r.account_name || r.accountName).trim(),
      propertyId: str(r.property_id || r.propertyId || r.id).trim(),
      propertyName: str(r.property_name || r.propertyName).trim(),
      email: str(r.email).trim(),
      name: str(r.name).trim(),
    }))
    // No id means nothing to submit, so the row cannot be chosen.
    .filter((p) => p.propertyId !== "")
    // A property with no name still needs something clickable.
    .map((p) => ({ ...p, propertyName: p.propertyName || p.propertyId }))
    .slice(0, MAX_ROWS);
}

/** Google creates one of these per Firebase project, named exactly this. */
const AUTO_ACCOUNT = "Default Account for Firebase";

/**
 * Groups properties under their Google account, auto-created accounts last.
 *
 * Order is otherwise preserved — the backend's order is the one the customer
 * will recognise — but Firebase's auto-created account is pushed to the end
 * however early it arrives. The combined flow really does return it first, and
 * since the picker pre-selects the first row that would have defaulted a
 * LeadByte workspace to an unrelated Firebase project's traffic.
 */
export function groupByAccount(properties: GoogleProperty[]): PropertyGroup[] {
  const groups: PropertyGroup[] = [];

  for (const property of properties) {
    const accountName = property.accountName || "Other";
    const existing = groups.find((g) => g.accountName === accountName);
    if (existing) {
      existing.properties.push(property);
    } else {
      groups.push({ accountName, properties: [property] });
    }
  }

  // Stable partition: within each half the backend's order survives.
  return [
    ...groups.filter((g) => g.accountName !== AUTO_ACCOUNT),
    ...groups.filter((g) => g.accountName === AUTO_ACCOUNT),
  ];
}

/**
 * The property id as a person reads it.
 *
 * The two flows spell the same id differently: the Analytics-only callback
 * sends `508182301`, the combined one sends Google's resource name
 * `properties/517246553`. The raw value is what we keep and send back, so only
 * the display is normalised.
 */
export function propertyNumber(property: GoogleProperty): string {
  return property.propertyId.startsWith("properties/")
    ? property.propertyId.slice("properties/".length)
    : property.propertyId;
}

/** Finds Analytics properties anywhere in a callback payload. */
export function findGoogleProperties(raw: unknown): GoogleProperty[] {
  return collectFromPayload(raw, parseGoogleProperties, (p) => p.propertyId);
}
