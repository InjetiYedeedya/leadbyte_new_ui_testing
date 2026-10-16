"use client";

/**
 * "← Back" that returns to wherever the visitor came from.
 *
 * ## Why this earns `"use client"`
 *
 * Only the browser knows the page before this one. A page like Pricing is
 * reached from an agent's Unlock box, the checkout, the account menu or a
 * shared link, so no single fixed destination is "back" for everyone.
 *
 * It is still a real link to `fallbackHref`: with no earlier page in this tab
 * from our own site (a new tab, a pasted link), going "back" would leave the
 * app entirely, so the link simply goes to the fallback instead.
 *
 * ## Why it shows a ring
 *
 * Both destinations can take seconds — the agent page and `/agents` read from
 * the backend — and an outlined button that only flashes on press then sits
 * unchanged reads as a click that did nothing. The fallback path is a normal
 * `Link`, so `useLinkStatus` reports it (from a DESCENDANT of the `Link`, as
 * `PendingLink` does). `router.back()` is a history pop, which a transition
 * does not track — it ends the moment `history.back()` returns — so that path
 * holds its own flag until the route changes underneath it.
 */

import { useEffect, useState } from "react";
import { useLinkStatus } from "next/link";
import Link from "@/components/ui/app-link";
import { usePathname, useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { BACK_BUTTON_CLASSES } from "@/components/ui/back-button-classes";

function LinkSpinner({ goingBack }: { goingBack: boolean }) {
  const { pending } = useLinkStatus();
  return pending || goingBack ? <Spinner /> : <span aria-hidden="true">←</span>;
}

export function BackLink({
  fallbackHref,
  label = "Back",
  history = true,
}: {
  fallbackHref: string;
  label?: string;
  /**
   * `false` in a step-by-step flow: "back" is the previous STEP, always
   * `fallbackHref`. A history pop there can land on the same step again — a
   * refused submit redirects to it with `?problems=`, adding an entry
   * (LBS-1147 g).
   */
  history?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [goingBack, setGoingBack] = useState(false);

  // The route changed, so the pop landed. Also cleared when the browser
  // restores this page from its back/forward cache with the flag still set.
  useEffect(() => setGoingBack(false), [pathname]);
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) setGoingBack(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  return (
    <Link
      href={fallbackHref}
      aria-busy={goingBack || undefined}
      onClick={(event) => {
        // Modified clicks (new tab, etc.) keep their normal meaning.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (!history) return;
        let cameFromHere = false;
        try {
          cameFromHere =
            window.history.length > 1 &&
            document.referrer !== "" &&
            new URL(document.referrer).origin === window.location.origin;
        } catch {
          cameFromHere = false;
        }
        if (cameFromHere) {
          event.preventDefault();
          setGoingBack(true);
          router.back();
        }
      }}
      className={BACK_BUTTON_CLASSES}
    >
      {/* The ring takes the arrow's place, so the button keeps its width. */}
      <LinkSpinner goingBack={goingBack} />
      {label}
    </Link>
  );
}
