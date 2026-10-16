import { cookies } from "next/headers";

/**
 * "This browser launched a campaign for this agent", for when the backend
 * record of it could not be written.
 *
 * `launchCampaign` writes a `status: "submitted"` row after every launch, and
 * that row is what keeps the setup form from coming back (`agentLaunched`).
 * The write happens past the point of no return — the campaign is already
 * being built — so a failure there cannot be reported as a failed launch
 * (CLAUDE.md rule 4). Before this marker it was only logged, the setup form
 * returned on the next page, and the customer was invited to launch the same
 * paid campaign again (META_ADS_AGENT_SPEC §15.4).
 *
 * A cookie, not process memory: Cloudflare does not keep one instance per
 * customer, and a marker that lives in one instance protects nobody. It is a
 * stop-gap for a day — long enough for the next launch-free visit to read the
 * real row once the backend is answering again — and the `leadbyte_` prefix
 * means signing out clears it with everything else.
 */

const MAX_AGE = 60 * 60 * 24;

function cookieName(agentId: string): string {
  return `leadbyte_launched_${agentId.replace(/[^a-z0-9-]/gi, "")}`;
}

/** Call from a Server Action only — cookies are not writable during a render. */
export async function markLaunched(agentId: string, at: string = new Date().toISOString()): Promise<void> {
  (await cookies()).set(cookieName(agentId), at, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** When this browser last launched the agent unrecorded, or null. Safe anywhere. */
export async function launchMarkedAt(agentId: string): Promise<string | null> {
  const value = (await cookies()).get(cookieName(agentId))?.value;
  return value && !Number.isNaN(Date.parse(value)) ? value : null;
}
