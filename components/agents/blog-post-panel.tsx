"use client";

import type { BlogPublishState } from "@/lib/data/blog-publish";

/**
 * The Blog Posting agent: write one post for the customer's site and publish
 * it, then show what was written.
 *
 * ## Why this earns `"use client"`
 *
 * The run is one request that takes 1 to 4 minutes, and the page has to
 * move while it does: a step estimate and a running clock (the same honesty
 * rule as the analysis screen: there are no progress counters, so the steps
 * are paced by time, the last one holds until the run returns, and the clock
 * is what answers "is it stuck?"). A form post would freeze the page for the
 * whole wait. The run itself is a Server Action (`writeBlogPost`).
 *
 * ## The post's HTML is never put into this page
 *
 * It is AI-written. It is shown in an `<iframe sandbox="">` via `srcDoc`: no
 * scripts, no forms, no navigation, an opaque origin. Never
 * `dangerouslySetInnerHTML`.
 *
 * ## GitHub comes first
 *
 * The post is published through the site's GitHub repository, so without one
 * a run is paid for and then not published. The page decides `github` on the
 * server; while it is `blocked` the button stays off and `ConnectGithub` waits
 * on GitHub's tab, refreshing the page when the connection lands.
 * `writeBlogPost` checks again, so this is the hint, not the guard.
 */

import { PendingLink } from "@/components/ui/pending-link";
import { useEffect, useRef, useState } from "react";
import { ConnectGithub } from "@/components/connections/connect-github";
import { BLOG_STEPS, blogStepAt, type BlogOutcome } from "@/lib/data/blog-post-result";
import { formatElapsed } from "@/lib/data/analysis-steps";
import { whenVisible } from "@/lib/poll-pacing";

const SITE =
  "min-h-11 min-w-0 flex-1 basis-48 truncate rounded-md border border-border bg-surface-raised px-3.5 py-2.5 text-sm leading-6 text-ink";
const PRIMARY =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-surface hover:bg-accent-ink disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const LINK = "font-medium underline underline-offset-2";

/** Styles for the preview frame's own document; nothing from this page reaches it. */
const PREVIEW_STYLE =
  "<style>body{font-family:system-ui,-apple-system,sans-serif;line-height:1.65;color:#0c153f;margin:0;padding:16px}img{max-width:100%;height:auto}h1,h2,h3{line-height:1.25}a{color:#1936b8}</style>";

/**
 * Whether a post can be published, decided on the server from the GitHub and
 * WordPress checks (`lib/data/blog-publish.ts`).
 */
export type BlogGithub = BlogPublishState;

/** How often a background job is checked, and how long before we stop watching it. */
const POLL_MS = 5_000;
const MAX_WAIT_MS = 10 * 60_000;
const STILL_WRITING =
  "Writing the post is taking longer than expected. Check your site in a few minutes before trying again.";

type JobCheck = BlogOutcome | { kind: "running" };

