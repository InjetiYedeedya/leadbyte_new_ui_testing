"use client";

/**
 * The website field and its Analyze button, on the entry screen.
 *
 * ## Why it earns `"use client"`
 *
 * The design shows the button pale until there is an address to analyse, and
 * solid once there is — that is the field's own value, which only the browser
 * knows as it is typed. The button's pending state is `AnalyzeButton`'s
 * `useFormStatus`, unchanged.
 *
 * Pale, not disabled: an empty submit still reaches the server, which answers
 * with its own prompt, and a disabled button gives no reason for itself.
 */

import { useState } from "react";
import { Link as LinkIcon } from "@phosphor-icons/react";
import { AnalyzeButton } from "@/components/analyze-button";

export function WebsiteField({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-surface/80 p-1.5 shadow-[0_18px_40px_-24px_rgb(12_21_63/0.35)] backdrop-blur sm:flex-row">
      {/* The ring is on the wrapper: the input has no border of its own. */}
      <label className="flex min-h-13 flex-1 items-center gap-3 rounded-md border border-border/70 bg-surface px-4 text-left focus-within:border-accent focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent">
        <LinkIcon aria-hidden="true" weight="bold" className="size-5 shrink-0 text-accent-vivid" />
        <span className="sr-only">Your website address</span>
        <input
          type="text"
          name="websiteUrl"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Enter your website URL"
          autoComplete="url"
          inputMode="url"
          suppressHydrationWarning
          className="h-full w-full min-w-0 bg-transparent text-base text-ink outline-none placeholder:text-ink-soft/80"
        />
      </label>
      <AnalyzeButton ready={value.trim() !== ""} />
    </div>
  );
}
