"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  CaretDown,
  ChartLineUp,
  ChartPieSlice,
  Compass,
  GearSix,
  Globe,
  IdentificationCard,
  ListMagnifyingGlass,
  LockSimple,
  MagnifyingGlass,
  Megaphone,
  Play,
  PlugsConnected,
  Robot,
  SquaresFour,
  X,
} from "@phosphor-icons/react";
import { NavTabLink } from "@/components/nav-transition";
import {
  loadAgentRows,
  loadMenuBundle,
  loadIntegrationMenu,
  loadPerformanceCards,
  loadPricingMenu,
  loadStrategyMenu,
} from "@/app/(app)/nav-menu-actions";
import type {
  MenuAgent,
  MenuIntegration,
  MenuIntegrationState,
  MenuPerfCard,
  MenuSlide,
} from "@/lib/data/nav-menu-status";
import type { Currency, PriceSheet } from "@/lib/billing/price-sheet";
import { AgentPricingBoard, CheckoutCta } from "@/components/pricing/agent-pricing-board";
import { agentLogoSrc } from "@/components/agents/agent-logo";
import { CURRENCIES, catalogSheet, chargeFor, formatCurrency, wasFor } from "@/lib/billing/price-sheet";
import { PRICING_AGENTS } from "@/lib/data/pricing-catalog";
import type { BillingPeriod } from "@/lib/data/pricing-catalog";

/** The agents whose marks are preloaded for the Pricing menu (its ids). */
const AGENT_LOGO_IDS: Record<string, true> = {
  "meta-ads": true,
  "google-ads": true,
  "linkedin-ads": true,
  "openai-ads": true,
  "lead-qualification": true,
  "on-page-seo": true,
  "off-page-seo": true,
  "social-media": true,
  "blog-posting": true,
  aeo: true,
};
import { OPEN_NAV_MENU_EVENT } from "@/components/agents/show-agents-button";

/**
 * The primary navigation, Okara-style (an experiment since 2026-10-14).
 *
 * Every tab opens its own MODAL on hover: centred under the bar, over the
 * page, which blurs and dims behind it. The tab itself still navigates on a
 * click, exactly as before. The bar stays sharp above the backdrop, so moving
 * along it switches straight to the next tab's modal — only one is ever open.
 * It closes on Escape, on a click outside it, on its × and when the pointer
 * leaves it; the page under it does not scroll while it is open.
 *
 * Four modals are live. Agents is the control center — every agent by kind,
 * with Run agent (or Set up / Unlock) and Dashboard — and Integrations says
 * what is connected and as whom; Performance and Strategy summarise their
 * pages. Each is read when it first OPENS (`nav-menu-actions.ts`), from the
 * same readers and rules as the pages they stand for, so nothing is shown as
 * connected or ready that the page would not show.
 *
 * To go back to the old strip, set `NAV_STYLE` to "classic" in `tab-bar.tsx`.
 *
 * Wide screens only (`lg`): below that the tabs share a scrolling strip, and
 * a tap is a click, so the tab simply opens its page.
 */

export type MegaLive = "agents" | "integrations" | "strategy" | "pricing";

export type MegaItem = {
  href: string;
  label: string;
  description: string;
  /** The agent's id or the integration's key, which the live data is matched on. */
  key?: string;
  /** A mark under `public/` — an agent's or a platform's own logo. */
  logo?: string;
  /** Or one of the line icons below, for our own pages. */
  icon?: keyof typeof ICONS;
};

export type MegaTab = {
  href: string;
  label: string;
  /** Show how many agents the account has bought, read live (never a fixed number). */
  ownedAgentsBadge?: boolean;
  /**
   * A section with a page of its own that is highlighted while you are on
   * it (Business overview, Strategy). The others — Agents, Integrations,
   * Pricing — are menus only: lit while their menu is open, never because a
   * page reached FROM them is on screen.
   */
  isPage?: boolean;
  menu?: {
    items: MegaItem[];
    columns: 2 | 3;
    /** Which live read fills this modal, if any. */
    live?: MegaLive;
    feature: { title: string; body: string; href: string; cta: string };
  };
};

const ICONS = {
  summary: ChartPieSlice,
  profile: IdentificationCard,
  audit: ListMagnifyingGlass,
  geo: Globe,
  agents: Robot,
  integrations: PlugsConnected,
  overview: SquaresFour,
  performance: ChartLineUp,
  search: MagnifyingGlass,
  ads: Megaphone,
  strategy: Compass,
} as const;

/* ------------------------------------------------------------- store -- */

/*
 * What the menus show, kept in the browser between pages (module scope: a
 * client navigation does not reload this file). Opening a menu used to start
 * its read, so every opening showed placeholders for as long as the backend
 * took. Now the buttons and statuses are read in the background once a page
 * has settled, are kept for KEEP_MS, and are refreshed quietly when older than
 * FRESH_MS — a menu opens with its answers already in place.
 *
 * The agents' BUTTONS (one status read per agent) are a read of their own,
 * apart from the Performance cards beside them, so the buttons never wait on
 * the slower one.
 */
type StoreKey = "agentRows" | "perfCards" | "integrations" | "strategy" | "pricing";

/** Single reads, for the one key not in the bundle (and as its fallback). */
const FETCH: Record<StoreKey, () => Promise<unknown>> = {
  agentRows: loadAgentRows,
  perfCards: loadPerformanceCards,
  integrations: loadIntegrationMenu,
  strategy: loadStrategyMenu,
  pricing: loadPricingMenu,
};
const KEYS_FOR: Record<MegaLive, StoreKey[]> = {
  agents: ["agentRows", "perfCards"],
  integrations: ["integrations"],
  strategy: ["strategy"],
  pricing: ["pricing"],
};
/**
 * What the menus open on, read together as ONE background call
 * (`loadMenuBundle`) once a page has settled — Server Actions queue one after
 * another, so four calls took four turns.
 */
const BUNDLE: StoreKey[] = ["agentRows", "integrations", "strategy", "pricing"];
/**
 * Read only when its own menu opens, never ahead of it: the Performance cards
 * come from the connected-data read, the largest the app makes.
 */
const ON_OPEN_ONLY = new Set<StoreKey>(["perfCards"]);

const FRESH_MS = 60 * 1000;
const KEEP_MS = 5 * 60 * 1000;
const store = new Map<StoreKey, { value: unknown; at: number }>();
const inflight = new Set<StoreKey>();
const failed = new Set<StoreKey>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/*
 * Kept in `sessionStorage` too, per account, so a full reload (or a new page
 * load after a server redirect) opens the menus on the last answers at once
 * and refreshes them quietly, instead of starting from placeholders. Per
 * ACCOUNT: another sign-in in the same tab never sees these. Every access is
 * guarded — storage can be absent or refuse.
 */
