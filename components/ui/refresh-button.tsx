"use client";

/**
 * Asks the server for this page again, and says so while it does.
 *
 * For "Try again" / "Check again" on a page that is ALREADY showing. A `Link`
 * to the same URL is not a refresh: the client router keeps a visited page for
 * 30s (`staleTimes.dynamic`), so inside that window it re-showed the saved copy
 * and the button looked dead (audit, 2026-09-29). `router.refresh()` always
 * goes back to the server.
 *
 * ## Why this earns `"use client"`
 *
 * `router.refresh()` exists only in the browser, and the wait is a transition:
 * `useTransition` stays pending until the re-read server tree has committed,
 * which is what lets the button disable itself and show the ring for exactly
 * as long as the read takes — and refuse a second press while it does.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";

/**
 * The same rule as `SubmitButton`: a caller that sets its own display wins,
 * because two display utilities in one class string resolve by stylesheet
 * order. Whole class names, so `flex-1` is not mistaken for `flex`.
 */
const DISPLAY_UTILITIES = new Set(["flex", "inline-flex", "grid", "inline-grid", "block", "inline-block", "contents"]);

function laysItselfOut(className: string): boolean {
  return className.split(/\s+/).some((name) => DISPLAY_UTILITIES.has(name));
}

export function RefreshButton({
  children,
  pendingLabel = "Checking…",
  className = "",
}: {
  children: React.ReactNode;
  /** What to say while the page is being read again. */
  pendingLabel?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const layout = laysItselfOut(className) ? "items-center gap-2" : "inline-flex items-center gap-2";

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={() => startTransition(() => router.refresh())}
      // Form-filler extensions stamp attributes onto buttons before hydration.
      suppressHydrationWarning
      className={`${layout} transition disabled:opacity-70 ${className}`}
    >
      {pending && <Spinner />}
      {pending ? pendingLabel : children}
    </button>
  );
}
