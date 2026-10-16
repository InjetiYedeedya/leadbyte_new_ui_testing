import { isRedirectError } from "@/lib/auth/session-expired";
import { apiPost } from "@/lib/api/client";
import {
  promptRequest,
  readPromptJob,
  readPrompts,
  type PromptChoice,
  type PromptJob,
  type PromptRequest,
} from "@/lib/data/creative-prompts";

/**
 * The transport for the creative prompt pipeline. Server-only.
 *
 * Never throws: a customer partway through configuring a campaign must not lose
 * the form because a creative suggestion could not be written. Every failure
 * returns null or an empty list, and the caller offers to carry on without a
 * chosen prompt — which is the state every campaign has launched in until now.
 */

export async function startPromptGeneration(input: PromptRequest): Promise<PromptJob | null> {
  try {
    const payload = await apiPost<unknown>(
      "/api/creative/generate-prompts",
      promptRequest(input),
    );
    const job = readPromptJob(payload);
    if (job === null) {
      console.warn("[creative] generate-prompts gave no usable job:", payload);
    }
    return job;
  } catch (error) {
    // A dead session leaves as a redirect to sign in, not as this call's
    // own failure (audit, 2026-09-29).
    if (isRedirectError(error)) throw error;
    console.error("[creative] could not start prompt generation:", error);
    return null;
  }
}

/**
 * One poll. Returns `ready: false` for a failure as well as for "still
 * writing" — the caller keeps polling, and a dropped request is not an answer.
 */
export async function fetchPrompts(
  jobId: string,
  token: string,
): Promise<{ ready: boolean; prompts: PromptChoice[] }> {
  try {
    const payload = await apiPost<unknown>("/api/creative/get-prompts", {
      job_id: jobId,
      token,
    });
    return readPrompts(payload);
  } catch (error) {
    // A dead session leaves as a redirect to sign in, not as this call's
    // own failure (audit, 2026-09-29).
    if (isRedirectError(error)) throw error;
    console.error(`[creative] could not read prompts for ${jobId}:`, error);
    return { ready: false, prompts: [] };
  }
}

/**
 * Records the pick.
 *
 * The pipeline is told which prompt was chosen so its own record matches what
 * we then send on the launch body. A failure here is reported: launching with a
 * prompt the pipeline does not know it produced is worse than asking again.
 */
export async function selectPrompt(
  jobId: string,
  token: string,
  chosen: number,
): Promise<boolean> {
  try {
    const payload = await apiPost<{ status?: string; chosen?: number }>(
      "/api/creative/select-prompt",
      { job_id: jobId, token, chosen },
    );
    return payload?.status === "accepted" || payload?.chosen === chosen;
  } catch (error) {
    // A dead session leaves as a redirect to sign in, not as this call's
    // own failure (audit, 2026-09-29).
    if (isRedirectError(error)) throw error;
    console.error(`[creative] could not record the pick for ${jobId}:`, error);
    return false;
  }
}
