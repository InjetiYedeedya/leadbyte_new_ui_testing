import { devGlobal } from "@/lib/dev-global";
import { TURN_TIMEOUT_MS } from "@/lib/data/marketing-strategy";

/**
 * One strategy turn at a time, per account.
 *
 * ## Why this is needed on the server as well as in the button
 *
 * `SubmitButton` disables itself while a turn is in flight, which stops the
 * obvious double-press. It cannot stop a reload followed by another press, a
 * second tab, or a customer who gives up waiting and clicks again on a fresh
 * page — and every one of those starts another agent run.
 *
 * That is not a cosmetic problem. The agent is stateful per `sessionId`, so
 * five concurrent turns are not five copies of one answer; they are five
 * interleaved messages in a single conversation, and five paid runs. Observed
 * live on 2026-09-07: an unresponsive button produced more than five n8n
 * executions of the same turn.
 *
 * ## Why the stale release exists
 *
 * A turn whose Server Action died — a crash, a dev-server reload, a deploy —
 * would otherwise lock that account's conversation forever. The agent's own
 * budget is `TURN_TIMEOUT_MS`, so a turn older than that plus a margin is not
 * still running, whatever this map says.
 *
 * `devGlobal` because Next dev compiles this module once per importing route
 * segment, and a plain module-level map is not guaranteed to be the same object
 * across two Server Actions in different routes (see CLAUDE.md).
 */

const inFlight = devGlobal<Record<string, number>>("strategy-inflight", () => ({}));

/** A turn older than this cannot still be running. */
const STALE_AFTER_MS = TURN_TIMEOUT_MS + 10_000;

function startedAt(businessId: string, now: number): number | null {
  const at = inFlight[businessId];
  if (at === undefined) return null;
  if (now - at > STALE_AFTER_MS) return null;
  return at;
}

/** True when this account already has a turn running. */
export function isTurnInFlight(businessId: string, now: number = Date.now()): boolean {
  return startedAt(businessId, now) !== null;
}

/**
 * Claims the turn. False means one is already running and the caller must not
 * send anything — returning false rather than throwing, because "your previous
 * message is still being answered" is information, not an error.
 */
export function beginTurn(businessId: string, now: number = Date.now()): boolean {
  if (startedAt(businessId, now) !== null) return false;
  inFlight[businessId] = now;
  return true;
}

/** Releases the turn. Safe to call when nothing is running. */
export function endTurn(businessId: string): void {
  delete inFlight[businessId];
}
