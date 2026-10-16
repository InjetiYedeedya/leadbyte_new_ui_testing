"use client";

/**
 * A `Link` styled as a button, which reports that it was pressed.
 *
 * ## The narrow case this is for
 *
 * A client navigation fetches the route's flight response before anything on
 * screen changes. `PageShell` streams its frame in ~350ms warm, but the agent
 * detail page fans out to the backend, and against a cold Lambda the pressed
 * button sits there unchanged for the whole wait — the "clicks do nothing"
 * complaint the Suspense work was done for, in the one place it still shows.
 *
 * ## Why this is not `RouteProgress` coming back
 *
 * That was a bar across the top of the WINDOW — a page-level animation, which
 * meant it and the arriving page's `PageLoading` were on screen together on a
 * slow read, and two animations for one wait reads as a screen struggling. It
 * was deleted for that and should stay deleted.
 *
 * This is the pressed control reporting itself, which is the documented
 * exception `SubmitButton` and `AnalyzeButton` already sit in (CLAUDE.md,
 * "Loading is ONE animation"). It is deliberately scoped to BUTTON-shaped
 * primary actions — never the tab strip, never an inline text link. A tab that
 * changes shape when clicked reads as a different control, which is exactly
 * the objection that killed three earlier attempts at nav feedback.
 *
 * `useLinkStatus` must be called from a DESCENDANT of the `Link`, which is why
 * the ring is its own component rather than a hook call up here.
 */

import Link from "@/components/ui/app-link";
import { useLinkStatus } from "next/link";
import { Spinner } from "@/components/ui/spinner";
import { useNavigationStart } from "@/components/nav-transition";

function LinkSpinner() {
  const { pending } = useLinkStatus();
  return pending ? <Spinner /> : null;
}

export function PendingLink({
  href,
  children,
  className = "",
  "aria-label": ariaLabel,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  // The page loader as well as the ring, once the wait is long enough to need
  // it — the same rule the tabs follow (`useNavigationStart`).
  const onNavigate = useNavigationStart();
  return (
    <Link href={href} className={className} aria-label={ariaLabel} onClick={onNavigate(href)}>
      <LinkSpinner />
      {children}
    </Link>
  );
}
