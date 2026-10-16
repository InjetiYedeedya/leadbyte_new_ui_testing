import { webHref } from "@/lib/data/profile-display";
import { formatCount } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionUnavailableState } from "@/components/ui/states";
import {
  sectionFailed,
  type AgentDashboard as AgentDashboardData,
  type KpiFigure,
} from "@/lib/data/agent-dashboard";
import { humaniseOr } from "@/lib/data/labels";

/**
 * One agent's performance, from its own dashboard tables.
 *
 * A Server Component: it renders figures that were read on the server and owns
 * no interaction. Only the picker beside it is a client island.
 *
 * ## Empty is not the same as broken
 *
 * Every section branches on the table's `SourceOutcome` before its rows. A
 * table that answered with nothing means the customer has not run that agent;
 * a table that could not be read means we do not know. Showing "nothing yet"
 * for the second is a confident lie, and the reader's next move — go and run
 * the agent — is the wrong one.
 */

/** A figure, or an em dash. Sentence-case label, not a shouted micro-caption. */
function Figure({ figure }: { figure: KpiFigure }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <div className="text-xs text-ink-soft">{figure.label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-ink">
        {figure.value === null ? "—" : formatCount(figure.value)}
      </div>
    </div>
  );
}

function Figures({ figures }: { figures: KpiFigure[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {figures.map((figure) => (
        <Figure key={figure.label} figure={figure} />
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {children}
    </section>
  );
}

/** A count, right-aligned and tabular so a column of them lines up. */
function Count({ value }: { value: number | null }) {
  return (
    <td className="px-3 py-2 text-right tabular-nums text-ink">
      {value === null ? "—" : formatCount(value)}
    </td>
  );
}

export function AgentDashboard({ dashboard }: { dashboard: AgentDashboardData }) {
  const failure = sectionFailed(dashboard);
  const hasAnything =
    dashboard.kpis.some((kpi) => kpi.value !== null && kpi.value !== 0) ||
    dashboard.activity.length > 0 ||
    dashboard.posts.length > 0 ||
    dashboard.keywords.length > 0 ||
    dashboard.competitors.length > 0;

  // Only when there is nothing else to show: one table failing used to hide
  // everything that DID load. And never the backend's own words — it printed
  // "Could not resolve userId to email" to customers (seen live, 2026-09-29).
  // The detail belongs in the server log, which `readTable` already writes.
  if (failure !== null && !hasAnything) {
    return (
      <SectionUnavailableState
        label="This agent's dashboard"
        reason="We couldn't load this agent's figures just now. Reload the page in a moment."
      />
    );
  }

  const { agentId, kpis, posts, keywords, competitors, activity } = dashboard;
  const shown = kpis.filter((figure) => figure.value !== null);

  const nothing =
    kpis.every((k) => k.value === null) &&
    posts.length === 0 &&
    keywords.length === 0 &&
    competitors.length === 0 &&
    activity.length === 0;

  if (nothing) {
    return (
      <EmptyState
        title="Nothing to report yet"
        description="This agent hasn't produced any results for this account."
        note="Once it runs, its figures appear here automatically."
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Only the figures we can actually fill.
          `mapLeadQualification` returns a slot per field the backend defines,
          and one of them — sales-team sends — has no source in any table this
          screen can read: it exists only as a column on a `lead_qualification`
          row, and an account without that row can never fill it. A box that
          can only ever hold an em dash is not information, it reads as a
          broken panel. A figure appears when there is a figure. */}
      {shown.length > 0 && (
        <Section
          title={agentId === "lead-qualification" ? "Lead outreach" : "Outreach"}
        >
          <Figures figures={shown} />
        </Section>
      )}

      {activity.length > 0 && (
        <Section title="Lead activity">
          {/* Counted from the rows on screen, not read from the KPI table —
              which is empty for accounts that have plenty of activity. The
              label says "leads contacted" rather than restating a figure the
              backend never sent. */}
          {/* Counted from the rows on screen. Bounces are shown because an
              outreach number without them overstates what landed — 7 of these
              124 never arrived. */}
          <Figures
            figures={[
              { label: "Leads contacted", value: activity.length },
              {
                label: "Opened at least once",
                value: activity.filter((row) => row.opens > 0).length,
              },
              {
                label: "Clicked a link",
                value: activity.filter((row) => row.clicks > 0).length,
              },
              {
                label: "Bounced or failed",
                value: activity.filter((row) => row.failed).length,
              },
            ]}
          />
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {activity.slice(0, 8).map((row) => (
              <div
                key={row.rowId}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-ink">{row.leadEmail}</span>
                <span className="shrink-0 text-xs text-ink-soft">{humaniseOr(row.status)}</span>
                <span className="shrink-0 text-xs tabular-nums text-ink-soft">
                  {formatCount(row.opens)} {row.opens === 1 ? "open" : "opens"}
                </span>
              </div>
            ))}
          </div>
          {activity.length > 8 && (
            <p className="text-xs text-ink-soft">
              Showing 8 of {formatCount(activity.length)}. The agent&apos;s own screen
              has the full list.
            </p>
          )}
        </Section>
      )}

      {posts.length > 0 && (
        <Section title="Recent posts">
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {posts.map((post, index) => (
              <div
                key={`${post.platform}-${post.link}-${index}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm"
              >
                <span className="min-w-0 shrink-0 font-medium text-ink">
                  {post.platform}
                </span>
                {/* A raw anchor: the post is on someone else's site, and
                    `next/link` is only for pages of ours. */}
                {post.link !== "" && (
                  <a
                    href={webHref(post.link)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-accent-ink hover:underline"
                  >
                    {post.link}
                  </a>
                )}
                <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-soft">
                  {post.likes === null ? "—" : formatCount(post.likes)} likes ·{" "}
                  {post.comments === null ? "—" : formatCount(post.comments)} comments ·{" "}
                  {post.audience === null ? "—" : formatCount(post.audience)}{" "}
                  {post.audienceLabel.toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {keywords.length > 0 && (
        <Section title="Keywords">
          <div className="overflow-x-auto rounded-lg border border-border scroll-x-hint">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-ink-soft">
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Keyword
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Priority
                  </th>
                  <th scope="col" className="w-28 px-3 py-2 text-right font-medium">
                    Search volume
                  </th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((row) => (
                  <tr key={row.keyword} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 text-ink">{row.keyword}</td>
                    <td className="px-3 py-2 text-ink-soft">
                      {row.priority === "" ? "—" : row.priority}
                    </td>
                    <Count value={row.searchVolume} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {competitors.length > 0 && (
        <Section title="Competitors">
          <div className="overflow-x-auto rounded-lg border border-border scroll-x-hint">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-ink-soft">
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Competitor
                  </th>
                  <th scope="col" className="w-28 px-3 py-2 text-right font-medium">
                    Authority
                  </th>
                  <th scope="col" className="w-32 px-3 py-2 text-right font-medium">
                    Referring domains
                  </th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((row) => (
                  <tr key={row.name} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 text-ink">{row.name}</td>
                    <Count value={row.authorityScore} />
                    <Count value={row.referringDomains} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
