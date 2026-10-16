import { cookies } from "next/headers";

/**
 * The Lead Qualification campaign that is currently running, and its state.
 *
 * ## Why a cookie
 *
 * The control routes address a campaign by the MAIL SERVICE's own `job_id`,
 * which arrives once, in the run's reply (`campaign-reply.ts`). It has to
 * outlive the request that brought it — the same reasoning as the analysis
 * job cookie. (It used to hold an id we generated ourselves, which the mail
 * service never stored, so every pause and cancel answered "no job".) The
 * live list (`listLiveCampaigns`) supersedes it once that route is deployed;
 * until then this is the fallback.
 *
 * httpOnly, `leadbyte_`-prefixed so signing out sweeps it: a campaign id is
 * account state, and the next person on this browser must not inherit the
 * ability to cancel someone else's outreach.
 *
 * Value is `jobId|startedAt|state`, so a paused campaign still reads as paused
 * after a reload.
 */

const JOB_COOKIE = "leadbyte_lq_job";
/** Long enough for an outreach run, short enough not to linger for months. */
const MAX_AGE = 60 * 60 * 24 * 30;

export type CampaignState = "running" | "paused";

export interface CampaignRecord {
  jobId: string;
  startedAt: number;
  state: CampaignState;
}

const OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
} as const;

/** Parses the cookie. Exported for its own test — no `cookies()` needed. */
export function parseCampaignCookie(raw: string | undefined): CampaignRecord | null {
  if (raw === undefined || raw.trim() === "") return null;

  const [jobId, stamp, state] = raw.split("|");
  if (jobId === undefined || jobId.trim() === "") return null;

  const startedAt = Number(stamp);
  return {
    jobId,
    // A cookie from before the timestamp existed reads as just-started, which
    // only affects how long ago the screen says the run began.
    startedAt: Number.isFinite(startedAt) && startedAt > 0 ? startedAt : Date.now(),
    state: state === "paused" ? "paused" : "running",
  };
}

export function serialiseCampaign(record: CampaignRecord): string {
  return `${record.jobId}|${record.startedAt}|${record.state}`;
}

export async function currentCampaign(): Promise<CampaignRecord | null> {
  const store = await cookies();
  return parseCampaignCookie(store.get(JOB_COOKIE)?.value);
}

/** Remembers a campaign that has just been started. */
export async function setCampaign(jobId: string): Promise<void> {
  const store = await cookies();
  store.set(
    JOB_COOKIE,
    serialiseCampaign({ jobId, startedAt: Date.now(), state: "running" }),
    OPTIONS,
  );
}

/** Records a pause or a resume, keeping the id and the start time. */
export async function setCampaignState(state: CampaignState): Promise<void> {
  const current = await currentCampaign();
  if (current === null) return;

  const store = await cookies();
  store.set(JOB_COOKIE, serialiseCampaign({ ...current, state }), OPTIONS);
}

/** After a cancel: there is no campaign to control any more. */
export async function clearCampaign(): Promise<void> {
  const store = await cookies();
  store.delete(JOB_COOKIE);
}
