"use client";

/**
 * A link that leaves the app, and says so while it goes.
 *
 * ## Why a link and not a button
 *
 * Every OAuth start here is a 302 chain the BROWSER has to walk — our Route
 * Handler redirects to the Lambda, which redirects to the provider's consent
 * screen. `Link` would attempt an RSC navigation to a route with no page
 * behind it, and a `fetch` cannot take someone through Google's approval. So
 * the raw `<a>` stays; this only adds the feedback.
 *
 * ## Why it needs feedback at all
 *
 * These are the deadest controls in the app. A full-page navigation shows
 * nothing until the new document's first byte, and that is a round trip to
 * n8n and then to Google — routinely a second or more. Inside a MODAL it is
 * worse: the dialog stays open and unchanged, so the obvious reading is that
 * the click missed. `SubmitButton` covers everything that submits; this covers
 * everything that leaves.
 *
 * ## What it deliberately does not do
 *
 * It never calls `preventDefault`. The navigation is the browser's, exactly as
 * before — this component only renders, so a failure here cannot cost someone
 * a consent flow.
 */

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";

/**
 * Whether this click opens somewhere else and leaves THIS page where it is.
 *
 * A ctrl/cmd-click or a middle-click opens a new tab; the page the customer is
 * looking at does not go anywhere, so a spinner on it would never stop.
 */
function opensElsewhere(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0 ||
    event.currentTarget.target === "_blank"
  );
}

export function ConnectLink({
  href,
  children,
  className = "",
  pendingLabel,
  style,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  /** For the Google cards, whose border and text carry a third party's brand
      colour — not ours to tokenise (CLAUDE.md names this exception). */
  style?: React.CSSProperties;
  /**
   * What to say while leaving. Omit for a rich control — a card with an icon,
   * a title and a blurb — where replacing everything with one word loses more
   * than the word adds; there the spinner appears and the content stays.
   */
  pendingLabel?: string;
}) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // The back button restores this page from the bfcache with its React state
    // intact, so without this someone who approves nothing and comes back finds
    // a control that has been "opening" ever since. `pageshow` fires on a
    // restore where `mount` does not.
    const stop = () => setLeaving(false);
    window.addEventListener("pageshow", stop);
    return () => window.removeEventListener("pageshow", stop);
  }, []);

  return (
    <a
      href={href}
      onClick={(event) => {
        if (opensElsewhere(event)) return;
        setLeaving(true);
      }}
      aria-busy={leaving}
      style={style}
      // Not `disabled` — an anchor has no such thing, and removing the href
      // mid-navigation is a good way to cancel one. This stops a second click
      // starting a second consent while the first is still loading.
      className={`${leaving ? "pointer-events-none opacity-70" : ""} ${className}`}
    >
      {leaving && <Spinner />}
      {leaving && pendingLabel ? pendingLabel : children}
    </a>
  );
}
