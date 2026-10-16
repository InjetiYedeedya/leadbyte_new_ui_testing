import { devGlobal } from "@/lib/dev-global";

/**
 * One paid action at a time per account, and not too often.
 *
 * ## Why
 *
 * Launching a campaign, running Lead Qualification (which EMAILS leads),
 * starting a forced crawl, an AEO audit or the creative-prompt pipeline each
 * cost real money downstream, and none had any server-side guard: a
 * double-click that beat the button's own disabling, a second tab, or a retry
 * after a timeout ran the whole thing again (audit, 2026-09-25).
 *
 * ## What it is, and its limit
 *
 * An in-memory record keyed on the SIGNED account id and the action. It
 * stops the realistic cases — two submits a moment apart reach the same
 * server — and a `minIntervalMs` stops a loop from burning budget. It is per
 * server instance, the same limit `strategy-inflight.ts` has, so a determined
 * caller spread across instances is the backend's to stop; that request is on
 * the list handed to the backend team.
 */

interface Entry {
  /** When the action started; cleared when it ends. */
  running: number | null;
  /** When it last started, for the minimum interval. */
  lastStart: number;
}

const entries = devGlobal<Record<string, Entry>>("action-guard", () => ({}));

export interface GuardOptions {
  /** A run older than this is assumed dead and no longer blocks. */
  staleAfterMs: number;
  /** The least time between two starts of the same action. */
  minIntervalMs?: number;
}

export type GuardResult =
  | {
      ok: true;
      /** The action finished; the minimum interval still applies. */
      release: () => void;
      /**
       * Nothing was started after all (the request failed before anything
       * ran), so neither the run nor the interval should hold the next try.
       */
      forget: () => void;
    }
  | { ok: false; reason: "running" | "too-soon" };

export function beginAction(
  account: string,
  action: string,
  { staleAfterMs, minIntervalMs = 0 }: GuardOptions,
  now: number = Date.now(),
): GuardResult {
  const key = `${account}::${action}`;
  const entry = entries[key];
  if (entry?.running !== null && entry?.running !== undefined && now - entry.running < staleAfterMs) {
    return { ok: false, reason: "running" };
  }
  if (entry && now - entry.lastStart < minIntervalMs) {
    return { ok: false, reason: "too-soon" };
  }
  entries[key] = { running: now, lastStart: now };
  const previous = entry;
  return {
    ok: true,
    release: () => {
      const current = entries[key];
      if (current) current.running = null;
    },
    forget: () => {
      if (previous) entries[key] = { running: null, lastStart: previous.lastStart };
      else delete entries[key];
    },
  };
}

/** What to tell the customer when a guard refuses. */
export function guardMessage(reason: "running" | "too-soon"): string {
  return reason === "running"
    ? "That is already running. Give it a moment to finish."
    : "That was just started. Please wait a minute before starting it again.";
}
