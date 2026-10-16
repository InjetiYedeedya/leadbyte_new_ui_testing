"use client";

/**
 * The card-by-card scroll stack, as a mechanism anything can use.
 *
 * Each item is sticky at the same offset, so the next one slides up OVER the
 * one before it while that one shrinks and fades out behind. The transition is
 * driven by scroll POSITION, not by an element entering the viewport: an
 * enter-once animation plays at whatever speed it was authored at and then
 * sits there, while a scroll-linked one is under the reader's hand the whole
 * way and can be scrubbed backwards.
 *
 * ## Why this is a shared module and not copy-paste
 *
 * It was written for the Business profile and is now on the Overview too. The
 * maths is subtle enough that a second copy would drift within a week, and
 * both of the traps below were found once, expensively. One implementation,
 * two callers.
 *
 * ## The two traps, both of which cost a round of "you changed nothing"
 *
 * - `useScroll({ target })` reads the element's RENDERED rect, and a sticky
 *   element's rect is frozen at the pin. So the instant an item pinned, its
 *   own progress stopped advancing and the fade, the shrink and the active
 *   index silently never moved. `useFlowTops` reads `offsetHeight` — a layout
 *   measurement sticky does not touch — against the window scroll instead.
 * - The pin offset is MEASURED from `[data-app-header]` with a
 *   `ResizeObserver`, never matched by hand. CLAUDE.md records a `top-[69px]`
 *   that broke silently the first time the header's padding changed.
 *
 * ## Contract
 *
 * Items are rendered as DIRECT children of one measured container, because
 * that is what lets them share a containing block and stack on each other
 * instead of each being trapped in a box of its own. Do not insert anything
 * between the container and the items, and put anything that should NOT stack
 * after the whole component.
 *
 * With `prefers-reduced-motion` the entire mechanism is dropped: no sticky, no
 * transforms, no scroll linkage. The items render as ordinary stacked blocks.
 */

import { useEffect, useRef, useState } from "react";
import type { MotionValue } from "framer-motion";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";

/**
 * How far below the viewport top a pinned item sits.
 *
 * MEASURED, never hard-coded — see the trap note above. It runs on resize
 * rather than on scroll, so it costs nothing while reading.
 */
