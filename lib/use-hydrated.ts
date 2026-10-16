import { useSyncExternalStore } from "react";

/**
 * False on the server and during hydration, true once the browser has taken
 * over. CLIENT ONLY — for islands that print something only the viewer's own
 * browser knows, such as the time of day in their time zone.
 *
 * The server renders in UTC and a browser in India renders five and a half
 * hours on, so a time printed during render differed between the two and
 * React threw away the server's HTML for that part of the page (audit,
 * 2026-09-29). Printing the time only once this is true keeps the first render
 * identical on both sides.
 */
const subscribe = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
