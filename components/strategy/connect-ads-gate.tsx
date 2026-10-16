"use client";

/**
 * "Connect your ad accounts" — the gate in front of the first strategy message.
 *
 * A client island. It earns `"use client"` because a modal is open/closed state
 * plus focus management. It holds no application data — what is missing is
 * decided on the server by `adsPromptDecision` and arrives as a prop.
 *
 * ## When it opens
 *
 * On arrival, every time the strategy screen is opened with an ad platform
 * unconnected. `adsPromptDecision` owns that rule and the reasoning behind it.
 *
 * ## Two modes, because there are two situations
 *
 * **Before the first message** (`onStartAnyway` given) it also GATES: it
 * replaces the start button, so the ask sits between the customer and the
 * agent's first question. That matters because a `<dialog>` closes on Escape
 * and on a backdrop click — an earlier version merely opened over a working
 * start button, so the ask could be skipped without ever answering it.
 *
 * **Mid-conversation** it is only an offer. There is nothing left to gate, the
 * plan is already being built, and blocking a reply to the agent would be
 * obstruction rather than help — so it closes and stays closed for that visit.
 *
 * The agent plans paid acquisition. Asked to build a strategy with no ad data
 * it will still answer, and the answer will be generic — it cannot know what a
 * click costs this business or which campaigns already convert. That is what
 * makes it worth interrupting for.
 *
 * ## Colour
 *
 * Google's and Meta's own brand colours, the same exception `connect-google`
 * documents: a third party's colour is not ours to tokenise, and rendering both
 * in `accent` would make the two indistinguishable.
 */

import { useScrollLock } from "@/lib/use-scroll-lock";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConnectLink } from "@/components/ui/connect-link";
import { useEffect, useRef, useState } from "react";

const GOOGLE_ADS = "#4285F4";
const META_ADS = "#0866FF";

export type AdsPlatform = "googleAds" | "metaAds";

const PLATFORMS: Record<
  AdsPlatform,
  { label: string; href: string; color: string; blurb: string }
> = {
  googleAds: {
    label: "Google Ads",
    href: "/api/ads/connect?platform=google-ads",
    color: GOOGLE_ADS,
    blurb: "Search spend, cost per click and which keywords already convert.",
  },
  metaAds: {
    label: "Meta Ads",
    href: "/api/ads/connect?platform=meta-ads",
    color: META_ADS,
    blurb: "Facebook and Instagram campaign performance, audiences and CPA.",
  },
};

function AdsIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true" fill="none">
      <path d="M3 16h14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6 16V7M10 16V3.5M14 16v-6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ConnectAdsGate({
  missing,
  onStartAnyway,
}: {
  missing: AdsPlatform[];
  /**
   * Starts the conversation without connecting. Given only before the first
   * message — its presence is what puts this component in gate mode.
   *
   * It starts in the same submit that answers the ask: two steps would mean
   * answering the question and then still having to press start, which reads
   * as the answer not having worked.
   */
  onStartAnyway?: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Open on arrival. `adsPromptDecision` has already decided this screen should
  // ask; the component does not second-guess it.
  const [open, setOpen] = useState(true);
  const gates = onStartAnyway !== undefined;

  // `showModal()` is what gives focus trapping, Escape-to-close and the
  // backdrop for free; rendering the element open would give none of it.
  // The page behind a modal must not scroll; see the hook for what
  // `showModal()` does and does not give us.
  useScrollLock(open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      {/* In gate mode this stands in for `StrategyThread`'s own start button,
          so closing the dialog cannot leave a working way past the ask — it
          only re-opens it. Same label, because it leads to the same place. */}
      {gates && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          suppressHydrationWarning
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition active:scale-[0.99] motion-reduce:transform-none hover:bg-accent-ink"
        >
          Start the conversation
        </button>
      )}

      <dialog
      ref={dialogRef}
      onClose={() => setOpen(false)}
      // The dialog element is the click target for its own backdrop, so a hit
      // on the element itself means the backdrop was clicked.
      onClick={(e) => {
        if (e.target === dialogRef.current) setOpen(false);
      }}
      aria-labelledby="connect-ads-title"
      className="w-[min(38rem,calc(100vw-2rem))] rounded-lg border border-border bg-ground p-0 text-ink shadow-lg backdrop:bg-ink/50"
    >
      <div className="p-4">
        <h2 id="connect-ads-title" className="text-base font-bold text-ink">
          Connect your ad accounts first
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          The strategy is built around what your advertising already tells us — spend, cost per
          click, and which campaigns convert. Without it the plan is guesswork.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          {missing.map((id) => {
            const platform = PLATFORMS[id];
            return (
              <ConnectLink
                key={id}
                href={platform.href}
                className="flex items-start gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-surface-raised"
              >
                <span className="mt-0.5 shrink-0">
                  <AdsIcon color={platform.color} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">
                    Connect {platform.label}
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-soft">{platform.blurb}</span>
                </span>
              </ConnectLink>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between gap-4 border-t border-border pt-4">
          <p className="text-xs text-ink-soft">
            You&apos;ll be sent to approve access, then back here.
          </p>
          {/* Before the first message this both answers the ask and starts, so
              someone who does not run ads is not stuck. Mid-conversation there
              is nothing to start, so it simply closes — blocking a reply to the
              agent would be obstruction, not help. */}
          {gates ? (
            <form action={onStartAnyway}>
              {/* This one starts the agent, so it has the same two-minute wait
                  as the thread's own send — and the same need to say so. */}
              <SubmitButton
                pendingLabel="Starting…"
                className="shrink-0 rounded-md border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface-raised"
              >
                Start without connecting
              </SubmitButton>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(false)}
              suppressHydrationWarning
              className="shrink-0 rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-raised"
            >
              Not now
            </button>
          )}
        </div>
      </div>
      </dialog>
    </>
  );
}