export function useHeaderOffset(gap = 24): number {
  const [offset, setOffset] = useState(112);

  useEffect(() => {
    const header = document.querySelector("[data-app-header]");
    if (!header) return;

    const measure = () => setOffset(Math.round(header.getBoundingClientRect().height) + gap);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, [gap]);

  return offset;
}

/**
 * How visible the lead is at a scroll position: 1 while every card is below
 * its text, falling to 0 over `span` px as the highest card climbs past it.
 *
 * The lead used to stay fully drawn behind the stack, so any card that rose
 * over its text — a tall one pinning by its foot, a card fading on its way
 * out, the 16px gap between two cards in a row — showed the headline through
 * it: "Your business insights are ready" printed across the audit card on a
 * laptop, and across the whole business card on a phone (2026-10-13). A card
 * now takes the lead's place rather than sliding over a page still showing.
 *
 * A card's top on screen is where the flow puts it, held at its pin once it
 * sticks. Its entrance offset is ignored on purpose: that only pushes it DOWN,
 * so the lead fades a touch early rather than late. Pure, so it is tested.
 */
export function leadOpacityAt(
  scroll: number,
  cards: readonly { flowTop: number; pin: number; goneAt?: number | null }[],
  guardLine: number,
  span = 96,
): number {
  if (cards.length === 0 || span <= 0) return 1;
  let highest = Infinity;
  for (const card of cards) {
    // A card the next one has fully covered is gone from view, though its
    // sticky box still sits at its pin. Counting it held the lead faded for
    // every card after a tall one (2026-10-13).
    if (card.goneAt != null && scroll >= card.goneAt) continue;
    highest = Math.min(highest, Math.max(card.pin, card.flowTop - scroll));
  }
  if (highest === Infinity) return 1;
  const overlap = guardLine - highest;
  return Math.max(0, Math.min(1, 1 - overlap / span));
}

/**
 * Where every item SITS IN THE FLOW, measured once and re-measured on any
 * change of size.
 *
 * `offsetHeight` is a layout measurement and is not affected by sticky or by a
 * transform, so the flow positions are the container's own top plus a running
 * total. Everything else is arithmetic against the window's scroll, which is
 * always true.
 */
function useFlowTops(
  count: number,
  enabled: boolean,
  leadRef?: React.RefObject<HTMLDivElement | null>,
) {
  const ref = useRef<HTMLDivElement>(null);
  const [tops, setTops] = useState<number[]>([]);
  const [heights, setHeights] = useState<number[]>([]);
  const [trailing, setTrailing] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;

    const measure = () => {
      const base = el.getBoundingClientRect().top + window.scrollY;
      const next: number[] = [];
      const cards: number[] = [];
      let y = base;
      for (const child of Array.from(el.children) as HTMLElement[]) {
        next.push(y);
        y += child.offsetHeight;
        // The card itself, without its dwell padding.
        cards.push((child.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0);
      }
      setTops(next);
      setHeights(cards);
      // Everything on the page below the stack. It does not depend on the
      // last item's own padding, so it is safe to size that padding from it.
      setTrailing(Math.max(0, document.documentElement.scrollHeight - y));
      setViewport(window.innerHeight);
      setMaxScroll(document.documentElement.scrollHeight - window.innerHeight);
    };

    measure();

    // An item's height changes when an image loads or a row is opened, and
    // every landing point below it moves with it.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    // The lead sits ABOVE the container, so its height moves every card's
    // flow position without resizing the container. It must be watched
    // separately or the landings go stale the moment it sizes itself.
    if (leadRef?.current) observer.observe(leadRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [enabled, count, leadRef]);

  return { ref, tops, heights, trailing, viewport, maxScroll };
}

/**
 * One item in the stack.
 *
 * The dwell is this section's `padding-bottom`: how far the reader scrolls
 * before the next item reaches the top. It is empty space in the flow but
 * never empty on screen, because the next item is travelling up through it
 * the whole time.
 *
 * Every value below is a window-scroll position in pixels, worked out from the
 * measured flow tops. `landAt` is the scroll at which this item reaches its
 * pin; `leaveTo` is the scroll at which the NEXT item reaches the same pin,
 * which is the moment this one must be gone.
 */
function StackItem({
  id,
  dwell,
  index,
  top,
  nextTop,
  height,
  scrollY,
  enterFrom,
  landAt,
  leaveTo,
  still,
  children,
}: {
  id?: string;
  dwell: string;
  index: number;
  /** Where this item pins, px from the viewport top. */
  top: number;
  /** Where the NEXT item pins. Higher than `top` only for a docked first card. */
  nextTop: number;
  /** This card's own height, without its dwell. */
  height: number;
  scrollY: MotionValue<number>;
  enterFrom: number;
  landAt: number;
  /** `null` for the last item, and until the first measurement lands. */
  leaveTo: number | null;
  still: boolean;
  children: React.ReactNode;
}) {
  // Until the container has been measured there are no real ranges to work
  // with. An item must be fully visible in that state, never mid-animation —
  // a mis-measured card that starts at opacity 0 is a blank screen.
  const arrives = landAt > enterFrom;
  const departs = leaveTo !== null && leaveTo > enterFrom;

  /*
   * Arrival and departure are separate ranges now, because they drive
   * different things: arrival only moves and grows the card (it is solid the
   * whole way up), departure only fades and shrinks it.
   *
   *   enterFrom ... landAt ... fadeFrom ....... fadeTo ...... leaveTo
   *   rising        pinned     going out        gone          next one lands
   *
   * The fade used to END at `leaveTo` — the exact moment the next card finished
   * covering this one — so it happened almost entirely out of sight, and the
   * card behind read as "not fading" (2026-09-23). It now runs across the
   * middle of the pinned stretch and is finished well before the cover lands.
   *
   * When the next card lands before this one can pin (the last landing is
   * clamped to the end of the page), there is no pinned stretch to fade
   * across, so the fade rides the tail of the next card's climb instead.
   */
  const span = departs ? leaveTo - landAt : 0;
  // A card docked LOWER than the one after it (the Overview's first card,
  // resting under the opening text) is not covered at the next card's
  // landing but on its way past. It fades exactly while the next card slides
  // over it, never during its own hold, which is the point of the hold.
  const docked = departs && top > nextTop && height > 0;
  const coveredAt = docked ? leaveTo - (top - nextTop) : 0;
  const fadeFrom = docked
    ? Math.max(landAt, coveredAt - height)
    : departs
      ? span > 40
        ? landAt + span * 0.15
        : leaveTo - 240
      : 0;
  const fadeTo = docked
    ? Math.max(fadeFrom + 1, coveredAt)
    : departs
      ? span > 40
        ? landAt + span * 0.7
        : leaveTo
      : 1;

  const opacity = useTransform(scrollY, [fadeFrom, fadeTo], [1, departs ? 0 : 1]);

  // Small numbers on purpose. A card that travels far or shrinks hard reads as
  // a slide deck; this should read as depth.
  const grow = useTransform(
    scrollY,
    arrives ? [enterFrom, enterFrom + (landAt - enterFrom) * 0.8] : [0, 1],
    arrives ? [0.985, 1] : [1, 1],
  );
  const shrink = useTransform(scrollY, [fadeFrom, fadeTo], [1, departs ? 0.96 : 1]);
  const scale = useTransform([grow, shrink], ([g, k]) => (g as number) * (k as number));
  const y = useTransform(
    scrollY,
    arrives ? [enterFrom, landAt] : [0, 1],
    arrives ? [44, 0] : [0, 0],
  );

  if (still) {
    return (
      <section id={id} className="scroll-mt-32 pb-4">
        {children}
      </section>
    );
  }

  return (
    <section
      id={id}
      className="scroll-mt-32"
      // Where this item counts as arrived, for anything that links to it: an
      // anchor jump lands wherever `scroll-mt-32` puts it, which is not this
      // point, so a rail that scrolled by anchor lit the chapter BEFORE the
      // one on screen (2026-10-08). `scrollToStackItem` reads it.
      data-stack-landing={still || !arrives ? undefined : Math.ceil(landAt)}
      style={{
        position: "sticky",
        top,
        // Not a Tailwind class: the number comes from data, and a class a data
        // module invents is only as real as the scanner that finds it.
        paddingBottom: dwell,
        // Belt and braces over paint order: the arriving card must be above
        // the one it is covering, and a transform on either could otherwise
        // make that depend on which stacking context won.
        zIndex: index,
      }}
    >
      {/* The transforms sit on the CONTENT, not on the section. The section is
          mostly dwell padding, so scaling it would pivot around a point half a
          screen below the card and swing the card around instead of shrinking
          it in place. */}
      <motion.div style={{ y, scale, opacity, willChange: "transform, opacity" }}>
        {children}
      </motion.div>
    </section>
  );
}

export interface ScrollStackItem {
  key: string;
  /** Anchor id, where something links to this item. */
  id?: string;
  /** How far the page scrolls with this item pinned, as a CSS length. */
  dwell: string;
  content: React.ReactNode;
}

export function ScrollStack({
  items,
  lead,
  onActiveIndexChange,
  gap,
  peek = 0,
}: {
  items: ScrollStackItem[];
  /**
   * Content that opens the stack and stays pinned behind it.
   *
   * It fills the screen under the header, so on arrival no card is visible.
   * Every card rises and DOCKS under the lead's `[data-stack-dock]` element
   * (plus a 20px gap) instead of pinning under the header, so the whole
   * card-by-card sequence plays out in one place with the lead fixed above
   * it (asked for 2026-09-23: "every card scroll at the place of 1st card").
   *
   * A card too tall to fit whole below the dock rises only as far as it must
   * to show in full. Pinned at the dock it would be cut off at the bottom of
   * the screen, and a pinned card's hidden part can never be scrolled to.
   *
   * Anything in the lead marked `[data-stack-cue]` fades out as the first
   * card rises: an invitation to scroll is done once the scrolling starts.
   */
  lead?: React.ReactNode;
  /**
   * Which item is currently pinned. Fires only when the answer CHANGES, so a
   * caller may hold it in state without re-rendering per frame.
   */
  onActiveIndexChange?: (index: number) => void;
  /** Distance between the app header and a pinned item. */
  gap?: number;
  /**
   * How much of the first card shows under the lead on arrival, in px. The
   * lead used to fill the screen so no card was visible and a "scroll to
   * explore" cue had to say there was more; a card's edge says it better.
   */
  peek?: number;
}) {
  const reduce = useReducedMotion();
  const still = reduce === true;
  const top = useHeaderOffset(gap);
  const header = useHeaderOffset(0);
  const { scrollY } = useScroll();
  const leadRef = useRef<HTMLDivElement>(null);
  const { ref, tops, heights, trailing, viewport, maxScroll } = useFlowTops(
    items.length,
    !still,
    lead ? leadRef : undefined,
  );

  /*
   * The lead: where it pins, how tall it is, and where the first card docks.
   *
   * It pins where it already sits on arrival (`leadTop`), so it never shifts
   * before it holds. Its height is the rest of the screen below that, which is
   * what keeps the first card below the fold on arrival. The dock is measured
   * from the rendered lead, not guessed: it is wherever the lead's own content
   * marks its important part as ending.
   */
  const [leadTop, setLeadTop] = useState(0);
  const [dock, setDock] = useState(0);
  // The lead's CONTENT height, read off its child rather than the sticky box,
  // whose min-height is itself derived from the pin.
  const [leadHeight, setLeadHeight] = useState(0);
  useEffect(() => {
    const el = leadRef.current;
    if (!lead || still || !el) return;
    const measure = () => {
      setLeadHeight(Math.round(el.scrollHeight));
      const box = el.getBoundingClientRect();
      // Its document position is where it should pin. Read with the scroll
      // subtracted and the sticky offset ignored: a pinned lead reports its
      // pin, which is the same number.
      const natural = Math.round(box.top + Math.min(window.scrollY, 0));
      setLeadTop((current) => current || Math.max(header, natural));
      const marker = el.querySelector("[data-stack-dock]");
      if (marker) setDock(Math.round(marker.getBoundingClientRect().bottom - box.top + 20));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [lead, still, header]);

  /*
   * A sticky element taller than the room below its pin can never show its
   * foot: it holds at the pin and the rest stays under the bottom edge for as
   * long as it is stuck. On a 1366x657 laptop that was the Overview's scroll
   * cue and the footer of every tall profile chapter, permanently out of
   * reach. So anything that does not fit pins by its FOOT instead: it scrolls
   * up until its last line is on screen, then holds there.
   */
  const leadFits = leadHeight === 0 || viewport === 0 || leadHeight <= viewport - (leadTop || header);
  const leadPin = leadFits ? leadTop || header : viewport - leadHeight;
  const dockPin = lead && dock > 0 ? leadPin + dock : top;
  const pinOf = (i: number) => {
    const height = heights[i];
    const measured = height !== undefined && height > 0 && viewport > 0;
    const footPin = measured ? viewport - height - 16 : top;
    if (measured && footPin < top) return footPin;
    if (!lead || dockPin === top) return top;
    // Unmeasured: dock. Otherwise dock if it fits whole, and rise no higher
    // than the usual pin under the header.
    if (!measured) return dockPin;
    return Math.max(top, Math.min(dockPin, footPin));
  };

  /*
   * The scroll position at which each item reaches its pin.
   *
   * The LAST one is clamped to the furthest the page can actually scroll, and
   * that is not a nicety. Every item's landing point sits below the fold by
   * design, but there is nothing after the last one to scroll through, so the
   * reader runs out of page before reaching it and the final card is left
   * permanently mid-arrival: partly transparent, still scaled down, still
   * offset, overlapping the card behind it. It reads as a rendering fault.
   * Reported on the Overview on 2026-09-23, and the Business profile had it
   * too.
   *
   * Clamping only moves the point at which that card is FINISHED. It does not
   * change the distance it travels or the curve it travels on. Doing it here
   * rather than by padding the page keeps it correct at every window height,
   * which a fixed dwell is not: the shortfall grows with the viewport.
   */
  const landings = tops.map((flowTop, i) => flowTop - pinOf(i));
  if (landings.length > 0 && maxScroll > 0) {
    const last = landings.length - 1;
    landings[last] = Math.min(landings[last]!, Math.max(0, maxScroll - 8));
  }

  const activeRef = useRef(0);
  const pins = landings.map((_, i) => pinOf(i));
  const reportActive = (value: number) => {
    if (landings.length === 0 || !onActiveIndexChange) return;
    const next = activeIndexAt(value, landings, pins, viewport);
    if (activeRef.current === next) return;
    activeRef.current = next;
    onActiveIndexChange(next);
  };
  useMotionValueEvent(scrollY, "change", reportActive);
  // Also when the landings MOVE without a scroll — images arriving, a resize,
  // a page opened at `#chapter-…`. Scroll alone left the rail on the chapter
  // the old measurements said (2026-10-08).
  const landingsKey = landings.map((l) => Math.round(l)).join(",");
  // The switch point also moves with the screen's height (`activeIndexAt`).
  const activeKey = `${landingsKey}|${pins.join(",")}|${viewport}`;
  useEffect(() => {
    reportActive(scrollY.get());
    // `reportActive` reads `landings`, `pins` and `viewport`, which `activeKey` stands for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  /*
   * The lead's scroll cue fades as the first card rises, and is gone by the
   * time that card docks. Written straight to the element rather than through
   * state, so nothing re-renders per frame. Once invisible it stops taking
   * clicks, because it sits in the gap under the docked card.
   */
  const firstLanding = landings[0] ?? 0;
  useMotionValueEvent(scrollY, "change", (value) => {
    const cue = leadRef.current?.querySelector<HTMLElement>("[data-stack-cue]");
    if (!cue || firstLanding <= 0) return;
    const opacity = Math.max(0, Math.min(1, 1 - value / (firstLanding * 0.7)));
    cue.style.opacity = String(opacity);
    cue.style.pointerEvents = opacity < 0.05 ? "none" : "";
  });

  /*
   * The lead steps back as a card takes its place (`leadOpacityAt`). Written
   * straight to the element, like the cue, so nothing re-renders per frame;
   * hidden, it stops taking clicks and is skipped by the tab order's eye.
   */
  const guardLine = dock > 0 ? leadPin + dock - 20 : 0;
  const cardsForLead = tops.map((flowTop, i) => ({ flowTop, pin: pinOf(i), goneAt: landings[i + 1] ?? null }));
  const applyLead = (value: number) => {
    const el = leadRef.current;
    if (!el || !lead || still || guardLine <= 0 || cardsForLead.length === 0) return;
    const opacity = leadOpacityAt(value, cardsForLead, guardLine);
    el.style.opacity = String(opacity);
    el.style.visibility = opacity <= 0.01 ? "hidden" : "";
    el.style.pointerEvents = opacity < 0.5 ? "none" : "";
  };
  useMotionValueEvent(scrollY, "change", applyLead);
  const leadKey = `${guardLine}|${landingsKey}`;
  useEffect(() => {
    applyLead(scrollY.get());
    // `applyLead` reads the measurements `leadKey` stands for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadKey]);

  /*
   * With a lead, the last card must END the page at its dock, not scroll on
   * past it. The last item never sticks (there is nothing after it inside the
   * stack to stick against), so where it finishes is simply where the page
   * runs out. Its padding is therefore sized to leave exactly the room below
   * it that the screen has below the dock. A fixed dwell was too much at one
   * height and too little at another, and the last card carried on up the
   * screen while the others stayed docked.
   */
  const lastIndex = items.length - 1;
  const lastHeight = heights[lastIndex] ?? 0;
  const lastDwell =
    lead && !still && viewport > 0 && lastHeight > 0
      ? `${Math.max(0, Math.round(viewport - pinOf(lastIndex) - lastHeight - trailing))}px`
      : null;

  const stack = (
    <div ref={ref} className="min-w-0">
      {items.map((item, i) => {
        const landAt = landings[i] ?? 0;
        const pin = pinOf(i);
        return (
          <StackItem
            key={item.key}
            id={item.id}
            dwell={i === lastIndex && lastDwell !== null ? lastDwell : item.dwell}
            // One above the lead, so every card slides OVER it.
            index={i + 1}
            top={pin}
            nextTop={pinOf(i + 1)}
            height={heights[i] ?? 0}
            scrollY={scrollY}
            enterFrom={landAt - (viewport - pin)}
            landAt={landAt}
            leaveTo={landings[i + 1] ?? null}
            still={still}
          >
            {item.content}
          </StackItem>
        );
      })}
    </div>
  );

  if (!lead) return stack;

  if (still) {
    return (
      <div className="min-w-0">
        {lead}
        {stack}
      </div>
    );
  }

  return (
    // The lead and the stack share this parent, so the lead's sticky range is
    // the whole stack: it holds for as long as there are cards to scroll.
    <div className="min-w-0">
      <motion.div
        ref={leadRef}
        className="flex flex-col"
        style={{
          position: "sticky",
          top: leadPin,
          zIndex: 0,
          // The rest of the screen below where it pins, less the first card's
          // peek: on arrival the next card's edge shows under the lead.
          minHeight: viewport > 0 ? Math.max(0, viewport - leadPin - peek) : undefined,
        }}
      >
        {lead}
      </motion.div>
      {stack}
    </div>
  );
}

/**
 * Which item the reader is on at scroll position `value`. Pure, so it is tested.
 *
 * It used to be the last item that had LANDED — pinned exactly in place. But a
 * card looks settled long before that: it climbs only the last 44px with any
 * movement, and the card it covers has faded out by 70% of its stay. So the
 * Business profile showed "03 Competitors" full on screen with "02 Brand"
 * still lit in the rail (LBS-1249). An item now counts from when its top edge
 * passes the middle of the screen, which is when it is the card being read;
 * its landing is still the latest it can switch.
 */
export function activeIndexAt(
  value: number,
  landings: readonly number[],
  pins: readonly number[],
  viewport: number,
): number {
  let next = 0;
  for (let i = 0; i < landings.length; i++) {
    const landing = landings[i]!;
    const pin = pins[i] ?? 0;
    const early = viewport > 0 ? Math.max(0, viewport / 2 - pin) : 0;
    if (value >= landing - early - 1) next = i;
  }
  return next;
}

/**
 * Scrolls to the point where the stacked item with this id has arrived — the
 * same point the active index changes at. False when the item is not stacked
 * (reduced motion, not yet measured), so the caller's plain anchor applies.
 */
export function scrollToStackItem(id: string, smooth: boolean): boolean {
  const el = document.getElementById(id);
  const landing = Number(el?.dataset.stackLanding);
  if (!el || !Number.isFinite(landing) || el.dataset.stackLanding === undefined) return false;
  // +1: the active index switches at `landing - 1`; land past it, not on it.
  window.scrollTo({ top: landing + 1, behavior: smooth ? "smooth" : "auto" });
  history.replaceState(null, "", `#${id}`);
  return true;
}
