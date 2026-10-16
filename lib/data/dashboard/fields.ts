/**
 * Reading dashboard rows by SHAPE, not by exact spelling.
 *
 * Different agent runs write the same field differently — `sent_mails` and
 * `outreach_email_sent`, `Like_count` and `likes_count` — so the legacy
 * dashboard shrank every key to lowercase letters and digits and looked for a
 * list of accepted spellings (implementation guide §4). Same rule here, for
 * every tab.
 *
 * One deliberate difference from the guide's `pick`: a missing number is
 * NULL, not 0. The guide's own rule is "—" for missing and "0" only for a real
 * zero, and a helper that returns 0 for "not in the row" makes that
 * impossible to keep. Pure and client-safe.
 */

export type Row = Record<string, unknown>;

/** `Outreach_Email-Sent` → `outreachemailsent`. */
export function normKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The row with every key normalised. Later duplicates do not overwrite earlier ones. */
export function flatten(row: unknown): Row {
  const flat: Row = {};
  if (!row || typeof row !== "object" || Array.isArray(row)) return flat;
  for (const [key, value] of Object.entries(row as Row)) {
    const norm = normKey(key);
    if (!(norm in flat)) flat[norm] = value;
  }
  return flat;
}

/**
 * A number, however it arrived: `1240`, `"1,240"`, `" 12 "`. Blank, missing
 * or unreadable is null. Negative counts are clamped to 0 (a count cannot be
 * below nothing); pass `allowNegative` for a value that can.
 */
export function numeric(value: unknown, allowNegative = false): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[,\s]/g, ""));
  if (!Number.isFinite(n)) return null;
  return allowNegative ? n : Math.max(0, n);
}

/** The first of these spellings that holds a number, or null. `flat` must be `flatten`ed. */
export function pickNum(flat: Row, ...names: string[]): number | null {
  for (const name of names) {
    const value = numeric(flat[normKey(name)]);
    if (value !== null) return value;
  }
  return null;
}

/** The first of these spellings that holds non-blank text, or "". */
export function pickStr(flat: Row, ...names: string[]): string {
  for (const name of names) {
    const value = flat[normKey(name)];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

/** The first of these spellings that holds anything at all, raw. */
export function pickRaw(flat: Row, ...names: string[]): unknown {
  for (const name of names) {
    const value = flat[normKey(name)];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/** A share, 0–1, or null when there is nothing to divide by. */
export function ratio(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole <= 0) return null;
  return part / whole;
}

/** "12%" / "4.2%" — one decimal under 10%, none above. Null → "—". */
export function formatShare(share: number | null): string {
  if (share === null) return "—";
  const pct = share * 100;
  return `${pct < 10 && pct !== 0 ? pct.toFixed(1) : Math.round(pct)}%`;
}
