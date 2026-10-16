/**
 * Reading the admin tables' rows, which were written by three generations of
 * code and spell the same field several ways.
 *
 * The old panel read `created_at || createdAt`, `errorId || id || error_id`
 * and so on inline, at every use. That is the same fall-back list repeated
 * forty times, and each copy was a chance to forget one spelling. `pick` is the
 * list once per field.
 *
 * Pure, no I/O — every mapper under `lib/admin/` builds on these.
 */

export type Row = Record<string, unknown>;

/** A value is "there" when it is not null, undefined or an empty string. */
function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

/** The first of `keys` that holds a real value, or undefined. */
export function pick(row: Row, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (present(value)) return value;
  }
  return undefined;
}

/** `pick`, as a trimmed string. "" when nothing is there. */
export function pickString(row: Row, ...keys: string[]): string {
  const value = pick(row, ...keys);
  if (value === undefined) return "";
  return typeof value === "string" ? value.trim() : String(value);
}

/** A number from a field that may hold one as text. Null, never NaN. */
export function pickNumber(row: Row, ...keys: string[]): number | null {
  const value = pick(row, ...keys);
  if (value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** True for `true`, `"true"`, `"yes"` and `1`. Anything else is false. */
export function truthy(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  return ["true", "yes", "1"].includes(value.trim().toLowerCase());
}

/** Lower-cased, trimmed email. "" for anything that is not a string. */
export function normEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Milliseconds since the epoch, or null when the value is not a date. */
export function timeOf(value: unknown): number | null {
  if (!present(value)) return null;
  const parsed = new Date(value as string | number);
  const t = parsed.getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Admin times are shown in India time, and say so.
 *
 * They are formatted on the SERVER and handed to the tables as text. A date
 * formatted inside a client cell renderer runs twice — once in Node, once in
 * the browser — and the two disagree whenever their time zones do, which React
 * reports as a hydration mismatch. Pinning one zone makes the text identical in
 * both places. It is India because the team reading this panel is there; the
 * column headers name the zone so nobody has to guess.
 */
export const ADMIN_TIME_ZONE = "Asia/Kolkata";

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: ADMIN_TIME_ZONE,
});

const DATE_TIME_SECONDS = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: ADMIN_TIME_ZONE,
});

const DATE_ONLY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: ADMIN_TIME_ZONE,
});

/** "14 Sept 2026, 09:05" → normalised to a three-letter month. */
function tidy(text: string): string {
  // en-GB writes September as "Sept" — four letters where every other month
  // has three. The analytics axes fixed the same thing in `shortDay`.
  return text.replace("Sept", "Sep");
}

/** A timestamp for a table cell. "—" when there is none. */
export function formatDateTime(value: unknown, withSeconds = false): string {
  const t = timeOf(value);
  if (t === null) return "—";
  return tidy((withSeconds ? DATE_TIME_SECONDS : DATE_TIME).format(t));
}

/** A date for a table cell. "—" when there is none. */
export function formatDate(value: unknown): string {
  const t = timeOf(value);
  if (t === null) return "—";
  return tidy(DATE_ONLY.format(t));
}

/** `lead_qualification` / `leadQualification` → "Lead qualification". */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A stored value as short text for a cell. Objects are shown as JSON. */
export function cellText(value: unknown, max = 80): string {
  if (!present(value)) return "—";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Whether a stored field holds a credential.
 *
 * Agent configurations carry things like a WordPress admin password and API
 * keys. The legacy panel printed them in the clear in two places; an admin
 * screen needs to show that one is set, not what it is.
 */
export function isSecretKey(key: string): boolean {
  return /pass(word|wd)?|secret|token|api[_-]?key|private[_-]?key|credential|authorization|bearer|session[_-]?id|cookie/i.test(
    key,
  );
}

/** `cellText`, with credentials masked. */
export function safeCellText(key: string, value: unknown, max = 80): string {
  if (isSecretKey(key)) return present(value) ? "•••••••• (hidden)" : "—";
  return cellText(value, max);
}
