"use client";

import { useEffect } from "react";
import { Robot } from "@phosphor-icons/react";

/** Asks the top menu to open one of its modals (`nav-mega-menu.tsx` listens). */
export const OPEN_NAV_MENU_EVENT = "leadbyte:open-nav-menu";

/**
 * Opens the top menu's Agents modal from the page. The agent cards live there
 * since 2026-10-14; this is the way to them for someone who did not think to
 * hover the tab.
 */
export function ShowAgentsButton({ autoOpen = false }: { autoOpen?: boolean }) {
  const show = () => window.dispatchEvent(new CustomEvent(OPEN_NAV_MENU_EVENT, { detail: "/agents" }));
  // Landing on bare `/agents` (a bookmark, a link) opens the agents at once
  // rather than a page that only points at them. A tick later, so the top
  // menu — which this event asks — is listening.
  useEffect(() => {
    if (!autoOpen) return;
    const timer = setTimeout(show, 50);
    return () => clearTimeout(timer);
  }, [autoOpen]);
  return (
    <button
      type="button"
      onClick={show}
      className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-accent-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Robot size={16} weight="fill" aria-hidden="true" />
      Show agents
    </button>
  );
}
