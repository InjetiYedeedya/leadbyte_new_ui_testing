import { humaniseKey } from "@/lib/data/labels";
import {
  DATE_PRESETS,
  NO_FILTERS,
  isFiltered,
  type CampaignFilters,
  type DatePreset,
} from "@/lib/data/dashboard/ads-campaigns";
import { countOf } from "@/lib/format";

/**
 * Search, status, date range, minimum spend and minimum ROAS.
 *
 * Controlled: the island owns the filter state because the summary cards, the
 * efficiency panel, the table and the charts all read the SAME filtered set.
 * Rendered inside that island's tree, so it needs no directive of its own.
 *
 * Visible labels, never placeholders standing in for them — a placeholder
 * disappears the moment someone types, which is when they need to know which
 * box they are in (same as `campaign-table.tsx`).
 */

const CONTROL =
  "min-h-9 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-ink outline-none transition-colors focus:border-accent";

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="text-xs text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

export function AdsFilterBar({
  filters,
  onChange,
  statuses,
  shown,
  total,
}: {
  filters: CampaignFilters;
  onChange: (next: CampaignFilters) => void;
  /** Every status present in the rows. */
  statuses: string[];
  shown: number;
  total: number;
}) {
  const set = <K extends keyof CampaignFilters>(key: K, value: CampaignFilters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" role="search">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
        <Field label="Search" className="col-span-2 sm:col-span-3 2xl:col-span-2">
          <input
            type="search"
            value={filters.search}
            onChange={(event) => set("search", event.target.value)}
            placeholder="Campaign name"
            suppressHydrationWarning
            className={CONTROL}
          />
        </Field>

        <Field label="Status">
          <select
            value={filters.status}
            onChange={(event) => set("status", event.target.value)}
            suppressHydrationWarning
            className={CONTROL}
          >
            <option value="all">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {humaniseKey(status)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Running during">
          <select
            value={filters.date}
            onChange={(event) => set("date", event.target.value as DatePreset)}
            suppressHydrationWarning
            className={CONTROL}
          >
            {DATE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Min spend">
          <input
            type="number"
            min="0"
            inputMode="decimal"
            value={filters.minSpend}
            onChange={(event) => set("minSpend", event.target.value)}
            placeholder="Any"
            suppressHydrationWarning
            className={CONTROL}
          />
        </Field>

        <Field label="Min ROAS">
          <input
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            value={filters.minRoas}
            onChange={(event) => set("minRoas", event.target.value)}
            placeholder="Any"
            suppressHydrationWarning
            className={CONTROL}
          />
        </Field>
      </div>

      {filters.date === "custom" && (
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <Field label="From">
            <input
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(event) => set("from", event.target.value)}
              suppressHydrationWarning
              className={CONTROL}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(event) => set("to", event.target.value)}
              suppressHydrationWarning
              className={CONTROL}
            />
          </Field>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Says what the whole tab is showing, since the cards above the bar
            follow it too. Dates are calendar days in UTC. */}
        <p className="text-xs tabular-nums text-ink-soft" aria-live="polite">
          {shown === total ? countOf(total, "campaign") : `${shown} of ${countOf(total, "campaign")}`}
          {filters.date !== "all" && " · dates in UTC"}
        </p>
        {isFiltered(filters) && (
          <button
            type="button"
            onClick={() => onChange(NO_FILTERS)}
            suppressHydrationWarning
            className="min-h-9 rounded-md border border-border px-3 text-sm font-medium text-ink transition hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Clear filters{total - shown > 0 ? ` (${total - shown} hidden)` : ""}
          </button>
        )}
      </div>
    </div>
  );
}
