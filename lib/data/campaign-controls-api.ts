import { isRedirectError } from "@/lib/auth/session-expired";
import { ApiError, apiGet, apiPost } from "@/lib/api/client";
import {
  mapLiveCampaigns,
  readCancelActiveResult,
  readControlResult,
  type CampaignAction,
  type ControlResult,
  type LiveCampaign,
} from "@/lib/data/campaign-controls";

/**
 * The transport for the campaign control routes. Server-only: `apiPost` reads
 * httpOnly cookies.
 *
 *   POST /api/campaigns/{job_id}/{pause|resume|cancel}   { tenant_id }
 *   POST /api/campaigns/{job_id}/recipients/cancel       { tenant_id, emails, lead_ids }
 *   GET  /api/campaigns?tenant_id=<uid>&live=true
 *   POST /api/campaigns/cancel-active                    { tenant_id }
 *
 * Never throws. A control that cannot be reached must report that it did not
 * happen — an exception bubbling into the page would tell the customer nothing
 * about whether their outreach is still sending.
 */

export async function controlCampaign(
  action: CampaignAction,
  jobId: string,
  tenantId: string,
): Promise<ControlResult> {
  try {
    const payload = await apiPost<unknown>(
      `/api/campaigns/${encodeURIComponent(jobId)}/${action}`,
      // The FIREBASE UID, not the email. The email finds nothing here.
      { tenant_id: tenantId },
    );
    const result = readControlResult(action, payload);
    if (!result.ok) {
      console.warn(`[campaigns] ${action} of ${jobId} was refused:`, payload);
    }
    return result;
  } catch (error) {
    // A dead session leaves as a redirect to sign in, not as this call's
    // own failure (audit, 2026-09-29).
    if (isRedirectError(error)) throw error;
    console.error(`[campaigns] could not ${action} ${jobId}:`, error);
    return {
      ok: false,
      message: `We couldn't reach the campaign service to ${action} this run. Please try again.`,
    };
  }
}

/**
 * Stops sending to specific people, leaving the rest of the run going.
 *
 * Both `emails` and `lead_ids` are sent, as the documented body does — the
 * backend matches on either, and a recipient known only by one of them would
 * otherwise keep receiving mail.
 */
export async function cancelRecipients(
  jobId: string,
  tenantId: string,
  recipients: { emails: string[]; leadIds?: string[] },
): Promise<ControlResult> {
  if (recipients.emails.length === 0 && (recipients.leadIds ?? []).length === 0) {
    return { ok: false, message: "Choose at least one recipient to stop." };
  }

  try {
    const payload = await apiPost<unknown>(
      `/api/campaigns/${encodeURIComponent(jobId)}/recipients/cancel`,
      {
        tenant_id: tenantId,
        emails: recipients.emails,
        lead_ids: recipients.leadIds ?? [],
      },
    );
    const result = readControlResult("cancel", payload);
    return result.ok
      ? {
          ok: true,
          message:
            recipients.emails.length === 1
              ? `Stopped sending to ${recipients.emails[0]}.`
              : `Stopped sending to ${recipients.emails.length} recipients.`,
        }
      : result;
  } catch (error) {
    // A dead session leaves as a redirect to sign in, not as this call's
    // own failure (audit, 2026-09-29).
    if (isRedirectError(error)) throw error;
    console.error(`[campaigns] could not stop recipients on ${jobId}:`, error);
    return {
      ok: false,
      message: "We couldn't reach the campaign service. Please try again.",
    };
  }
}

/**
 * The account's campaigns still sending.
 *
 * `unavailable` is a 404: the leadbyte-api pass-through for this route was
 * requested on 2026-10-14 and may not be deployed yet. The screen falls back
 * to the single campaign it remembers rather than claiming nothing is running.
 */
export type LiveCampaignsRead =
  | { status: "ok"; jobs: LiveCampaign[] }
  | { status: "unavailable" }
  | { status: "failed" };

export async function listLiveCampaigns(tenantId: string): Promise<LiveCampaignsRead> {
  try {
    const payload = await apiGet<unknown>(
      `/api/campaigns?tenant_id=${encodeURIComponent(tenantId)}&live=true`,
    );
    return { status: "ok", jobs: mapLiveCampaigns(payload) };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof ApiError && error.status === 404) return { status: "unavailable" };
    console.error("[campaigns] could not list live campaigns:", error);
    return { status: "failed" };
  }
}

/**
 * Stops every campaign the account has running — the tenant-wide Stop, which
 * needs no job id at all. `unavailable` again means the route is not deployed.
 */
export async function cancelActiveCampaigns(
  tenantId: string,
): Promise<ControlResult & { unavailable?: boolean }> {
  try {
    const payload = await apiPost<unknown>("/api/campaigns/cancel-active", { tenant_id: tenantId });
    const result = readCancelActiveResult(payload);
    if (!result.ok) console.warn("[campaigns] cancel-active was refused:", payload);
    return result;
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof ApiError && error.status === 404) {
      return { ok: false, unavailable: true, message: "Stopping every campaign at once isn't available yet." };
    }
    console.error("[campaigns] could not cancel active campaigns:", error);
    return { ok: false, message: "We couldn't reach the campaign service. Please try again." };
  }
}
