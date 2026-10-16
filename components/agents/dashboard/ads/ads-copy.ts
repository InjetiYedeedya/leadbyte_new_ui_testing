import type { BadgeVariant } from "@/components/ui/badge";
import { isActiveStatus, isEndedStatus, type AdsPlatform } from "@/lib/data/dashboard/ads-campaigns";
import { formatCount } from "@/lib/format";

/**
 * The words and number formats the Meta and Google tabs share.
 *
 * One screen serves both platforms, and the only differences are names: Meta
 * calls a conversion a "result" and its spend "amount spent", Google says
 * "conversions" and "cost". Kept in one table so the cards, the table and the
 * drawer can never disagree about which word a platform uses.
 */

export interface PlatformCopy {
  name: string;
  /** What the platform calls a conversion. */
  results: string;
  /** The same, in a column header. */
  resultsShort: string;
  costPerResult: string;
  spend: string;
}

export const PLATFORM_COPY: Record<AdsPlatform, PlatformCopy> = {
  google: {
    name: "Google Ads",
    results: "Conversions",
    resultsShort: "Conv.",
    costPerResult: "Cost / conv.",
    spend: "Cost",
  },
  meta: {
    name: "Meta Ads",
    results: "Results",
    resultsShort: "Results",
    costPerResult: "Cost / result",
    spend: "Amount spent",
  },
};

/** A count that may be fractional (Google reports 3.5 conversions). Null → "—". */
export function formatFigure(value: number | null): string {
  if (value === null) return "—";
  return formatCount(Math.round(value * 100) / 100);
}

/** A percentage that is already ×100. Two decimals: CTRs live under 10%. */
export function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(2)}%`;
}

/** Return on ad spend, as a multiple: "4.20×". */
export function formatRoas(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(2)}×`;
}

/**
 * Green while running, neutral when paused (a decision someone made, not a
 * fault), quieter still when it is over. The Badge family already draws that
 * distinction; this only chooses between them.
 */
export function statusVariant(status: string | null): BadgeVariant {
  if (isActiveStatus(status)) return "campaign-active";
  if (isEndedStatus(status)) return "campaign-removed";
  return "campaign-paused";
}
