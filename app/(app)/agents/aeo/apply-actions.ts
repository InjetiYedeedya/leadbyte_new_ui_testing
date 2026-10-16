"use server";

/**
 * The actions behind "How to apply them": GitHub status, preview, and opening
 * the pull request.
 *
 * Called directly from `AeoApply` (a client island) as plain async functions,
 * not through `<form action>` + `redirect()`: each answers a question the
 * island shows in place — a preview's diff, a status that flips while a
 * GitHub tab is open — and a redirect would throw that away. Every one returns
 * a result rather than throwing, because a thrown error loses its shape on the
 * way to the browser.
 *
 * ## The one check every action makes first
 *
 * The audit id must be in THIS account's run cookie (signed). Without it, any
 * audit id posted to these actions could be previewed or — worse — turned into
 * a pull request. The same rule `approveAeoFixesAction` applies.
 */

import { currentBusinessId } from "@/components/page-shell";
import { AeoApiError } from "@/lib/api/aeo-client";
import { beginAction, guardMessage } from "@/lib/data/action-guard";
import {
  type GithubStatus,
  type PullRequestPreview,
  disconnectGithub,
  listGithubRepos,
  openPullRequest,
  previewPullRequest,
  readGithubStatus,
  readRepoInput,
} from "@/lib/data/aeo-deploy";
import { readAeoRun } from "@/lib/data/aeo-run";
import { checkAgentRun } from "@/lib/data/agent-run-check";

const NOT_IN_RUN = "That audit isn't part of this run any more. Reload the page.";

/** The audit is in this account's run AND the account may use AEO. */
async function ownsJob(jobId: string): Promise<{ url: string } | null> {
  if (!(await checkAgentRun("aeo", await currentBusinessId())).ok) return null;
  const run = await readAeoRun();
  const site = run?.sites.find((s) => s.id === jobId);
  return site ? { url: site.url } : null;
}

function hostOf(url: string): string {
  try {
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function problem(error: unknown, fallback: string): string {
  // The service's own sentence is written for a person when it rejects a
  // request ("repository not found", "branch does not exist"); anything else
  // is ours to phrase.
  if (error instanceof AeoApiError && error.kind === "bad-request") return error.message;
  if (error instanceof AeoApiError && error.kind === "timeout") {
    return "GitHub took too long to answer. Please try again.";
  }
  return fallback;
}

export type GithubStatusResult = { ok: true; status: GithubStatus } | { ok: false; message: string };

/**
 * Is GitHub connected for this site?
 *
 * `domain` comes from the rendered report, so it is checked against the site
 * this run actually audited before it is sent anywhere.
 */
export async function aeoGithubStatusAction(
  jobId: string,
  domain: string,
): Promise<GithubStatusResult> {
  const site = await ownsJob(jobId);
  if (!site) return { ok: false, message: NOT_IN_RUN };
  const cleanDomain = domain.trim().toLowerCase();
  if (!cleanDomain || hostOf(cleanDomain) !== hostOf(site.url)) {
    return { ok: false, message: NOT_IN_RUN };
  }
  try {
    const status = await readGithubStatus(await currentBusinessId(), cleanDomain);
    return { ok: true, status };
  } catch (error) {
    console.error("[aeo] github status failed", error);
    return { ok: false, message: "We couldn't check your GitHub connection just now." };
  }
}

/**
 * Disconnect GitHub for this site (live on aeo-agent, 2026-10-01).
 *
 * Checked like the status: the audit must be in this account's run and the
 * domain must be the site it audited, so a tampered call cannot disconnect
 * anyone else's site. Clears the service's saved link only — the GitHub App
 * stays installed until the customer removes it on GitHub — and answers with
 * the fresh status (`connected: false`, a new install link).
 */
export async function aeoGithubDisconnectAction(
  jobId: string,
  domain: string,
): Promise<GithubStatusResult> {
  const site = await ownsJob(jobId);
  if (!site) return { ok: false, message: NOT_IN_RUN };
  const cleanDomain = domain.trim().toLowerCase();
  if (!cleanDomain || hostOf(cleanDomain) !== hostOf(site.url)) {
    return { ok: false, message: NOT_IN_RUN };
  }
  try {
    return { ok: true, status: await disconnectGithub(await currentBusinessId(), cleanDomain) };
  } catch (error) {
    console.error("[aeo] github disconnect failed", error);
    return { ok: false, message: problem(error, "We couldn't disconnect GitHub just now. Nothing changed.") };
  }
}

export type GithubReposResult = { ok: true; repos: string[] } | { ok: false; message: string };

/** The repositories to pick from, once GitHub is connected for this site. */
export async function aeoGithubReposAction(
  jobId: string,
  domain: string,
): Promise<GithubReposResult> {
  const site = await ownsJob(jobId);
  if (!site) return { ok: false, message: NOT_IN_RUN };
  const cleanDomain = domain.trim().toLowerCase();
  if (!cleanDomain || hostOf(cleanDomain) !== hostOf(site.url)) {
    return { ok: false, message: NOT_IN_RUN };
  }
  try {
    return { ok: true, repos: await listGithubRepos(await currentBusinessId(), cleanDomain) };
  } catch (error) {
    console.error("[aeo] github repos failed", error);
    return { ok: false, message: problem(error, "We couldn't list your repositories just now.") };
  }
}

export type PreviewResult = { ok: true; preview: PullRequestPreview } | { ok: false; message: string };

/** The change we would propose. Needs no access and creates nothing. */
export async function aeoPreviewAction(
  jobId: string,
  repoRaw: string,
  branchRaw: string,
): Promise<PreviewResult> {
  if (!(await ownsJob(jobId))) return { ok: false, message: NOT_IN_RUN };
  const input = readRepoInput(repoRaw, branchRaw);
  if (!input.ok) return input;
  try {
    return {
      ok: true,
      preview: await previewPullRequest(jobId, await currentBusinessId(), input.repo, input.branch),
    };
  } catch (error) {
    console.error("[aeo] preview failed", error);
    return { ok: false, message: problem(error, "We couldn't preview that repository just now.") };
  }
}

/**
 * Open the pull request. Writes a branch to the customer's repository, so it
 * is guarded against a double press: one per account at a time, and not
 * again within a minute.
 */
export async function aeoOpenPullRequestAction(
  jobId: string,
  repoRaw: string,
  branchRaw: string,
): Promise<PreviewResult> {
  if (!(await ownsJob(jobId))) return { ok: false, message: NOT_IN_RUN };
  const input = readRepoInput(repoRaw, branchRaw);
  if (!input.ok) return input;

  const guard = beginAction(await currentBusinessId(), "aeo-open-pr", {
    staleAfterMs: 120_000,
    minIntervalMs: 60_000,
  });
  if (!guard.ok) return { ok: false, message: guardMessage(guard.reason) };

  try {
    const result = await openPullRequest(jobId, await currentBusinessId(), input.repo, input.branch);
    if (!result.pullRequestUrl) {
      return {
        ok: false,
        message:
          result.pushBlockedReason ||
          "GitHub didn't confirm a pull request. Check the repository before trying again.",
      };
    }
    return { ok: true, preview: result };
  } catch (error) {
    console.error("[aeo] open pull request failed", error);
    return {
      ok: false,
      message: problem(
        error,
        "We couldn't open the pull request. Check the repository on GitHub before trying again.",
      ),
    };
  } finally {
    guard.release();
  }
}
