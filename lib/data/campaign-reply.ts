import { mapLiveCampaign, type LiveCampaign } from "@/lib/data/campaign-controls";

/**
 * What a Lead Qualification run's reply tells us about the campaign it made.
 *
 * ## Why the id comes from here and nowhere else
 *
 * The mail service creates the campaign and names it with its OWN `job_id`,
 * which n8n hands back as `[{ job_id, status, total, sent, ... }]` — the legacy
 * app read it the same way (`extractCampaignJobId`). The id we put in the
 * request envelope is a tracking id the mail service never stored, so
 * pause / resume / cancel against it always answered "no job". When the reply
 * carries no id this returns null rather than falling back to ours: no handle
 * is honest, a dead one is not.
 *
 * `warnings` rides on every send reply (a truncated lead list, say) and is
 * shown to the customer as it arrives.
 */
export interface CampaignReply {
  jobId: string | null;
  job: LiveCampaign | null;
  warnings: string[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The first object in an array, `{ data }` or a bare object. */
function nodeOf(reply: unknown): Record<string, unknown> | null {
  const first = Array.isArray(reply) ? reply[0] : reply;
  const body = record(first);
  const data = body?.data;
  if (body !== null && body.job_id === undefined && body.jobId === undefined && data !== undefined) {
    return record(Array.isArray(data) ? data[0] : data) ?? body;
  }
  return body;
}

function warningsOf(...nodes: (Record<string, unknown> | null)[]): string[] {
  const seen = new Set<string>();
  for (const node of nodes) {
    const list = node?.warnings;
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const line =
        typeof item === "string" ? item : typeof record(item)?.message === "string" ? String(record(item)?.message) : "";
      if (line.trim() !== "") seen.add(line.trim());
    }
  }
  return [...seen];
}

export function readCampaignReply(reply: unknown): CampaignReply {
  const node = nodeOf(reply);
  const job = mapLiveCampaign(node);
  const outer = record(Array.isArray(reply) ? reply[0] : reply);
  return {
    jobId: job?.jobId ?? null,
    job,
    warnings: warningsOf(outer, node === outer ? null : node),
  };
}
