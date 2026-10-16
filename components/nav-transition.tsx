"use client";

/**
 * Showing the page's own loader the moment a tab is pressed, instead of when
 * the server gets round to answering.
 *
 * ## The measured problem
 *
 * Every route here is dynamic and rule 0 bans `loading.tsx`, so Next's default
 * prefetch has no boundary to fetch to and resolves to nothing. The first
 * thing that can render after a tab click is therefore the first byte of that
 * route's flight stream. Measured 2026-09-11 on a cold route: the click was
 * handled in 17ms, the server's first byte arrived at 2277ms, and the first
 * pixel changed at 2746ms. For those 2.7 seconds the PREVIOUS screen sat
 * there, complete and unchanged, which is indistinguishable from a click that
 * missed.
 *
 * `prefetch` on the tabs closes most of that in production and none of it in
 * development, where Next disables prefetching outright. This closes the rest,
 * in both.
 *
 * ## Why this is not the nav indicator that was deleted three times
 *
 * Those attempts all decorated the TAB: a wash that made tabs look like
 * buttons, then an underline that collided with the active tab's own. Neither
 * the tab's box, colour nor underline is touched here, and the ring is
 * absolutely positioned so pressing a tab moves nothing. The main event is in
 * the BODY, which swaps to `PageLoading`: the same component the arriving page
 * renders behind its own `<Suspense>`, so when the route commits the loader
 * does not change — it carries on and is then replaced by real content. One
 * animation, one place (CLAUDE.md, "Loading is ONE animation"); this only
 * starts it on time.
 *
 * It is also not `loading.tsx`. No route file is involved and nothing about
 * the flight stream changes; this is ordinary client state in the page that is
 * already on screen.
 *
 * ## Why the click is remembered here and not read from the link
 *
 * The first version asked each link for its own `useLinkStatus` and published
 * that upwards. It did not work, and the reason is worth keeping: the tab strip
 * is inside `PageShell`'s `<Suspense>`, so a navigation used to UNMOUNT it —
 * the header's counts suspend and the whole band was replaced by an empty
 * frame. The links reporting the navigation therefore disappeared in the middle
 * of it, taking their own state with them, and the ring never got to show.
 *
 * That frame now renders the real tab strip, so the band no longer vanishes —
 * but the lesson stands and this no longer depends on it. The provider sits
 * ABOVE that boundary, remembers which href was clicked, and `usePathname`
 * tells it when we arrived. Nothing here depends on the links surviving.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageLoading } from "@/components/ui/page-loading";

interface NavTransition {
  /** Whether the wait has run long enough to be worth showing. Already delayed. */
  showing: boolean;
  /** Which href is bringing it, so one tab is marked and not the rest. */
  start: (href: string) => void;
}

const NavTransitionContext = createContext<NavTransition>({
  showing: false,
  // Inert outside a provider rather than a throw: the tab bars render on
  // screens that do not all use `PageShell`.
  start: () => {},
});

/**
 * How long a navigation must run before the loader is worth showing.
 *
 * The client router cache holds a visited page for 30s, so going back to one
 * is quick — and a loader that appears and vanishes inside a tenth of a second
 * reads as a glitch, not as progress. 120ms was tried first and measured a
 * flash on a cached navigation; 250ms is under the threshold where a wait
 * starts to feel like one, and over the length of a navigation that was
 * effectively free.
 */
const SHOW_AFTER_MS = 250;

/**
 * And how long it stays once shown.
 *
 * Without this, a navigation finishing just after the delay expires paints the
 * loader for a single frame — the very flicker the delay above exists to
 * prevent, moved rather than removed. The cost is honest and bounded: content
 * that arrives during this window waits out the remainder.
 */
const MIN_VISIBLE_MS = 300;

/**
 * The last resort, if a navigation neither arrives nor fails visibly.
 *
 * `usePathname` changing is what normally clears this, and a navigation that is
 * abandoned — a rejected redirect, a route that throws before committing —
 * never changes it. Without a ceiling the loader would sit there permanently,
 * which is a worse failure than the dead screen this exists to fix.
 */
const GIVE_UP_MS = 15000;

/** `active`, held to the timing rules above. */
function useDelayedFlag(active: boolean): boolean {
  const [show, setShow] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    if (active) {
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setShow(true);
      }, SHOW_AFTER_MS);
      return () => clearTimeout(timer);
    }

    if (!show) return;
    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current));
    const timer = setTimeout(() => setShow(false), remaining);
    return () => clearTimeout(timer);
  }, [active, show]);

  return show;
}

