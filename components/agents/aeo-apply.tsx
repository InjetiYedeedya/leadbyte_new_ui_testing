"use client";

/**
 * "How to apply them": the routes the fixes can take to the site, as tabs,
 * each opening onto what doing it actually involves.
 *
 * ## Why this earns `"use client"`
 *
 * Three things a form POST cannot express: which tab is open; a GitHub
 * connection that is made in ANOTHER tab (the install callback lands on the
 * AEO service, not on us) and has to be noticed here by polling; and a preview
 * whose diff is shown in place, next to the repository it was asked about.
 * It never fetches — every call is a Server Action handed in as a prop, the
 * same way the report card receives `approve`.
 *
 * ## The one thing it will not do without being asked
 *
 * Open a pull request. Preview first, always: the button that writes to the
 * customer's repository appears only under a preview of exactly what it would
 * write. Even then it is a pull request that waits for them to merge it.
 */

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Spinner } from "@/components/ui/spinner";
import { PendingDownload } from "@/components/ui/pending-download";
import type { ApplyRoute, GithubStatus, PullRequestPreview } from "@/lib/data/aeo-deploy";
import { formatPoints } from "@/lib/data/aeo-report";
import { whenVisible } from "@/lib/poll-pacing";

export type GithubStatusCheck = { ok: true; status: GithubStatus } | { ok: false; message: string };
export type ReposCheck = { ok: true; repos: string[] } | { ok: false; message: string };
export type PreviewCheck = { ok: true; preview: PullRequestPreview } | { ok: false; message: string };

export interface AeoApplyActions {
  githubStatus: (jobId: string, domain: string) => Promise<GithubStatusCheck>;
  githubRepos: (jobId: string, domain: string) => Promise<ReposCheck>;
  /** Forgets this site's GitHub link; answers with the fresh, disconnected status. */
  githubDisconnect: (jobId: string, domain: string) => Promise<GithubStatusCheck>;
  preview: (jobId: string, repo: string, branch: string) => Promise<PreviewCheck>;
  openPullRequest: (jobId: string, repo: string, branch: string) => Promise<PreviewCheck>;
}

/** How often to look for a connection made in the GitHub tab, and for how long. */
// Every 2s, the backend's own recommendation: their side is fast, GitHub's
// install screen is the slow part.
const CONNECT_POLL_MS = 2000;
const CONNECT_GIVE_UP_MS = 5 * 60_000;

const PRIMARY =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-accent px-6 text-sm font-semibold text-surface transition-colors duration-150 hover:bg-accent-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent motion-reduce:transition-none";
const SECONDARY =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-border bg-surface px-5 text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface motion-reduce:transition-none";
const DANGER_OUTLINE =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-crit/40 bg-surface px-5 text-sm font-medium text-crit transition-colors duration-150 hover:bg-crit-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none";
const DANGER =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-crit px-5 text-sm font-semibold text-surface transition-opacity duration-150 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 motion-reduce:transition-none";
const INPUT =
  "min-h-12 w-full rounded-md border border-border bg-surface px-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent motion-reduce:transition-none";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function scoreRange(route: ApplyRoute): string | null {
  if (route.from === null || route.to === null) return null;
  return `${formatPoints(route.from)} → ${formatPoints(route.to)}`;
}

// ---------------------------------------------------------------------------
// GitHub pull request
// ---------------------------------------------------------------------------

