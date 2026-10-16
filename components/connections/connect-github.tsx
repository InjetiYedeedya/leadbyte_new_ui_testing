"use client";

/**
 * Connect / change GitHub on the Connections page.
 *
 * ## Why this earns `"use client"`
 *
 * GitHub's install screen is opened in a NEW tab, and its callback lands on the
 * AEO service rather than on us — so nothing ever redirects back here. The only
 * way this page learns the connection happened is to ask on a timer, which a
 * form POST cannot do. It never fetches: the check is a Server Action handed in
 * as a prop, and when it says yes the page re-renders on the server, so the
 * badge and the repository list come from the same read as every other row.
 *
 * Same pacing as the AEO report's GitHub panel (`aeo-apply.tsx`): every 2s,
 * giving up after five minutes with a sentence rather than a silent reset.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { whenVisible } from "@/lib/poll-pacing";

const POLL_MS = 2000;
const GIVE_UP_MS = 5 * 60_000;

export function ConnectGithub({
  installUrl,
  connected,
  check,
  compact = false,
}: {
  /** GitHub's install page. Empty when the service gave none. */
  installUrl: string;
  connected: boolean;
  check: () => Promise<{ connected: boolean }>;
  /** A size down, to sit beside a second button on a card's bottom row. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [waiting, setWaiting] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!waiting) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    async function poll() {
      // Never from a hidden tab (Error 1102, `lib/poll-pacing.ts`): the
      // customer is on GitHub's tab meanwhile, so this checks when they return.
      await whenVisible();
      if (cancelled) return;
      let landed = false;
      try {
        landed = (await check()).connected;
      } catch {
        // One failed check is not the end of the wait.
      }
      if (cancelled) return;
      if (landed) {
        setWaiting(false);
        router.refresh();
        return;
      }
      if (Date.now() - startedAt >= GIVE_UP_MS) {
        setWaiting(false);
        setTimedOut(true);
        return;
      }
      timer = setTimeout(poll, POLL_MS);
    }
    timer = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [waiting, check, router]);

  function open() {
    if (!installUrl) return;
    // A new tab, never this one: this page has to still be here to notice.
    window.open(installUrl, "_blank", "noopener,noreferrer");
    setTimedOut(false);
    // Already connected means "change which repositories" — GitHub's screen
    // saves that on its own, and the list refreshes on the next visit.
    if (!connected) setWaiting(true);
  }

  if (!installUrl) {
    return <span className="shrink-0 text-xs text-ink-soft">Not available right now</span>;
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={open}
        disabled={waiting}
        aria-busy={waiting}
        aria-describedby={timedOut ? "github-timed-out" : undefined}
        className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ${
          compact ? "px-3 py-1.5" : "px-4 py-2"
        } transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          connected
            ? "border border-border text-ink hover:bg-surface-raised"
            : "bg-accent text-surface hover:bg-accent-ink"
        }`}
      >
        {waiting ? (
          <>
            <Spinner /> Waiting for GitHub…
          </>
        ) : connected ? (
          "Change repositories"
        ) : (
          "Connect"
        )}
      </button>
      {/* Live, so a screen reader hears the wait start and end. */}
      {/* The gap only when there is something to say, so an idle button is
          its own height — the live region itself stays, for screen readers. */}
      <p aria-live="polite" className="mt-1 text-right text-xs text-ink-soft empty:mt-0">
        {waiting ? (
          "Finish on the GitHub tab. This page notices by itself."
        ) : timedOut ? (
          <span id="github-timed-out">We didn&apos;t hear back. If you finished, press Connect again.</span>
        ) : null}
      </p>
    </div>
  );
}
