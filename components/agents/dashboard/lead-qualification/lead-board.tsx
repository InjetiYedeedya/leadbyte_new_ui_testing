"use client";

/**
 * The Lead Qualification pipeline and the leads table beneath it.
 *
 * ## Why this earns `"use client"`
 *
 * The pipeline bars and the score chips are FILTERS on the table, so the
 * panels and the table share one piece of state; add the search box, the
 * filter panel, the CSV download (a Blob made in the browser) and the lead
 * drawer, and none of it is expressible as a form post. It never fetches: the
 * leads arrive already mapped, from the tab's server read.
 *
 * ## What each figure is a share of
 *
 * Every pipeline bar is a share of ALL leads — the rows plus the leads still
 * queued in runs in progress — so the bars can be compared with each other.
 * A funnel where each stage is a share of the one above reads well and cannot
 * be compared at all: "50% replied" of 4 opened looks like a triumph.
 * Outreach's open rate is the one exception, and it says so: of leads emailed.
 */

import { useMemo, useRef, useState } from "react";
import { DownloadSimple, FunnelSimple, MagnifyingGlass } from "@phosphor-icons/react";
import { Panel } from "@/components/agents/dashboard/parts";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  NO_FILTERS,
  SCORE_GROUP_LABEL,
  anyFilter,
  distinctValues,
  extraFilterCount,
  filterLeads,
  leadsToCsv,
  statusLabel,
  type Lead,
  type LeadFilters,
  type Pipeline,
  type PipelineStage,
} from "@/lib/data/dashboard/lead-pipeline";
import { formatShare, ratio } from "@/lib/data/dashboard/fields";
import { countOf, formatCount } from "@/lib/format";
import { LeadDrawer } from "./lead-drawer";
import { SCORE_FILL, SCORE_TONE, ScorePill, StatusPill } from "./lead-pills";

const CONTROL =
  "rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent";
const BUTTON =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40";

/* ---------- pipeline ---------- */

type StageTone = "accent" | "info" | "good";
const FILL: Record<StageTone, string> = { accent: "bg-accent", info: "bg-info", good: "bg-good" };

/**
 * A bar that is also a filter. `BarRow`'s look, rebuilt in spans because a
 * `<button>` may only hold phrasing content and `BarRow` is divs.
 */
function StageBar({
  label,
  value,
  total,
  tone,
  pressed,
  onPress,
  hint,
}: {
  label: string;
  value: number;
  total: number;
  tone: StageTone;
  pressed: boolean;
  onPress: () => void;
  hint: string;
}) {
  const share = ratio(value, total);
  const width = value > 0 && share !== null ? Math.max(1.5, Math.min(1, share) * 100) : 0;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      title={hint}
      className={`group -mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-1.5 text-left transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
        pressed ? "bg-accent-soft/60 ring-1 ring-accent/40" : ""
      }`}
    >
      <span className="flex items-baseline justify-between gap-3 text-sm">
        <span className={`min-w-0 truncate ${pressed ? "font-semibold text-accent-ink" : "text-ink"}`}>{label}</span>
        <span className="shrink-0 tabular-nums text-ink">
          <span className="font-semibold">{formatCount(value)}</span>
          <span className="ml-1.5 text-xs text-ink-soft">{formatShare(share)}</span>
        </span>
      </span>
      <span aria-hidden="true" className="mt-1 block h-2 overflow-hidden rounded-full bg-border/60">
        <span
          className={`block h-full origin-left rounded-full ${FILL[tone]} motion-safe:animate-[bar-grow_0.5s_cubic-bezier(0.16,1,0.3,1)]`}
          style={{ width: `${width}%` }}
        />
      </span>
    </button>
  );
}

