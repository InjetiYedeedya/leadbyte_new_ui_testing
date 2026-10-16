"use client";

import { useEffect } from "react";

/**
 * Scrolls to `#section` once the section exists.
 *
 * The router scrolls to a hash when it navigates, but a page whose content
 * streams in behind `<Suspense>` has nothing with that id yet at that moment,
 * so it lands at the top. Rendered INSIDE the streamed content, this mounts
 * with it and finishes the job (the top menu's "View" links, 2026-10-14).
 */
export function HashScroll() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  }, []);
  return null;
}
