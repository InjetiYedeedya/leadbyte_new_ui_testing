import type { AdCampaignRow } from "@/lib/data/ads-insights";
import { formatMoney } from "@/lib/format";

/**
 * Which campaigns buy a conversion cheapest.
 *
 * Carried over from the legacy dashboard, which had it and we did not. It
 * answers the question a spend table cannot: the biggest spender is not the
 * worst campaign, and the cheapest cost per conversion is not the one with the
 * smallest bill.
 *
 * ## Why the bar is inverted
 *
 * Every other ranked bar in the app is "more is longer". Here less is better,
 * so the CHEAPEST campaign draws the fullest bar and the bar length is
 * `cheapest / this`. Without the inversion the most expensive campaign would
 * have the most impressive-looking bar, which is precisely backwards, and the
 * panel says which way round it is rather than leaving it to be inferred.
 *
 * ## Why campaigns with no conversions are excluded, and counted
 *
 * A campaign with no conversions has no cost per conversion — the figure is
 * undefined, not large. Ranking it as "infinitely expensive" would bury every
 * real result underneath it, and ranking it as zero would make it the winner.
 * So it is left out, and the count of what was left out is printed: a panel
 * silently showing five of forty campaigns is a panel that misleads by
 * omission.
 */

/** How many bars before the list stops being a ranking and starts being a table. */
const TOP_N = 5;

interface Ranked {
  campaign: string;
  cost: number;
}

export function CampaignEfficiency({ rows }: { rows: AdCampaignRow[] }) {
  // The platform's own `cost_per_conversion` when it sent one, else derived.
  // Google sends it; Meta does not, and dividing is the same arithmetic.
  const ranked: Ranked[] = rows
    .map((row) => {
      const cost =
        row.costPerConversion ??
        (row.spend !== null && row.conversions !== null && row.conversions > 0
          ? row.spend / row.conversions
          : null);
      return cost !== null && cost > 0 ? { campaign: row.campaign, cost } : null;
    })
    .filter((entry): entry is Ranked => entry !== null)
    .sort((a, b) => a.cost - b.cost);

  // One bar is not a ranking — there is nothing to compare it against, and the
  // full-width bar would imply it had won something.
  if (ranked.length < 2) return null;

  const shown = ranked.slice(0, TOP_N);
  const cheapest = shown[0]!.cost;
  const excluded = rows.length - ranked.length;

  return (
    <section className="min-w-0 rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-bold text-ink">Campaign efficiency</h3>
      <p className="mt-0.5 max-w-prose text-xs leading-5 text-ink-soft">
        Cost per conversion — less is better, so the cheapest campaign draws the fullest bar.
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        {/* Index as well: two ad accounts can share a campaign name. */}
        {shown.map((entry, index) => (
          <li key={`${entry.campaign}-${index}`}>
            <div className="flex items-baseline justify-between gap-4">
              <span className="min-w-0 truncate text-sm text-ink" title={entry.campaign}>
                {entry.campaign}
              </span>
              <span className="shrink-0 text-sm tabular-nums text-ink">
                {formatMoney(entry.cost)}
              </span>
            </div>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-ground">
              <span
                className="block h-1.5 rounded-full bg-accent"
                // Inverted: the cheapest is 100% and everything else is a
                // fraction of how much cheaper it is.
                style={{ width: `${Math.max(2, (cheapest / entry.cost) * 100)}%` }}
              />
            </span>
          </li>
        ))}
      </ul>

      {excluded > 0 && (
        <p className="mt-4 text-xs text-ink-soft">
          {excluded === 1
            ? "One campaign is not ranked here because it has no conversions yet."
            : `${excluded} campaigns are not ranked here because they have no conversions yet.`}
        </p>
      )}
    </section>
  );
}