function GithubPanel({
  jobId,
  domain,
  actions,
  writing,
}: {
  jobId: string;
  domain: string;
  actions: AeoApplyActions;
  /** Fixes still arriving: nothing to preview yet. */
  writing: boolean;
}) {
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [statusProblem, setStatusProblem] = useState<string | null>(null);
  /** The GitHub wait ran out: said, rather than quietly resetting the button. */
  const [timedOut, setTimedOut] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [repo, setRepo] = useState("");
  /** The repositories GitHub granted, once connected. Empty: type one instead. */
  const [repos, setRepos] = useState<string[]>([]);
  const [branch, setBranch] = useState("main");
  const [preview, setPreview] = useState<PullRequestPreview | null>(null);
  /** The repository and branch the preview on screen was made for. */
  const [previewedFor, setPreviewedFor] = useState<string | null>(null);
  const [opened, setOpened] = useState<PullRequestPreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();
  const [opening, startOpen] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();
  /** The in-place "are you sure": disconnecting stops pull requests and blog posts. */
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  /** Said once it is done, because the app itself is still installed on GitHub. */
  const [disconnected, setDisconnected] = useState(false);
  const repoTouched = useRef(false);
  const repoId = useId();
  const branchId = useId();

  // The first look, on mount.
  useEffect(() => {
    let cancelled = false;
    actions
      .githubStatus(jobId, domain)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setStatus(result.status);
          if (result.status.repo && !repoTouched.current) setRepo(result.status.repo);
        } else {
          setStatusProblem(result.message);
        }
      })
      // A thrown check left "Checking…" spinning with no way out.
      .catch(() => {
        if (!cancelled) setStatusProblem("We couldn't check your GitHub connection just now.");
      });
    return () => {
      cancelled = true;
    };
  }, [actions, jobId, domain]);

  // Once connected, offer the repositories chosen on GitHub's own screen as a
  // list — the backend's advice, since retyping a name invites a typo. The
  // service does not remember a previous pick (`status.repo` stays empty),
  // so a single repository is simply chosen for them.
  const connectedNow = status?.connected === true;
  useEffect(() => {
    if (!connectedNow) return;
    let cancelled = false;
    actions.githubRepos(jobId, domain).then((result) => {
      if (cancelled || !result.ok) return;
      setRepos(result.repos);
      if (result.repos.length === 1 && !repoTouched.current) setRepo(result.repos[0] ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [connectedNow, actions, jobId, domain]);

  // While the GitHub tab is open, watch for the connection to land.
  useEffect(() => {
    if (!waiting) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    async function poll() {
      // Never from a hidden tab (Error 1102, `lib/poll-pacing.ts`). The
      // customer is on GitHub's tab meanwhile, so this checks the moment they
      // come back — which is when the answer matters.
      await whenVisible();
      if (cancelled) return;
      let result: Awaited<ReturnType<typeof actions.githubStatus>> | null = null;
      try {
        result = await actions.githubStatus(jobId, domain);
      } catch {
        result = null; // one failed check is not the end of the wait
      }
      if (cancelled) return;
      if (result === null) {
        timer = setTimeout(poll, CONNECT_POLL_MS);
        return;
      }
      if (result.ok) {
        setStatus(result.status);
        if (result.status.connected) {
          if (result.status.repo && !repoTouched.current) setRepo(result.status.repo);
          setWaiting(false);
          return;
        }
      }
      if (Date.now() - startedAt >= CONNECT_GIVE_UP_MS) {
        setWaiting(false);
        setTimedOut(true);
        return;
      }
      timer = setTimeout(poll, CONNECT_POLL_MS);
    }
    timer = setTimeout(poll, CONNECT_POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [waiting, actions, jobId, domain]);

  function connect() {
    if (!status?.installUrl) return;
    // A new tab, never this one: GitHub's callback lands on the audit
    // service, and this page has to still be here to notice.
    window.open(status.installUrl, "_blank", "noopener,noreferrer");
    setTimedOut(false);
    setWaiting(true);
  }

  const target = `${repo.trim()}@${branch.trim() || "main"}`;
  const previewIsCurrent = preview !== null && previewedFor === target;

  function runPreview() {
    setProblem(null);
    setOpened(null);
    startPreview(async () => {
      const result = await actions.preview(jobId, repo, branch);
      if (result.ok) {
        setPreview(result.preview);
        setPreviewedFor(target);
      } else {
        setPreview(null);
        setProblem(result.message);
      }
    });
  }

  function runOpen() {
    setProblem(null);
    startOpen(async () => {
      const result = await actions.openPullRequest(jobId, repo, branch);
      if (result.ok) {
        setOpened(result.preview);
        return;
      }
      setProblem(result.message);
      // "connect GitHub for this site first": the connection is gone (or was
      // never there). Re-read it so the Connect box comes back.
      if (/connect github/i.test(result.message)) {
        const fresh = await actions.githubStatus(jobId, domain);
        if (fresh.ok) setStatus(fresh.status);
      }
    });
  }

  function runDisconnect() {
    setProblem(null);
    startDisconnect(async () => {
      const result = await actions.githubDisconnect(jobId, domain);
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
      // Back to the Connect box, with the fresh install link it answered with.
      setStatus(result.status);
      setRepos([]);
      setPreview(null);
      setOpened(null);
      setConfirmingDisconnect(false);
      setDisconnected(true);
    });
  }

  const connected = status?.connected === true;

  return (
    <div>
      <p className="text-sm text-ink">
        The safest option: we open a pull request, you review and merge it. Previewing needs no
        access at all.
      </p>

      {/* The connection box. Four honest states: still checking, connected,
          not connected, and "we have not set GitHub up" — the last is our
          problem, so it is said as ours and offers no button. */}
      {status === null && statusProblem === null ? (
        <div className="mt-4 flex items-center gap-2 rounded-md bg-surface-raised p-4 text-sm text-ink-soft">
          <Spinner /> Checking your GitHub connection…
        </div>
      ) : statusProblem !== null ? (
        <p className="mt-4 rounded-md bg-surface-raised p-4 text-sm text-ink-soft">
          {statusProblem} You can still preview the change.
        </p>
      ) : connected ? (
        <div className="mt-4 rounded-md bg-good-soft p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-good">GitHub connected</p>
              <p className="mt-0.5 text-sm text-ink">
                {status?.repo
                  ? `We can open pull requests on ${status.repo}.`
                  : "We can open pull requests on the repositories you chose."}
              </p>
            </div>
            {!confirmingDisconnect && (
              <button
                type="button"
                onClick={() => setConfirmingDisconnect(true)}
                className={DANGER_OUTLINE}
              >
                Disconnect
              </button>
            )}
          </div>
          {confirmingDisconnect && (
            // Asked in place rather than in a dialog: the question belongs to this box.
            <div role="group" aria-labelledby={`${repoId}-disconnect`} className="mt-3 border-t border-good/20 pt-3">
              <p id={`${repoId}-disconnect`} className="text-sm font-medium text-ink">
                Disconnect GitHub for {domain}?
              </p>
              <p className="mt-0.5 text-sm text-ink">
                We won&apos;t be able to open pull requests, and the Blog Posting agent can&apos;t
                publish, until you connect it again. The LeadByte app stays installed on your GitHub
                account; uninstall it there to remove it completely.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={runDisconnect} disabled={disconnecting} className={DANGER}>
                  {disconnecting ? (
                    <>
                      <Spinner /> Disconnecting…
                    </>
                  ) : (
                    "Disconnect"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDisconnect(false)}
                  disabled={disconnecting}
                  className={SECONDARY}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : status?.configured ? (
        <>
          {disconnected && (
            <p role="status" className="mt-4 rounded-md bg-info-soft p-4 text-sm text-info">
              <span className="font-medium">GitHub disconnected.</span> The LeadByte app is still
              installed on your GitHub account. To remove it completely, uninstall it under{" "}
              {/* GitHub, so a raw anchor. */}
              <a
                href="https://github.com/settings/installations"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                GitHub&apos;s settings
              </a>
              .
            </p>
          )}
        <div className="mt-4 flex flex-col gap-4 rounded-md bg-accent-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Connect GitHub</p>
            <p className="mt-0.5 text-sm leading-relaxed text-ink">
              {waiting
                ? "Finish on the GitHub tab. This page notices by itself when you're done."
                : timedOut
                  ? "We didn't hear back from GitHub. If you finished there, press Connect GitHub again."
                  : !status.installUrl
                    ? "GitHub connection isn't available right now. You can still preview the change."
                    : "You choose which repositories we may touch. We store a revocable reference, never a password or token."}
            </p>
          </div>
          <button
            type="button"
            onClick={connect}
            disabled={waiting || !status.installUrl}
            className={PRIMARY}
          >
            {waiting ? (
              <>
                <Spinner /> Waiting for GitHub…
              </>
            ) : (
              "Connect GitHub"
            )}
          </button>
        </div>
        </>
      ) : (
        <p className="mt-4 rounded-md bg-surface-raised p-4 text-sm text-ink-soft">
          Connecting GitHub isn&apos;t switched on yet. You can still preview the change.
        </p>
      )}

      <form
        className="mt-4 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (repo.trim() && !writing) runPreview();
        }}
      >
        <label htmlFor={repoId} className="sr-only">
          Repository
        </label>
        {repos.length > 0 ? (
          <select
            id={repoId}
            value={repo}
            onChange={(event) => {
              repoTouched.current = true;
              setRepo(event.target.value);
            }}
            className={`${INPUT} sm:flex-[2] ${repo ? "" : "text-ink-soft"}`}
          >
            <option value="">Choose a repository</option>
            {repos.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={repoId}
            value={repo}
            onChange={(event) => {
              repoTouched.current = true;
              setRepo(event.target.value);
            }}
            placeholder="owner/repository"
            autoComplete="off"
            spellCheck={false}
            className={`${INPUT} sm:flex-[2]`}
          />
        )}
        <label htmlFor={branchId} className="sr-only">
          Branch
        </label>
        <input
          id={branchId}
          value={branch}
          onChange={(event) => setBranch(event.target.value)}
          placeholder="main"
          autoComplete="off"
          spellCheck={false}
          className={`${INPUT} sm:flex-1`}
        />
        <button type="submit" disabled={!repo.trim() || previewing || writing} className={PRIMARY}>
          {previewing ? (
            <>
              <Spinner /> Previewing…
            </>
          ) : (
            "Preview"
          )}
        </button>
      </form>

      {writing && (
        <p className="mt-3 text-sm text-ink-soft">
          Preview opens once all the fixes are written. This page updates by itself.
        </p>
      )}

      {problem && (
        <p role="alert" className="mt-3 text-sm text-crit">
          {problem}
        </p>
      )}

      {preview && previewIsCurrent && !opened && (
        <PreviewResult
          preview={preview}
          connected={connected}
          opening={opening}
          onOpen={runOpen}
        />
      )}

      {opened && (
        <div role="status" className="mt-4 rounded-md bg-good-soft p-4">
          <p className="text-sm font-semibold text-good">Pull request opened</p>
          <p className="mt-0.5 text-sm text-ink">
            Nothing changes on your site until you merge it.
          </p>
          {/* GitHub, so a raw anchor. */}
          <a
            href={opened.pullRequestUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm font-medium text-accent-ink underline-offset-4 hover:underline"
          >
            View the pull request on GitHub
          </a>
        </div>
      )}
    </div>
  );
}

function PreviewResult({
  preview,
  connected,
  opening,
  onOpen,
}: {
  preview: PullRequestPreview;
  connected: boolean;
  opening: boolean;
  onOpen: () => void;
}) {
  const nothing = preview.filesChanged === 0 && preview.ships === 0;
  const where = preview.repo ? `${preview.repo}, branch ${preview.branch || "main"}` : null;

  return (
    <div className="mt-4 border-t border-border pt-4">
      {nothing ? (
        <p className="text-sm text-ink">
          Nothing to change{where ? ` in ${where}` : ""}. The fixes are already there, or none of
          them can go out this way.
        </p>
      ) : (
        <>
          <p className="text-sm font-medium text-ink">
            {plural(preview.ships, "fix", "fixes")} would go into{" "}
            {plural(preview.filesChanged, "file", "files")}
            {preview.addedLines > 0 ? `, ${plural(preview.addedLines, "line", "lines")} added` : ""}
            {where ? ` in ${where}` : ""}.
          </p>
          {preview.heldBack > 0 && (
            <p className="mt-1 text-sm text-ink-soft">
              {plural(preview.heldBack, "fix is", "fixes are")} held back until approved.
            </p>
          )}
          {preview.branchNote && <p className="mt-1 text-sm text-ink-soft">{preview.branchNote}</p>}

          {preview.diff && (
            <details className="group mt-3">
              <summary className="cursor-pointer list-none text-sm text-accent-ink underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <span className="group-open:hidden">Show the change</span>
                <span className="hidden group-open:inline">Hide the change</span>
              </summary>
              <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-surface-raised p-3 font-mono text-xs text-ink-soft">
                {preview.diff}
              </pre>
            </details>
          )}

          <div className="mt-4">
            {preview.canPush && connected ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <button type="button" onClick={onOpen} disabled={opening} className={PRIMARY}>
                  {opening ? (
                    <>
                      <Spinner /> Opening…
                    </>
                  ) : (
                    "Open pull request"
                  )}
                </button>
                <p className="text-sm text-ink-soft">
                  You review it on GitHub. Nothing changes until you merge it.
                </p>
              </div>
            ) : (
              <p className="text-sm text-ink-soft">
                {preview.pushBlockedReason ||
                  (connected
                    ? "We can't open a pull request on this repository."
                    : "Connect GitHub to open this as a pull request.")}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The other routes
// ---------------------------------------------------------------------------

function RoutePanel({
  route,
  jobId,
  domain,
  actions,
  pluginHref,
  writing,
}: {
  route: ApplyRoute;
  jobId: string;
  domain: string;
  actions: AeoApplyActions;
  pluginHref: string;
  writing: boolean;
}) {
  switch (route.id) {
    case "source_pr":
      return <GithubPanel jobId={jobId} domain={domain} actions={actions} writing={writing} />;
    case "manual":
      return (
        <p className="text-sm text-ink">
          You paste each fix into your site yourself. Every page&apos;s fixes, and exactly where
          each one goes, are in the page list below — and all of them are in the full report.
        </p>
      );
    case "plugin":
      return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink">
            A WordPress plugin built for this site. Download it, then upload it in WordPress under
            Plugins → Add New → Upload.
          </p>
          {/* A file built on request, so it says so while it is being made —
              a raw `download` anchor showed nothing until the file arrived. */}
          <PendingDownload href={pluginHref} filename="plugin.zip" className={SECONDARY}>
            Download the plugin
          </PendingDownload>
        </div>
      );
    default:
      return (
        <p className="text-sm text-ink">
          This one isn&apos;t set up from here yet. The fixes it would carry, and where each one
          goes, are in the full report.
        </p>
      );
  }
}

export function AeoApply({
  jobId,
  domain,
  routes,
  unavailable,
  actions,
  writing = false,
}: {
  jobId: string;
  domain: string;
  routes: ApplyRoute[];
  /** "WordPress plugin (this site is not WordPress)" — said, never dropped. */
  unavailable: string[];
  actions: AeoApplyActions;
  /** The audit has landed but fixes are still being written. */
  writing?: boolean;
}) {
  const [active, setActive] = useState(routes[0]?.id ?? "");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const baseId = useId();
  const current = routes.find((route) => route.id === active) ?? routes[0];
  const reportHref = `/api/aeo/${encodeURIComponent(jobId)}/report.html`;
  const pluginHref = `/api/aeo/${encodeURIComponent(jobId)}/plugin.zip`;

  function onTabKey(event: React.KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = routes[(index + step + routes.length) % routes.length];
    if (!next) return;
    setActive(next.id);
    tabRefs.current[next.id]?.focus();
  }

  return (
    <section aria-labelledby={`${baseId}-heading`}>
      <div className="flex items-center gap-3">
        <h3 id={`${baseId}-heading`} className="shrink-0 text-base font-semibold text-ink">
          How to apply them
        </h3>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>

      {current && (
        <>
          <div role="tablist" aria-label="Ways to apply the fixes" className="mt-4 flex flex-wrap gap-3">
            {routes.map((route, index) => {
              const selected = route.id === current.id;
              const range = scoreRange(route);
              return (
                <button
                  key={route.id}
                  ref={(node) => {
                    tabRefs.current[route.id] = node;
                  }}
                  type="button"
                  role="tab"
                  id={`${baseId}-tab-${route.id}`}
                  aria-selected={selected}
                  aria-controls={`${baseId}-panel`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(route.id)}
                  onKeyDown={(event) => onTabKey(event, index)}
                  className={`min-h-14 rounded-md border px-4 py-2 text-center transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${
                    selected
                      ? "border-accent bg-accent-soft text-accent-ink"
                      : "border-border bg-surface text-ink hover:bg-surface-raised"
                  }`}
                >
                  <span className="block text-sm font-medium">{route.label}</span>
                  {range && (
                    <span
                      className={`mt-0.5 block text-xs tabular-nums ${
                        selected ? "text-accent-ink" : "text-ink-soft"
                      }`}
                    >
                      <span className="sr-only">Score </span>
                      {range}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {unavailable.length > 0 && (
            <p className="mt-2 text-xs text-ink-soft">Not available here: {unavailable.join("; ")}.</p>
          )}

          {current.shortfall && (
            <p className="mt-4 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
              {current.shortfall}
            </p>
          )}

          <div
            role="tabpanel"
            id={`${baseId}-panel`}
            aria-labelledby={`${baseId}-tab-${current.id}`}
            className="mt-2 rounded-lg border border-border bg-surface p-5"
          >
            <RoutePanel
              // Remounted per route, so a half-typed repository does not leak
              // into another route's panel and back.
              key={current.id}
              route={current}
              jobId={jobId}
              domain={domain}
              actions={actions}
              pluginHref={pluginHref}
              writing={writing}
            />
          </div>
        </>
      )}

      <div className="mt-6">
        <PendingDownload href={reportHref} filename="report.html" className={PRIMARY}>
          Download the full report
        </PendingDownload>
      </div>
    </section>
  );
}
