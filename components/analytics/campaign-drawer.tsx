"use client";

/**
 * One campaign, opened from its row.
 *
 * ## Why a drawer and not a page
 *
 * The legacy dashboard did this and it is the right shape: a campaign's own
 * trend is a follow-up question about a row you are already looking at, and
 * answering it by navigating away loses the sort, the filters and the scroll
 * position that got you there. A dialog answers it and gives the table back.
 *
 * ## Why it charts spend AND clicks, not one figure
 *
 * The question someone opens a campaign to ask is "is this getting worse, or
 * did I just spend less?" — and that needs both lines. Spend falling with
 * clicks is a budget change; spend flat with clicks falling is a problem.
 * Neither series alone can tell them apart.
 *
 * Two separate charts rather than two lines on one axis, for the same reason
 * `TimelineBands` uses lanes: spend and clicks are different units and one
 * shared y-axis would flatten whichever is smaller into the baseline.
 *
 * ## Why `useScrollLock`
 *
 * `<dialog>` + `showModal()` gives the top layer, the backdrop, focus trapping
 * and Escape — it does NOT stop the page scrolling underneath, and the two
 * obvious cures both fail. See `lib/use-scroll-lock.ts`; this is the seventh
 * modal to use it and the reasoning is all there.
 */

import { useEffect, useRef } from "react";
import { LineChart } from "@/components/ui/chart";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { useScrollLock } from "@/lib/use-scroll-lock";
import type { AdCampaignRow, AdsDay } from "@/lib/data/ads-insights";
import { formatCount, formatMoney } from "@/lib/format";
import { withPriorPeriod } from "@/lib/data/prior-period";
import { shortDay } from "@/lib/data/analytics-timeline";

/** One figure in the drawer's summary strip. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] leading-4 text-ink-soft">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

export function CampaignDrawer({
  campaign,
  days,
  statusVariant,
  onClose,
}: {
  /** Null closes the dialog. */
  campaign: AdCampaignRow | null;
  /** This campaign's own daily rows, oldest first. */
  days: AdsDay[];
  statusVariant: (status: string | null) => BadgeVariant;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const open = campaign !== null;

  useScrollLock(open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const spend = withPriorPeriod(days.map((day) => ({ label: shortDay(day.date), value: day.spend })));
  const clicks = withPriorPeriod(
    days.map((day) => ({ label: shortDay(day.date), value: day.clicks })),
  );

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      // The dialog element is the click target for its own backdrop, so a hit
      // on the element itself means the backdrop was clicked.
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      aria-labelledby="campaign-drawer-title"
      className="w-[min(48rem,calc(100vw-2rem))] rounded-lg border border-border bg-ground p-0 text-ink shadow-lg backdrop:bg-ink/50"
    >
      {campaign && (
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2
                id="campaign-drawer-title"
                className="text-base font-bold text-ink"
                title={campaign.campaign}
              >
                {campaign.campaign}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant(campaign.status)}>
                  {campaign.status ?? "unknown"}
                </Badge>
                {campaign.kind && (
                  <span className="text-sm text-ink-soft">
                    {campaign.kind.replace(/_/g, " ").toLowerCase()}
                  </span>
                )}
              </div>
            </div>
            {/* 40px hit area, not the 24px the icon alone would give. */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              suppressHydrationWarning
              className="-mr-2 -mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-soft transition hover:bg-surface-raised hover:text-ink"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure label="Spend" value={formatMoney(campaign.spend)} />
            <Figure
              label="Clicks"
              value={campaign.clicks === null ? "—" : formatCount(campaign.clicks)}
            />
            <Figure
              label="Conversions"
              value={campaign.conversions === null ? "—" : formatCount(campaign.conversions)}
            />
            <Figure label="Cost / conv." value={formatMoney(campaign.costPerConversion)} />
          </dl>

          {days.length > 1 ? (
            <div className="mt-6 flex flex-col gap-4">
              <section>
                <h3 className="mb-2 text-sm font-medium text-ink">Spend per day</h3>
                <LineChart
                  points={spend.points}
                  height={160}
                  caption={`Daily spend for ${campaign.campaign}`}
                />
              </section>
              <section>
                <h3 className="mb-2 text-sm font-medium text-ink">Clicks per day</h3>
                <LineChart
                  points={clicks.points}
                  height={160}
                  caption={`Daily clicks for ${campaign.campaign}`}
                />
              </section>
            </div>
          ) : (
            /* Said plainly. The campaign rows are lifetime totals and the daily
               table is a separate import, so a campaign can legitimately have
               totals and no day-by-day history — an empty chart frame would
               look like a failure instead of an absence. */
            <p className="mt-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-ink-soft">
              No day-by-day history for this campaign yet. Its totals above are from the
              platform&apos;s lifetime report, which arrives separately from the daily rows.
            </p>
          )}
        </div>
      )}
    </dialog>
  );
}
