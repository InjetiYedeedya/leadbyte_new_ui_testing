"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/ui/spinner";

/**
 * The wait, shown ON the card that is waiting.
 *
 * ## Why it exists
 *
 * Creating a campaign takes 10-15 seconds (n8n builds it before answering).
 * A spinner inside one button is easy to miss over that long, and the page
 * looked frozen until the next screen's full-page loader took over — so the
 * wait read as the whole page reloading. This covers the form it sits in with
 * one message about what is happening, and blocks a second press while it
 * does (product owner, 2026-10-06).
 *
 * ## Why `"use client"`
 *
 * `useFormStatus` — it answers for the form it is rendered inside, so it must
 * be a child of that `<form>`, and the form needs `relative` for the cover to
 * sit over it. Not the page-loading animation (CLAUDE.md, "Loading is ONE
 * animation"): this reports an action someone just took.
 */
export function FormPendingOverlay({ title, detail }: { title: string; detail?: string }) {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-surface/90 px-6 text-center backdrop-blur-sm"
    >
      <span className="text-accent">
        <Spinner size="lg" />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {detail && <p className="max-w-sm text-sm text-ink-soft">{detail}</p>}
    </div>
  );
}
