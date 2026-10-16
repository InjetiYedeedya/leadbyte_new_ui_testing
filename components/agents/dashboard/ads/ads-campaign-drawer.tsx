"use client";

/**
 * One campaign, from the right — everything the dashboard knows about it.
 *
 * From the guide (§5.4, "Campaign drawer"): the name, platform · status and
 * dates; how much of the planned amount is spent; every metric; spend per
 * day; what Meta counted as results; and every raw field the row carried.
 * Opened from a table row, so it answers a follow-up question about a row
 * without losing the sort, the filters or the scroll position that led to it
 * (the same reasoning as `components/analytics/campaign-drawer.tsx`, which
 * stays spend-only for the Performance screen).
 *
 * ## The dialog mechanics
 *
 * `<dialog>` + `showModal()`: top layer, backdrop, focus trapped, Escape
 * closes. `useScrollLock` holds the page still behind it — `showModal()` does
 * not, see `lib/use-scroll-lock.ts`. Focus goes back to whatever opened it
 * (the row) on close; engines differ on whether they restore it themselves,
 * so it is done by hand.
 */

import { useEffect, useRef } from "react";
import { LineChart } from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { useScrollLock } from "@/lib/use-scroll-lock";
import type { AdsDay } from "@/lib/data/ads-insights";
import { shortDay } from "@/lib/data/analytics-timeline";
import { budgetUse, campaignDay, type AdCampaign, type AdsPlatform } from "@/lib/data/dashboard/ads-campaigns";
import { humaniseKey, humaniseOr } from "@/lib/data/labels";
import { CURRENCY_UNKNOWN, formatMoney } from "@/lib/format";
import { PLATFORM_COPY, formatFigure, formatPct, formatRoas, statusVariant } from "./ads-copy";

const BUDGET_FILL = { good: "bg-good", warn: "bg-warn", crit: "bg-crit" } as const;
const BUDGET_TEXT = { good: "text-good", warn: "text-warn", crit: "text-crit" } as const;

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

/** Why there is no budget bar — said, because an absent bar reads as a broken one. */
function noBudgetReason(campaign: AdCampaign): string {
  if (campaign.budgetType === "Daily" && campaign.endDate === null)
    return "A daily budget with no end date has no planned total to measure against.";
  if (campaign.budgetType === null) return "No budget on record for this campaign.";
  return "No spend reported yet to measure against the budget.";
}

