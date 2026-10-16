"use client";

/**
 * The account's Lead Qualification campaigns that are still sending, each
 * with Pause / Resume and Cancel, plus a "Stop all" above them.
 *
 * ## Why it earns `"use client"`
 *
 * The same three reasons as `CampaignControls`, now per row: a cancel asks
 * first (it cannot be undone and it stops real email), each button reports
 * its own answer beside itself, and each shows its own pending state. After a
 * confirmed change it calls `router.refresh()` so the list is re-read on the
 * server — the island never fetches.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignAction, ControlResult, LiveCampaign } from "@/lib/data/campaign-controls";
import { Panel } from "@/components/agents/dashboard/parts";
import { Spinner } from "@/components/ui/spinner";
import { formatCount } from "@/lib/format";

const BUTTON =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "disabled:opacity-60";
const QUIET = `${BUTTON} border border-border text-ink hover:bg-surface-raised`;
const DANGER_OUTLINE = `${BUTTON} border border-crit/40 text-crit hover:bg-crit-soft`;
const DANGER = `${BUTTON} bg-crit text-surface`;
const PILL = "inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold";

function Result({ result }: { result: ControlResult | null }) {
  if (result === null) return null;
  return (
    <p
      role="status"
      className={`rounded-md px-3 py-2 text-sm ${result.ok ? "bg-good-soft text-good" : "bg-crit-soft text-crit"}`}
    >
      {result.message}
    </p>
  );
}

function statusTone(status: string): string {
  if (status === "paused") return "bg-warn-soft text-warn";
  if (status === "running" || status === "sending") return "bg-good-soft text-good";
  return "bg-surface-raised text-ink-soft";
}

function statusWord(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

/** "Started 14 Oct" in UTC, so server and browser print the same text. */
function startedLabel(createdAt: string | null): string | null {
  if (createdAt === null) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return `Started ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`;
}

function CampaignRow({
  job,
  onControl,
}: {
  job: LiveCampaign;
  onControl: (jobId: string, action: CampaignAction) => Promise<ControlResult>;
}) {
  const router = useRouter();
  const [result, setResult] = useState<ControlResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<CampaignAction | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: CampaignAction) {
    setBusy(action);
    setConfirming(false);
    startTransition(async () => {
      const answer = await onControl(job.jobId, action);
      setResult(answer);
      setBusy(null);
      if (answer.ok) router.refresh();
    });
  }

  const paused = job.status === "paused";
  const share = job.total !== null && job.total > 0 && job.sent !== null ? Math.min(1, job.sent / job.total) : null;
  const started = startedLabel(job.createdAt);
  const title = job.name ?? "Outreach campaign";

  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate font-medium text-ink" title={title}>
              {title}
            </p>
            <span className={`${PILL} ${statusTone(job.status)}`}>{statusWord(job.status)}</span>
          </div>

          {share !== null && (
            <div
              className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-surface-raised"
              role="progressbar"
              aria-label={`${title}: emails sent`}
              aria-valuemin={0}
              aria-valuemax={job.total ?? 0}
              aria-valuenow={job.sent ?? 0}
            >
              <div className="h-full rounded-full bg-accent" style={{ width: `${share * 100}%` }} />
            </div>
          )}

          <p className="mt-1.5 text-sm text-ink-soft tabular-nums">
            {[
              job.sent !== null && job.total !== null
                ? `${formatCount(job.sent)} of ${formatCount(job.total)} sent`
                : job.sent !== null
                  ? `${formatCount(job.sent)} sent`
                  : null,
              job.pending !== null ? `${formatCount(job.pending)} waiting` : null,
              job.failed !== null && job.failed > 0 ? `${formatCount(job.failed)} failed` : null,
              started,
            ]
              .filter(Boolean)
              .join(" · ") || "Progress not reported yet"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(paused ? "resume" : "pause")}
            className={QUIET}
          >
            {(busy === "pause" || busy === "resume") && <Spinner />}
            {busy === "pause" ? "Pausing…" : busy === "resume" ? "Resuming…" : paused ? "Resume" : "Pause"}
          </button>
          {confirming ? (
            <>
              <button type="button" disabled={pending} onClick={() => run("cancel")} className={DANGER}>
                {busy === "cancel" && <Spinner />}
                {busy === "cancel" ? "Cancelling…" : "Yes, cancel it"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className={`${BUTTON} text-ink-soft hover:bg-surface-raised`}
              >
                Keep running
              </button>
            </>
          ) : (
            <button type="button" disabled={pending} onClick={() => setConfirming(true)} className={DANGER_OUTLINE}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {confirming && (
        <p className="rounded-md bg-crit-soft px-3 py-2 text-sm text-crit">
          Cancelling stops this campaign for everyone not emailed yet. It can&apos;t be restarted.
        </p>
      )}
      <Result result={result} />
    </li>
  );
}

export function LiveCampaigns({
  jobs,
  onControl,
  onStopAll,
}: {
  jobs: LiveCampaign[];
  onControl: (jobId: string, action: CampaignAction) => Promise<ControlResult>;
  onStopAll: () => Promise<ControlResult>;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ControlResult | null>(null);
  const [pending, startTransition] = useTransition();

  function stopAll() {
    setConfirming(false);
    startTransition(async () => {
      const answer = await onStopAll();
      setResult(answer);
      if (answer.ok) router.refresh();
    });
  }

  const action =
    jobs.length === 0 ? null : confirming ? (
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={stopAll} className={DANGER}>
          Yes, stop all
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className={`${BUTTON} text-ink-soft hover:bg-surface-raised`}
        >
          Keep sending
        </button>
      </div>
    ) : (
      <button type="button" disabled={pending} onClick={() => setConfirming(true)} className={DANGER_OUTLINE}>
        {pending && <Spinner />}
        {pending ? "Stopping…" : "Stop all"}
      </button>
    );

  return (
    <Panel
      title="Campaigns sending now"
      hint={
        jobs.length === 0
          ? "No campaigns are sending right now."
          : jobs.length === 1
            ? "1 campaign is emailing your leads."
            : `${jobs.length} campaigns are emailing your leads.`
      }
      action={action}
    >
      {confirming && (
        <p className="rounded-md bg-crit-soft px-3 py-2 text-sm text-crit">
          This stops every campaign below for everyone not emailed yet. It can&apos;t be undone.
        </p>
      )}
      <Result result={result} />
      {jobs.length > 0 && (
        <ul className="divide-y divide-border">
          {jobs.map((job) => (
            <CampaignRow key={job.jobId} job={job} onControl={onControl} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