const STAGES: {
  stage: PipelineStage;
  label: string;
  key: "contacted" | "opened" | "replied" | "sales";
  tone: StageTone;
}[] = [
  { stage: "contacted", label: "Contacted", key: "contacted", tone: "accent" },
  { stage: "opened", label: "Opened", key: "opened", tone: "accent" },
  { stage: "replied", label: "Replied", key: "replied", tone: "info" },
  // The furthest a lead goes in this data, so it takes the outcome colour.
  { stage: "sales", label: "Sent to sales", key: "sales", tone: "good" },
];

/* ---------- score mix ---------- */

type Scored = "hot" | "warm" | "cold";
const SCORED: Scored[] = ["hot", "warm", "cold"];

function ScoreMix({
  pipeline,
  leadCount,
  active,
  onPick,
}: {
  pipeline: Pipeline;
  leadCount: number;
  active: Scored | null;
  onPick: (group: Scored) => void;
}) {
  const { score } = pipeline;
  const words = `${SCORED.map((g) => `${SCORE_GROUP_LABEL[g]} ${score[g]}`).join(", ")}${
    score.unscored > 0 ? `, not scored ${score.unscored}` : ""
  }`;
  return (
    <Panel
      title="Score mix"
      hint={score.unscored > 0 ? `${countOf(score.unscored, "lead")} not scored yet` : "Hot 70+, warm 40–69, cold under 40"}
    >
      <div role="img" aria-label={words} className="flex h-3 overflow-hidden rounded-full bg-border/60">
        {leadCount > 0 &&
          (["hot", "warm", "cold", "unscored"] as const).map((group) =>
            score[group] > 0 ? (
              <span key={group} className={`h-full ${SCORE_FILL[group]}`} style={{ width: `${(score[group] / leadCount) * 100}%` }} />
            ) : null,
          )}
      </div>
      <div className="flex flex-wrap gap-2">
        {SCORED.map((group) => (
          <button
            key={group}
            type="button"
            aria-pressed={active === group}
            onClick={() => onPick(group)}
            title={`Show only ${SCORE_GROUP_LABEL[group].toLowerCase()} leads`}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              active === group
                ? `border-transparent ${SCORE_TONE[group]} font-semibold ring-1 ring-current`
                : "border-border bg-surface text-ink hover:bg-surface-raised"
            }`}
          >
            <span aria-hidden="true" className={`size-2 rounded-full ${SCORE_FILL[group]}`} />
            {SCORE_GROUP_LABEL[group]}
            <span className="tabular-nums font-semibold">{formatCount(score[group])}</span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function Outreach({ pipeline }: { pipeline: Pipeline }) {
  const rate = ratio(pipeline.opened, pipeline.contacted);
  return (
    <Panel title="Outreach" hint={`${countOf(pipeline.emailsSent, "email")} sent in all`}>
      <dl className="grid grid-cols-3 gap-3">
        {[
          ["Sent", formatCount(pipeline.contacted), "leads emailed"],
          ["Opened", formatCount(pipeline.opened), "leads"],
          ["Open rate", formatShare(rate), "of leads emailed"],
        ].map(([label, value, note]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-ink-soft">{label}</dt>
            <dd className="mt-0.5 text-xl font-bold tabular-nums tracking-tight text-ink">{value}</dd>
            <dd className="text-xs text-ink-soft">{note}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/* ---------- filters ---------- */

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-ink-soft">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={CONTROL}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function download(leads: readonly Lead[]) {
  // The BOM is what makes Excel read the file as UTF-8 rather than mangling
  // every accented name in it.
  const blob = new Blob(["﻿", leadsToCsv(leads)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* ---------- the board ---------- */

export function LeadBoard({ leads, pipeline }: { leads: Lead[]; pipeline: Pipeline }) {
  const [filters, setFilters] = useState<LeadFilters>(NO_FILTERS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // The View button that opened the drawer, so focus can go back to it.
  const trigger = useRef<HTMLButtonElement | null>(null);

  const shown = useMemo(() => filterLeads(leads, filters), [leads, filters]);
  const statuses = useMemo(() => distinctValues(leads, (l) => l.status), [leads]);
  const templates = useMemo(() => distinctValues(leads, (l) => l.template), [leads]);
  const extra = extraFilterCount(filters);
  const filtering = anyFilter(filters);
  const selected = openId === null ? null : (leads.find((l) => l.id === openId) ?? null);

  const set = <K extends keyof LeadFilters>(key: K, value: LeadFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const columns: Column<Lead>[] = [
    {
      key: "name",
      header: "Lead name",
      cell: (l) => (l.name ? <span className="font-medium">{l.name}</span> : <span className="text-ink-soft">—</span>),
      sortValue: (l) => l.name.toLowerCase(),
    },
    {
      key: "email",
      header: "Email",
      cell: (l) => (
        <span className="block max-w-[14rem] truncate text-ink-soft" title={l.email}>
          {l.email || "—"}
        </span>
      ),
      sortValue: (l) => l.email.toLowerCase(),
    },
    { key: "status", header: "Status", cell: (l) => <StatusPill status={l.status} />, sortValue: (l) => l.status.toLowerCase() },
    {
      key: "score",
      header: "Score",
      cell: (l) => <ScorePill score={l.score} group={l.scoreGroup} />,
      sortValue: (l) => l.score ?? -1,
    },
    { key: "sent", header: "Emails sent", cell: (l) => formatCount(l.emailsSent), sortValue: (l) => l.emailsSent, numeric: true },
    {
      key: "lastSent",
      header: "Last sent",
      cell: (l) => <span className="whitespace-nowrap tabular-nums">{l.lastSentLabel || "—"}</span>,
      sortValue: (l) => l.lastSentAt ?? 0,
    },
    {
      key: "view",
      header: "Details",
      cell: (l) => (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`View ${l.name || l.email}`}
          onClick={(event) => {
            trigger.current = event.currentTarget;
            setOpenId(l.id);
          }}
          className="rounded-md border border-border px-3 py-1 text-xs font-medium text-ink transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          View
        </button>
      ),
    },
  ];

  const leadRows = leads.length;
  const countLine = filtering
    ? `${formatCount(shown.length)} of ${formatCount(leadRows)} match your filters`
    : `${formatCount(leadRows)} total`;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel
          title="Pipeline"
          hint={`Share of all ${countOf(pipeline.total, "lead")}. Choose a stage to filter the table.`}
          action={
            pipeline.runsInProgress > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-info-soft px-2 py-0.5 text-xs font-semibold text-info">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-info motion-safe:animate-pulse" />
                {pipeline.queued > 0 ? `${formatCount(pipeline.queued)} queued` : "Run in progress"}
              </span>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-1">
            <StageBar
              label="All leads"
              value={pipeline.total}
              total={pipeline.total}
              tone="accent"
              pressed={filters.stage === null}
              onPress={() => set("stage", null)}
              hint={
                pipeline.queued > 0
                  ? `Includes ${countOf(pipeline.queued, "lead")} still queued, not yet in the table`
                  : "Show every stage"
              }
            />
            {STAGES.map(({ stage, label, key, tone }) => (
              <StageBar
                key={stage}
                label={label}
                value={pipeline[key]}
                total={pipeline.total}
                tone={tone}
                pressed={filters.stage === stage}
                onPress={() => set("stage", filters.stage === stage ? null : stage)}
                hint={filters.stage === stage ? "Clear this filter" : `Show only leads ${label.toLowerCase()}`}
              />
            ))}
          </div>
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          <ScoreMix
            pipeline={pipeline}
            leadCount={leadRows}
            active={filters.score}
            onPick={(group) => set("score", filters.score === group ? null : group)}
          />
          <Outreach pipeline={pipeline} />
        </div>
      </div>

      <section aria-labelledby="leads-title" className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        {/* Title, search and the two controls on ONE line: they are all about
            the same table, and on two lines the search box read as belonging
            to the filter panel under it rather than to the leads above. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h4 id="leads-title" className="text-base font-bold text-ink">
              Leads
            </h4>
            <p aria-live="polite" className="mt-0.5 text-xs tabular-nums text-ink-soft">
              {countLine}
            </p>
          </div>

          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <label className="relative min-w-0 flex-1 basis-56 @3xl:max-w-sm">
            <span className="sr-only">Search leads</span>
            <MagnifyingGlass
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
            />
            <input
              type="search"
              value={filters.query}
              onChange={(e) => set("query", e.target.value)}
              placeholder="Search name, email, status, subject or reply"
              className={`${CONTROL} w-full pl-9 placeholder:text-ink-soft`}
            />
          </label>
          <button
            type="button"
            onClick={() => download(shown)}
            disabled={shown.length === 0}
            title={`Download the ${countOf(shown.length, "lead")} shown as a CSV file`}
            className={BUTTON}
          >
            <DownloadSimple size={16} aria-hidden="true" />
            Export CSV
          </button>
          <button
            type="button"
            aria-expanded={panelOpen}
            aria-controls="lead-filters"
            onClick={() => setPanelOpen((open) => !open)}
            className={BUTTON}
          >
            <FunnelSimple size={16} aria-hidden="true" />
            Filters
            {extra > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-xs font-semibold tabular-nums text-surface">
                {extra}
                <span className="sr-only"> active</span>
              </span>
            )}
          </button>
          {filtering && (
            <button
              type="button"
              onClick={() => setFilters(NO_FILTERS)}
              className="rounded-md px-2 py-2 text-sm font-medium text-accent-ink transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent"
            >
              Clear all
            </button>
          )}
          </div>
        </div>

        {panelOpen && (
          <div
            id="lead-filters"
            className="grid grid-cols-1 gap-3 rounded-md border border-border bg-ground p-3 @sm:grid-cols-2 @2xl:grid-cols-3"
          >
            <Select
              label="Status"
              value={filters.status}
              onChange={(v) => set("status", v)}
              options={[["", "Any status"], ...statuses.map((s) => [s, statusLabel(s)] as const)]}
            />
            <Select
              label="Reply"
              value={filters.reply}
              onChange={(v) => set("reply", v as LeadFilters["reply"])}
              options={[
                ["", "Any"],
                ["replied", "Replied"],
                ["not-replied", "No reply yet"],
              ]}
            />
            <Select
              label="Sales"
              value={filters.sales}
              onChange={(v) => set("sales", v as LeadFilters["sales"])}
              options={[
                ["", "Any"],
                ["yes", "Sent to sales"],
                ["no", "Not sent to sales"],
              ]}
            />
            <Select
              label="Template"
              value={filters.template}
              onChange={(v) => set("template", v)}
              options={[["", "Any template"], ...templates.map((t) => [t, t] as const)]}
            />
            <label className="flex min-w-0 flex-col gap-1 text-xs text-ink-soft">
              From date
              <input
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(e) => set("from", e.target.value)}
                className={CONTROL}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs text-ink-soft">
              To date
              <input
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(e) => set("to", e.target.value)}
                className={CONTROL}
              />
            </label>
          </div>
        )}

        <DataTable
          rows={shown}
          columns={columns}
          rowKey={(l) => l.id}
          caption="Leads"
          pageSize={25}
          empty={
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
              <p className="text-sm font-medium text-ink">No leads match these filters.</p>
              <button
                type="button"
                onClick={() => setFilters(NO_FILTERS)}
                className="mt-2 rounded-md px-2 py-1 text-sm font-medium text-accent-ink transition hover:bg-surface-raised"
              >
                Clear all filters
              </button>
            </div>
          }
        />
      </section>

      <LeadDrawer
        lead={selected}
        onClose={() => {
          setOpenId(null);
          // After the dialog has let go of focus, not during.
          const button = trigger.current;
          requestAnimationFrame(() => button?.focus());
        }}
      />
    </>
  );
}
