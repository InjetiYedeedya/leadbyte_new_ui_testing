"use client";

/**
 * A link that pulls slightly toward the cursor.
 *
 * ## Why this is its own file
 *
 * It runs a spring on every pointer move. Isolating it means those updates
 * never re-render the screen that contains it — the Overview dashboard holds
 * scores, tables and an agent grid, and a card's hover has no business
 * touching any of them. `memo` holds the line for a parent that re-renders
 * for its own reasons.
 *
 * ## Why no `useState`
 *
 * State would re-render this component on every pointer event, which is 60+
 * renders a second while the cursor is over the button. `useMotionValue`
 * writes straight to the DOM node outside React's render cycle, so the cost
 * is one style write per frame and nothing reconciles.
 *
 * The spring is `stiffness: 100, damping: 20` — weighty rather than snappy,
 * so the button feels like it has mass being pulled rather than a box
 * tracking a cursor. `useSpring` also means the return to centre carries
 * momentum instead of cutting straight back.
 *
 * ## Limits
 *
 * `MAX_PULL` is 6px. Past roughly 8px the button visibly detaches from the
 * text around it and starts reading as a bug. Pointer handlers are bound only
 * for a fine pointer: on a touchscreen there is no hover, and a tap would
 * otherwise shove the button sideways under the finger pressing it.
 */

import Link from "@/components/ui/app-link";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { memo, useCallback, useRef } from "react";

/** Furthest the button travels from rest, in px. */
const MAX_PULL = 6;

/** How much of the cursor's offset from centre becomes pull. */
const PULL_RATIO = 0.35;

function clamp(value: number) {
  return Math.max(-MAX_PULL, Math.min(MAX_PULL, value));
}

export const MagneticLink = memo(function MagneticLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 100, damping: 20 });
  const springY = useSpring(y, { stiffness: 100, damping: 20 });

  // The full `transform` string rather than Motion's `x`/`y` shorthands,
  // which it applies from JS each frame instead of handing the compositor a
  // single transform.
  const transform = useTransform(
    [springX, springY],
    ([tx, ty]: number[]) => `translate(${tx ?? 0}px, ${ty ?? 0}px)`,
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLSpanElement>) => {
      if (event.pointerType !== "mouse") return;
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      x.set(clamp((event.clientX - (rect.left + rect.width / 2)) * PULL_RATIO));
      y.set(clamp((event.clientY - (rect.top + rect.height / 2)) * PULL_RATIO));
    },
    [x, y],
  );

  const release = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  // Reduced motion gets an ordinary link. The pull IS the animation, so there
  // is nothing left to soften once it is gone.
  if (reduce) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  // The motion lives on a WRAPPER, not on the anchor. Animating a `motion.a`
  // would mean a raw `<a href>`, and every internal link in this app must be
  // `next/link` — a raw anchor triggers a full document load, re-downloading
  // every chunk and re-running the shell. That rule is in `CLAUDE.md` and it
  // predates this component.
  return (
    <motion.span
      ref={ref}
      className="inline-flex"
      style={{ transform }}
      onPointerMove={onPointerMove}
      onPointerLeave={release}
      onBlur={release}
    >
      <Link href={href} className={className}>
        {children}
      </Link>
    </motion.span>
  );
});
