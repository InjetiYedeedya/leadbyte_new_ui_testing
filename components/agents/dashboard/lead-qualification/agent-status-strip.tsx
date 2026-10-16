import Link from "@/components/ui/app-link";
import {
  agentStateOf,
  statusLabel,
  timeAgo,
  type LeadAgentSettings,
} from "@/lib/data/dashboard/lead-pipeline";
import { webHref } from "@/lib/data/profile-display";

/**
 * The agent's own state, above everything else on the tab and in every state
 * of it — failed, empty or full. "Is it even running?" is the first question
 * on arrival, and the answer does not depend on whether any leads exist yet.
 *
 * A Server Component: "2d ago" is worked out once, here, so the server and the
 * browser can never print two different ages.
 */

const EXTERNAL = { target: "_blank", rel: "noopener noreferrer" } as const;
const LINK = "font-medium text-accent-ink underline-offset-2 hover:underline";

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-ink">{children}</dd>
    </div>
  );
}

export function AgentStatusStrip({
  settings,
  ok,
  now = Date.now(),
  action,
  heading,
}: {
  settings: LeadAgentSettings | null;
  /** False when the settings could not be read — which is not the same as "not configured". */
  ok: boolean;
  now?: number;
  /** The tab's primary control, shown at the end of the strip. */
  action?: React.ReactNode;
  /** The tab's name, first in the same row as the state it describes. */
  heading?: React.ReactNode;
}) {
  if (!ok) {
    return (
      <section aria-label="Agent status" className="rounded-lg border border-border bg-surface p-4">
        {heading}
        <p className="mt-2 flex items-center gap-2 text-sm font-medium text-ink">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-warn" />
          Status unavailable
        </p>
        <p className="mt-0.5 text-xs text-ink-soft">
          Couldn&apos;t load the agent&apos;s settings. This is a connection problem — your setup is
          unchanged.
        </p>
      </section>
    );
  }

  const state = agentStateOf(settings);
  // Never colour alone: the dot is decoration and the words carry the state.
  const [dot, words] =
    state === "active"
      ? ["bg-good", "Agent active"]
      : state === "inactive"
        ? ["bg-warn", `Agent ${statusLabel(settings?.status ?? "").toLowerCase()}`]
        : ["bg-ink-soft/50", "Not configured"];

  const leadsFile = webHref(settings?.leadDatabaseUrl);
  const updated = settings?.updatedAt ?? null;

  return (
    <section
      aria-label="Agent status"
      className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-surface px-4 py-3"
    >
      {heading}

      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />
          {words}
        </p>
        {state === "not-configured" && (
          <p className="mt-0.5 text-xs text-ink-soft">
            Set the agent up to start qualifying leads.{" "}
            <Link href="/agents/lead-qualification" className={LINK}>
              Set up
            </Link>
          </p>
        )}
      </div>

      {settings && (
        <dl className="flex min-w-0 flex-1 flex-wrap gap-x-6 gap-y-3">
          {leadsFile && (
            <Item label="Lead database">
              <a href={leadsFile} {...EXTERNAL} className={LINK}>
                Download
              </a>
              {settings.leadsVersion !== null && (
                <span className="ml-1.5 text-ink-soft tabular-nums">v{settings.leadsVersion}</span>
              )}
            </Item>
          )}
          {updated !== null && (
            <Item label="Last updated">
              <time dateTime={new Date(updated).toISOString()} title={new Date(updated).toUTCString()}>
                {timeAgo(updated, now)}
              </time>
            </Item>
          )}
        </dl>
      )}

      {action && <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </section>
  );
}
