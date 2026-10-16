import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { currentJobId, currentJobStartedAt } from "@/lib/data/analysis-job";
import { firstFilled } from "@/lib/data/profile-display";
import { readPendingUrl } from "@/lib/data/pending-website";
import { AnalysisProgress } from "@/components/analysis/analysis-progress";
import { BrandHeader } from "@/components/brand-header";

export const metadata: Metadata = { title: "Analysing your website · LeadByte" };

/**
 * The screen between "Analyze Website" and the profile.
 *
 * ## Why it is its own route
 *
 * The analysis is a background job that outlives the request that started it,
 * so the wait needs an address. Its own URL means a reload resumes rather than
 * restarting, and `captureWebsiteUrl` can hand off to it without holding a
 * request open for the length of the crawl.
 *
 * ## Why it redirects when there is nothing to watch
 *
 * Landing here with no job in flight — a bookmark, a back button, a finished
 * run — would leave someone watching a sequence that will never move. The
 * profile is where they were going anyway.
 *
 * No `PageShell`: the tab bar and stage rail invite navigation away from the
 * wait, and the whole point of the screen is to hold attention on
 * one thing. It carries the wordmark alone, like the entry screen it follows.
 */
export default async function AnalysingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Cookies only. Every backend read was taken off this render path: the
  // status call alone made the page take 6.5 SECONDS to appear, on a screen
  // whose entire job is to show up instantly and then wait. The island polls
  // the job anyway, so the server has nothing to add.
  const [jobId, startedAt, pendingUrl] = await Promise.all([
    currentJobId(),
    currentJobStartedAt(),
    readPendingUrl(session.businessId),
  ]);

  // No job and no URL waiting to be analysed: there is nothing to watch.
  if (jobId === null && !firstFilled(pendingUrl)) {
    redirect("/overview");
  }

  const site =
    firstFilled(pendingUrl)?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? "your website";

  return (
    <main className="flex min-h-dvh flex-col">
      <BrandHeader />

      <div className="flex flex-1 items-start justify-center px-6 pt-24">
        <AnalysisProgress
          site={site}
          // No job yet means this screen has to start one. Arriving with a job
          // already running — a reload — must not start a second.
          needsStart={jobId === null}
          // Unknown only for a cookie written before the timestamp existed; the
          // estimate then starts from now, which costs nothing real.
          startedAt={startedAt ?? Date.now()}
        />
      </div>
    </main>
  );
}
