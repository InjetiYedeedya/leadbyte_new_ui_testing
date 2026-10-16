"use client";

/**
 * Key findings on the Website audit, with the severity tabs over them.
 *
 * Client because the tabs filter the list in place. The rows arrive as
 * props; this owns only which severity is showing. Printing shows every
 * finding, whatever tab is open: a filter is a way of looking, not an edit.
 */

import { useEffect, useState } from "react";
import { ArrowRight, ChartBar, Info, Star, WarningCircle } from "@phosphor-icons/react";
import { FILTER_SEVERITIES, findingCounts, findingReach, type FilterSeverity } from "@/lib/data/audit-view";
import type { FindingSeverity, WebsiteAuditFinding } from "@/lib/data/types";
import { usePrinting } from "@/lib/use-printing";

const LOOK: Record<FindingSeverity, { tile: string; pill: string; label: string; icon: React.ReactNode }> = {
  critical: {
    tile: "bg-crit-soft text-crit",
    pill: "bg-crit-soft text-crit",
    label: "Critical",
    icon: <WarningCircle size={20} weight="fill" />,
  },
  high: {
    tile: "bg-warn-soft text-warn",
    pill: "bg-warn-soft text-warn",
    label: "High",
    icon: <ChartBar size={20} weight="fill" />,
  },
  medium: {
    tile: "bg-info-soft text-info",
    pill: "bg-info-soft text-info",
    label: "Medium",
    icon: <Info size={20} weight="fill" />,
  },
  low: {
    tile: "bg-surface-raised text-ink-soft",
    pill: "bg-surface-raised text-ink-soft",
    label: "Low",
    icon: <Info size={20} weight="fill" />,
  },
  opportunity: {
    tile: "bg-warn-soft text-warn",
    pill: "bg-warn-soft text-warn",
    label: "Opportunity",
    icon: <Star size={20} weight="fill" />,
  },
};

const TAB_LABEL: Record<FilterSeverity | "all", string> = {
  all: "All",
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function AuditFindings({
  findings,
  pagesCrawled,
  pagesAnchor,
}: {
  findings: WebsiteAuditFinding[];
  pagesCrawled: number;
  /** Where each row's arrow goes: the page-level table, when there is one. */
  pagesAnchor?: string;
}) {
  const [tab, setTab] = useState<FilterSeverity | "all">("all");
  // `?severity=critical` opens on that tab: the GEO page's severity tiles link
  // here. Read after hydration, so the server render and the first client
  // render agree (the page itself takes no `searchParams`).
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get("severity");
    const match = FILTER_SEVERITIES.find((severity) => severity === asked);
    if (match) setTab(match);
  }, []);
  const printing = usePrinting();
  const counts = findingCounts(findings);
  const shown = printing || tab === "all" ? findings : findings.filter((finding) => finding.severity === tab);

  return (
    <div>
      <div className="flex flex-wrap gap-2 print:hidden" role="group" aria-label="Filter findings by severity">
        {(["all", ...FILTER_SEVERITIES] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              tab === key
                ? "border-transparent bg-accent-soft text-accent-ink"
                : "border-border bg-surface text-ink hover:bg-surface-raised"
            }`}
          >
            {TAB_LABEL[key]} ({counts[key]})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 rounded-lg bg-surface-raised px-4 py-6 text-center text-sm text-ink-soft">
          No {TAB_LABEL[tab].toLowerCase()} findings.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {shown.map((finding) => {
            const look = LOOK[finding.severity];
            return (
              <li key={finding.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 sm:flex-nowrap">
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-md ${look.tile}`} aria-hidden="true">
                  {look.icon}
                </span>
                <span
                  className={`w-32 shrink-0 rounded-md px-2.5 py-1.5 text-center text-xs font-bold uppercase tracking-wide ${look.pill}`}
                >
                  {look.label}
                </span>
                <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                  <p className="text-sm font-semibold text-ink">{finding.title}</p>
                  {finding.detail && <p className="mt-0.5 text-sm text-ink-soft">{finding.detail}</p>}
                </div>
                <span className="shrink-0 text-sm text-ink-soft">{findingReach(finding.affectedPages, pagesCrawled)}</span>
                {pagesAnchor && (
                  <a
                    href={`#${pagesAnchor}`}
                    aria-label={`See the pages behind "${finding.title}"`}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink transition-colors hover:bg-accent hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent print:hidden"
                  >
                    <ArrowRight size={16} weight="bold" aria-hidden="true" />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
