"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * The entrance for a freshly-swapped agent dashboard.
 *
 * ## Why this earns motion, when almost nothing else here does
 *
 * The rule in this app is that one wait gets one animation, in the body of the
 * page that is arriving — a spinner in the nav bar beside a loading panel was
 * removed for exactly that reason. This is a different thing: it answers an
 * action someone just took. Changing the agent in the picker replaces one panel
 * of figures with another panel of figures at the same size and position, and
 * without a transition the swap is a flicker you cannot tell from a re-render.
 * The motion says *this is new content*, which is the one job it has.
 *
 * ## Why it is keyed
 *
 * `children` are server-rendered and arrive through an RSC navigation, so this
 * component instance is REUSED across agents — the tree updates in place and
 * nothing would re-mount. `key={agentId}` is what makes React tear down and
 * remount, which is what runs `initial` again. Without it the animation plays
 * once, on first load, and never again.
 *
 * ## Why it moves but does not fade
 *
 * The obvious entrance is `opacity: 0 -> 1`, and it is the wrong one here.
 * Framer sets the initial value as an inline style on mount and only animates
 * away from it on an animation frame — so anywhere rAF does not run, the panel
 * is left at `opacity: 0` and the dashboard is simply invisible. Measured on a
 * backgrounded tab: `visibilityState: "hidden"`, rAF parked, panel stuck
 * blank. `PageSections` has the same scar from the other direction, where a
 * section that mounts at `height: 0` prints as an empty section.
 *
 * Transform only, so the resting state if nothing ever animates is the content
 * sitting 8px low — which no one will notice, and which is READABLE. An
 * entrance is a nicety; the figures are not.
 *
 * ## Why no exit animation
 *
 * `AnimatePresence` would hold the old panel on screen while the new one
 * arrives, so two sets of figures for the same account overlap mid-swap. A
 * reader glancing at that sees numbers that belong to neither agent. The old
 * panel leaves immediately; only the new one is animated in.
 */
export function DashboardSwap({
  agentId,
  children,
}: {
  /** What makes this a different panel. Changing it replays the entrance. */
  agentId: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      key={agentId}
      // Reduced motion gets no entrance at all: the movement IS the animation,
      // so there is nothing left to soften once it is gone.
      // The full `transform` string, not Motion's `y` shorthand. `x`/`y`/
      // `scale` are applied from JavaScript on each frame and drop frames
      // under load — which is exactly the condition here, since the panel
      // this wraps can hold a 123-row table that is mounting as it moves.
      // An earlier comment claimed `y` was a compositor property; it is not.
      initial={reduce ? false : { transform: "translateY(8px)" }}
      animate={{ transform: "translateY(0px)" }}
      // 180ms: long enough to register as a change, short enough that clicking
      // through four agents never feels like waiting. The curve is a strong
      // ease-out rather than Tailwind's stock [0,0,0.2,1], which is too weak
      // to read as deliberate. (Animation review, 2026-09-20.)
      transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
      className="flex min-w-0 flex-col"
    >
      {children}
    </motion.div>
  );
}
