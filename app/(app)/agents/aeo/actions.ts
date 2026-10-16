"use server";

/**
 * The AEO agent's own actions.
 *
 * A file of its own rather than more branches in `[agentId]/actions.ts`, for
 * the reason `openai-ads/actions.ts` gives about itself: none of this is the
 * n8n agent flow. There is no chat webhook, no suggestion cookie and no
 * receiver — it is a different service with a different contract, and keeping
 * them apart means a change to one cannot quietly alter the other.
 *
 * ## Nothing here is inside a try that also covers the redirect
 *
 * `redirect()` works by throwing `NEXT_REDIRECT`. A catch around it reports a
 * successful action as a failure — the bug that made a working login say
 * "something went wrong signing you in", twice. So every handler below does
 * its work in a `try`, decides a destination, and redirects after the block.
 */

import { NOT_PUBLIC_WEBSITE, isPublicWebsite } from "@/lib/url-safety";
import { beginAction, guardMessage } from "@/lib/data/action-guard";
import { redirect } from "next/navigation";
import { currentBusinessId } from "@/components/page-shell";
import { AeoApiError, aeoUserMessage } from "@/lib/api/aeo-client";
import {
  type AeoJobView,
  approveAeoFixes,
  readAeoJob,
  startAeoAudit,
  startAeoSelection,
  toJobView,
} from "@/lib/data/aeo-audit";
import {
  clearAeoPick,
  clearAeoRun,
  readAeoPick,
  readAeoRun,
  setAeoPick,
  setAeoRun,
} from "@/lib/data/aeo-run";
import { approvableIds } from "@/lib/data/aeo-report";
import { checkAgentRun } from "@/lib/data/agent-run-check";
import { getSession } from "@/lib/auth/session";
import { signText } from "@/lib/signed-text";

/**
 * Query parameters for a redirect, with the on-screen messages (`problem`,
 * `approveProblem`) signed so only our code can write them — the pages read
 * them through `readSignedText` (audit, 2026-09-29).
 */
function signedParams(params: Record<string, string>): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    out.set(key, key === "problem" || key === "approveProblem" ? signText(value) : value);
  }
  return out;
}


/**
 * AEO is sold like every other agent (added to Pricing 2026-09-25), so an
 * audit starts only for an account that bought it or was granted it. The
 * refusal is a message on the form, like every other problem there.
 */
async function aeoGateProblem(): Promise<string | null> {
  const email = (await getSession())?.businessId ?? (await currentBusinessId());
  const gate = await checkAgentRun("aeo", email, "the AEO agent");
  return gate.ok ? null : gate.message;
}

const FORM_PATH = "/agents/aeo/audit";
const REPORT_PATH = "/agents/aeo/report";

/**
 * How a failure travels back to the form.
 *
 * `kind` as well as the message, because one kind gets its own panel rather
 * than a line of red text: "the audit service isn't available yet" is a
 * statement about us, not about anything the customer typed, and offering
 * them a Try again for it would be a lie.
 */
function problemUrl(error: unknown, url: string): string {
  const kind = error instanceof AeoApiError ? error.kind : "server";
  const params = signedParams({
    kind,
    problem: aeoUserMessage(error),
  });
  if (url) params.set("url", url);
  return `${FORM_PATH}?${params.toString()}`;
}

