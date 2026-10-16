"use client";

/**
 * Every campaign, every field the platform gives us.
 *
 * ## Why twenty columns
 *
 * This showed six — name, impressions, clicks, spend, conversions, conversion
 * value — because that is all `toCampaignRow` used to read. Probing the live
 * tables found `google_ads_full_insights` carrying THIRTY fields on 100% of its
 * rows: status, channel type, both budgets, the dates, CTR, CPC, cost per
 * conversion, and the app-install counts. The legacy dashboard showed all of
 * them, and none of it needed a new backend call — it was already in the
 * bundle, unread.
 *
 * A wide table is the right shape for this. Someone deciding which campaign to
 * cut compares spend against conversions against cost per conversion across
 * twenty campaigns, and that comparison is what rows and columns are for.
 *
 * ## What is `secondary`, and why
 *
 * The eight columns that answer "is this working" stay at every width. The rest
 * — dates, budgets, reach, the install counts — are marked `secondary` and drop
 * below `sm`, because a phone showing twenty columns shows none of them. On
 * desktop the table scrolls sideways inside its own container, which is what
 * `DataTable` already does.
 *
 * ## Null is not zero, and this table is where it shows
 *
 * Nearly half of Meta's campaign rows carry no metrics at all — see
 * `ads-insights.ts`. Every numeric cell renders null as an em dash, so a
 * campaign that reported nothing is visibly different from one that spent
 * nothing and got nothing. Before the row type carried nulls, those 22
 * campaigns printed zeros and were indistinguishable.
 *
 * ## The filter bar
 *
 * `DataTable` owns search, sort and pagination. It does not own faceted
 * filters, and it should not: "spend over 50" means nothing to a table of
 * pages or search queries. So the filters live here, where the columns are
 * known, and `DataTable` receives rows that are already filtered.
 *
 * Two decisions inside it worth keeping:
 *
 * - **A campaign with no spend figure is not "under 50".** Filtering on a
 *   minimum keeps only rows that HAVE the metric, because null is unknown, not
 *   small — otherwise setting any minimum silently deletes every metric-less
 *   Meta campaign and the count would not explain why.
 * - **The reset says how many are hidden.** A filter left set is the commonest
 *   cause of "where did my data go", so the control that clears it is only
 *   shown when something is filtered, and it names the number.
 */

import { useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { CampaignDrawer } from "@/components/analytics/campaign-drawer";
import type { AdCampaignRow, AdsDay } from "@/lib/data/ads-insights";
import { formatCount, formatMoney } from "@/lib/format";
import { humaniseKey, humaniseOr } from "@/lib/data/labels";
import { shortDayYear } from "@/lib/data/analytics-timeline";

/**
 * An em dash for every absent count, never a zero.
 *
 * Money does NOT go through here — `formatMoney` already takes `number | null`
 * and does the right thing with both ends of the range. Using `formatAmount`
 * for these columns was the exact bug CLAUDE.md records: it rounds to whole
 * units, so a cost per click of 0.44 printed as `0` and a cost per conversion
 * of 2.23 as `2`. Every per-unit figure on this table is under ten, which is
 * where the decimals are the whole point.
 */
function n(value: number | null, format: (value: number) => string): string {
  return value === null ? "—" : format(value);
}

/**
 * Nulls sort below every real value.
 *
 * `DataTable` compares with `a - b`, so `-Infinity` would produce `NaN` and
 * scramble the sort. Every metric here is non-negative, so −1 is safely below
 * all of them and puts "we don't know" at the bottom when sorting best-first.
 */
function sortNum(value: number | null): number {
  return value ?? -1;
}

/**
 * `MULTI_CHANNEL` → `Multi channel`, `ENABLED` → `Enabled`.
 *
 * Both the Type and Status columns go through `humaniseOr` in `lib/data/labels.ts`
 * now. This file used to carry its own copy, which is how Status came to be
 * printed raw beside a Type column that was not — see that module's header.
 */
function statusVariant(status: string | null): BadgeVariant {
  const upper = (status ?? "").toUpperCase();
  if (upper === "ACTIVE") return "campaign-active";
  if (upper === "REMOVED") return "campaign-removed";
  return "campaign-paused";
}

/** A date, short. Absent dates are common on Display campaigns with no end. */
function shortDate(iso: string | null): string {
  return iso === null ? "—" : shortDayYear(iso);
}

/**
 * Return on ad spend, derived per row.
 *
 * Not a stored field on either platform. Null when nothing was spent — that is
 * unknown, not worthless, and `0.00x` would read as the latter.
 */
function roasOf(row: AdCampaignRow): number | null {
  if (row.spend === null || row.spend <= 0 || row.conversionValue === null) return null;
  return row.conversionValue / row.spend;
}

const COLUMNS: Column<AdCampaignRow>[] = [
  {
    key: "campaign",
    header: "Campaign",
    cell: (row) => (
      <span className="block max-w-[18rem] truncate font-medium" title={row.campaign}>
        {row.campaign}
      </span>
    ),
    sortValue: (row) => row.campaign,
  },
  {
    key: "status",
    header: "Status",
    // The platform's own word — `ENABLED`, `CAMPAIGN_PAUSED` — was printed
    // raw here, beside a Type column that was humanised. Same treatment now.
    cell: (row) => (
      <Badge variant={statusVariant(row.status)}>{humaniseOr(row.status, "Unknown")}</Badge>
    ),
    sortValue: (row) => row.status ?? "",
  },
  {
    key: "spend",
    header: "Spend",
    cell: (row) => formatMoney(row.spend),
    sortValue: (row) => sortNum(row.spend),
    numeric: true,
  },
  {
    key: "impressions",
    header: "Impressions",
    cell: (row) => n(row.impressions, formatCount),
    sortValue: (row) => sortNum(row.impressions),
    numeric: true,
  },
  {
    key: "clicks",
    header: "Clicks",
    cell: (row) => n(row.clicks, formatCount),
    sortValue: (row) => sortNum(row.clicks),
    numeric: true,
  },
  {
    key: "ctr",
    header: "CTR",
    // Already a percentage whichever platform it came from — see `ctrPercent`.
    cell: (row) => n(row.ctr, (value) => `${value.toFixed(2)}%`),
    sortValue: (row) => sortNum(row.ctr),
    numeric: true,
  },
  {
    key: "conversions",
    header: "Conversions",
    cell: (row) => n(row.conversions, formatCount),
    sortValue: (row) => sortNum(row.conversions),
    numeric: true,
  },
  {
    key: "costPerConversion",
    header: "Cost / conv.",
    cell: (row) => formatMoney(row.costPerConversion),
    sortValue: (row) => sortNum(row.costPerConversion),
    numeric: true,
  },

  // ---- Below here: detail. Dropped on a phone, where twenty columns is none.
  {
    key: "kind",
    header: "Type",
    cell: (row) => humaniseOr(row.kind),
    sortValue: (row) => row.kind ?? "",
    secondary: true,
  },
  {
    key: "cpc",
    header: "Cost / click",
    cell: (row) => formatMoney(row.cpc),
    sortValue: (row) => sortNum(row.cpc),
    numeric: true,
    secondary: true,
  },
  {
    key: "conversionValue",
    header: "Conv. value",
    cell: (row) => formatMoney(row.conversionValue),
    sortValue: (row) => sortNum(row.conversionValue),
    numeric: true,
    secondary: true,
  },
  {
    key: "roas",
    header: "ROAS",
    cell: (row) => n(roasOf(row), (value) => `${value.toFixed(2)}x`),
    sortValue: (row) => sortNum(roasOf(row)),
    numeric: true,
    secondary: true,
  },
  {
    key: "leads",
    header: "Leads",
    cell: (row) => n(row.leads, formatCount),
    sortValue: (row) => sortNum(row.leads),
    numeric: true,
    secondary: true,
  },
  {
    key: "reach",
    header: "Reach",
    cell: (row) => n(row.reach, formatCount),
    sortValue: (row) => sortNum(row.reach),
    numeric: true,
    secondary: true,
  },
  {
    key: "dailyBudget",
    header: "Daily budget",
    cell: (row) => formatMoney(row.dailyBudget),
    sortValue: (row) => sortNum(row.dailyBudget),
    numeric: true,
    secondary: true,
  },
  {
    key: "totalBudget",
    header: "Total budget",
    cell: (row) => formatMoney(row.totalBudget),
    sortValue: (row) => sortNum(row.totalBudget),
    numeric: true,
    secondary: true,
  },
  {
    key: "startDate",
    header: "Start",
    cell: (row) => shortDate(row.startDate),
    sortValue: (row) => row.startDate ?? "",
    secondary: true,
  },
  {
    key: "endDate",
    header: "End",
    cell: (row) => shortDate(row.endDate),
    sortValue: (row) => row.endDate ?? "",
    secondary: true,
  },
  {
    key: "iosInstalls",
    header: "iOS installs",
    cell: (row) => n(row.iosInstalls, formatCount),
    sortValue: (row) => sortNum(row.iosInstalls),
    numeric: true,
    secondary: true,
  },
  {
    key: "androidInstalls",
    header: "Android installs",
    cell: (row) => n(row.androidInstalls, formatCount),
    sortValue: (row) => sortNum(row.androidInstalls),
    numeric: true,
    secondary: true,
  },
];

/** A labelled control in the filter bar. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      {/* A visible label, not a placeholder. A placeholder disappears the
          moment someone types, which is exactly when they need to know which
          box they are in. */}
      <span className="text-[11px] leading-4 text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