function BudgetBar({ campaign }: { campaign: AdCampaign }) {
  const use = budgetUse(campaign);
  if (use === null || campaign.estimatedAmount === null) {
    return <p className="text-sm text-ink-soft">{noBudgetReason(campaign)}</p>;
  }
  const pct = Math.round(use.share * 100);
  return (
    <div>
      <p className="text-sm text-ink">
        Spent <span className="font-semibold tabular-nums">{formatMoney(campaign.spend)}</span> of{" "}
        <span className="font-semibold tabular-nums">{formatMoney(campaign.estimatedAmount)}</span>{" "}
        <span className={`font-semibold tabular-nums ${BUDGET_TEXT[use.tone]}`}>({pct}%)</span>
      </p>
      <div
        role="img"
        aria-label={`${pct}% of the ${campaign.budgetType === "Lifetime" ? "lifetime budget" : "planned amount"} spent`}
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-border/60"
      >
        <div className={`h-full rounded-full ${BUDGET_FILL[use.tone]}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink-soft">
        {campaign.budgetType === "Lifetime"
          ? "Against the lifetime budget."
          : "Against the daily budget × the days it runs."}{" "}
        Amounts {CURRENCY_UNKNOWN}.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-4">
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {children}
    </section>
  );
}

export function AdsCampaignDrawer({
  campaign,
  days,
  platform,
  onClose,
}: {
  /** Null closes it. */
  campaign: AdCampaign | null;
  /** This campaign's own daily rows, oldest first. */
  days: AdsDay[];
  platform: AdsPlatform;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const open = campaign !== null;
  const copy = PLATFORM_COPY[platform];

  useScrollLock(open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
    if (!open && returnTo.current) {
      if (returnTo.current.isConnected) returnTo.current.focus();
      returnTo.current = null;
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      // A click on the dialog element itself is a click on its backdrop.
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      aria-labelledby="ads-drawer-title"
      className="m-0 ml-auto h-dvh max-h-none w-full max-w-xl overflow-y-auto overscroll-contain rounded-l-lg border-l border-border bg-ground p-0 text-ink shadow-lg backdrop:bg-ink/50"
    >
      {campaign && (
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="ads-drawer-title" className="break-words text-base font-bold text-ink">
                {campaign.campaign}
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                <span>{copy.name}</span>
                <span aria-hidden="true">·</span>
                <Badge variant={statusVariant(campaign.status)}>{humaniseOr(campaign.status, "Unknown")}</Badge>
              </p>
              <p className="mt-1 text-sm tabular-nums text-ink-soft">
                {campaignDay(campaign.startDate)} →{" "}
                {campaign.endDate === null ? "no end date" : campaignDay(campaign.endDate)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              suppressHydrationWarning
              className="-mr-2 -mt-2 flex size-10 shrink-0 items-center justify-center rounded-md text-ink-soft transition hover:bg-surface-raised hover:text-ink"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <BudgetBar campaign={campaign} />
          </div>

          <Section title="Every metric">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Figure label={copy.spend} value={formatMoney(campaign.spend)} />
              <Figure label="Impressions" value={formatFigure(campaign.impressions)} />
              <Figure label="Clicks" value={formatFigure(campaign.clicks)} />
              <Figure label="CTR" value={formatPct(campaign.ctrPct)} />
              <Figure label={platform === "google" ? "Avg CPC" : "CPC"} value={formatMoney(campaign.cpc)} />
              <Figure label={platform === "google" ? "Avg CPM" : "CPM"} value={formatMoney(campaign.cpm)} />
              <Figure label={copy.results} value={formatFigure(campaign.conversions)} />
              <Figure label={copy.costPerResult} value={formatMoney(campaign.costPerConversion)} />
              <Figure
                label="Conversion rate"
                value={campaign.conversionRate === null ? "—" : formatPct(campaign.conversionRate * 100)}
              />
              <Figure label="Conv. value" value={formatMoney(campaign.convValue)} />
              <Figure label="ROAS" value={formatRoas(campaign.roas)} />
              {platform === "meta" && <Figure label="Reach" value={formatFigure(campaign.reach)} />}
              {platform === "meta" && (
                <Figure label="Frequency" value={campaign.frequency === null ? "—" : campaign.frequency.toFixed(2)} />
              )}
              <Figure label="Budget" value={formatMoney(campaign.budget)} />
              <Figure label="Budget type" value={campaign.budgetType ?? "—"} />
              <Figure label="Est. amount" value={formatMoney(campaign.estimatedAmount)} />
              <Figure label="Leads" value={formatFigure(campaign.leads)} />
              <Figure label="iOS installs" value={formatFigure(campaign.iosInstalls)} />
              <Figure label="Android installs" value={formatFigure(campaign.androidInstalls)} />
              {platform === "google" ? (
                <Figure label="Channel type" value={campaign.channelType ?? "—"} />
              ) : (
                <Figure label="Objective" value={humaniseOr(campaign.objective)} />
              )}
            </dl>
          </Section>

          <Section title="Spend per day">
            {days.length > 1 ? (
              <LineChart
                points={days.map((day) => ({ label: shortDay(day.date), value: day.spend }))}
                height={160}
                minWidth={280}
                caption={`Daily spend for ${campaign.campaign}`}
              />
            ) : (
              // Most campaigns have no daily rows at all (CLAUDE.md, "Per-campaign
              // daily rows barely exist") — said plainly, not drawn as an empty frame.
              <p className="text-sm text-ink-soft">
                {days.length === 1
                  ? `Only one day of history so far (${shortDay(days[0]?.date ?? "")}), which is not a trend yet.`
                  : "No day-by-day history for this campaign yet. The figures above are its lifetime totals, which arrive separately from the daily rows."}
              </p>
            )}
          </Section>

          {campaign.actions.length > 0 && (
            <Section title="Results breakdown">
              <ul className="flex flex-col">
                {campaign.actions.map((action) => (
                  <li
                    key={action.type}
                    className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 text-sm last:border-b-0"
                  >
                    <span className="min-w-0 break-words text-ink">{humaniseKey(action.type)}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-ink">{formatFigure(action.value)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="All data from database">
            <p className="text-xs text-ink-soft">
              Every field the platform sent for this campaign, by name. Credentials are never shown.
            </p>
            <dl className="flex flex-col">
              {campaign.raw.map(([key, value]) => (
                <div
                  key={key}
                  className="grid grid-cols-1 gap-0.5 border-b border-border/60 py-1.5 text-sm last:border-b-0 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-3"
                >
                  {/* A field name is an identifier — the one place the mono face belongs. */}
                  <dt className="break-all font-mono text-xs text-ink-soft">{key}</dt>
                  <dd className="break-words text-ink [overflow-wrap:anywhere]">{value}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </div>
      )}
    </dialog>
  );
}
