"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

/**
 * The card's scrolling layer, for what inside it follows the scroll (the
 * business profile's chapter stack): inside a held card it is THIS element
 * that scrolls, and the window stands still. `null` outside a card, where the
 * window scrolls as ever.
 */
const FitScrollContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

export function useFitScroller(): RefObject<HTMLDivElement | null> | null {
  return useContext(FitScrollContext);
}

/**
 * The page's frosted card, held to the window: it never runs past where the
 * window ends (less the page's own bottom padding) and its CONTENTS scroll
 * inside it, so the page around it — header, background, the card's own
 * frame — stays put. Every frosted page, through `PageContainer`.
 *
 * Two sizes (`mode`):
 * - `cap` (the default): AT MOST the window's height. A short page keeps a
 *   short card, a long one stops at the window's edge and scrolls inside.
 * - `fill`: EXACTLY the window's height, whatever it holds — for a page whose
 *   contents size themselves to the card (the agents dashboard split, which
 *   measures the card's height and could not, were the card measuring it).
 *
 * Two layers, on purpose. The outer one is the frosted card and never
 * scrolls; the inner one scrolls. The frost is a `::before` laid over the
 * card, and on a scrolling element it would scroll away with the first
 * screenful and leave the rest on bare background.
 *
 * The height is MEASURED (top of the card to the bottom of the window), not
 * `100dvh - <header>`: what sits above the card — the sticky header, the
 * connect banner that comes and goes — is not one number, and any typed
 * figure is the `top-[69px]` trap. Until it is measured the card falls back
 * to an estimate, so the first paint is close rather than full length.
 *
 * `data-fit-scroll` marks the scrolling layer, so something inside it (the
 * agents dashboard, the scroll lock) can find the card rather than the window.
 */
export function FitToWindow({
  frameClassName,
  mode = "cap",
  children,
}: {
  frameClassName: string;
  mode?: "cap" | "fill";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const below = el.parentElement ? parseFloat(getComputedStyle(el.parentElement).paddingBottom) || 0 : 0;
      const top = el.getBoundingClientRect().top + window.scrollY;
      // A floor, so a very short window still gets a usable card; under it
      // the page scrolls as a last resort rather than squeezing to nothing.
      setHeight(Math.max(360, Math.floor(window.innerHeight - top - below)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // `cap`: a column whose scroller shrinks to the cap (`min-h-0`) and is
  // otherwise its content's height. `fill`: a fixed height the scroller fills.
  const size =
    mode === "fill"
      ? "h-[var(--fit-h,calc(100dvh-9rem))]"
      : "flex flex-col max-h-[var(--fit-h,calc(100dvh-9rem))]";
  const scroller = mode === "fill" ? "h-full" : "min-h-0";

  return (
    <div
      ref={ref}
      className={`${frameClassName} ${size} overflow-hidden print:h-auto print:max-h-none print:overflow-visible`}
      style={height === null ? undefined : ({ "--fit-h": `${height}px` } as React.CSSProperties)}
    >
      <div
        ref={scrollerRef}
        data-fit-scroll
        className={`${scroller} overflow-y-auto overscroll-contain p-4 print:h-auto print:overflow-visible print:p-0`}
      >
        <FitScrollContext.Provider value={scrollerRef}>{children}</FitScrollContext.Provider>
      </div>
    </div>
  );
}
