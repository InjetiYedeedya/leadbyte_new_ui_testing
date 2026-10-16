import type { Metadata } from "next";
import { GetForm, GetFormSubmit } from "@/components/ui/get-form";
import Link from "@/components/ui/app-link";
import { Suspense } from "react";
import { CheckCircle } from "@phosphor-icons/react/ssr";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { PageLoading } from "@/components/ui/page-loading";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { ActionResult, AdminStat, ReadFailed, param, withParams } from "@/components/admin/admin-ui";
import { adminCan, requirePermission } from "@/lib/admin/access";
import { scanTable } from "@/lib/admin/data";
import { ADMIN_TABLES } from "@/lib/admin/tables";
import {
  SEVERITIES,
  errorCategories,
  errorStats,
  filterErrors,
  groupBySeverity,
  normalizeErrors,
  readErrorFilters,
  type AdminError,
  type Severity,
} from "@/lib/admin/errors";
import { formatCount } from "@/lib/format";
import { clearError } from "../actions";

export const metadata: Metadata = { title: "Errors · Admin · LeadByte" };

type Params = Promise<Record<string, string | string[] | undefined>>;

const SEVERITY: Record<Severity, { label: string; variant: BadgeVariant }> = {
  CRITICAL: { label: "Critical", variant: "severity-critical" },
  HIGH: { label: "High", variant: "severity-high" },
  MEDIUM: { label: "Medium", variant: "severity-medium" },
  LOW: { label: "Low", variant: "severity-low" },
};

/**
 * Cards drawn per severity column, newest first. Every error was drawn at
 * once, each with its own clear-form, and on the live site the error log is
 * large enough that the page never finished — "This screen couldn't load:
 * Connection closed" (seen live, 2026-09-29). The counts stay complete; the
 * filters narrow to anything older.
 */
const PER_COLUMN = 30;

const CONTROL =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent";

export default function AdminErrorsPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<PageLoading title="Errors" />}>
      <ErrorsBody searchParams={searchParams} />
    </Suspense>
  );
}

async function ErrorsBody({ searchParams }: { searchParams: Params }) {
  const me = await requirePermission("errors", "read");
  const canWrite = await adminCan(me, "errors", "write");
  const params = await searchParams;
  const read = await scanTable(ADMIN_TABLES.errorNotifications);
  const all = normalizeErrors(read.rows);
  const filters = readErrorFilters(params);
  const shown = filterErrors(all, filters);
  const stats = errorStats(shown);
  const groups = groupBySeverity(shown);
  const categories = errorCategories(all);
  const filtering =
    filters.q !== "" || filters.from !== "" || filters.to !== "" || filters.status !== "all" || filters.category !== "all";
  const here = withParams("/admin/errors", { ...filters }, {});

  return (
    <PageContainer>
      <PageHeader title="Errors" description="Workflow failures reported by the agents, by severity." />
      <ActionResult notice={param(params, "notice")} error={param(params, "error")} />
      {!read.ok && <ReadFailed what="the error log" />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat label="Total flagged" value={formatCount(stats.total)} note={filtering ? "Matching the filters" : undefined} />
        <AdminStat label="Pending review" value={formatCount(stats.pending)} tone={stats.pending > 0 ? "warn" : "neutral"} note="Not yet cleared" />
        <AdminStat label="High / critical" value={formatCount(stats.highOrCritical)} tone={stats.highOrCritical > 0 ? "crit" : "neutral"} />
        <AdminStat label="Medium issues" value={formatCount(stats.medium)} tone={stats.medium > 0 ? "warn" : "neutral"} />
      </div>

      {/* A GET form: the filters live in the URL, so a filtered board can be
          reloaded or sent to whoever is fixing the workflow. */}
      <GetForm
        action="/admin/errors"
        className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] lg:items-end"
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
          Search
          <input name="q" type="search" defaultValue={filters.q} placeholder="Error id, agent, workflow or message…" suppressHydrationWarning className={CONTROL} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
          From
          <input name="from" type="date" defaultValue={filters.from} suppressHydrationWarning className={CONTROL} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
          To
          <input name="to" type="date" defaultValue={filters.to} suppressHydrationWarning className={CONTROL} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
          Status
          <select name="status" defaultValue={filters.status} suppressHydrationWarning className={CONTROL}>
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="cleared">Cleared</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
          Agent
          <select name="category" defaultValue={filters.category} suppressHydrationWarning className={CONTROL}>
            <option value="all">All agents</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <GetFormSubmit pendingLabel="Applying…" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink">
            Apply
          </GetFormSubmit>
          {filtering && (
            <Link href="/admin/errors" className="rounded-md border border-border px-3 py-2 text-sm text-ink hover:bg-surface-raised">
              Reset
            </Link>
          )}
        </div>
      </GetForm>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {SEVERITIES.map((severity) => (
          <section key={severity} aria-labelledby={`col-${severity}`} className="flex flex-col gap-2 rounded-lg border border-border bg-ground p-3">
            <header className="flex items-center justify-between">
              <h2 id={`col-${severity}`} className="flex items-center gap-2 text-sm font-bold text-ink">
                <Badge variant={SEVERITY[severity].variant}>{SEVERITY[severity].label}</Badge>
              </h2>
              <span className="text-xs tabular-nums text-ink-soft">{groups[severity].length}</span>
            </header>
            {groups[severity].length === 0 ? (
              <p className="py-4 text-center text-xs text-ink-soft">Nothing here.</p>
            ) : (
              <>
                {groups[severity].slice(0, PER_COLUMN).map((error) => (
                  <ErrorCard key={error.id} error={error} back={here} canWrite={canWrite} />
                ))}
                {groups[severity].length > PER_COLUMN && (
                  <p className="py-2 text-center text-xs text-ink-soft">
                    Showing the newest {PER_COLUMN} of {formatCount(groups[severity].length)}. Use the
                    filters above to find older ones.
                  </p>
                )}
              </>
            )}
          </section>
        ))}
      </div>
    </PageContainer>
  );
}

function ErrorCard({ error, back, canWrite }: { error: AdminError; back: string; canWrite: boolean }) {
  return (
    <article className={`flex flex-col gap-2 rounded-md border border-border bg-surface p-3 ${error.cleared ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="neutral">{error.category}</Badge>
        <Badge variant={error.cleared ? "issue-cleared" : "issue-open"}>{error.cleared ? "Cleared" : "Open"}</Badge>
      </div>
      <p className="text-sm text-ink [overflow-wrap:anywhere]">{error.summary}</p>
      {error.workflow && <p className="text-xs font-medium text-ink-soft">Workflow: {error.workflow}</p>}
      <p className="flex flex-wrap gap-x-2 text-xs text-ink-soft">
        {error.errorId && <span className="font-mono">{error.errorId}</span>}
        {error.at !== null && <span>{error.atLabel} IST</span>}
      </p>
      <div className="border-t border-border pt-2">
        {error.cleared ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-good">
            <CheckCircle aria-hidden="true" className="size-4" /> Issue cleared
          </span>
        ) : !canWrite ? null : error.errorId ? (
          <form action={clearError}>
            <input type="hidden" name="errorId" value={error.errorId} />
            <input type="hidden" name="back" value={back} />
            <SubmitButton
              pendingLabel="Clearing…"
              className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-raised"
            >
              <CheckCircle aria-hidden="true" className="size-4" /> Mark issue cleared
            </SubmitButton>
          </form>
        ) : (
          <span className="text-xs text-ink-soft">No id stored, so this can&apos;t be cleared from here.</span>
        )}
      </div>
    </article>
  );
}
