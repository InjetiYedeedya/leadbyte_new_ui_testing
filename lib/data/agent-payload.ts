/**
 * The envelope every agent run payload carries.
 *
 * Client-safe: field assembly only, no transport.
 *
 * ## Why the same fact goes out under several names
 *
 * Taken from three live n8n request bodies (Lead Qualification 2026-08-27,
 * On-Page and Off-Page SEO 2026-09-04). Each one sends the account email as
 * BOTH `email_address` and `email`, the Firebase uid as BOTH `user_id` and
 * `userId`, and the agent discriminator as BOTH `agent_type`
 * (SCREAMING_SNAKE) and `agentType` (lower-kebab). The workflow's branches
 * read whichever key is in front of them rather than a single canonical one —
 * the same thing the ad payloads do (see `ads-chat-payload`), and the reason
 * sending only the tidiest spelling leaves some branch with nothing.
 *
 * `configured` and `status` are echoes of the stored setup row: the captured
 * bodies carry them on every run, and the workflow treats a body without them
 * as an unconfigured agent.
 */

export interface AgentEnvelopeInput {
  jobId: string;
  /** The account email. Goes out as `email_address` AND `email`. */
  email: string;
  /** The Firebase uid. Omitted entirely when unknown — never sent blank. */
  userId?: string;
  /** Exactly as the captured bodies spell it: "On Page SEO Agent", no hyphen. */
  agentName: string;
  /** SCREAMING_SNAKE: `LEAD_QUALIFICATION`. */
  agentType: string;
  /** lower-kebab: `on-page-seo`. */
  agentSlug: string;
  /** True when this account has configured this agent before. */
  isUpdate?: boolean;
  /** The stored row's creation time, when we know it. */
  createdAt?: string;
}

/**
 * A job id in the backend's own shape: `job_<epoch ms>_<random>`.
 *
 * Captured live as `job_1788534027056_6c9u4pt7e`. `randomUUID()` produces a
 * different shape entirely, and two things read this key: the campaign control
 * routes look a Lead Qualification job up by it, and the n8n workflows log and
 * correlate on it. An id in the wrong shape is not obviously broken — it just
 * cannot be found later.
 */
export function agentJobId(now: number = Date.now()): string {
  const suffix = Math.random().toString(36).slice(2, 11).padEnd(9, "0");
  return `job_${now}_${suffix}`;
}

export function agentEnvelope(input: AgentEnvelopeInput): Record<string, unknown> {
  const now = new Date().toISOString();
  const isUpdate = input.isUpdate === true;

  const envelope: Record<string, unknown> = {
    job_id: input.jobId,
    email_address: input.email,
    agent_name: input.agentName,
    agent_type: input.agentType,
    agentType: input.agentSlug,
    timestamp: now,
    email: input.email,
    configured: true,
    status: "active",
    // A first configure has no earlier row to date, so creation and update are
    // the same moment. We do not invent an older one.
    created_at: isUpdate ? (input.createdAt ?? now) : now,
    updated_at: now,
    isUpdate,
  };

  // Both spellings, or neither. The lead activity table is keyed on the uid,
  // so a blank one writes rows the dashboard can never find again.
  if (input.userId) {
    envelope.user_id = input.userId;
    envelope.userId = input.userId;
  }

  return envelope;
}
