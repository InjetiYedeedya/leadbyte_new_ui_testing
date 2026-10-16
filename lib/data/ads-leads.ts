import { cache } from "react";
import { rowsFrom } from "@/lib/api/read-cascade";
import { apiRequest } from "@/lib/api/client";
import { isBackendConfigured } from "@/lib/api/config";
import { isRedirectError } from "@/lib/auth/session-expired";
import { neutralise } from "@/lib/data/dashboard/ads-leads-table";

/**
 * Leads captured from ad campaigns, read from `leadbyte-leads`.
 *
 * ## Why this is separate from `leadbyte_lead_activity`
 *
 * `lib/data/lead-qualification.ts` already reads a table with a similar
 * name — `leadbyte_lead_activity` — but that one is the OUTREACH log: what
 * happened after a lead database was uploaded and emailed. This is the
 * opposite end: raw leads an ad platform's lead-gen form captured, before
 * anyone has scored or emailed them. Confusing the two would show a
 * customer their own outreach history as though it were a fresh lead list.
 *
 * ## Field spellings — CONFIRMED against a live query (2026-09-18)
 *
 * `email` on every row is the ACCOUNT's own address, not the lead's — it is
 * the table's own partition key, repeated on every item. The lead's actual
 * address is `client_email`. This was found live: a first pass mapped
 * `email` first and every "lead" on screen showed the same address, which
 * is exactly the bug this comment now exists to stop coming back — `email`
 * and `lead_email` are NOT read as candidates for a lead's address at all,
 * rather than merely being lower priority than `client_email`.
 *
 * Confirmed real shape: `client_email`, `fullName` (a business name — the
 * rows are lead-gen form submissions with no separate person/company split),
 * `phone`, `zip`, `status`, `receivedAt`/`processedAt`, `leadId`. There is no
 * field naming which platform the lead came from, so `source` stays
 * "Unknown" rather than a guess — this needs a real answer from the backend
 * team, not an invented one; see the flagged item this shipped with.
 */

export interface AdsLead {
  /** `leadId` from the real row. Falls back to the email when a row somehow
      has none, so a lead the customer selects on screen can always be found
      again server-side — see `resolveLeadDatabase` in the agent actions. */
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  /** No field for this exists in the confirmed shape — always "Unknown". */
  source: string;
  createdAt: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate.trim();
    if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  }
  return "";
}

/** Same defensive shape-finding `mapLeadActivity` uses: the rows might be the
    bare payload, or nested under `data` or `items`. */
export function mapAdsLeads(payload: unknown): AdsLead[] {
  // Every envelope the backend uses (`data`, `items`, `Items`, `data.Items`,
  // bare), not just the first three — `data.Items` read as no rows at all
  // (audit, 2026-09-29).
  const rows = rowsFrom(payload);
  if (rows.length === 0) return [];

  return rows
    .map((row) => {
      const r = record(row);
      const email = str(r.client_email, r.lead_email);
      return {
        id: str(r.leadId, r.lead_id) || email,
        // `fullName` is a business name in every row seen — there is no
        // separate company field, so `company` stays empty rather than
        // duplicating this into two fields that would always agree.
        name: str(r.fullName, r.full_name, r.name, r.lead_name),
        // `client_email` is the confirmed real field. `email` is deliberately
        // NOT a candidate here — see the file's doc comment for why.
        email,
        phone: str(r.phone, r.phone_number),
        company: str(r.company, r.company_name),
        source: str(r.source, r.platform, r.ad_platform) || "Unknown",
        createdAt: str(r.receivedAt, r.processedAt, r.created_at, r.createdAt, r.timestamp),
      };
    })
    // An unreadable row has no email and nothing to qualify against — a row
    // with a name but no address is not a lead, it is a fragment.
    .filter((lead) => lead.email !== "")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Never throws: offering "use ads leads" must degrade to "none found" rather
 * than take the whole Configure popup down. Empty is also the honest answer
 * for any account with no ad-captured leads yet, which today is most of them.
 */
export const getAdsLeads = cache(async function getAdsLeads(
  email: string | undefined,
): Promise<AdsLead[]> {
  if (!isBackendConfigured()) return [];

  if (!email) {
    console.warn("[ads-leads] no account email on the session, so leadbyte-leads cannot be read");
    return [];
  }

  try {
    const payload = await apiRequest<unknown>(`/api/query/leadbyte-leads/${encodeURIComponent(email)}`);
    return mapAdsLeads(payload);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(`[ads-leads] could not read leadbyte-leads for ${email}:`, error);
    return [];
  }
});

const CSV_HEADER = ["name", "email", "phone", "company", "source", "created_at"];

/** One field, quoted only when it needs to be — a comma, quote or newline
    inside it would otherwise merge into the next column. Formula-looking text
    is neutralised first: these values are typed by strangers into an ad form. */
function csvField(value: string): string {
  const safe = neutralise(value);
  if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

/**
 * Turns fetched ads leads into the same shape a customer's own CSV upload
 * would be, so the Lead Qualification agent's contract needs no change at
 * all: this still goes through `uploadFile` and becomes a `leadDatabaseUrl`,
 * exactly like a file someone picked from their computer.
 */
export function leadsToCsv(leads: AdsLead[]): string {
  const rows = leads.map((lead) =>
    [lead.name, lead.email, lead.phone, lead.company, lead.source, lead.createdAt]
      .map(csvField)
      .join(","),
  );
  return [CSV_HEADER.join(","), ...rows].join("\r\n");
}
