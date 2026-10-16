"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Scales its contents down just enough to fit the page's card without
 * scrolling (2026-10-13: "the screen to be fitted without any scrolling").
 * The Agents page is one screen of panels to take in at a glance; a few
 * pixels too tall for the window should not cost the bottom row.
 *
 * - Only where it is WIDE (a desktop window, and the list at card width): on
 *   a phone, or beside an open dashboard, the content scrolls as it always
 *   did — shrinking it there would only make it unreadable.
 * - Never below `min` (75%): past that the text is too small to be worth it,
 *   and the card scrolls instead.
 * - CSS `zoom`, not a transform: zoom re-lays the content out at the smaller
 *   size, so it still fills the width and leaves no gap below it. A transform
 *   paints smaller but keeps the original box.
 *
 * It measures against the card's scrolling layer (`[data-fit-scroll]`, from
 * `FitToWindow`) — the room from where this starts to the card's bottom edge.
 */
export function ShrinkToFit({
  children,
  min = 0.75,
  className = "",
}: {
  children: ReactNode;
  min?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const scroller = el.closest<HTMLElement>("[data-fit-scroll]");
    if (!scroller) return;

    // The room it had when it last measured. Zoom only GROWS when the room
    // grows (a taller window, a resized card). Zooming re-wraps the text, and
    // smaller text wraps onto fewer lines, so the content's own height moves
    // with every zoom: letting that alone push the zoom back up made it flip
    // between two sizes many times a second and the whole page shook
    // (2026-10-15).
    let lastRoom = { height: -1, width: -1 };
    const measure = () => {
      const current = zoomRef.current;
      // Wide: a desktop window, and this at the width of a card's list (42rem)
      // rather than the narrow list beside an open dashboard.
      const width = el.parentElement?.clientWidth ?? 0;
      const wide = window.innerWidth >= 1024 && width >= 672;
      const style = getComputedStyle(scroller);
      const padTop = parseFloat(style.paddingTop) || 0;
      const padBottom = parseFloat(style.paddingBottom) || 0;
      const box = el.getBoundingClientRect();
      // Where this starts inside the card's content, whatever it is scrolled to.
      const offset = box.top - scroller.getBoundingClientRect().top - padTop + scroller.scrollTop;
      const available = scroller.clientHeight - padTop - padBottom - offset;
      // Its height at full size: the rendered height is already zoomed.
      const natural = box.height / current;
      const next =
        wide && available > 0 && natural > available
          ? Math.max(min, Math.floor((available / natural) * 1000) / 1000)
          : 1;
      const room = { height: scroller.clientHeight, width: window.innerWidth };
      const roomGrew = room.height > lastRoom.height || room.width !== lastRoom.width;
      lastRoom = room;
      // Shrinking is always allowed; growing back only for more room.
      if (next > current && !roomGrew && wide) return;
      if (Math.abs(next - current) < 0.004) return;
      zoomRef.current = next;
      setZoom(next);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(scroller);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [min]);

  return (
    <div ref={ref} className={className} style={zoom === 1 ? undefined : { zoom }}>
      {children}
    </div>
  );
}
