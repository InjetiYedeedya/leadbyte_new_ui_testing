import { readSignedText } from "@/lib/signed-text";
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "@/components/ui/app-link";
import { redirect } from "next/navigation";
import { PageLoading } from "@/components/ui/page-loading";
import { PageShell } from "@/components/page-shell";
import { PageContainer } from "@/components/ui/page-container";
import { SubmitButton } from "@/components/ui/submit-button";
import { AeoRunBoard } from "@/components/agents/aeo-run-board";
import {
  AeoBlockedCard,
  AeoErrorCard,
  AeoReportCard,
  AeoUnknownCard,
} from "@/components/agents/aeo-report-card";
import { FlashNotice } from "@/components/ui/flash-notice";
import { isAeoFinished, isAeoReportReady, readAeoJob, toJobView } from "@/lib/data/aeo-audit";
import { readAeoRun } from "@/lib/data/aeo-run";
import { approveAeoFixesAction, clearAeoRunAction, retryAeoSiteAction } from "../actions";
import {
  aeoGithubDisconnectAction,
  aeoGithubReposAction,
  aeoGithubStatusAction,
  aeoOpenPullRequestAction,
  aeoPreviewAction,
} from "../apply-actions";

/** Handed to every report card; the island calls them in place. */
const APPLY_ACTIONS = {
  githubStatus: aeoGithubStatusAction,
  githubRepos: aeoGithubReposAction,
  githubDisconnect: aeoGithubDisconnectAction,
  preview: aeoPreviewAction,
  openPullRequest: aeoOpenPullRequestAction,
};

export const metadata: Metadata = { title: "AEO audit results · LeadByte" };

/**
 * The audits, running and finished, on one screen.
 *
 * ## Why progress and results are not two pages
 *
 * With several sites in a run they finish at different times and none waits on
 * another, so a separate wait screen would have to show finished and
 * unfinished work side by side anyway — which is this screen. A card is
 * replaced in place the moment its own audit lands, and the rest keep going.
 *
 * ## Why the server reads every job as well as the poller
 *
 * The board polls for STATE only; a finished audit runs to well over 100KB and
 * has no business travelling down a poll every four seconds to decide one
 * boolean. So the server reads the jobs once per render and hands down the
 * finished reports already rendered; the board asks for a refresh when
 * something new lands.
 */
type Flash = { approved?: string; approveProblem?: string };

async function AeoReportPageBody({ flash }: { flash: Promise<Flash> }) {
  const { approved, approveProblem: rawApproveProblem } = await flash;
  // Signed by the action that redirected here; a link carrying any other text
  // shows nothing rather than words someone else chose (audit, 2026-09-29).
  const approveProblem = readSignedText(rawApproveProblem) ?? undefined;
  const approvedCount = Number(approved);
  const run = await readAeoRun();

  // Nothing to watch. A redirect rather than an empty state: the page is fine,
  // there is simply no run, and the form is where one starts.
  if (!run) redirect("/agents/aeo/audit");

  const jobs = await Promise.all(run.sites.map((site) => readAeoJob(site.id, site.url)));

  const reports: Record<string, React.ReactNode> = {};
  for (const job of jobs) {
    // Drawn as soon as the result exists, not when the job says `done`: the
    // score is final once the crawl ends, and the fixes go on being written
    // for tens of seconds after. The card says which part is still coming.
    if (isAeoReportReady(toJobView(job)) && job.result) {
      reports[job.id] = (
        <AeoReportCard
          job={job}
          writing={!isAeoFinished(job.state)}
          approve={approveAeoFixesAction}
          apply={APPLY_ACTIONS}
        />
      );
    } else if (job.state === "blocked") {
      reports[job.id] = <AeoBlockedCard job={job} />;
    } else if (job.state === "error") {
      reports[job.id] = (
        <AeoErrorCard
          job={job}
          retry={
            /* Offered here and never on a blocked card: an unreachable site
               may be a transient network failure, a bot wall is not. */
            <form action={retryAeoSiteAction}>
              <input type="hidden" name="url" value={job.url} />
              <input type="hidden" name="id" value={job.id} />
              <SubmitButton
                pendingLabel="Starting…"
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-raised motion-reduce:transition-none"
              >
                Try again
              </SubmitButton>
            </form>
          }
        />
      );
    } else if (job.state === "done" && !job.result) {
      // Finished with nothing in it. Rare, and saying so beats a blank card.
      reports[job.id] = <AeoUnknownCard url={job.url} />;
    }
  }

  return (
    <PageContainer>
      <div className="max-w-3xl">
        <Link
          href="/agents/aeo"
          className="text-sm text-ink-soft transition-colors hover:text-ink motion-reduce:transition-none"
        >
          ← AEO agent
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {run.sites.length > 1 ? "Your AEO audits" : "Your AEO audit"}
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
          How AI answer engines read your pages. Each site is audited on its own and scored on its
          own — this is a different set of checks from{" "}
          <Link
            href="/overview/geo-analysis"
            className="text-accent-ink underline-offset-4 hover:underline"
          >
            GEO analysis
          </Link>
          , so the two scores will not match.
        </p>
      </div>

      {approvedCount > 0 && (
        <FlashNotice
          clear={["approved"]}
          className="max-w-3xl rounded-lg bg-good-soft px-4 py-3 text-sm text-good"
        >
          Approved {approvedCount} {approvedCount === 1 ? "fix" : "fixes"}. Nothing has been
          changed on your site.
        </FlashNotice>
      )}
      {approveProblem && (
        <FlashNotice
          role="alert"
          clear={["approveProblem"]}
          className="max-w-3xl rounded-lg bg-crit-soft px-4 py-3 text-sm text-crit"
        >
          {approveProblem}
        </FlashNotice>
      )}

      {/* Sites the service refused to start. A shorter list of cards with no
          explanation is indistinguishable from sites nobody picked. */}
      {run.failed.length > 0 && (
        <div role="alert" className="max-w-3xl rounded-lg bg-warn-soft px-4 py-3">
          <p className="text-sm font-medium text-warn">
            {run.failed.length} {run.failed.length === 1 ? "site" : "sites"} couldn&apos;t be
            started
          </p>
          <ul className="mt-2 space-y-1">
            {run.failed.map((failure) => (
              <li key={failure.url} className="break-all text-sm text-warn">
                {failure.url} — {failure.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {run.sites.length > 0 && (
        <AeoRunBoard
          initial={jobs.map(toJobView)}
          startedAt={run.startedAt}
          reports={reports}
        />
      )}

      <form action={clearAeoRunAction} className="max-w-3xl">
        <SubmitButton
          pendingLabel="Clearing…"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-raised motion-reduce:transition-none"
        >
          Audit another site
        </SubmitButton>
      </form>
    </PageContainer>
  );
}

export default function AeoReportPage({ searchParams }: { searchParams: Promise<Flash> }) {
  return (
    <PageShell activeTab="/agents" currentStageId="agents">
      <Suspense fallback={<PageLoading title="AEO audit" />}>
        <AeoReportPageBody flash={searchParams} />
      </Suspense>
    </PageShell>
  );
}
