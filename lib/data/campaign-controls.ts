/**
 * Pausing, resuming and cancelling a Lead Qualification outreach run.
 *
 * ## The contract (FRONTEND_BACKEND_API_CALLS.md §8)
 *
 *   POST /api/campaigns/{job_id}/pause | /resume | /cancel   { tenant_id }
 *   POST /api/campaigns/{job_id}/recipients/cancel           { tenant_id, emails, lead_ids }
 *   POST /api/campaigns/cancel-active                        { tenant_id }
 *   GET  /api/campaigns?tenant_id=<uid>&live=true
 *
 * `tenant_id` is the FIREBASE UID, not the email — the same key the lead
 * activity table is indexed on. Without it the backend cannot find the job.
 *
 * ## Why this module is pure
 *
 * The id shape and the reply parsing are the two things worth testing, and
 * neither needs a network. The transport lives in `campaign-controls-api.ts`
 * so this file stays importable from a client component.
 *
 * ## Why the failure detail is never shown
 *
 * A failed control answers with `detail` as a JSON STRING containing the
 * tenant id and an internal remediation note:
 *
 *   {"error": "no job 'job_1' for tenant 'uid_1'", "remediation": "..."}
 *
 * That is a diagnostic, not a sentence. It is logged and translated; the
 * customer is told the run is no longer running, which is the fact they need.
 */

export type CampaignAction = "pause" | "resume" | "cancel";

export interface ControlResult {
  ok: boolean;
  message: string;
}

const VERB: Record<CampaignAction, string> = {
  pause: "pause",
  resume: "resume",
  cancel: "cancel",
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Does this failure detail mean "the backend has never heard of this job"? */
function isUnknownJob(detail: string): boolean {
  return /no job|not found|unknown job/i.test(detail);
}

/**
 * Reads a control reply.
 *
 * `success` must be explicitly true. An unreadable body is a failure, not a
 * confirmation: telling someone their campaign is paused when we do not know
 * is the one wrong answer they cannot recover from — they stop watching.
 */
export function readControlResult(action: CampaignAction, payload: unknown): ControlResult {
  const body = record(payload);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const detail = typeof body?.detail === "string" ? body.detail : "";

  if (body?.success === true) {
    return { ok: true, message: message || `Campaign ${VERB[action]} ok.` };
  }

  if (isUnknownJob(detail)) {
    return {
      ok: false,
      message: `That campaign is no longer running, so there is nothing to ${VERB[action]}.`,
    };
  }

  // A message the backend wrote for a human is better than one we invent — but
  // only when it is not just the generic "Campaign x failed." stub beside an
  // unreadable detail.
  if (message !== "" && !/failed\.?$/i.test(message)) {
    return { ok: false, message };
  }

  return {
    ok: false,
    message: `We couldn't ${VERB[action]} this campaign. Please try again in a moment.`,
  };
}

/**
 * One campaign the mail service is still sending.
 *
 * A count it did not send is null, never 0 — "0 sent" on a campaign whose
 * progress we simply do not know reads as a campaign that is stuck.
 */
export interface LiveCampaign {
  jobId: string;
  name: string | null;
  status: string;
  total: number | null;
  sent: number | null;
  pending: number | null;
  failed: number | null;
  createdAt: string | null;
}

function count(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** One job record, or null when it carries no id to act on. */
export function mapLiveCampaign(value: unknown): LiveCampaign | null {
  const row = record(value);
  const jobId = text(row?.job_id) ?? text(row?.jobId);
  if (row === null || jobId === null) return null;
  return {
    jobId,
    name: text(row.name),
    status: text(row.status)?.toLowerCase() ?? "running",
    total: count(row.total),
    sent: count(row.sent),
    pending: count(row.pending),
    failed: count(row.failed),
    createdAt: text(row.created_at) ?? text(row.createdAt),
  };
}

/**
 * The live list: `{ count, jobs: [...] }`.
 *
 * A row with no `job_id` is dropped — a campaign with no id cannot be paused
 * or cancelled, and a row whose buttons cannot work is worse than no row.
 */
export function mapLiveCampaigns(payload: unknown): LiveCampaign[] {
  const body = record(payload);
  const jobs = Array.isArray(payload) ? payload : body?.jobs ?? record(body?.data)?.jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.map(mapLiveCampaign).filter((job): job is LiveCampaign => job !== null);
}

/**
 * Reads `cancel-active`: `{ cancelled: [...], cancelled_count, nothing_to_cancel }`.
 *
 * `nothing_to_cancel: true` is a success — the campaign had already finished,
 * which is what the customer wanted when they pressed Stop.
 */
export function readCancelActiveResult(payload: unknown): ControlResult {
  const body = record(payload);
  if (body?.nothing_to_cancel === true) {
    return { ok: true, message: "Nothing was still sending — your campaigns had already finished." };
  }
  const cancelled =
    count(body?.cancelled_count) ?? (Array.isArray(body?.cancelled) ? body.cancelled.length : null);
  if (cancelled !== null && body?.success !== false) {
    return {
      ok: true,
      message:
        cancelled === 1 ? "Stopped 1 campaign." : `Stopped ${cancelled} campaigns.`,
    };
  }
  return { ok: false, message: "We couldn't stop your campaigns. Please try again in a moment." };
}
