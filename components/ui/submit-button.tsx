"use client";

/**
 * A submit button that shows it is working, and refuses a second press.
 *
 * ## Why this exists
 *
 * `<form action={serverAction}>` gives no feedback while the action runs. That
 * is fine for a redirect that takes 200ms and actively harmful for anything
 * slower: the marketing-strategy agent is an LLM conversation with a 120-second
 * budget, and its form looked completely inert for the whole turn. The only
 * feedback available to the customer was pressing the button again — which is
 * exactly what happened, and n8n ran the same turn five or more times.
 *
 * ## Why the disable matters as much as the spinner
 *
 * Each press is a real agent run: it costs money, and the agent is stateful per
 * `sessionId`, so five concurrent turns on one session is not five copies of an
 * answer — it is five interleaved messages in one conversation. Disabling while
 * pending is the fix for that; the spinner is just the explanation.
 *
 * `useFormStatus` only reports the status of the form ABOVE it in the tree,
 * which is why this is its own component rather than something the page could
 * do inline.
 */

import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/ui/spinner";

/**
 * A caller that lays itself out sets its own display, and two display
 * utilities in one class string resolve by stylesheet order rather than by
 * which was written last — so this checks for one and stands aside. Matched as
 * whole class names on purpose: `flex-1` and `grid-cols-2` are not displays,
 * and a substring test treats them as though they were.
 */
const DISPLAY_UTILITIES = new Set([
  "flex",
  "inline-flex",
  "grid",
  "inline-grid",
  "block",
  "inline-block",
  "contents",
]);

function laysItselfOut(className: string): boolean {
  return className.split(/\s+/).some((name) => DISPLAY_UTILITIES.has(name));
}

export function SubmitButton({
  children,
  pendingLabel,
  className = "",
  disabled = false,
  role,
}: {
  children: React.ReactNode;
  /** What to say while the action is in flight. Say what is happening. */
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
  /** For a submit that is also a menu item — the account menu's Sign out. */
  role?: string;
}) {
  const { pending } = useFormStatus();
  // `inline-flex` is the default, not a requirement: the spinner needs a row
  // and a gap, which is all this really asks for.
  const layout = laysItselfOut(className) ? "items-center gap-2" : "inline-flex items-center gap-2";

  return (
    <button
      type="submit"
      role={role}
      disabled={pending || disabled}
      aria-busy={pending}
      // Form-filler extensions stamp `fdprocessedid` onto buttons before React
      // hydrates, which React reports as a hydration mismatch.
      suppressHydrationWarning
      className={`${layout} transition disabled:opacity-70 ${className}`}
    >
      {pending && <Spinner />}
      {pending ? pendingLabel : children}
    </button>
  );
}
