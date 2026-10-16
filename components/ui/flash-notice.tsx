"use client";

/**
 * A one-time message about something that just happened: "LinkedIn Ads
 * connected", "Saved", "We couldn't save that".
 *
 * ## The bug this exists for
 *
 * Every one of these was rendered from the page address (`?connected=…`,
 * `?saved=1`, `?problems=…`) and nothing ever took it away. So the message sat
 * on the page for as long as the reader stayed, and a REFRESH showed it
 * again, because the address still said it. A "saved, it can take a minute"
 * note was still there an hour later, next to a row that had long since read
 * Connected.
 *
 * ## What it does instead
 *
 * - **Wipes its own values from the address the moment it appears**, so a
 *   refresh, a bookmark or the back button never replays it. `replaceState`,
 *   which Next's router follows without refetching the page.
 * - **Leaves on its own**: 6 seconds for good news, 12 for a problem, which
 *   needs reading. The clock stops while the pointer or keyboard focus is on
 *   it, so nobody loses a message mid-sentence (WCAG 2.2.1).
 * - **Has no close button**, on request (2026-10-05): it always leaves by
 *   itself, so there is nothing for the reader to manage.
 * - **Collapses rather than vanishing**, so the page below slides up instead
 *   of jumping. Reduced motion skips the animation.
 *
 * Client, because a timer, a hover pause and a close button are all things a
 * server render cannot express. It takes its message as children and fetches
 * nothing.
 */

import { useEffect, useRef, useState } from "react";

const LEAVE_MS = 220;

export function FlashNotice({
  children,
  className = "",
  role = "status",
  clear = [],
  duration,
}: {
  children: React.ReactNode;
  /** The banner's own look, exactly as the page styled it before. */
  className?: string;
  /** `status` for news, `alert` for a problem. Also picks the default time. */
  role?: "status" | "alert";
  /** The address values that produced this message, removed on arrival. */
  clear?: readonly string[];
  /** How long it stays, in ms. Defaults to 6000 for status, 12000 for alert. */
  duration?: number;
}) {
  const [phase, setPhase] = useState<"shown" | "leaving" | "gone">("shown");
  const paused = useRef(false);
  const remaining = useRef(duration ?? (role === "alert" ? 12_000 : 6_000));
  // Read once: the list is a literal at every call site, and re-running the
  // wipe on a re-render would be harmless but pointless.
  const clearRef = useRef(clear);

  useEffect(() => {
    const keys = clearRef.current;
    if (keys.length === 0) return;
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of keys) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) {
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  useEffect(() => {
    if (phase !== "shown") return;
    const tick = 200;
    const timer = window.setInterval(() => {
      if (paused.current) return;
      remaining.current -= tick;
      if (remaining.current <= 0) setPhase("leaving");
    }, tick);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(() => setPhase("gone"), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === "gone") return null;

  const leaving = phase === "leaving";
  const pause = () => {
    paused.current = true;
  };
  const resume = () => {
    paused.current = false;
  };

  return (
    <div
      // Collapse by animating the row height to zero, which unlike `height`
      // needs no measuring: the grid does it.
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
        leaving ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
      }`}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <div className="min-h-0 overflow-hidden">
        <div role={role} className={className}>
          {children}
        </div>
      </div>
    </div>
  );
}
