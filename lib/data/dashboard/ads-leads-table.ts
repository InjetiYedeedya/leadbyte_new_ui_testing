import { normKey, type Row } from "@/lib/data/dashboard/fields";

/**
 * The Ads Leads Details table, built from whatever the rows carry.
 *
 * ## Why the columns come from the data
 *
 * `leadbyte-leads` holds lead-gen FORM submissions, and every ad form asks its
 * own questions — one has a preferred time, another a budget, a third neither.
 * A fixed column list would either drop the answers a customer's own form
 * collected or print a wall of empty columns for forms that never asked. So a
 * column exists when some row has a value for it (legacy guide §5.8).
 *
 * ## The three rules, in order
 *
 * 1. **Hidden** — `email` is the ACCOUNT's own address, the table's partition
 *    key repeated on every row (`lib/data/ads-leads.ts` records the bug that
 *    came from reading it as the lead's). The ids and `processedAt` are
 *    plumbing a customer cannot act on.
 * 2. **Renamed, and first** — the fields every form carries, in the order
 *    someone scanning a lead list reads them.
 * 3. **Everything else, A→Z**, labelled from its own key.
 *
 * Keys are matched after `normKey`, so `form_id` and `formId`, or
 * `campaignName` and `campaign_name` on two different rows, are ONE column —
 * two forms spelling a field differently is not two fields.
 *
 * Pure and client-safe — the leads panel builds its CSV from it in the
 * browser. The read lives in the tab (`ads-leads-tab.tsx`), because the
 * cascade reaches `lib/api/client.ts`, which is server-only.
 */

const HIDDEN = new Set(
  ["email", "leadId", "adgroupId", "adId", "pageId", "processedAt", "form_id", "formId"].map(normKey),
);

/** Normalised key → label, in display order. */
const KNOWN: readonly (readonly [string[], string])[] = [
  [["campaignName", "campaign_name", "CampaignName"], "Campaign Name"],
  [["which_ads", "whichAds"], "Ads Platform"],
  [["status"], "Status"],
  [["client_email", "clientEmail", "Client_Email"], "Lead Email"],
  [["fullName", "full_name"], "Full Name"],
  [["phone"], "Phone"],
  [["zip"], "Zip Code"],
  [["responseId"], "Response ID"],
];

const KNOWN_LABEL = new Map<string, string>();
const KNOWN_ORDER = new Map<string, number>();
KNOWN.forEach(([spellings, label], index) => {
  for (const spelling of spellings) {
    KNOWN_LABEL.set(normKey(spelling), label);
    KNOWN_ORDER.set(normKey(spelling), index);
  }
});

/** The words a label keeps in capitals rather than title-casing ("Utm Source"). */
const ACRONYMS: Record<string, string> = { id: "ID", url: "URL", utm: "UTM", ip: "IP", sms: "SMS" };

/**
 * `preferredTime` → "Preferred Time", `budget_range` → "Budget Range".
 *
 * Title case to match the renamed columns beside it ("Campaign Name", "Zip
 * Code"): a header row where half the labels are cased one way and half the
 * other reads as two tables stitched together.
 */
