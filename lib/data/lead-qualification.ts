import { cache } from "react";
import { rowsFrom } from "@/lib/api/read-cascade";
import { apiRequest } from "@/lib/api/client";
import { isBackendConfigured } from "@/lib/api/config";
import { agentEnvelope } from "@/lib/data/agent-payload";
import { absoluteUrl } from "@/lib/data/profile-display";
import { isRedirectError } from "@/lib/auth/session-expired";

/**
 * The Lead Qualification agent: its run payload, and its activity.
 *
 * ## Running it (AGENTS-INTEGRATION.md, 2026-09-03)
 *
 *   POST /api/webhook/main   agent_type: LEAD_QUALIFICATION
 *
 * Unlike the ad agents there is no chat hop and no `campaign_data` — this
 * payload is flat, and its field names are the backend's own mix of snake_case
 * (`lead_database_url`) and camelCase (`companyName`). They are copied exactly;
 * making them consistent would break them.
 *
 * ## Reading what it did
 *
 *   GET /api/query/leadbyte_lead_activity/{account_email}
 *
 * Keyed on `user_email` (HASH) + `lead_email` (RANGE) — the ACCOUNT's email,
 * like every other read in this app.
 *
 * It used to go through `/api/query-by-uid/…/{firebase_uid}`, on the
 * understanding that the table had a `user_id-index` GSI. It does not. That
 * route answers `Could not resolve userId to email` — the backend's uid-to-email
 * map has no row for the uid we hold — so this screen showed "no activity yet"
 * for every account, which is indistinguishable from an agent that had never
 * run. Confirmed with the backend team (2026-09-16) and measured: the email
 * query returns 123 rows for the account the uid route returned none for.
 */

export interface LeadQualificationRun {
  jobId: string;
  email: string;
  userId?: string;
  emailTemplate: string;
  leadDatabaseUrl: string;
  attachedDocument: string;
  companyName: string;
  websiteUrl: string;
  businessType: string;
  specialization: string;
  /** `profile.brand.logo`, which the captured body carries as `brandLogoUrl`. */
  brandLogoUrl?: string;
  /** How many times a leads file has been uploaded. The live body showed 4. */
  leadsVersion?: number;
  isUpdate?: boolean;
  createdAt?: string;
}

/**
 * The run payload, field for field against the live body captured 2026-08-27.
 *
 * Three things about it that look like mistakes and are the contract:
 *
 * - **Every URL goes out under several names.** The leads file is
 *   `lead_database_url` AND `leadDatabaseUrl`; the document is `companyDocUrl`,
 *   `attachedDocumentUrl` AND `attached_document`; the template is
 *   `email_template` AND `emailTemplate`. See `agent-payload.ts`.
 * - **`outreachEmail` and `outreachPassword` are sent empty**, as the captured
 *   body does: the agent sends through its own transport, and this app has
 *   never asked a customer for an email password — a credential we should not
 *   be holding.
 * - **`serviceVersion` is 0.** The live body carried 0 with `leadsVersion: 4`;
 *   nothing in this app writes a service version, so it stays 0 rather than
 *   being invented.
 *
 * `emailTemplateMode` is `custom` when the customer typed the template and
 * `business` when they did not — CONFIRMED against the Lambda source
 * (2026-09-07), which recognises four values: `business`, `custom`,
 * `instructions` and `document`. `custom` is handled directly: it returns the
 * customer's own template, cleaned. It is not ignored.
 *
 * Two corrections to earlier guesses in this file, both worth keeping written
 * down:
 *
 * - `custom` was first sent on a guess, then removed on a second guess that
 *   the enumeration was only the three GENERATOR modes. The second guess was
 *   the wrong one: sending `business` beside a template the customer wrote by
 *   hand tells the backend to write its own instead.
 * - An unknown mode does NOT fall back to the business default. The endpoint
 *   answers `400 "Unknown template mode"`, so a bad value fails loudly rather
 *   than quietly swapping someone's email for a generated one. That is the
 *   safer failure, and it means this field is worth getting exactly right.
 */
export function leadQualificationPayload(run: LeadQualificationRun): Record<string, unknown> {
  const hasTemplate = run.emailTemplate.trim() !== "";

  return {
    ...agentEnvelope({
      jobId: run.jobId,
      email: run.email,
      userId: run.userId,
      agentName: "Lead Qualification Agent",
      agentType: "LEAD_QUALIFICATION",
      agentSlug: "lead-qualification",
      isUpdate: run.isUpdate,
      createdAt: run.createdAt,
    }),
    companyName: run.companyName,
    // With its scheme — see `onPageSeoPayload`; same webhook, same refusal.
    websiteUrl: absoluteUrl(run.websiteUrl),
    businessType: run.businessType,
    specialization: run.specialization,
    brandLogoUrl: run.brandLogoUrl ?? "",
    reportEmail: run.email,

    outreachEmail: "",
    outreachPassword: "",

    email_template: run.emailTemplate,
    emailTemplate: run.emailTemplate,
    emailTemplateMode: hasTemplate ? "custom" : "business",
    emailTemplateSourceUrl: "",

    lead_database_url: run.leadDatabaseUrl,
    leadDatabaseUrl: run.leadDatabaseUrl,
    hasLeadDetails: run.leadDatabaseUrl.trim() !== "",
    leadsVersion: run.leadsVersion ?? 1,
    serviceVersion: 0,

    attached_document: run.attachedDocument,
    attachedDocumentUrl: run.attachedDocument,
    companyDocUrl: run.attachedDocument,
  };
}

