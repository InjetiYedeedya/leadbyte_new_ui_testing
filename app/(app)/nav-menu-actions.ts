"use server";

import { currentBusinessId } from "@/components/page-shell";
import type { PriceSheet } from "@/lib/billing/price-sheet";
import {
  readAgentRows,
  readIntegrationMenu,
  readPerformanceCards,
  readPricingMenu,
  readStrategyMenu,
  type MenuAgent,
  type MenuIntegration,
  type MenuPerfCard,
  type MenuSlide,
} from "@/lib/data/nav-menu-status";

/**
 * The top menu's live answers (`components/nav-mega-menu.tsx`). Read in the
 * background once a page has loaded, or when a menu opens, and kept for a few
 * minutes in the browser — never as part of rendering a page. The account is
 * the session's own, never anything the browser sends.
 */
/**
 * Everything the menus open on, in ONE call. Server Actions from a page run
 * one after another, so four separate background reads queued behind each
 * other — and anything the page itself asked for queued behind them. One
 * call takes one turn, and its four reads run side by side on the server.
 * Each part fails alone (`null`), never the whole menu.
 */
export async function loadMenuBundle(): Promise<{
  agentRows: MenuAgent[] | null;
  integrations: { integrations: MenuIntegration[]; slides: MenuSlide[] } | null;
  strategy: { slides: MenuSlide[] } | null;
  pricing: { sheet: PriceSheet; ownedIds: string[] } | null;
}> {
  const businessId = await currentBusinessId();
  const [agentRows, integrations, strategy, pricing] = await Promise.allSettled([
    readAgentRows(businessId),
    readIntegrationMenu(businessId),
    readStrategyMenu(businessId),
    readPricingMenu(businessId),
  ]);
  const ok = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
  return { agentRows: ok(agentRows), integrations: ok(integrations), strategy: ok(strategy), pricing: ok(pricing) };
}

export async function loadAgentRows(): Promise<MenuAgent[]> {
  return readAgentRows(await currentBusinessId());
}

/** The Agents menu's three Performance cards. Only when that menu opens. */
export async function loadPerformanceCards(): Promise<MenuPerfCard[]> {
  return readPerformanceCards(await currentBusinessId());
}

export async function loadIntegrationMenu(): Promise<{ integrations: MenuIntegration[]; slides: MenuSlide[] }> {
  return readIntegrationMenu(await currentBusinessId());
}

export async function loadStrategyMenu(): Promise<{ slides: MenuSlide[] }> {
  return readStrategyMenu(await currentBusinessId());
}

/** `currency` is the menu's INR/USD switch; anything else falls back as the Pricing page does. */
export async function loadPricingMenu(currency?: string): Promise<{ sheet: PriceSheet; ownedIds: string[] }> {
  return readPricingMenu(await currentBusinessId(), currency);
}
