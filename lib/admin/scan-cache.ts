import type { TableRead } from "@/lib/data/admin-repo";

/**
 * Whole-table admin reads, kept for a few seconds so moving between admin
 * screens does not read every table again. SERVER-ONLY.
 *
 * ## Why
 *
 * Every admin screen scans whole tables, and several share them: Overview
 * alone scans twelve at once (users, details and ten agent-config tables), and
 * Clients, Grant access, Purchases and User dashboard read the same users
 * table again. Clicking through the panel re-read all of it on every screen,
 * and on the live site that load pushed the server past its limits —
 * "Error 1102: Worker exceeded resource limits" (2026-09-29).
 *
 * ## What keeps it safe
 *
 * - **Only pages read it.** It sits behind `scanTable` in `lib/admin/data.ts`,
 *   which every panel page calls AFTER `requireAdmin()`. Server Actions go to
 *   the repo directly, so a read-modify-write (granting agents writes the user
 *   row back whole) always starts from a fresh row.
 * - **Every admin write clears it** (`put`, `remove` and the key save in
 *   `admin-repo.ts`, plus Refresh), so an admin sees their own change at once.
 * - **Short.** A server instance that did not handle the write can show the
 *   previous copy for up to `TTL_MS`; the Refresh button clears it.
 * - **Failures are never kept**, so a timed-out read is retried next time
 *   instead of showing "couldn't load" for the whole window.
 * - The data is the same for every admin — these are whole-table reads with no
 *   per-account filter — so nothing one admin sees is hidden from another.
 */

const TTL_MS = 30_000;

const entries = new Map<string, { at: number; read: TableRead }>();

export function cachedScan(table: string, now: number = Date.now()): TableRead | null {
  const entry = entries.get(table);
  if (!entry) return null;
  if (now - entry.at > TTL_MS) {
    entries.delete(table);
    return null;
  }
  return entry.read;
}

export function rememberScan(table: string, read: TableRead, now: number = Date.now()): void {
  if (read.ok) entries.set(table, { at: now, read });
}

/** After any admin write — the next screen reads fresh. */
export function dropAdminScans(): void {
  entries.clear();
}
