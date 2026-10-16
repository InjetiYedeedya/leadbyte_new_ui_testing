import { CONTAINER_CLASSES } from "@/components/ui/page-container";

/**
 * The one loading animation in this app.
 *
 * ## Why there is exactly one
 *
 * There were two. A bar swept across the top of the window while a navigation
 * was in flight, and then the page body filled with shimmering grey blocks
 * while it streamed — two different animations, in two different registers, for
 * two halves of the same wait. On a slow read both were on screen at once, and
 * a screen with two things loading on it reads as a screen that is struggling.
 *
 * So: one mark, one place, shown from the moment a page starts loading until it
 * is there. Nothing else moves.
 *
 * ## Why it looks like this
 *
 * A ring, a heading and one line, straight on the moving background — the
 * design given on 2026-09-28 ("Analyzing your website…"). It replaced four
 * rising columns that sat on the frosted page panel. No panel here on
 * purpose: a card with nothing in it but a spinner is a box around a wait.
 * The text is white with a dark shadow and a soft dark glow behind it,
 * because it sits on the footage itself, bright windows included — white
 * with a light shadow alone could not be read there.
 *
 * It shows no figure. There is no source for a percentage, so there is no
 * percentage — the same rule the analysis screen follows.
 *
 * Pure CSS, no `"use client"`: this is the fallback a Server Component renders
 * while it waits, so it cannot depend on hydration having happened.
 */

/**
 * "Website audit" → "website audit", but "GEO analysis" and "API keys" keep
 * their capitals: only a capital followed by a lower-case letter is a
 * sentence-start capital.
 */
function inSentence(title: string): string {
  return /^[A-Z][a-z]/.test(title) ? title[0]!.toLowerCase() + title.slice(1) : title;
}

export function PageLoading({
  title,
  label = "Loading",
}: {
  /** The page's own name, so the screen is identifiable while it loads. */
  title?: string;
  /** What is being waited for, if it is not simply the page. */
  label?: string;
}) {
  return (
    <main className={`${CONTAINER_CLASSES} py-5`} aria-busy="true">
      <div
        className="relative isolate flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center [text-shadow:0_1px_2px_rgb(12_21_63/0.55),0_2px_18px_rgb(12_21_63/0.5)]"
        role="status"
      >
        {/* A soft dark glow behind the words, fading to nothing — not a card.
            White text alone vanished over the bright windows in the footage. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[340px] w-[min(760px,100%)] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,rgb(12_21_63/0.42),rgb(12_21_63/0.18)_60%,transparent)]"
        />
        <svg viewBox="0 0 48 48" className="size-16 animate-page-loading" aria-hidden="true">
          {/* The track, then a quarter-and-a-bit of arc riding round it. */}
          <circle cx="24" cy="24" r="20" fill="none" strokeWidth="4" className="stroke-surface/55" />
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="40 126"
            className="stroke-accent-vivid"
          />
        </svg>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {label}
            {title ? ` ${inSentence(title)}` : ""}…
          </h1>
          <p className="mt-2 text-sm font-medium text-white">Getting your data, this will just take a moment.</p>
        </div>
      </div>
    </main>
  );
}
