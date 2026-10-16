/**
 * Which AEO audits this browser is currently watching.
 *
 * ## Why this is not `leadbyte_analysis_job`
 *
 * That cookie holds ONE bare job id, because the website analysis is one job.
 * An AEO run can be several — the main domain plus every subdomain the
 * customer kept — and they finish at different times, so the report screen has
 * to know all of them at once.
 *
 * It also holds each job's URL. The service returns one on the job, but a
 * queued job's `url` is the only label the card has before the first poll
 * lands, and a board of three cards all reading "Auditing…" is not a board.
 *
 * ## Two cookies, because they answer different questions
 *
 * `leadbyte_aeo_run` is the run in progress. `leadbyte_aeo_pick` is the
 * shorter-lived one that carries the discovered subdomains from the start call
 * to the selection call — nothing is persisted server-side between those two,
 * by design ("do not start any job yet"), so this is what remembers them.
 *
 * Both are prefixed `leadbyte_`, which is what makes `lib/auth/sign-out.ts`
 * sweep them without being told they exist. That matters here for the same
 * reason it mattered for the analysis job: a run cookie carries no account
 * key, so signing out and in as someone else on one browser would otherwise
 * show the previous account's audit as the new account's own.
 *
 * Cookies are writable only from a Server Action or Route Handler — the
 * setters below must be called from one. The getters are safe anywhere.
 */

import { signValue, verifyValue } from "@/lib/auth/signed-cookie";
import { cookies } from "next/headers";

const RUN_COOKIE = "leadbyte_aeo_run";
const PICK_COOKIE = "leadbyte_aeo_pick";

/**
 * How many sites one run may carry.
 *
 * A cookie caps around 4KB and each entry is a job id plus a URL. Twelve is
 * comfortably inside that with room for a long hostname, and it is also more
 * subdomains than anyone reviews in one sitting. The same reasoning, and the
 * same failure if ignored, as `MAX_ROWS` in `google-callback-payload.ts`:
 * an oversized cookie is not rejected loudly, it is dropped.
 */
export const MAX_SITES = 12;

/** An hour — far longer than any audit, short enough not to outlive interest. */
const RUN_MAX_AGE = 60 * 60;

/**
 * Fifteen minutes for the pick.
 *
 * Long enough to read a list of subdomains and decide, short enough that a
 * tab left open overnight does not later submit a selection against a
 * discovery nobody remembers making.
 */
const PICK_MAX_AGE = 15 * 60;

export interface AeoRunSite {
  id: string;
  url: string;
}

export interface AeoRunFailure {
  url: string;
  error: string;
}

export interface AeoRun {
  startedAt: number;
  sites: AeoRunSite[];
  /**
   * Sites the service declined to start, from the selection call's own
   * `failed` array.
   *
   * Carried here because the report screen is a redirect away from the action
   * that learned about them, and a site that silently does not appear is
   * indistinguishable from one the customer never picked. The service returns
   * 200 with a partial list on purpose; this is the half of that contract we
   * are responsible for showing.
   */
  failed: AeoRunFailure[];
}

export interface AeoPick {
  websiteUrl: string;
  domain: string;
  subdomains: string[];
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Both parsers are exported so the shapes are tested without a request.
 *
 * They return null rather than throwing on anything they do not recognise. A
 * cookie is attacker-supplied in the sense that matters here — it can also be
 * simply stale, written by an older version of this code — and a screen that
 * throws on one is a screen the customer cannot get out of without clearing
 * their browser.
 */
export function parseRun(raw: string | undefined): AeoRun | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const sites = Array.isArray(record.sites) ? record.sites : [];
  const parsed = sites
    .map((site) => {
      const row = (site ?? {}) as Record<string, unknown>;
      return { id: str(row.id), url: str(row.url) };
    })
    .filter((site) => site.id !== "")
    .slice(0, MAX_SITES);
  const failed = (Array.isArray(record.failed) ? record.failed : [])
    .map((row) => {
      const entry = (row ?? {}) as Record<string, unknown>;
      return { url: str(entry.url), error: str(entry.error) };
    })
    .filter((entry) => entry.url !== "")
    .slice(0, MAX_SITES);
  // A run with neither a job nor a failure is nothing to show. One with only
  // failures IS something to show — every site was refused, and saying so is
  // the whole point of carrying them.
  if (parsed.length === 0 && failed.length === 0) return null;
  const startedAt =
    typeof record.startedAt === "number" && Number.isFinite(record.startedAt)
      ? record.startedAt
      : Date.now();
  return { startedAt, sites: parsed, failed };
}

export function parsePick(raw: string | undefined): AeoPick | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const websiteUrl = str(record.websiteUrl);
  if (!websiteUrl) return null;
  const subdomains = (Array.isArray(record.subdomains) ? record.subdomains : [])
    .map(str)
    .filter(Boolean)
    .slice(0, MAX_SITES);
  return { websiteUrl, domain: str(record.domain), subdomains };
}

export async function readAeoRun(): Promise<AeoRun | null> {
  const store = await cookies();
  // Signed (2026-09-25): this cookie is the only record of which audit jobs
  // belong to this account, and an edited one let a visitor view or approve
  // another customer's audit by adding its id.
  return parseRun((await verifyValue(RUN_COOKIE, store.get(RUN_COOKIE)?.value)) ?? undefined);
}

export async function setAeoRun(
  sites: AeoRunSite[],
  failed: AeoRunFailure[] = [],
): Promise<void> {
  const store = await cookies();
  const run: AeoRun = {
    startedAt: Date.now(),
    sites: sites.slice(0, MAX_SITES),
    // Truncated: a Python traceback in `error` would push the cookie past 4KB
    // on its own, and a cookie that overflows is dropped silently rather than
    // rejected — taking the job ids with it.
    failed: failed.slice(0, MAX_SITES).map((f) => ({ url: f.url, error: f.error.slice(0, 200) })),
  };
  store.set(RUN_COOKIE, await signValue(RUN_COOKIE, JSON.stringify(run)), cookieOptions(RUN_MAX_AGE));
}

export async function clearAeoRun(): Promise<void> {
  (await cookies()).delete(RUN_COOKIE);
}

export async function readAeoPick(): Promise<AeoPick | null> {
  const store = await cookies();
  return parsePick((await verifyValue(PICK_COOKIE, store.get(PICK_COOKIE)?.value)) ?? undefined);
}

export async function setAeoPick(pick: AeoPick): Promise<void> {
  const store = await cookies();
  const capped: AeoPick = { ...pick, subdomains: pick.subdomains.slice(0, MAX_SITES) };
  store.set(PICK_COOKIE, await signValue(PICK_COOKIE, JSON.stringify(capped)), cookieOptions(PICK_MAX_AGE));
}

export async function clearAeoPick(): Promise<void> {
  (await cookies()).delete(PICK_COOKIE);
}
