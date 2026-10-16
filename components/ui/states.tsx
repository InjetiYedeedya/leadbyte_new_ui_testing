import Link from "@/components/ui/app-link";

/**
 * The states every migrated screen must handle (brief §22).
 *
 * Each one answers two questions: why is this not showing data, and what
 * happens next. A panel that renders nothing — which is what several v1 pages
 * did before this existed — reads as a broken page rather than an empty one.
 *
 * `EmptyState` lives in ./empty-state.tsx and is re-exported here so callers
 * have one import for the whole set.
 */

export { EmptyState } from "./empty-state";

type Tone = "neutral" | "warn" | "crit";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "border-border bg-surface",
  warn: "border-warn/30 bg-warn-soft",
  crit: "border-crit/30 bg-crit-soft",
};

const TONE_TITLE: Record<Tone, string> = {
  neutral: "text-ink",
  warn: "text-warn",
  crit: "text-crit",
};

function Panel({
  tone,
  title,
  description,
  action,
}: {
  tone: Tone;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      role={tone === "neutral" ? undefined : "alert"}
      className={`flex flex-col items-center gap-2 rounded-lg border px-4 py-6 text-center ${TONE_CLASSES[tone]}`}
    >
      <p className={`text-sm font-medium ${TONE_TITLE[tone]}`}>{title}</p>
      <p className="max-w-md text-sm text-ink-soft">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * A fetch failed. Never shows the raw error — that leaks internals and tells
 * the reader nothing they can act on. The detail belongs in the server log.
 */
export function ErrorState({
  title = "Couldn't load this",
  description = "Something went wrong on our side. Try again in a moment.",
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return <Panel tone="crit" title={title} description={description} action={action} />;
}

/**
 * A background analysis is in flight and this section has nothing yet.
 *
 * Deliberately indeterminate. The backend confirmed it emits no progress
 * counters, so there is no honest percentage to show — an earlier version
 * rendered a bar that could never fill.
 */
export function AnalysingState({
  what = "your site",
  action,
}: {
  what?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface px-4 py-6 text-center"
    >
      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
        <span
          aria-hidden="true"
          className="h-2 w-2 animate-pulse rounded-full bg-accent motion-reduce:animate-none"
        />
        Analysing {what}…
      </div>
      <p className="max-w-md text-sm text-ink-soft">
        We&apos;re fetching the data — this usually takes under a minute. This page updates
        itself when it&apos;s ready.
      </p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * The analysis failed. The backend's own message is shown when it sent one —
 * these are user-facing ("Website could not be reached"), not internals.
 */
export function AnalysisFailedState({
  message,
  action,
}: {
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <Panel
      tone="crit"
      title="We couldn't analyse your site"
      description={
        message && message.trim() !== ""
          ? message
          : "Something went wrong on our side. Please try again in a few minutes."
      }
      action={action}
    />
  );
}

/**
 * One SECTION of the analysis could not be produced, while the rest of it
 * could.
 *
 * Distinct from `AnalysisFailedState` (the whole job failed) and from
 * `EmptyState` (nothing has ever been run). That distinction is the point: a
 * job that finished with its audit section missing used to render "Nobody has
 * run an audit for this account", which is false, and sends the reader off to
 * run it again against a step that is not going to work.
 *
 * `reason` is the translated sentence from `analysis-errors.ts`, never the
 * backend's raw text — the AWS diagnostic behind this belongs in the server
 * log, per the note on `ErrorState`.
 */
export function SectionUnavailableState({
  label,
  reason,
  action,
}: {
  /** What is missing, in the customer's words: "The website audit". */
  label: string;
  reason: string;
  action?: React.ReactNode;
}) {
  return (
    <Panel
      tone="warn"
      title={`${label} isn't available`}
      description={reason}
      action={action}
    />
  );
}

/** Some of the data arrived. Says which part is missing and why. */
export function PartialDataState({ missing, reason }: { missing: string; reason: string }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn"
    >
      <span className="font-medium">{missing} isn&apos;t shown.</span> {reason}
    </div>
  );
}

/** The account lacks the entitlement or role. */
export function PermissionDeniedState({
  what = "this",
  upgradeHref,
}: {
  what?: string;
  upgradeHref?: string;
}) {
  return (
    <Panel
      tone="neutral"
      title="Not included in your plan"
      description={`Your current plan doesn't include ${what}.`}
      action={
        upgradeHref && (
          <Link
            href={upgradeHref}
            className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
          >
            See plans
          </Link>
        )
      }
    />
  );
}

/** A platform has to be connected before this screen has anything to show. */
export function NotConnectedState({
  platform,
  connectHref,
}: {
  platform: string;
  connectHref?: string;
}) {
  return (
    <Panel
      tone="neutral"
      title={`${platform} isn't connected`}
      description={`Connect ${platform} and this fills in automatically.`}
      action={
        connectHref && (
          <Link
            href={connectHref}
            className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
          >
            Connect {platform}
          </Link>
        )
      }
    />
  );
}

/** The session no longer carries usable credentials. */
export function ExpiredSessionState() {
  return (
    <Panel
      tone="warn"
      title="Your session expired"
      description="Sign in again to carry on."
      action={
        <Link
          href="/login"
          className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
        >
          Sign in
        </Link>
      }
    />
  );
}