export function autoLabel(key: string): string {
  const words = key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter((word) => word !== "");
  if (words.length === 0) return key;
  return words
    .map((word) => ACRONYMS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Any value as the text of one cell. Blank is "" — the table prints "-".
 *
 * Never a raw object: React refuses to render one and would take the whole
 * tab down with it, and `String({})` prints "[object Object]", which is worse
 * than nothing. A nested answer (a form's address block) reads as
 * `city: Pune; zip: 411001`.
 */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value.map(cellText).filter((part) => part !== "").join(", ");
  }
  if (typeof value === "object") {
    return Object.entries(value as Row)
      .map(([key, inner]) => [key, cellText(inner)] as const)
      .filter(([, text]) => text !== "")
      .map(([key, text]) => `${key}: ${text}`)
      .join("; ");
  }
  return "";
}

export interface LeadColumn {
  /** The normalised key — stable across spellings. */
  key: string;
  label: string;
}

export interface LeadRow {
  /** Unique within the table, for React and `DataTable`'s `rowKey`. */
  id: string;
  /** Column key → text. A column the row has no value for is absent. */
  cells: Record<string, string>;
}

export interface LeadsTable {
  columns: LeadColumn[];
  rows: LeadRow[];
}

/** When the lead arrived, for newest-first ordering. Read from hidden fields too. */
function arrivedAt(raw: Row): string {
  for (const [key, value] of Object.entries(raw)) {
    const norm = normKey(key);
    if ((norm === "receivedat" || norm === "processedat" || norm === "createdat") && typeof value === "string") {
      return value;
    }
  }
  return "";
}

export function buildLeadsTable(input: readonly unknown[]): LeadsTable {
  const firstSpelling = new Map<string, string>();
  const records = input.filter(
    (row): row is Row => row !== null && typeof row === "object" && !Array.isArray(row),
  );

  // Newest first, where the rows say when they arrived. Stable, so rows with
  // no date keep the order the backend sent them in, after the dated ones.
  const ordered = records
    .map((raw, index) => ({ raw, index, at: arrivedAt(raw) }))
    .sort((a, b) => {
      if (a.at === b.at) return a.index - b.index;
      if (a.at === "") return 1;
      if (b.at === "") return -1;
      return b.at.localeCompare(a.at);
    });

  const rows: LeadRow[] = ordered.map(({ raw, index }) => {
    const cells: Record<string, string> = {};
    let leadId = "";
    for (const [key, value] of Object.entries(raw)) {
      const norm = normKey(key);
      if (norm === "leadid" && typeof value === "string") leadId = value.trim();
      if (norm === "" || HIDDEN.has(norm)) continue;
      // Two spellings of one field on the same row: the first with a value wins.
      if (cells[norm] !== undefined) continue;
      const text = cellText(value);
      if (text === "") continue;
      cells[norm] = text;
      if (!firstSpelling.has(norm)) firstSpelling.set(norm, key);
    }
    // The index keeps the id unique: `leadId` is not guaranteed to be, and a
    // duplicate key is how rule 6's bugs were found four times.
    return { id: `${leadId || "lead"}-${index}`, cells };
  });

  const known: LeadColumn[] = [];
  const rest: LeadColumn[] = [];
  for (const [key, spelling] of firstSpelling) {
    const label = KNOWN_LABEL.get(key);
    if (label !== undefined) known.push({ key, label });
    else rest.push({ key, label: autoLabel(spelling) });
  }
  known.sort((a, b) => (KNOWN_ORDER.get(a.key) ?? 0) - (KNOWN_ORDER.get(b.key) ?? 0));
  rest.sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));

  return { columns: [...known, ...rest], rows };
}

/* ---------- CSV export ---------- */

/**
 * A cell a spreadsheet would run as a formula is prefixed with `'`.
 *
 * These values are typed by strangers into an ad form, and a lead named
 * `=HYPERLINK(...)` becomes a live formula the moment the customer opens the
 * export. A phone number (`+91 98765 43210`) or a negative number starts with
 * a sign too and is left alone — mangling every international phone number
 * would make the export worse for everyone to defend against a case the
 * pattern below already excludes.
 */
export function neutralise(text: string): string {
  if (/^[=@\t\r]/.test(text)) return `'${text}`;
  if (/^[+-]/.test(text) && !/^[+-][\d\s().-]*$/.test(text)) return `'${text}`;
  return text;
}

function csvField(text: string): string {
  const safe = neutralise(text);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The table as CSV, columns as shown. An empty cell is empty, not "-". */
export function leadsTableToCsv(table: LeadsTable): string {
  const header = table.columns.map((column) => csvField(column.label)).join(",");
  const lines = table.rows.map((row) =>
    table.columns.map((column) => csvField(row.cells[column.key] ?? "")).join(","),
  );
  return [header, ...lines].join("\r\n");
}

/**
 * Drops a row whose `email` names a DIFFERENT account.
 *
 * `email` is this table's partition key, so a query by the account's address
 * only ever returns its own rows — but the cascade also scans, and a scan's
 * filter is the backend's to get right. A row that says it belongs to someone
 * else is never shown as this customer's leads. A row with no `email` is kept:
 * the uid route answers by the account's own id.
 */
export function ownRows(rows: readonly unknown[], accountEmail: string): unknown[] {
  const account = accountEmail.trim().toLowerCase();
  return rows.filter((row) => {
    if (row === null || typeof row !== "object") return false;
    const owner = (row as Row).email;
    return typeof owner !== "string" || owner.trim() === "" || owner.trim().toLowerCase() === account;
  });
}