/** Whatever the customer typed, tidied but never rewritten. */
function cleanUrl(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Step one: ask for an audit, or for the list of subdomains first.
 *
 * With `subdomain` unticked this starts a job and goes straight to the board.
 * With it ticked the service may answer with a list instead, and **nothing has
 * started** in that case — the list goes into a short-lived cookie and the
 * form reopens with the picker. Reading `needs_selection` rather than the
 * length of `subdomains` is what keeps "none found" behaving exactly like
 * "never asked", which is the contract.
 */
export async function startAeoAuditAction(formData: FormData): Promise<void> {
  const websiteUrl = cleanUrl(formData.get("websiteUrl"));
  const subdomain = formData.get("subdomain") === "on";

  if (!websiteUrl) {
    redirect(`${FORM_PATH}?${signedParams({ problem: "Enter a website address to audit." })}`);
  }
  if (!isPublicWebsite(websiteUrl)) {
    redirect(`${FORM_PATH}?${signedParams({ problem: NOT_PUBLIC_WEBSITE })}`);
  }

  const locked = await aeoGateProblem();
  if (locked) redirect(`${FORM_PATH}?${signedParams({ problem: locked })}`);

  // Each submit started a new paid audit; one per account per 30 seconds.
  const guard = beginAction(await currentBusinessId(), "aeo-audit", { staleAfterMs: 30_000, minIntervalMs: 30_000 });
  if (!guard.ok) {
    redirect(`${FORM_PATH}?${signedParams({ problem: guardMessage(guard.reason) })}`);
  }

  let destination: string;
  try {
    const userId = await currentBusinessId();
    const started = await startAeoAudit(websiteUrl, { subdomain, userId });

    if (started.kind === "needs-selection") {
      await setAeoPick({
        websiteUrl,
        domain: started.domain,
        subdomains: started.subdomains,
      });
      destination = `${FORM_PATH}?pick=1`;
    } else {
      await clearAeoPick();
      await setAeoRun([{ id: started.job.id, url: started.job.url || websiteUrl }]);
      destination = REPORT_PATH;
    }
  } catch (error) {
    console.error("[aeo] start failed", error);
    destination = problemUrl(error, websiteUrl);
  }

  redirect(destination);
}

/**
 * Step two: start one audit per site the customer kept.
 *
 * An empty selection is a real answer — "just the main site" — so it is not
 * validated away. The service audits the main domain unconditionally, which is
 * why it never appears among the choices.
 */
export async function confirmAeoSelectionAction(formData: FormData): Promise<void> {
  const raw = formData.get("selected");
  const selected =
    typeof raw === "string"
      ? raw
          .split(",")
          .map((host) => host.trim())
          .filter(Boolean)
      : [];

  const pick = await readAeoPick();
  if (!pick) {
    // The offer expired. Say that rather than starting an audit of whatever
    // URL happens to be in the form now.
    redirect(
      `${FORM_PATH}?${signedParams({
        problem: "That subdomain check expired. Please run it again.",
      })}`,
    );
  }

  const locked = await aeoGateProblem();
  if (locked) redirect(`${FORM_PATH}?${signedParams({ problem: locked })}`);

  let destination: string;
  try {
    const userId = await currentBusinessId();
    const outcome = await startAeoSelection(pick.websiteUrl, selected, userId);
    await clearAeoPick();

    if (outcome.jobs.length === 0) {
      // Every site was refused. That is not a crash, and the board is still
      // the right place for it — it is where the reasons are shown.
      await setAeoRun([], outcome.failed);
    } else {
      await setAeoRun(
        outcome.jobs.map((job) => ({ id: job.id, url: job.url })),
        outcome.failed,
      );
    }
    destination = REPORT_PATH;
  } catch (error) {
    console.error("[aeo] selection failed", error);
    destination = problemUrl(error, pick.websiteUrl);
  }

  redirect(destination);
}

/**
 * What the board polls. Never throws, by construction.
 *
 * One call for every job rather than one per card: the jobs are independent
 * but the browser's request budget is not, and three cards each running their
 * own timer is three times the traffic to answer one question.
 */
export async function pollAeoRunAction(): Promise<AeoJobView[]> {
  const run = await readAeoRun();
  if (!run || run.sites.length === 0) return [];

  const jobs = await Promise.all(run.sites.map((site) => readAeoJob(site.id, site.url)));
  return jobs.map(toJobView);
}

/**
 * Re-run one site after an error.
 *
 * Only offered for `error`, never for `blocked`: a bot wall is a property of
 * the site and polling again cannot change it, so a Try again there would be
 * a button that is guaranteed to do nothing.
 *
 * It replaces that one entry in the run and leaves the others alone — the
 * whole point of the board is that the jobs do not wait on each other.
 */
export async function retryAeoSiteAction(formData: FormData): Promise<void> {
  const url = cleanUrl(formData.get("url"));
  const previousId = cleanUrl(formData.get("id"));
  const run = await readAeoRun();

  if (!url || !run) redirect(FORM_PATH);

  const locked = await aeoGateProblem();
  if (locked) redirect(`${FORM_PATH}?${signedParams({ problem: locked })}`);

  const guard = beginAction(await currentBusinessId(), `aeo-retry:${url}`, { staleAfterMs: 30_000, minIntervalMs: 30_000 });
  if (!guard.ok) redirect(REPORT_PATH);

  let destination = REPORT_PATH;
  try {
    const userId = await currentBusinessId();
    const started = await startAeoAudit(url, { subdomain: false, userId });
    if (started.kind === "started") {
      await setAeoRun(
        run.sites.map((site) =>
          site.id === previousId ? { id: started.job.id, url: started.job.url || url } : site,
        ),
        run.failed,
      );
    }
  } catch (error) {
    console.error("[aeo] retry failed", error);
    destination = problemUrl(error, url);
  }

  redirect(destination);
}

function reportFlash(params: Record<string, string>): string {
  return `${REPORT_PATH}?${signedParams(params).toString()}`;
}

/**
 * Approve held fixes — the ticked ones, or every one still held.
 *
 * Three checks before anything is sent, because the form is the browser's
 * and the service trusts whatever id it is given:
 *
 * - **The job must be in this visitor's own run.** The service's routes are
 *   open; without this, any audit id typed into a form could be approved from
 *   this account.
 * - **The job is re-read here**, and only ids that are held in it RIGHT NOW
 *   go out (`approvableIds`). A stale tab or a doubled click names fixes that
 *   are already approved.
 * - **It must have finished.** Fixes are still being written while a job
 *   runs, so "approve all" would mean all of the ones that happened to exist.
 *
 * Approval is not a deploy. Nothing here or in the service's approve route
 * pushes to the customer's site, and the screen says so.
 */
export async function approveAeoFixesAction(formData: FormData): Promise<void> {
  const jobId = cleanUrl(formData.get("jobId"));
  const all = formData.get("scope") === "all";
  const ticked = formData
    .getAll("artifact")
    .filter((value): value is string => typeof value === "string" && value !== "");

  const run = await readAeoRun();
  if (!run || !run.sites.some((site) => site.id === jobId)) {
    redirect(reportFlash({ approveProblem: "That audit isn't part of this run any more." }));
  }

  let destination: string;
  try {
    const job = await readAeoJob(jobId);
    if (job.state !== "done" || !job.result) {
      destination = reportFlash({
        approveProblem: "The fixes are still being written. Try again when the audit finishes.",
      });
    } else {
      const ids = approvableIds(job.result.fixes, all ? "all" : ticked);
      if (ids.length === 0) {
        destination = reportFlash({
          approveProblem: all
            ? "There are no fixes waiting for approval."
            : "Tick at least one fix to approve.",
        });
      } else {
        await approveAeoFixes(jobId, ids);
        destination = reportFlash({ approved: String(ids.length) });
      }
    }
  } catch (error) {
    console.error("[aeo] approve failed", error);
    destination = reportFlash({
      approveProblem:
        error instanceof AeoApiError && error.kind === "bad-request"
          ? error.message
          : "We couldn't approve those fixes just now. Please try again.",
    });
  }

  redirect(destination);
}

/** Put the form back, and stop watching whatever was running. */
export async function clearAeoRunAction(): Promise<void> {
  await clearAeoRun();
  await clearAeoPick();
  redirect(FORM_PATH);
}

