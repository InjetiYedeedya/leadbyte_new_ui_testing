import { cache } from "react";
import { apiRequest, ApiError } from "@/lib/api/client";
import { isBackendConfigured } from "@/lib/api/config";
import { isRedirectError } from "@/lib/auth/session-expired";
import { PRICING_AGENTS } from "@/lib/data/pricing-catalog";
import { catalogSheet, mapLivePricing, type Currency, type PriceSheet } from "@/lib/billing/price-sheet";

/**
 * The price sheet for a currency: the live admin table when it answers, the
 * catalog otherwise.
 *
 * Server-only (it reaches `lib/api/client.ts`). Never throws: a pricing table
 * that cannot be read falls back to today's price list, because a Pricing
 * page that errors sells nothing. The fallback is USD only, so a visitor who
 * asked for INR is told INR is not available rather than shown rupee labels
 * on dollar amounts.
 *
 * Read fresh on every render, never cached across requests: a price the
 * admin just changed must be the price the next checkout shows. React
 * `cache()` only dedupes the Pricing page and Checkout asking twice in one
 * render.
 */
export const getPriceSheet = cache(async function getPriceSheet(currency: Currency): Promise<PriceSheet> {
  if (!isBackendConfigured()) return catalogSheet(PRICING_AGENTS);
  try {
    const raw = await apiRequest<unknown>(`/api/pricing?currency=${currency}`);
    return mapLivePricing(raw, currency, PRICING_AGENTS) ?? catalogSheet(PRICING_AGENTS);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    // 404 would mean an environment whose backend predates the pricing
    // table; it is live on leadbyte-api_v1 (probed 2026-09-28).
    if (!(error instanceof ApiError && error.status === 404)) {
      console.warn(`[pricing] /api/pricing?currency=${currency} failed, showing the catalog:`, error instanceof Error ? error.message : error);
    }
    return catalogSheet(PRICING_AGENTS);
  }
});
