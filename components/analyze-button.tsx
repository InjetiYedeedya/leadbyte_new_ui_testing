"use client";

/**
 * The submit button on the website entry screen.
 *
 * ## Why it earns `"use client"`
 *
 * `useFormStatus` is the only way to know a Server Action is in flight, and it
 * only works inside the form's own client subtree.
 *
 * ## Why it needs to know
 *
 * Pressing it saves the URL, then starts the analysis — two backend round trips
 * before the redirect. On a slow day that is several seconds of a page that
 * looks exactly as it did before the click, which reads as a dead button. The
 * only way to find out it worked was to press it again, which starts a second
 * crawl.
 *
 * Disabled while pending for the same reason: a second submit is a second job.
 */

import { useFormStatus } from "react-dom";
import { ArrowRight } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";

export function AnalyzeButton({ ready = true }: { ready?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      // Form-filler extensions stamp `fdprocessedid` onto BUTTONS as well as
      // inputs, before React hydrates — which React reports as a hydration
      // mismatch. Same reason every control in `auth-form.tsx` carries this.
      suppressHydrationWarning
      // Pale until there is an address to analyse, as the design shows it —
      // pale, not disabled; see `WebsiteField`.
      className={`group flex min-h-13 items-center justify-center gap-2 whitespace-nowrap rounded-md px-6 font-semibold text-surface transition-[background-color,transform] duration-200 active:scale-[0.98] disabled:opacity-80 motion-reduce:transform-none ${
        ready || pending ? "bg-accent-vivid hover:bg-accent" : "bg-accent-vivid/50 hover:bg-accent-vivid/70"
      }`}
    >
      {pending && <Spinner size="md" />}
      {pending ? "Starting…" : "Analyze My Website"}
      {!pending && (
        <ArrowRight
          aria-hidden="true"
          weight="bold"
          className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
        />
      )}
    </button>
  );
}