export function NavTransitionProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<string | null>(null);
  const pathname = usePathname();

  // Arrived. Keyed on the path rather than on the link, so the back button and
  // any navigation this did not start clear it too.
  useEffect(() => setTarget(null), [pathname]);

  useEffect(() => {
    if (target === null) return;
    const timer = setTimeout(() => setTarget(null), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [target]);

  const start = useCallback((href: string) => setTarget(href), []);

  // EVERY link to one of our pages, not just the tabs: "Explore…", "View
  // performance", "Manage connections" and the rest sat unchanged for up to
  // ~3s on a slow page and read as dead buttons (audit, 2026-09-29). One
  // capture-phase listener covers them all — including ones added later —
  // instead of every link having to remember to opt in. It only STARTS the
  // loader; navigation stays entirely `Link`'s, and the same guards as a tab
  // apply (same page, modifier keys, new tab, off-site, Route Handlers).
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Route Handlers 302 off-site (OAuth starts) — a full page load of its own.
      if (url.pathname.startsWith("/api/")) return;
      if (url.pathname === window.location.pathname) return;
      setTarget(url.pathname + url.search);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  const showing = useDelayedFlag(target !== null);

  return (
    <NavTransitionContext value={{ showing, start }}>
      {children}
    </NavTransitionContext>
  );
}

/**
 * An `onClick` for any link to one of our pages: swaps the body to the loader
 * while the next page is on its way, exactly as a tab does.
 *
 * It was only on the tabs, so every other link to a slow page — "Explore…",
 * "View performance", "Manage connections", the admin rail — sat unchanged for
 * up to ~3s and read as dead (audit, 2026-09-29).
 *
 * The loader clears when the PATH changes, so it may only start for a click
 * that will change it. The page you are already on (or a query change on the
 * same page) never changes it, and ctrl/cmd/middle-click opens a new tab and
 * leaves this one where it is — each of those held the loader for the full
 * 15-second give-up.
 */
export function useNavigationStart(): (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => void {
  const { start } = useContext(NavTransitionContext);
  const pathname = usePathname();
  return useCallback(
    (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      const opensElsewhere =
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0 ||
        event.currentTarget.target === "_blank";
      if (opensElsewhere || event.defaultPrevented) return;
      const path = new URL(href, window.location.href).pathname;
      if (path === pathname) return;
      start(href);
    },
    [start, pathname],
  );
}

/**
 * A plain text link to one of our pages, with the page loader a tab has. For
 * inline links; a button-shaped one is `PendingLink`.
 */
export function NavLink({
  href,
  children,
  className,
  "aria-label": ariaLabel,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  const onNavigate = useNavigationStart();
  return (
    <Link href={href} className={className} aria-label={ariaLabel} onClick={onNavigate(href)}>
      {children}
    </Link>
  );
}

/**
 * A tab. An ordinary `Link` that also tells the provider it was pressed.
 *
 * It renders NO indicator of its own. It used to put a spinner beside the
 * pressed tab's label, which meant a navigation ran two animations at once —
 * that spinner in the strip and `PageLoading` in the body arriving beneath it.
 * "Loading is ONE animation" is the rule, and the body's loader is the one,
 * because it sits where the thing being waited for will appear. A tab does not
 * need to be told it was clicked; it needs to not move, so the strip stays
 * navigable mid-click.
 *
 * Navigation is left entirely to `Link` — this adds an `onClick` and never
 * calls `preventDefault` or pushes a route, so a fault here can cost the
 * feedback but cannot break navigating.
 */
export function NavTabLink({
  href,
  children,
  className,
  prefetch,
  "aria-current": ariaCurrent,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  /**
   * `"intent"`: a FULL prefetch, but only once the reader shows they may go
   * there — pointer over the tab, keyboard focus on it, or a finger landing
   * on it. `true` prefetched every tab the moment it was on screen, so each
   * page view quietly rendered every other primary page on the server too:
   * about thirty backend calls in the background, competing with the page
   * actually being read and tipping the slow ones into the 8s timeout. A
   * hover leads a click by a few hundred ms, which is enough to start the
   * render early, and the click-loader covers the rest.
   */
  prefetch?: boolean | "intent";
  "aria-current"?: "page" | undefined;
}) {
  const onNavigate = useNavigationStart();
  const [armed, setArmed] = useState(false);
  const intent = prefetch === "intent";
  const arm = intent && !armed ? () => setArmed(true) : undefined;

  return (
    <Link
      href={href}
      className={className}
      prefetch={intent ? armed : prefetch}
      aria-current={ariaCurrent}
      onClick={onNavigate(href)}
      onPointerEnter={arm}
      onFocus={arm}
      onTouchStart={arm}
    >
      {children}
    </Link>
  );
}

/** The page body, or the loader once a navigation has run long enough to need one. */
export function NavPendingBody({ children }: { children: React.ReactNode }) {
  return useContext(NavTransitionContext).showing ? <PageLoading /> : children;
}
