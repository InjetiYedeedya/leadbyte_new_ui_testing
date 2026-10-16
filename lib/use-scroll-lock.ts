import { useEffect } from "react";

/**
 * Holds the page still while a modal is open.
 *
 * CLIENT ONLY — it touches `document`. It carries no `"use client"` of its own
 * because a hook cannot be an entry point; the seven dialogs that call it are
 * already islands.
 *
 * ## Why `showModal()` is not enough on its own
 *
 * The house pattern is `<dialog>` + `showModal()`, and that already gives the
 * top layer, the backdrop, focus trapping and Escape. What it does not give is
 * a still background: the wheel keeps scrolling the document underneath.
 * Measured on `/agents` with the On-Page SEO dialog open — five wheel ticks
 * moved the page 331px while the dialog sat where it was. The effect is that
 * the thing you were reading slides away behind a panel you cannot dismiss by
 * scrolling, and on a short dialog it looks like the page is coming apart.
 *
 * ## Why the obvious cures do not work, which is the surprising part
 *
 * Measured, in order, on `/agents` with the On-Page SEO dialog open:
 *
 * - `overflow: hidden` on `<body>` alone does nothing at all —
 *   `document.scrollingElement` is HTML, so the element that actually scrolls
 *   was never touched. Wheel still ran the page to 331px.
 * - `overflow: hidden` on `<html>` blocks the wheel when NO dialog is open —
 *   verified by setting it by hand, where the same gesture moved the page 0px.
 *   With a modal dialog open it stops working: same CSS, confirmed applied by
 *   `getComputedStyle` at the moment of the gesture, page still ran to 331px.
 *   A top-layer element's scroll chain reaches the viewport directly and does
 *   not consult the root element's overflow.
 * - Cancelling the wheel does not save it either. With a `preventDefault`
 *   handler in place the event arrived at the page reading
 *   `defaultPrevented=true` — and it scrolled anyway.
 *
 * So neither the CSS nor the event is dependable while a dialog is in the top
 * layer. What is left is to make the document unscrollable in the only way
 * nothing can route around: take it out of flow. A `position: fixed` body has
 * no scrollable overflow for any mechanism to act on, at any level. The offset
 * (`top: -scrollY`) is what keeps the page looking untouched, and the restore
 * puts the reader back where they were.
 *
 * The trade is that this is the heavier technique, and it is chosen on
 * evidence rather than taste: the two lighter ones were tried first and
 * measured failing.
 *
 * ## What this does NOT block
 *
 * Scrolling INSIDE the dialog, which is the point — a form taller than the
 * viewport must still reach its submit button. The dialog is in the top layer
 * and is not affected by the body being pinned.
 */

let openCount = 0;
let restore: (() => void) | null = null;

function lock(): void {
  openCount += 1;
  if (openCount > 1) return;

  const html = document.documentElement;
  const { body } = document;
  const scrollY = window.scrollY;
  // The scrollbar's width — 0 where the OS draws overlay scrollbars.
  const scrollbar = window.innerWidth - html.clientWidth;

  const previous = {
    htmlOverflow: html.style.overflow,
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    paddingRight: body.style.paddingRight,
  };

  // Pinning the body is what actually holds. `overflow: hidden` is kept
  // alongside it, but it is not the load-bearing part — see the note above.
  html.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  // The page card scrolls inside itself (`FitToWindow`), so pinning the body
  // alone would leave the card scrolling behind the dialog. `overflow: hidden`
  // keeps its scroll position, so there is nothing to put back but the style.
  const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-fit-scroll]"));
  const cardOverflow = cards.map((card) => card.style.overflow);
  for (const card of cards) card.style.overflow = "hidden";

  restore = () => {
    html.style.overflow = previous.htmlOverflow;
    body.style.position = previous.position;
    body.style.top = previous.top;
    body.style.left = previous.left;
    body.style.right = previous.right;
    body.style.width = previous.width;
    body.style.paddingRight = previous.paddingRight;
    cards.forEach((card, i) => {
      card.style.overflow = cardOverflow[i] ?? "";
    });
    // Pinning the body scrolled the document to 0; put the reader back where
    // they were. `instant` because this is undoing a mechanic, not a
    // navigation, and a smooth glide here reads as the page moving on its own.
    window.scrollTo({ top: scrollY, behavior: "instant" as ScrollBehavior });
  };
}

function unlock(): void {
  openCount = Math.max(0, openCount - 1);
  if (openCount > 0) return;
  restore?.();
  restore = null;
}

/** Locks while `active` is true, and always releases on unmount. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    lock();
    // Runs on close AND on unmount — a dialog whose page navigates away while
    // it is open must not leave the next page unable to scroll.
    return unlock;
  }, [active]);
}