let storageKey: string | null = null;
function persist(): void {
  if (!storageKey) return;
  try {
    const keep: Record<string, { value: unknown; at: number }> = {};
    for (const [key, hit] of store) if (!ON_OPEN_ONLY.has(key)) keep[key] = hit;
    sessionStorage.setItem(storageKey, JSON.stringify(keep));
  } catch {
    // Full or blocked: the in-memory answers still work.
  }
}
function hydrate(account: string): void {
  const key = `leadbyte:nav-menu:${account}`;
  if (storageKey === key) return;
  // A different account in this tab: nothing of the last one may show.
  if (storageKey !== null) store.clear();
  storageKey = key;
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "{}") as Record<string, { value: unknown; at: number }>;
    for (const [name, hit] of Object.entries(saved)) {
      if (hit && Date.now() - hit.at < KEEP_MS && !store.has(name as StoreKey)) store.set(name as StoreKey, hit);
    }
  } catch {
    // Nothing saved, or unreadable: start empty.
  }
}

function put(key: StoreKey, value: unknown): void {
  store.set(key, { value, at: Date.now() });
}

function fetchBundle(): void {
  const due = BUNDLE.filter((key) => {
    const hit = store.get(key);
    return !inflight.has(key) && !(hit && Date.now() - hit.at < FRESH_MS);
  });
  if (due.length === 0) return;
  due.forEach((key) => {
    inflight.add(key);
    failed.delete(key);
  });
  notify();
  loadMenuBundle()
    .then(
      (bundle) => {
        for (const key of due) {
          const value = bundle[key as keyof typeof bundle];
          if (value !== null) put(key, value);
          else if (!store.has(key)) failed.add(key);
        }
        persist();
      },
      () => due.forEach((key) => !store.has(key) && failed.add(key)),
    )
    .finally(() => {
      due.forEach((key) => inflight.delete(key));
      notify();
    });
}

function fetchKey(key: StoreKey): void {
  if (BUNDLE.includes(key)) return fetchBundle();
  const hit = store.get(key);
  if (inflight.has(key) || (hit && Date.now() - hit.at < FRESH_MS)) return;
  inflight.add(key);
  failed.delete(key);
  notify();
  FETCH[key]()
    .then(
      (value) => store.set(key, { value, at: Date.now() }),
      // A failed refresh keeps the last answer: still the last true reading.
      () => {
        if (!store.has(key)) failed.add(key);
      },
    )
    .finally(() => {
      inflight.delete(key);
      notify();
    });
}

/** The answer, or where it stands: being read, failed, or not asked yet. */
function readKey<T>(key: StoreKey): T | "loading" | "failed" | null {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.value as T;
  if (inflight.has(key)) return "loading";
  return failed.has(key) ? "failed" : null;
}

/** The live answers for a modal's entries: rows by key, or where they stand. */
type Live<T> = Map<string, T> | "loading" | "failed" | null;
type Read<T> = T | "loading" | "failed" | null;
type ModalLive = {
  rows: Live<unknown>;
  slides: MenuSlide[] | null;
  slidesLoading: boolean;
  /** Agents: the three Performance cards beside the agents. */
  perf?: Read<MenuPerfCard[]>;
  /** Pricing: what the Pricing page's board needs. */
  pricing?: Read<{ sheet: PriceSheet; ownedIds: string[] }>;
};

function asRows<T>(value: T[] | "loading" | "failed" | null, keyOf: (row: T) => string): Live<T> {
  return Array.isArray(value) ? new Map(value.map((row) => [keyOf(row), row])) : value;
}

function liveFor(kind: MegaLive | undefined): ModalLive {
  const none: ModalLive = { rows: null, slides: null, slidesLoading: false };
  if (!kind) return none;
  const slidesOf = (value: unknown) =>
    value !== null && typeof value === "object" && "slides" in value ? (value as { slides: MenuSlide[] }).slides : null;
  if (kind === "agents") {
    return {
      rows: asRows(readKey<MenuAgent[]>("agentRows"), (a) => a.id),
      slides: null,
      slidesLoading: false,
      perf: readKey<MenuPerfCard[]>("perfCards"),
    };
  }
  if (kind === "integrations") {
    const value = readKey<{ integrations: MenuIntegration[]; slides: MenuSlide[] }>("integrations");
    const rows = typeof value === "object" && value !== null ? value.integrations : value;
    return { rows: asRows(rows, (r) => r.key), slides: slidesOf(value), slidesLoading: value === "loading" || value === null };
  }
  if (kind === "pricing") {
    return { rows: null, slides: null, slidesLoading: false, pricing: readKey("pricing") };
  }
  const value = readKey<{ slides: MenuSlide[] }>(kind);
  return { rows: null, slides: slidesOf(value), slidesLoading: value === "loading" || value === null };
}

const owns = (status: MenuAgent["status"]) => status !== "locked" && status !== "coming-soon";

/** Every menu's width — one value, so no menu is sized on its own. */
const POPUP_WIDTH = "w-[min(64rem,calc(100vw-2.5rem))]";

const TAB =
  "relative flex shrink-0 items-center gap-1 rounded-md px-2 py-2 text-sm font-semibold transition-colors sm:px-3.5";

/** How long a pointer must rest on a tab before its modal opens. */
const INTENT_MS = 140;
/** How long the pointer may be away — crossing to the modal — before it closes. */
const GRACE_MS = 320;