export function BlogPostPanel({
  website,
  write,
  check,
  github = { kind: "ready", note: null },
  checkGithub,
  connectWordpress,
}: {
  /**
   * The account's own website, shown and not editable: the backend knows only
   * that site, GitHub is connected per site and WordPress is the account's one
   * site, so a post for any other website failed or went to the wrong place
   * (2026-10-13). `write` reads it again on the server; this is only shown.
   */
  website: string;
  write: () => Promise<BlogOutcome>;
  /**
   * One check of a background job. The backend answers a run with a job id
   * at once (2026-10-12) and writes and publishes afterwards; without this
   * the panel read that answer as a failure while the post went live.
   */
  check?: (jobId: string) => Promise<JobCheck>;
  github?: BlogGithub;
  checkGithub?: () => Promise<{ connected: boolean }>;
  /** The other way to publish, offered beside GitHub when neither is set up. */
  connectWordpress?: React.ReactNode;
}) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [outcome, setOutcome] = useState<BlogOutcome | null>(null);
  const running = startedAt !== null;
  const blocked = github.kind === "blocked";
  const site = website.trim();
  const hasSite = site !== "";
  // Leaving the page stops the checks; the job itself carries on.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Checks the job until it ends, or until we have watched it long enough. */
  async function follow(jobId: string, begun: number): Promise<BlogOutcome> {
    if (!check) return { kind: "failed", message: STILL_WRITING, timedOut: true };
    while (Date.now() - begun < MAX_WAIT_MS) {
      await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
      // Never from a hidden tab (Error 1102, `lib/poll-pacing.ts`).
      await whenVisible();
      if (!mounted.current) break;
      // A failed check is a passing fault: the job goes on, so check again.
      const status = await check(jobId).catch((): JobCheck => ({ kind: "running" }));
      if (status.kind !== "running" && status.kind !== "started") return status;
    }
    return { kind: "failed", message: STILL_WRITING, timedOut: true };
  }

  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running || blocked || !hasSite) return;
    setOutcome(null);
    const begun = Date.now();
    setStartedAt(begun);
    try {
      const first = await write();
      const outcome = first.kind === "started" ? await follow(first.jobId, begun) : first;
      if (mounted.current) setOutcome(outcome);
    } catch {
      setOutcome({ kind: "failed", message: "We couldn't reach the server. Check your connection, then look at your site before trying again." });
    } finally {
      setStartedAt(null);
    }
  }

  const elapsed = startedAt === null ? 0 : Math.max(0, now - startedAt);
  const step = blogStepAt(elapsed);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div>
        <h2 className="text-base font-semibold text-ink">Write and publish a post</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-soft">
          The agent reads your site, picks a topic and keywords, writes the post with a cover image, and
          publishes it to your site. It usually takes 1 to 4 minutes.
        </p>
      </div>

      {github.kind === "blocked" && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-warn/30 bg-warn-soft px-4 py-3">
          <div className="min-w-0 flex-1 basis-64">
            <p className="text-sm font-semibold text-warn">{github.title}</p>
            <p className="mt-0.5 text-sm text-ink">{github.message}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {github.installUrl !== null && checkGithub ? (
              <ConnectGithub installUrl={github.installUrl} connected={false} check={checkGithub} />
            ) : (
              <PendingLink
                href="/"
                className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-raised"
              >
                Add website
              </PendingLink>
            )}
            {connectWordpress}
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <p className="text-xs font-medium text-ink-soft">
          Your website
        </p>
        <div className="flex flex-wrap gap-2">
          {/* Text, not an input: posts are only for the website on the account. */}
          <p className={SITE} title={hasSite ? site : undefined}>
            {hasSite ? site : <span className="text-ink-soft">No website on your account yet</span>}
          </p>
          <button type="submit" disabled={running || blocked || !hasSite} aria-busy={running} className={PRIMARY}>
            {running ? "Writing…" : "Write and publish"}
          </button>
        </div>
        <p className="text-xs text-ink-soft">
          {blocked
            ? "Connect one of them above, then you can write and publish."
            : "It publishes straight to your site, so only press this when you want a new post live."}
          {!blocked && github.note && <> {github.note}</>}
        </p>
      </form>

      {running && (
        <div role="status" className="rounded-md border border-border bg-surface-raised px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-ink">{BLOG_STEPS[step]}…</p>
            <p className="text-xs tabular-nums text-ink-soft">{formatElapsed(elapsed)}</p>
          </div>
          <ol className="mt-3 flex flex-col gap-1.5">
            {BLOG_STEPS.map((label, index) => (
              <li key={label} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className={`size-2 shrink-0 rounded-full ${
                    index < step ? "bg-good" : index === step ? "bg-accent motion-safe:animate-pulse" : "bg-border"
                  }`}
                />
                <span className={index <= step ? "text-ink" : "text-ink-soft"}>{label}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-ink-soft">
            The steps are an estimate: the service reports only when it is done. Keep this page open.
          </p>
        </div>
      )}

      {outcome?.kind === "failed" && (
        <p role="alert" className="rounded-lg border border-crit/30 bg-crit-soft px-4 py-3 text-sm text-crit">
          {outcome.message}
          {outcome.details && <span className="mt-1 block text-xs opacity-80">Details: {outcome.details}</span>}
        </p>
      )}

      {outcome?.kind === "done" && (
        <article className="flex flex-col gap-3">
          {outcome.published === null ? (
            <p className="rounded-lg bg-good-soft px-4 py-3 text-sm text-good">
              Your post is finished. Check your site to see it.
            </p>
          ) : outcome.published ? (
            <p className="rounded-lg bg-good-soft px-4 py-3 text-sm text-good">
              Your post is written and published.
              {outcome.publish?.url && (
                <>
                  {" "}
                  <a href={outcome.publish.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                    View it
                  </a>
                </>
              )}
              {outcome.publish?.prUrl && (
                <>
                  {" · "}
                  <a href={outcome.publish.prUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
                    Review the pull request
                  </a>
                </>
              )}
            </p>
          ) : (
            <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
              The post is written but wasn&apos;t published
              {outcome.publish?.message ? `: ${outcome.publish.message.replace(/\.$/, "")}.` : "."}
            </p>
          )}

          {/* No post came back to show (the job said only "done"): no placeholder heading. */}
          {(outcome.contentHtml !== "" || outcome.published !== null) && (
          <div>
            <h3 className="text-lg font-bold tracking-tight text-ink">{outcome.title}</h3>
            {outcome.metaDescription !== "" && <p className="mt-1 text-sm text-ink-soft">{outcome.metaDescription}</p>}
          </div>
          )}
          {/* The preview below already carries the post's own image; showing it above as well
              drew it twice. Kept only for a post whose body has no image of its own. */}
          {outcome.image && !/<img[\s>]/i.test(outcome.contentHtml) && (
            // An inline data image (checked in `readBlogSuccess`); next/image cannot optimise one.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={outcome.image} alt={outcome.imageAlt} className="w-full rounded-lg border border-border" />
          )}
          {/* A run can be published with no body in the reply; an empty frame reads as broken. */}
          {outcome.contentHtml !== "" && (
            <iframe
              title={`Preview of ${outcome.title}`}
              sandbox=""
              srcDoc={`${PREVIEW_STYLE}${outcome.contentHtml}`}
              className="h-[32.5rem] w-full rounded-lg border border-border bg-surface"
            />
          )}
          {outcome.warnings.length > 0 && (
            <details className="text-sm text-ink-soft">
              <summary className="cursor-pointer">Notes from the agent ({outcome.warnings.length})</summary>
              <ul className="mt-2 list-disc pl-5">
                {outcome.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
        </article>
      )}
    </div>
  );
}
