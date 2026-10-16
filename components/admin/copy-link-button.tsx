"use client";

/**
 * Copies an invite's claim link.
 *
 * ## Why this earns `"use client"`
 *
 * A clipboard write and a moment of "Copied" — the same two things
 * `color-swatches.tsx` needed. It is the fallback for an invite email that did
 * not arrive, so it has to work for every pending invite, not only one created
 * in this session (the legacy panel only remembered links it had just made).
 */

import { useEffect, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";

export function CopyLinkButton({ url, email }: { url: string; email: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy the claim link for ${email}`}
      suppressHydrationWarning
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-raised"
    >
      {state === "copied" ? <Check aria-hidden="true" className="size-3.5 text-good" /> : <Copy aria-hidden="true" className="size-3.5" />}
      <span aria-live="polite">
        {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : "Copy link"}
      </span>
    </button>
  );
}