export function NavMegaMenu({
  tabs,
  activeHref,
  account,
}: {
  tabs: MegaTab[];
  activeHref: string;
  /** The signed-in account: the saved menu answers belong to it alone. */
  account: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  // The tab the modal shows — kept through the fade-out, when `open` is null.
  const [shown, setShown] = useState<string | null>(null);
  const [top, setTop] = useState(80);
  const [mounted, setMounted] = useState(false);
  const [pricingFull, setPricingFull] = useState(false);
  // Set once the page is idle: from then on every menu is built (hidden).
  const [prepared, setPrepared] = useState(false);
  // Re-render whenever the store gets an answer.
  const [, bump] = useState(0);
  useEffect(() => {
    const listener = () => bump((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Once the page has settled, read what the menus open on, so they open
  // with it in place. Kept between pages, so this is a read every few
  // minutes at most, not one per page.
  // First the answers this tab already had (they show at once), then a
  // quiet refresh as soon as the page is idle — kept short, so the answers
  // are usually in before anyone reaches for a menu.
  useEffect(() => {
    hydrate(account);
    bump((n) => n + 1);
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback;
    const start = () => {
      fetchBundle();
      setPrepared(true);
      // Every mark the menus show, into the browser's cache now, so a menu
      // opens with them drawn rather than popping in one by one. Local files
      // of a few hundred bytes each.
      const logos = new Set<string>(["/leadbyte-logo.png"]);
      for (const tab of tabs) for (const item of tab.menu?.items ?? []) if (item.logo) logos.add(item.logo);
      for (const id of Object.keys(AGENT_LOGO_IDS)) {
        const src = agentLogoSrc(id);
        if (src) logos.add(src);
      }
      logos.forEach((src) => {
        const img = new window.Image();
        img.src = src;
      });
    };
    const handle = idle ? idle(start, { timeout: 300 }) : window.setTimeout(start, 100);
    return () => {
      if (!idle) window.clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per account; the tabs are fixed
  }, [account]);

  // The badge: how many agents the account has BOUGHT, from the same read as
  // the Agents menu's buttons. Absent until known — never a made-up number.
  const agentRows = readKey<MenuAgent[]>("agentRows");
  const owned = Array.isArray(agentRows) ? agentRows.filter((a) => owns(a.status)).length : null;
  const intent = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grace = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);

  const clearTimers = () => {
    if (intent.current) clearTimeout(intent.current);
    if (grace.current) clearTimeout(grace.current);
    intent.current = grace.current = null;
  };
  const close = useCallback(() => {
    clearTimers();
    setOpen(null);
  }, []);
  const scheduleClose = () => {
    if (intent.current) clearTimeout(intent.current);
    if (grace.current) clearTimeout(grace.current);
    grace.current = setTimeout(() => setOpen(null), GRACE_MS);
  };
  const keepOpen = () => {
    if (grace.current) clearTimeout(grace.current);
    grace.current = null;
  };

  // Everything every menu reads — for the pointer arriving on the bar, a
  // beat before any menu opens. Fresh answers are not read again.
  const warmAll = () => {
    for (const tab of tabs) {
      if (tab.menu?.live) KEYS_FOR[tab.menu.live].filter((key) => !ON_OPEN_ONLY.has(key)).forEach(fetchKey);
    }
  };

  const openTab = useCallback(
    (tab: MegaTab) => {
      if (!tab.menu) return;
      // Dropped from the tab row, as the menus always opened — not centred
      // in the window (asked for, 2026-10-14).
      const row = document.querySelector("[data-mega-trigger]")?.parentElement;
      setTop(Math.round((row?.getBoundingClientRect().bottom ?? 56) + 10));
      // Pricing opens on its compact view each time, unless it is already
      // the one showing (a second click must not undo View pricing).
      setOpen((current) => {
        if (current !== tab.href && tab.menu?.live === "pricing") setPricingFull(false);
        return tab.href;
      });
      setShown(tab.href);
      if (tab.menu.live) KEYS_FOR[tab.menu.live].forEach(fetchKey);
    },
    [],
  );

  // A destination was reached: the menu's job is done.
  useEffect(() => close(), [pathname, close]);
  useEffect(() => () => clearTimers(), []);

  // Escape closes, and the page under the modal does not scroll. `overflow`
  // on the root rather than the house `useScrollLock`: that one pins the body
  // `position: fixed`, which would carry the sticky bar off the top of the
  // screen — and the bar is what someone moves along to switch modals.
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const was = open;
      close();
      document.querySelector<HTMLElement>(`[data-mega-trigger="${was}"] a`)?.focus();
    };
    document.addEventListener("keydown", onKey);
    const html = document.documentElement;
    const before = { overflow: html.style.overflow, paddingRight: html.style.paddingRight };
    const scrollbar = window.innerWidth - html.clientWidth;
    html.style.overflow = "hidden";
    if (scrollbar > 0) html.style.paddingRight = `${scrollbar}px`;
    return () => {
      document.removeEventListener("keydown", onKey);
      html.style.overflow = before.overflow;
      html.style.paddingRight = before.paddingRight;
    };
  }, [open, close]);

  // The page can ask for a modal too (the Agents page's "Show agents").
  useEffect(() => {
    const onOpen = (e: Event) => {
      const tab = tabs.find((t) => t.href === (e as CustomEvent<string>).detail);
      if (tab) openTab(tab);
    };
    window.addEventListener(OPEN_NAV_MENU_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_NAV_MENU_EVENT, onOpen);
  }, [tabs, openTab]);

  const wide = () => typeof window.matchMedia !== "function" || window.matchMedia("(min-width: 1024px)").matches;
  const shownTab = tabs.find((t) => t.href === shown) ?? null;

  return (
    <>
      <div
        className="mx-auto flex w-max items-center gap-0.5 pb-1 max-sm:pr-10 sm:gap-1 lg:pb-0"
        onPointerEnter={() => wide() && warmAll()}
      >
        {tabs.map((tab) => {
          const active = activeHref === tab.href;
          const isOpen = open === tab.href;
          return (
            <div
              key={tab.href}
              data-mega-trigger={tab.href}
              onPointerEnter={() => {
                keepOpen();
                if (!tab.menu || !wide()) return;
                if (intent.current) clearTimeout(intent.current);
                // Already showing a modal: switch at once, as a bar should.
                if (open !== null) openTab(tab);
                else intent.current = setTimeout(() => openTab(tab), INTENT_MS);
              }}
              onPointerLeave={() => {
                if (intent.current) clearTimeout(intent.current);
                if (open !== null) scheduleClose();
              }}
              // Popup-only (2026-10-14): a click on any tab with a menu opens
              // the menu, never the page — a page opens only from something
              // chosen inside it. Caught on the way DOWN, so the link under
              // it never sees the click. A modified click (new tab) still
              // follows the link, and below `lg`, where there are no menus,
              // the tab opens its page as before.
              onClickCapture={(e) => {
                if (!tab.menu || !wide()) return;
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                keepOpen();
                openTab(tab);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && tab.menu) {
                  e.preventDefault();
                  openTab(tab);
                  requestAnimationFrame(() =>
                    document.querySelector<HTMLElement>(`[data-mega-modal="${tab.href}"] a, [data-mega-modal="${tab.href}"] button`)?.focus(),
                  );
                }
              }}
            >
              <NavTabLink
                href={tab.href}
                // See `tab-bar.tsx`: a full prefetch, on intent, never the open tab.
                prefetch={active ? false : "intent"}
                aria-current={active ? "page" : undefined}
                // The OPEN menu's tab is the highlighted one while a menu is
                // open; otherwise the page you are on, if it is a page-section
                // (`isPage`) — on a dashboard or the Connections page, opened
                // from a menu, no menu tab stays lit. Never two at once.
                className={`${TAB} ${
                  (open !== null ? isOpen : active && tab.isPage)
                    ? "bg-accent-soft text-accent-ink"
                    : "text-ink-soft hover:bg-surface-raised hover:text-ink"
                }`}
              >
                {tab.label}
                {tab.ownedAgentsBadge && owned !== null && (
                  <>
                    <span
                      aria-hidden="true"
                      title={`Agents you have: ${owned}`}
                      className="ml-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-ink"
                    >
                      {owned}
                    </span>
                    <span className="sr-only">{` — ${owned} agents purchased`}</span>
                  </>
                )}
                {tab.menu && (
                  <CaretDown
                    size={12}
                    weight="bold"
                    aria-hidden="true"
                    className={`hidden opacity-60 transition-transform duration-200 motion-reduce:transition-none lg:block ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                )}
              </NavTabLink>
            </div>
          );
        })}
      </div>

      {/* Every menu is built once the page is idle, hidden, and stays built:
          its logos are fetched and drawn and its buttons are in place before
          anyone hovers, so opening is only a fade. They used to be built on
          the first hover, which is when their images only began loading. */}
      {mounted &&
        (prepared || shownTab !== null) &&
        createPortal(
          <>
            {/* One backdrop for all of them. Clicking it closes the menu. Under
                the bar (`z-[29]`), so the tabs stay sharp and can switch menus. */}
            <div
              aria-hidden="true"
              onClick={close}
              style={{ pointerEvents: open !== null ? "auto" : "none" }}
              className={`fixed inset-0 z-[29] hidden bg-[rgb(12_21_63/0.28)] backdrop-blur-[8px] transition-opacity duration-200 ease-out motion-reduce:transition-none lg:block ${
                open !== null ? "opacity-100" : "opacity-0"
              }`}
            />
            {tabs.map((tab) =>
              tab.menu ? (
                <MegaModal
                  key={tab.href}
                  tab={tab}
                  open={open === tab.href}
                  top={top}
                  live={liveFor(tab.menu.live)}
                  pricingFull={pricingFull}
                  onPricingFull={setPricingFull}
                  onClose={close}
                  onPointerEnter={keepOpen}
                  onPointerLeave={scheduleClose}
                />
              ) : null,
            )}
          </>,
          document.body,
        )}
    </>
  );
}

/**
 * The backdrop and the modal. Portalled to `<body>`, under the sticky bar
 * (`z-[29]` against its `z-30`): the page blurs and dims, the bar does not.
 * Stays mounted after closing long enough to fade out.
 */
function MegaModal({
  tab,
  open,
  top,
  live,
  pricingFull,
  onPricingFull,
  onClose,
  onPointerEnter,
  onPointerLeave,
}: {
  tab: MegaTab;
  open: boolean;
  top: number;
  live: ModalLive;
  /** Pricing: the full board (View pricing) rather than the compact list. */
  pricingFull: boolean;
  onPricingFull: (full: boolean) => void;
  onClose: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const menu = tab.menu!;
  const { rows, slides } = live;

  return (
    <>
      {/* The menu itself sits ABOVE the bar (`z-[31]`): it drops from the
          tab row, over the section's sub-tabs where a page has them. */}
      <div
        data-mega-modal={tab.href}
        role="dialog"
        aria-modal="true"
        aria-label={`${tab.label} menu`}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onClickCapture={(e) => {
          // Only a click that goes somewhere closes the modal.
          if ((e.target as HTMLElement).closest("a")) onClose();
        }}
        // ONE width for every menu, Pricing included (`POPUP_WIDTH`). Pricing
        // is a single column; the others are content plus the right card.
        className={`fixed left-1/2 z-[31] hidden -translate-x-1/2 gap-4 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface p-4 text-left whitespace-normal shadow-[0_2px_6px_rgb(12_21_63/0.08),0_40px_80px_-30px_rgb(12_21_63/0.55)] transition-[opacity,translate,visibility] ease-out motion-reduce:transition-none lg:grid ${POPUP_WIDTH} ${
          menu.live === "pricing" ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_17rem]"
        } ${open ? "visible translate-y-0 opacity-100 duration-200" : "invisible -translate-y-1 opacity-0 duration-150"}`}
        style={{ top, maxHeight: `calc(100vh - ${top + 16}px)` }}
      >
        {menu.live === "pricing" ? (
          <PricingPanel live={live.pricing ?? null} full={pricingFull} onFull={onPricingFull} onClose={onClose} />
        ) : (
          <>
            <div className="min-w-0">
              {menu.live === "agents" ? (
                <ul className="grid grid-cols-2 content-start gap-1">
                  {menu.items.map((item, i) => (
                    <li key={item.key ?? item.href} {...entrance(open, i)}>
                      <AgentEntry item={item} live={rows as Live<MenuAgent>} />
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className={`grid content-start gap-1 ${menu.columns === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                  {menu.items.map((item, i) => (
                    <li key={(item.key ?? item.href) + item.label} {...entrance(open, i)}>
                      {menu.live === "integrations" ? (
                        <IntegrationEntry item={item} live={rows as Live<MenuIntegration>} />
                      ) : (
                        <NavTabLink
                          href={item.href}
                          prefetch="intent"
                          className={`group/item flex items-center gap-3 rounded-xl p-2.5 focus-visible:bg-surface-raised focus-visible:outline-none ${CARD_MOTION}`}
                        >
                          <ItemMark item={item} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink">{item.label}</span>
                            <span className="block truncate text-xs text-ink-soft">{item.description}</span>
                          </span>
                        </NavTabLink>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {menu.live === "agents" ? (
              <PerformanceStack live={live.perf ?? null} onClose={onClose} />
            ) : (
              <div className="relative flex min-h-0 flex-col">
                <CloseButton onClose={onClose} />
                {slides && slides.length > 0 ? (
                  <FeatureSlideshow slides={slides} feature={menu.feature} running={open} />
                ) : (
                  <NavTabLink
                    href={menu.feature.href}
                    prefetch="intent"
                    className={`group/feature flex flex-1 flex-col justify-between ${FEATURE_CARD} transition-shadow duration-200 hover:shadow-[inset_0_0_0_1px_var(--color-accent)] focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)] focus-visible:outline-none motion-reduce:transition-none`}
                  >
                    <span>
                      <span className="block pr-6 text-lg font-bold leading-snug text-ink">{menu.feature.title}</span>
                      <span className="mt-2 block text-sm text-ink-soft">{menu.feature.body}</span>
                      {live.slidesLoading && menu.live && (
                        <span aria-hidden="true" className="mt-5 block h-16 animate-pulse rounded-lg bg-surface/70" />
                      )}
                    </span>
                    <FeatureCta cta={menu.feature.cta} />
                  </NavTabLink>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/**
 * The cards arrive one after another on a slight diagonal — in from the left
 * and up from below — as the modal opens. On the `<li>`, so the card's own
 * hover tilt (its transform) is not overwritten by this one.
 */
function entrance(open: boolean, index: number): { className: string; style: React.CSSProperties } {
  return {
    // Short and capped: the last card used to wait 340ms, which read as the
    // menu loading slowly. Now everything is in place within ~0.3s.
    className: `transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
      open ? "translate-x-0 translate-y-0 opacity-100" : "-translate-x-1.5 translate-y-1.5 opacity-0"
    }`,
    style: { transitionDelay: open ? `${Math.min(index * 12, 100)}ms` : "0ms" },
  };
}

/** Every card's hover: a lift with a small 3D tilt, and its mark turns a touch. */
const CARD_MOTION =
  "transform-gpu transition-[transform,background-color,box-shadow] duration-200 ease-out hover:bg-surface-raised hover:shadow-[0_12px_28px_-16px_rgb(12_21_63/0.35)] hover:[transform:perspective(700px)_rotateX(4deg)_rotateY(-4deg)_translateY(-2px)] motion-reduce:transition-none motion-reduce:hover:[transform:none]";

const FEATURE_CARD =
  "rounded-xl bg-[linear-gradient(140deg,var(--color-accent-soft),color-mix(in_srgb,var(--color-accent-soft)_35%,var(--color-surface)))] p-5";

function FeatureCta({ cta }: { cta: string }) {
  return (
    <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-ink">
      {cta}
      <ArrowRight
        size={14}
        weight="bold"
        aria-hidden="true"
        className="transition-transform duration-150 group-hover/feature:translate-x-0.5 motion-reduce:transition-none"
      />
    </span>
  );
}

/* ------------------------------------------------------------- agents -- */

const BUTTON =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none";

/**
 * One agent: its mark, name and line, then the same two buttons its card had
 * on the Agents page — Run agent (or Set up / Unlock / Open, by its state)
 * and Dashboard.
 */
function AgentEntry({ item, live }: { item: MegaItem; live: Live<MenuAgent> }) {
  const agent = live instanceof Map ? live.get(item.key ?? "") : undefined;
  const action =
    agent && agent.actionLabel !== "" ? (
      <NavTabLink
        href={agent.actionHref}
        className={`${BUTTON} ${
          agent.status === "ready"
            ? "bg-accent text-surface hover:bg-accent-ink"
            : agent.status === "needs-setup"
              ? "bg-warn-soft text-warn hover:bg-warn-soft/70"
              : "border border-border text-ink hover:bg-surface-raised"
        }`}
      >
        {agent.status === "ready" ? (
          <Play size={11} weight="fill" aria-hidden="true" />
        ) : agent.status === "needs-setup" ? (
          <GearSix size={12} weight="fill" aria-hidden="true" />
        ) : agent.status === "locked" ? (
          <LockSimple size={12} weight="bold" aria-hidden="true" />
        ) : null}
        {agent.actionLabel}
        <span className="sr-only">{` — ${item.label}`}</span>
      </NavTabLink>
    ) : agent ? (
      <span className="rounded-full bg-info-soft px-2 py-0.5 text-xs font-medium text-info">Coming soon</span>
    ) : null;

  // Not bought: drawn in grey, its mark without colour, so what the account
  // HAS stands out. Its Unlock button keeps full strength — it is the way in.
  const locked = agent?.status === "locked";
  return (
    <div className={`group/item flex items-start gap-3 rounded-xl p-2.5 ${CARD_MOTION} ${locked ? "bg-ink/[0.03]" : ""}`}>
      <span className={locked ? "opacity-60 grayscale" : ""}>
        <ItemMark item={item} />
      </span>
      <div className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`truncate text-sm font-semibold ${locked ? "text-ink-soft" : "text-ink"}`}>{item.label}</span>
          {locked && (
            <span className="shrink-0 rounded-full bg-slate-soft px-1.5 py-px text-[10px] font-medium text-slate">
              Not purchased
            </span>
          )}
        </span>
        {/* Full `ink-soft`, not a faded one: below it the line fails AA
            contrast (`globals.contrast.test.ts`). The grey is the mark's. */}
        <span className="block truncate text-xs text-ink-soft">{item.description}</span>
        <div className="mt-2 flex min-h-[26px] flex-wrap items-center gap-1.5">
          {live === "loading" || live === null ? (
            // Held at the buttons' size, so nothing jumps when they land.
            <>
              <span aria-hidden="true" className="h-[26px] w-[86px] animate-pulse rounded-md bg-surface-raised" />
              <span aria-hidden="true" className="h-[26px] w-[90px] animate-pulse rounded-md bg-surface-raised" />
            </>
          ) : live === "failed" ? (
            <NavTabLink href="/agents" className={`${BUTTON} border border-border text-ink hover:bg-surface-raised`}>
              Open agents
            </NavTabLink>
          ) : (
            <>
              {action}
              {agent?.dashboardHref && (
                <NavTabLink
                  href={agent.dashboardHref}
                  className={`${BUTTON} border border-border text-ink hover:border-accent/40 hover:bg-accent-soft/50`}
                >
                  <ChartLineUp size={12} weight="bold" aria-hidden="true" />
                  Dashboard
                  <span className="sr-only">{` — ${item.label}`}</span>
                </NavTabLink>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- slideshow -- */

const SLIDE_TONE: Record<MenuSlide["tone"], string> = {
  accent: "text-accent-ink",
  good: "text-good",
  warn: "text-warn",
  crit: "text-crit",
};
const SLIDE_MS = 4200;

/**
 * The feature card as a slideshow of what is true right now. Advances on its
 * own while the modal is open, holds still under the pointer or keyboard
 * focus, and not at all for someone who asked for reduced motion (the dots
 * still step through it).
 */
function FeatureSlideshow({
  slides,
  feature,
  running,
}: {
  slides: MenuSlide[];
  feature: NonNullable<MegaTab["menu"]>["feature"];
  running: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const current = Math.min(index, slides.length - 1);

  useEffect(() => {
    setReduced(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  }, []);
  // Each opening starts from the first slide.
  useEffect(() => {
    if (running) setIndex(0);
  }, [running]);
  useEffect(() => {
    if (!running || paused || reduced || slides.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, [running, paused, reduced, slides.length]);

  return (
    <div
      className={`flex flex-1 flex-col ${FEATURE_CARD}`}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="pr-6 text-sm font-bold text-ink">{feature.title}</span>
      {/* The slides share one box and cross-fade, the leaving one sliding out
          left and the next in from the right. */}
      <div className="relative mt-4 min-h-[150px] flex-1 overflow-hidden" aria-live={paused ? "polite" : "off"}>
        {slides.map((slide, i) => {
          const where =
            i === current ? "translate-x-0 opacity-100" : i < current ? "-translate-x-6 opacity-0" : "translate-x-6 opacity-0";
          return (
            <div
              key={`${slide.kicker}-${i}`}
              aria-hidden={i !== current}
              className={`absolute inset-0 transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none ${where}`}
            >
              <span
                className={`inline-flex items-center gap-1.5 rounded-full bg-surface/80 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${SLIDE_TONE[slide.tone]}`}
              >
                <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none" />
                {slide.kicker}
              </span>
              {slide.value !== "" && (
                <span className={`mt-3 block text-3xl font-bold leading-none tracking-tight ${SLIDE_TONE[slide.tone]}`}>
                  {slide.value}
                </span>
              )}
              <span className={`block text-sm font-semibold text-ink ${slide.value !== "" ? "mt-1.5" : "mt-3"}`}>
                {slide.label}
              </span>
              <span className="mt-1.5 line-clamp-3 block text-sm text-ink-soft">{slide.body}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        {slides.length > 1 ? (
          <div className="flex items-center gap-1.5">
            {slides.map((slide, i) => (
              <button
                key={`${slide.kicker}-${i}`}
                type="button"
                aria-label={`Show ${slide.kicker}`}
                aria-current={i === current ? "true" : undefined}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none ${
                  i === current ? "w-5 bg-accent" : "w-1.5 bg-accent/30 hover:bg-accent/60"
                }`}
              />
            ))}
          </div>
        ) : (
          <span />
        )}
        <NavTabLink
          href={feature.href}
          prefetch="intent"
          className="group/feature inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-accent-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {feature.cta}
          <ArrowRight
            size={14}
            weight="bold"
            aria-hidden="true"
            className="transition-transform duration-150 group-hover/feature:translate-x-0.5 motion-reduce:transition-none"
          />
        </NavTabLink>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- integrations -- */

const STATE_LOOK: Record<MenuIntegrationState, { label: string; tone: string }> = {
  connected: { label: "Connected", tone: "bg-good-soft text-good" },
  "not-connected": { label: "Not connected", tone: "bg-slate-soft text-slate" },
  "finish-setup": { label: "Finish setup", tone: "bg-warn-soft text-warn" },
  expired: { label: "Expired", tone: "bg-crit-soft text-crit" },
  unknown: { label: "Unknown", tone: "bg-slate-soft text-slate" },
};

/**
 * One integration: its mark and name, whether it is connected, and — when it
 * is — as whom (the login email where one is recorded). The whole entry opens
 * the Connections page, where it is connected or managed.
 */
function IntegrationEntry({ item, live }: { item: MegaItem; live: Live<MenuIntegration> }) {
  const row = live instanceof Map ? live.get(item.key ?? "") : undefined;
  const look = row ? STATE_LOOK[row.state] : null;
  return (
    <NavTabLink
      href={item.href}
      prefetch="intent"
      className={`group/item flex items-start gap-3 rounded-xl p-2.5 focus-visible:bg-surface-raised focus-visible:outline-none ${CARD_MOTION}`}
    >
      <ItemMark item={item} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{item.label}</span>
        <span className="mt-1 flex min-h-[20px] items-center">
          {look ? (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${look.tone}`}>
              <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
              {look.label}
            </span>
          ) : live === "loading" || live === null ? (
            <span aria-hidden="true" className="h-[18px] w-20 animate-pulse rounded-full bg-surface-raised" />
          ) : (
            <span className="text-xs text-ink-soft">Status on the Connections page</span>
          )}
        </span>
        {/* Who it is connected as. Only for a connected row: an old name
            beside "Not connected" reads as a contradiction. */}
        {row?.state === "connected" && row.account !== "" ? (
          <span className="mt-1 block truncate text-xs text-ink" title={row.account}>
            {row.account}
          </span>
        ) : (
          <span className="mt-1 block truncate text-xs text-ink-soft">{item.description}</span>
        )}
      </span>
    </NavTabLink>
  );
}

/* -------------------------------------------------------- performance -- */

function CloseButton({ onClose, className = "absolute -right-1 -top-1 z-10" }: { onClose: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close menu"
      className={`${className} grid size-8 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}
    >
      <X size={16} weight="bold" aria-hidden="true" />
    </button>
  );
}

const PERF_TONE: Record<MenuPerfCard["id"], { icon: React.ReactNode; tone: string }> = {
  traffic: { icon: <ChartLineUp size={14} weight="bold" />, tone: "text-teal bg-teal-soft" },
  ads: { icon: <Megaphone size={14} weight="fill" />, tone: "text-warn bg-warn-soft" },
  cross: { icon: <SquaresFour size={14} weight="fill" />, tone: "text-accent bg-accent-soft" },
};
/** One colour per line, in the order the cross-channel card lists them. */
const LINE_TONES = ["stroke-accent", "stroke-teal", "stroke-warn"];

/**
 * A preview of a daily series: its shape only, each line scaled to its own
 * range so lines in different units (sessions, clicks, money) can share it.
 * The figures are beside it; the full chart is behind View.
 */
function Sparkline({ series }: { series: MenuPerfCard["series"] }) {
  const lines = series.filter((line) => line.values.length > 1);
  if (lines.length === 0) return null;
  const W = 100;
  const H = 28;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="mt-2 h-7 w-full overflow-visible">
      {lines.map((line, i) => {
        const max = Math.max(...line.values);
        const min = Math.min(...line.values);
        const span = max - min || 1;
        const points = line.values
          .map((v, x) => `${((x / (line.values.length - 1)) * W).toFixed(2)},${(H - 2 - ((v - min) / span) * (H - 4)).toFixed(2)}`)
          .join(" ");
        return (
          <polyline
            key={line.label}
            points={points}
            fill="none"
            strokeWidth={1.6}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
            className={LINE_TONES[i % LINE_TONES.length]}
          />
        );
      })}
    </svg>
  );
}

/**
 * The Agents menu's right-hand column (2026-10-14): the Performance page as
 * three compact cards — website traffic, paid advertising, cross-channel —
 * each with View to that section of the page. In the column the slideshow
 * used to fill, at the menu's same size: they scroll inside it if the column
 * is shorter than the three.
 */
function PerformanceStack({ live, onClose }: { live: Read<MenuPerfCard[]>; onClose: () => void }) {
  return (
    <div className={`relative flex min-h-0 flex-col ${FEATURE_CARD} !p-3`}>
      <div className="flex items-center justify-between gap-2 pl-1">
        <span className="text-sm font-bold text-ink">Performance</span>
        <CloseButton onClose={onClose} className="-mr-1 -mt-1" />
      </div>
      {/* The column is as tall as the agent list beside it, and no taller. */}
      <div className="relative mt-1 min-h-[22rem] flex-1">
        <div className="absolute inset-0 flex flex-col gap-2 overflow-y-auto overscroll-contain pr-0.5">
          {Array.isArray(live) ? (
            live.map((card) => <PerfCard key={card.id} card={card} />)
          ) : live === "failed" ? (
            <p className="rounded-lg bg-surface/80 p-3 text-xs text-ink-soft">
              Couldn&rsquo;t load performance just now.{" "}
              <NavTabLink href="/analytics" className="font-semibold text-accent-ink underline">
                Open Performance
              </NavTabLink>
            </p>
          ) : (
            // Held at the cards' size while the figures load.
            [0, 1, 2].map((i) => <span key={i} aria-hidden="true" className="block h-[7.5rem] shrink-0 animate-pulse rounded-lg bg-surface/70" />)
          )}
        </div>
      </div>
    </div>
  );
}

function PerfCard({ card }: { card: MenuPerfCard }) {
  const look = PERF_TONE[card.id];
  return (
    <section className="shrink-0 rounded-lg border border-ink/10 bg-surface p-2.5 shadow-[0_1px_2px_rgb(12_21_63/0.05)]">
      <header className="flex items-center gap-2">
        <span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-md ${look.tone}`}>
          {look.icon}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-xs font-bold text-ink">{card.title}</h3>
        <NavTabLink
          href={card.href}
          prefetch="intent"
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          View
          <ArrowRight size={11} weight="bold" aria-hidden="true" />
          <span className="sr-only">{` ${card.title}`}</span>
        </NavTabLink>
      </header>
      {card.note ? (
        <p className="mt-2 text-xs text-ink-soft">{card.note}</p>
      ) : (
        <>
          <dl className={`mt-2 grid gap-x-2 ${card.stats.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {card.stats.map((stat) => (
              <div key={stat.label} className="min-w-0">
                <dt className="truncate text-[11px] text-ink-soft" title={stat.label}>
                  {stat.label}
                </dt>
                <dd className="truncate text-sm font-bold tabular-nums text-ink" title={stat.value}>
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
          <Sparkline series={card.series} />
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------ pricing -- */

/*
 * The cart: which agents are picked and how they are billed. Module scope, so
 * it survives the menu closing, switching to another menu and coming back,
 * and moving between the compact list and the full board — one cart for both.
 * Checkout itself is the Pricing page's own (`CheckoutCta` → `startCheckout`).
 */
let cart: { ids: string[]; period: BillingPeriod; currency: Currency | null } = {
  ids: [],
  period: "monthly",
  currency: null,
};
/** Sheets read through the INR/USD switch, by the currency asked for. */
const sheetsByCurrency = new Map<Currency, { sheet: PriceSheet; ownedIds: string[] }>();

/** The agents and their names before the live sheet lands: the bundled catalog. Never its prices. */
const CATALOG_LINES = catalogSheet(PRICING_AGENTS).agents;

/** "AI Automation for Meta Ads" → "Meta Ads": the catalog titles do not fit a row. */
const shortTitle = (title: string) =>
  title.replace(/^AI Automation for /, "").replace(/^AI /, "").replace(/ Agent$/, "");

/**
 * Pricing, in two steps. First a compact list — each agent's mark, name and
 * price, Add to cart, and the running cart with checkout. View pricing opens
 * the Pricing page's own full board (features, offers, autopay) on the same
 * cart; Back returns. Prices and "Purchased" are the same price sheet and
 * purchases that page reads — nothing here is a number of its own.
 */
function PricingPanel({
  live,
  full,
  onFull,
  onClose,
}: {
  live: Read<{ sheet: PriceSheet; ownedIds: string[] }>;
  full: boolean;
  onFull: (full: boolean) => void;
  onClose: () => void;
}) {
  const [ids, setIds] = useState<string[]>(cart.ids);
  const [period, setPeriod] = useState<BillingPeriod>(cart.period);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const updateIds = (next: string[]) => {
    cart = { ...cart, ids: next };
    setIds(next);
  };
  const updatePeriod = (next: BillingPeriod) => {
    cart = { ...cart, period: next };
    setPeriod(next);
  };
  useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => setJustAdded(null), 2200);
    return () => clearTimeout(timer);
  }, [justAdded]);

  // The INR/USD switch: the menu's own sheet is the location's currency; the
  // other one is read through the same action, in that currency, on demand.
  const base = live !== null && typeof live === "object" ? live : null;
  const [currency, setCurrency] = useState<Currency | null>(cart.currency);
  const [alt, setAlt] = useState<{ sheet: PriceSheet; ownedIds: string[] } | null>(() =>
    cart.currency ? (sheetsByCurrency.get(cart.currency) ?? null) : null,
  );
  const [currencyFailed, setCurrencyFailed] = useState(false);
  const wantsOther = currency !== null && base !== null && base.sheet.currency !== currency;
  useEffect(() => {
    if (!wantsOther || !currency) return;
    const cached = sheetsByCurrency.get(currency);
    if (cached) {
      setAlt(cached);
      return;
    }
    let active = true;
    setAlt(null);
    setCurrencyFailed(false);
    loadPricingMenu(currency)
      .then((value) => {
        sheetsByCurrency.set(currency, value);
        if (active) setAlt(value);
      })
      .catch(() => {
        if (!active) return;
        setCurrencyFailed(true);
        cart = { ...cart, currency: null };
        setCurrency(null);
      });
    return () => {
      active = false;
    };
  }, [wantsOther, currency]);
  const chooseCurrency = (next: Currency) => {
    cart = { ...cart, currency: next };
    setCurrency(next);
  };

  const data = wantsOther ? alt : base;
  const sheet = data?.sheet ?? null;
  const owned = new Set(data?.ownedIds ?? []);
  // Something owned since it was put in the cart is not charged for again.
  const inCart = ids.filter((id) => !owned.has(id));
  const money = (value: number) => (sheet ? formatCurrency(value, sheet.currency) : "");
  const total = sheet
    ? inCart.reduce((sum, id) => {
        const line = sheet.agents.find((l) => l.id === id);
        const price = line ? chargeFor(line, period) : null;
        return sum + (price ?? 0);
      }, 0)
    : 0;
  const per = period === "monthly" ? "mo" : "yr";

  const toggle = (id: string) => {
    if (inCart.includes(id)) updateIds(ids.filter((x) => x !== id));
    else {
      // Pressing twice never adds twice.
      updateIds([...ids.filter((x) => x !== id), id]);
      setJustAdded(id);
    }
  };

  const header = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {full ? (
          <button
            type="button"
            onClick={() => onFull(false)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-ink transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ArrowRight size={12} weight="bold" aria-hidden="true" className="rotate-180" />
            Back
          </button>
        ) : (
          // The file itself, at once: through the optimiser and lazy, it was
          // the last thing to appear when Pricing opened. 16 KB.
          <Image src="/leadbyte-logo.png" alt="LeadByte" width={512} height={133} unoptimized loading="eager" className="h-7 w-auto" />
        )}
        <h2 className="truncate text-base font-bold text-ink">{full ? "All pricing details" : "Pricing"}</h2>
      </div>
      <div className="flex items-center gap-2">
        {/* As on the Pricing page: only when the live table answers — the
            fallback catalog is USD only. */}
        {base?.sheet.source === "live" && (
          <div role="radiogroup" aria-label="Currency" className="inline-flex rounded-lg border border-border bg-surface p-0.5">
            {CURRENCIES.map((option) => {
              const on = (currency ?? base.sheet.currency) === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => chooseCurrency(option)}
                  className={`min-h-7 rounded-md px-2.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${
                    on ? "bg-accent text-surface" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {option === "INR" ? "₹ INR" : "$ USD"}
                </button>
              );
            })}
          </div>
        )}
        <CloseButton onClose={onClose} className="" />
      </div>
    </div>
  );

  const currencyNote =
    currencyFailed ? (
      <p role="status" className="rounded-lg bg-info-soft px-3 py-2 text-xs text-info">
        Couldn&rsquo;t load prices in that currency just now, so they are shown in {sheet?.currency ?? "the default"}.
      </p>
    ) : currency && sheet && sheet.currency !== currency ? (
      <p role="status" className="rounded-lg bg-info-soft px-3 py-2 text-xs text-info">
        Prices in {currency} aren&rsquo;t available yet, so they are shown in {sheet.currency}.
      </p>
    ) : null;

  if (live === "failed" || (base !== null && !sheet && !wantsOther)) {
    return (
      <div className="flex flex-col gap-3">
        {header}
        <p className="rounded-lg bg-surface-raised p-4 text-sm text-ink-soft">
          Couldn&rsquo;t load prices just now.{" "}
          <NavTabLink href="/pricing" className="font-semibold text-accent-ink underline">
            Open the Pricing page
          </NavTabLink>
        </p>
      </div>
    );
  }

  // The full board, on the same cart. Its own checkout, autopay and toggle.
  if (full && (sheet || wantsOther)) {
    return (
      <div className="flex min-w-0 flex-col gap-3 animate-[reveal-fade_200ms_ease-out_both] motion-reduce:animate-none">
        {header}
        {currencyNote}
        {sheet ? (
          <AgentPricingBoard
            sheet={sheet}
            signedIn
            ownedIds={data?.ownedIds ?? []}
            selected={inCart}
            onSelectedChange={updateIds}
            period={period}
            onPeriodChange={updatePeriod}
          />
        ) : (
          <p role="status" className="rounded-lg bg-surface-raised p-4 text-sm text-ink-soft">
            Loading prices in {currency}…
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {header}
      {currencyNote}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">Pick the agents you need — each is billed on its own.</p>
        {/* The board's own toggle, small. */}
        <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-lg border border-border bg-surface p-0.5">
          {(["monthly", "yearly"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={period === option}
              onClick={() => updatePeriod(option)}
              className={`min-h-7 rounded-md px-2.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${
                period === option ? "bg-accent text-surface" : "text-ink-soft hover:text-ink"
              }`}
            >
              {option === "monthly" ? "Monthly" : "Annually"}
            </button>
          ))}
        </div>
      </div>

      {/* Rows are drawn from the catalog's ids at once; only the price waits
          for the sheet, in a box already its size. */}
      <ul className="grid grid-cols-3 gap-1.5">
        {(sheet?.agents ?? CATALOG_LINES).map((line) => {
          const price = sheet ? chargeFor(line, period) : null;
          const was = wasFor(line, period);
          const has = owned.has(line.id);
          const added = inCart.includes(line.id);
          const logo = agentLogoSrc(line.id);
          return (
            <li
              key={line.id}
              className={`flex min-w-0 items-center gap-2.5 rounded-xl border p-2 transition-colors ${
                added ? "border-accent/40 bg-accent-soft/40" : "border-ink/10 bg-surface"
              }`}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface">
                {logo ? (
                  <Image src={logo} alt="" aria-hidden="true" unoptimized loading="eager" width={20} height={20} className="size-5 object-contain" />
                ) : (
                  <Robot size={18} weight="duotone" aria-hidden="true" className="text-accent" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink" title={line.title}>
                  {shortTitle(line.title)}
                </span>
                <span className="flex min-h-4 items-baseline gap-1.5 text-xs">
                  {!sheet ? (
                    <span aria-hidden="true" className="h-3 w-20 animate-pulse rounded bg-surface-raised" />
                  ) : line.isCustom || price === null ? (
                    <span className="text-ink-soft">Custom pricing</span>
                  ) : (
                    <>
                      <span className="font-bold text-ink">
                        {money(price)}/{per}
                      </span>
                      {was !== null && <span className="text-ink-soft line-through">{money(was)}</span>}
                    </>
                  )}
                </span>
              </span>
              {!sheet ? (
                <span aria-hidden="true" className="h-6 w-[4.6rem] shrink-0 animate-pulse rounded-md bg-surface-raised" />
              ) : has ? (
                <span className="shrink-0 rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-semibold text-good">Purchased</span>
              ) : line.isCustom || price === null ? (
                <button
                  type="button"
                  onClick={() => onFull(true)}
                  className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-semibold text-ink hover:bg-surface-raised"
                >
                  Details
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => toggle(line.id)}
                  aria-pressed={added}
                  className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors motion-reduce:transition-none ${
                    added ? "bg-good-soft text-good hover:bg-crit-soft hover:text-crit" : "bg-accent text-surface hover:bg-accent-ink"
                  }`}
                  title={added ? "Remove from cart" : undefined}
                >
                  {added ? "Added ✓" : "Add to cart"}
                  <span className="sr-only">{` — ${line.title}`}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* The cart, and the way on. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-ground/50 px-3 py-2.5">
        <p className="min-w-0 text-sm text-ink" aria-live="polite">
          {justAdded && sheet ? (
            <span className="font-semibold text-good">
              Added {shortTitle(sheet.agents.find((l) => l.id === justAdded)?.title ?? "")} to your cart.
            </span>
          ) : inCart.length > 0 ? (
            <>
              <span className="font-semibold">
                {inCart.length} in cart · {money(total)}/{per}
              </span>
              <span className="text-ink-soft"> · billed {period === "monthly" ? "monthly" : "yearly"}</span>
            </>
          ) : (
            <span className="text-ink-soft">Your cart is empty.</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onFull(true)}
            disabled={!sheet}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-soft disabled:opacity-60"
          >
            View pricing
            <ArrowRight size={13} weight="bold" aria-hidden="true" />
          </button>
          {sheet && inCart.length > 0 && (
            <CheckoutCta signedIn selected={inCart} period={period} currency={sheet.currency} />
          )}
        </div>
      </div>
    </div>
  );
}

function ItemMark({ item }: { item: MegaItem }) {
  const tile =
    "flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface shadow-[0_1px_2px_rgb(12_21_63/0.05)] transition-[border-color,transform,box-shadow] duration-200 ease-out group-hover/item:-rotate-6 group-hover/item:scale-105 group-hover/item:border-accent/30 group-hover/item:shadow-[0_6px_14px_-8px_rgb(12_21_63/0.4)] motion-reduce:transition-none motion-reduce:group-hover/item:transform-none";
  if (item.logo) {
    return (
      <span className={tile}>
        {/* Decorative: the name is beside it. `unoptimized`: mostly SVGs. */}
        {/* `eager`: the default `lazy` waits until the image is on screen,
            so every opening started the logos' downloads only then. */}
        <Image src={item.logo} alt="" aria-hidden="true" unoptimized loading="eager" width={22} height={22} className="size-[22px] object-contain" />
      </span>
    );
  }
  const Icon = ICONS[item.icon ?? "overview"];
  return (
    <span className={`${tile} text-accent`}>
      <Icon size={20} weight="duotone" aria-hidden="true" />
    </span>
  );
}
