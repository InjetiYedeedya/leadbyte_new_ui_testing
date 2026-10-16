"use client";

/**
 * Whether the page is being printed RIGHT NOW.
 *
 * ## Why a hook rather than a print stylesheet
 *
 * `@media print` can only restyle what is in the DOM, and the two things that
 * ruin these reports on paper are not styling problems — they are absence:
 *
 * - A collapsed section in `PageSections` is UNMOUNTED, not hidden. No CSS can
 *   bring back a node React never rendered, so a PDF would carry whichever one
 *   page happened to be open and silently omit the other sixteen.
 * - A `DataTable` renders one page of rows. Rows 26 onward are not off-screen,
 *   they do not exist, so "print all rows" is a render decision too.
 *
 * Both need the component to render differently for the print, which means the
 * component has to know a print is happening.
 *
 * ## Why `flushSync`
 *
 * `beforeprint` fires immediately before the browser snapshots the page, and a
 * plain `setState` there is asynchronous — the snapshot is taken from the OLD
 * tree and the extra content misses the PDF entirely. `flushSync` forces the
 * re-render (and its layout effects) to complete inside the event handler,
 * while the browser is still waiting.
 *
 * Safe here specifically because this runs in a browser event listener.
 * `flushSync` warns when called during a render or a lifecycle method; a
 * `beforeprint` handler is neither.
 *
 * ## Why both `beforeprint` and the media query
 *
 * Safari has historically not fired `beforeprint`, but does match a `print`
 * media query while printing. Listening to both costs nothing and neither
 * fires twice in a way that matters, since both set the same boolean.
 */

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

/**
 * The direct "Download PDF" (`lib/pdf/report-pdf.ts`) copies the page as it
 * stands and never prints, so `beforeprint` never fired for it: the PDF held
 * only the audit table's first page of rows and whichever sections were open
 * (LBS-1247). It sends these two instead, around the copy.
 */
export const PDF_CAPTURE_START = "leadbyte:pdf-capture-start";
export const PDF_CAPTURE_END = "leadbyte:pdf-capture-end";

export function usePrinting(): boolean {
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    function start() {
      flushSync(() => setPrinting(true));
    }
    function stop() {
      setPrinting(false);
    }

    window.addEventListener("beforeprint", start);
    window.addEventListener("afterprint", stop);
    window.addEventListener(PDF_CAPTURE_START, start);
    window.addEventListener(PDF_CAPTURE_END, stop);

    // `matchMedia` is absent in some test environments, and `addEventListener`
    // on a MediaQueryList is absent in older Safari — hence both guards.
    const media = window.matchMedia?.("print");
    function onMediaChange(event: MediaQueryListEvent) {
      if (event.matches) start();
      else stop();
    }
    media?.addEventListener?.("change", onMediaChange);

    return () => {
      window.removeEventListener("beforeprint", start);
      window.removeEventListener("afterprint", stop);
      window.removeEventListener(PDF_CAPTURE_START, start);
      window.removeEventListener(PDF_CAPTURE_END, stop);
      media?.removeEventListener?.("change", onMediaChange);
    };
  }, []);

  return printing;
}