const CONTROL =
  "min-h-9 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-ink outline-none transition-colors focus:border-accent";

export function CampaignTable({
  rows,
  platform,
  dailyByCampaign = {},
}: {
  rows: AdCampaignRow[];
  platform: string;
  /** Each campaign's own daily series, for the row drawer. */
  dailyByCampaign?: Record<string, AdsDay[]>;
}) {
  const [status, setStatus] = useState("all");
  const [minSpend, setMinSpend] = useState("");
  const [minRoas, setMinRoas] = useState("");
  const [open, setOpen] = useState<AdCampaignRow | null>(null);

  // Every status actually present, rather than a hardcoded list: Google sends
  // PAUSED and REMOVED, Meta sends ACTIVE and PAUSED, and offering an option
  // that matches nothing is a control that can only disappoint.
  const statuses = useMemo(
    () => [...new Set(rows.map((row) => row.status).filter((s): s is string => s !== null))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const spendFloor = Number(minSpend);
    const roasFloor = Number(minRoas);
    const hasSpendFloor = minSpend !== "" && Number.isFinite(spendFloor);
    const hasRoasFloor = minRoas !== "" && Number.isFinite(roasFloor);

    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      // Null fails a minimum rather than passing it: "we do not know what this
      // spent" is not "this spent less than 50".
      if (hasSpendFloor && (row.spend === null || row.spend < spendFloor)) return false;
      if (hasRoasFloor) {
        const roas = roasOf(row);
        if (roas === null || roas < roasFloor) return false;
      }
      return true;
    });
  }, [rows, status, minSpend, minRoas]);

  const active = status !== "all" || minSpend !== "" || minRoas !== "";
  const hidden = rows.length - filtered.length;

  function clear() {
    setStatus("all");
    setMinSpend("");
    setMinRoas("");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Status">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            suppressHydrationWarning
            className={CONTROL}
          >
            <option value="all">All statuses</option>
            {statuses.map((option) => (
              <option key={option} value={option}>
                {humaniseKey(option)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Min spend">
          <input
            type="number"
            min="0"
            inputMode="decimal"
            value={minSpend}
            onChange={(event) => setMinSpend(event.target.value)}
            placeholder="Any"
            suppressHydrationWarning
            className={`${CONTROL} w-24`}
          />
        </Field>

        <Field label="Min ROAS">
          <input
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            value={minRoas}
            onChange={(event) => setMinRoas(event.target.value)}
            placeholder="Any"
            suppressHydrationWarning
            className={`${CONTROL} w-24`}
          />
        </Field>

        {/* Only when something is filtered, and it names the count. A filter
            left set is the commonest cause of "where did my data go". */}
        {active && (
          <button
            type="button"
            onClick={clear}
            suppressHydrationWarning
            className="min-h-9 rounded-md border border-border px-3 text-sm text-ink transition hover:bg-surface-raised"
          >
            Clear {hidden > 0 ? `(${hidden} hidden)` : "filters"}
          </button>
        )}
      </div>

      <DataTable
        rows={filtered}
        columns={COLUMNS}
        // The name is not unique — the same campaign appears once per account —
        // so the id leads and the name is the fallback for a row without one.
        rowKey={(row) => row.campaignId ?? row.campaign}
        // Raw AND displayed: the badge reads "Paused" while the row holds
        // `PAUSED`, and searching for either has to work.
        searchText={(row) =>
          `${row.campaign} ${row.status ?? ""} ${row.kind ?? ""} ${humaniseOr(row.status, "")} ${humaniseOr(row.kind, "")}`
        }
        searchPlaceholder="Filter campaigns…"
        initialSort={{ key: "spend", direction: "desc" }}
        caption={`${platform} campaigns, with spend, results and budgets`}
        onRowClick={(row) => setOpen(row)}
        empty={
          <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-ink-soft">
            No campaigns match these filters.
          </p>
        }
      />

      <CampaignDrawer
        campaign={open}
        days={open === null ? [] : (dailyByCampaign[open.campaign] ?? [])}
        statusVariant={statusVariant}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
