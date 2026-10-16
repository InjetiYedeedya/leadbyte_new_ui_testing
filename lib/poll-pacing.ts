/**
 * How every screen that asks the server "is it done yet?" paces itself.
 *
 * ## Why this exists (Error 1102, 2026-10-16)
 *
 * The app runs on Cloudflare's Free plan — about 10ms of CPU per request, and
 * moving to Paid is not an option. Every poll is a Server Action, which is a
 * full request that starts Next and spends that budget. Ten screens polled
 * every 1.5-5 seconds, only one of them stopped in a hidden tab, and most had
 * no end — so one forgotten tab on the analysis wait screen sent ~2,400
 * requests an hour, and enough of that pushed the whole Worker over its
 * limits until even `/login` answered "Worker exceeded resource limits".
 *
 * Two rules, for every poll:
 *
 * - **No poll from a tab nobody can see.** `whenVisible()` is awaited before
 *   each call; a hidden tab simply waits, and catches up the moment it is
 *   looked at again.
 * - **The longer it runs, the slower it asks.** `pollDelay` keeps the screen's
 *   own pace for the first two minutes — when nearly every job finishes, and
 *   when someone is actually watching — then backs off to 15s, and to 60s
 *   after ten minutes. Nothing stops outright, so no screen needs a new
 *   "gave up" state; it just stops costing much.
 */

const FAST_FOR_MS = 2 * 60_000;
const MEDIUM_FOR_MS = 10 * 60_000;
const MEDIUM_MS = 15_000;
const SLOW_MS = 60_000;

/** The wait before the next poll, given how long this screen has been polling. */
export function pollDelay(baseMs: number, elapsedMs: number): number {
  if (elapsedMs < FAST_FOR_MS) return baseMs;
  if (elapsedMs < MEDIUM_FOR_MS) return Math.max(baseMs, MEDIUM_MS);
  return Math.max(baseMs, SLOW_MS);
}

/** Resolves at once in a visible tab; in a hidden one, when it is shown again. */
export function whenVisible(): Promise<void> {
  if (typeof document === "undefined" || document.visibilityState !== "hidden") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const onChange = () => {
      if (document.visibilityState === "hidden") return;
      document.removeEventListener("visibilitychange", onChange);
      resolve();
    };
    document.addEventListener("visibilitychange", onChange);
  });
}