/** One row of the per-lead outreach activity. */
export interface LeadActivity {
  /** The lead's address alone — see `rowId` for the record's own key. */
  leadEmail: string;
  /**
   * The row's raw key. The table keys a row as `email#<uuid>` (one row per
   * lead per run), which was printed as the lead's address on the live site
   * ("harish@ntimes.ai#d8433b99-…", 2026-09-29). Unique, so it is the row key.
   */
  rowId: string;
  status: string;
  template: string;
  opens: number;
  clicks: number;
  failed: boolean;
  /** A mail actually went out to this lead — `last_sent_at` carries a time. */
  sent: boolean;
  /** The lead wrote back. */
  replied: boolean;
  updatedAt: string;
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

/**
 * Does this field actually say yes?
 *
 * NOT `str(...) !== ""`: that helper renders the number 0 as "0", so a row
 * carrying `replied_to_seq: 0` — which is every row that has NOT replied —
 * counted as a reply and turned 1 response into 123. Zero, false, null and
 * the empty string all mean "no" here.
 */
function present(...candidates: unknown[]): boolean {
  return candidates.some((value) => {
    if (value === null || value === undefined || value === false) return false;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") return value.trim() !== "" && value.trim() !== "0";
    return true;
  });
}

function num(...candidates: unknown[]): number {
  for (const candidate of candidates) {
    const parsed = typeof candidate === "number" ? candidate : Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/**
 * Reads the activity rows.
 *
 * Field spellings are unconfirmed — the guide names the table and its key but
 * not its columns — so every one is read defensively and an unreadable row
 * yields an empty string rather than `undefined` on screen.
 */
export function mapLeadActivity(payload: unknown): LeadActivity[] {
  // Every envelope the backend uses (`data`, `items`, `Items`, `data.Items`,
  // bare), not just the first three — `data.Items` read as no rows at all
  // (audit, 2026-09-29).
  const rows = rowsFrom(payload);
  if (rows.length === 0) return [];

  return rows
    .map((row) => {
      const r = record(row);
      return {
        leadEmail: str(r.lead_email, r.leadEmail, r.email).split("#")[0]!.trim(),
        rowId: `${str(r.lead_email, r.leadEmail, r.email)}|${str(r.updated_at, r.updatedAt, r.timestamp)}`,
        status: str(r.status, r.Status, r.stage) || "—",
        template: str(r.template, r.email_template),
        opens: num(r.machine_opens, r.opens, r.open_count),
        clicks: num(r.clicks, r.additional_clicks),
        // A failure is a fact about the send, so a missing field means "no",
        // not "unknown" — the dashboard would otherwise flag every row.
        failed:
          r.failed_mail === true ||
          str(r.failed_mail).toLowerCase() === "true" ||
          Number(r.failed_mail) > 0,
        // Measured, not assumed: on a live account 123 of 124 rows carry
        // `last_sent_at` and `send_mail`, and the one that does not is the lead
        // the agent never got to. A row existing is not a mail being sent.
        sent: present(r.last_sent_at, r.send_mail),
        replied: present(r.lead_reply, r.response, r.replied_to_seq),
        updatedAt: str(r.updated_at, r.updatedAt, r.timestamp),
      };
    })
    .filter((activity) => activity.leadEmail !== "")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * The agent's real activity, for the dashboard.
 *
 * Never throws: a dashboard that cannot reach the backend shows its empty
 * state, not a 500. Returns nothing without a uid, because the GSI this queries
 * is keyed on one — and says so in the log rather than looking like "no
 * activity yet".
 */
export const getLeadActivity = cache(async function getLeadActivity(
  email: string | undefined,
): Promise<LeadActivity[]> {
  if (!isBackendConfigured()) return [];

  if (!email) {
    console.warn(
      "[lead-qualification] no account email on the session, so the activity table cannot be read",
    );
    return [];
  }

  try {
    const payload = await apiRequest<unknown>(
      `/api/query/leadbyte_lead_activity/${encodeURIComponent(email)}`,
    );
    return mapLeadActivity(payload);
  } catch (error) {
    // A dead session leaves as a redirect, not as this call's own
    // failure — see isRedirectError in session-expired.ts.
    if (isRedirectError(error)) throw error;
    console.error(`[lead-qualification] could not read activity for ${email}:`, error);
    return [];
  }
});
