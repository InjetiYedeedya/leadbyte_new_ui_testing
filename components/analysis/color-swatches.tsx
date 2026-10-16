"use client";

/**
 * The brand palette, click-to-copy.
 *
 * A client island. It earns `"use client"` for a real reason, not decoration:
 * writing to the clipboard and showing a transient confirmation are things a
 * `<form action={serverAction}>` genuinely cannot express. Copying a hex is
 * also the one thing a person actually DOES on this page — these values get
 * pasted into a brief, a Figma file, or a stylesheet.
 *
 * It holds no application data. The colours are server-fetched and arrive as a
 * prop, per the repo's island rule.
 */

import { useEffect, useState } from "react";

/**
 * `compact` puts the swatch, the label and the hex on ONE line instead of
 * stacking them under a 128x80 tile.
 *
 * The large tile is right where the palette is the subject — the brand sheet
 * shows the colours so they can be judged. On the Business profile it is one
 * fact among five in a review card, and at 143px it was taller than the other
 * four rows put together. Same component and the same click-to-copy, because
 * copying a hex is the one thing anyone actually does with these.
 */
export function ColorSwatches({
  colors,
  compact = false,
}: {
  colors: { label: string; hex: string }[];
  compact?: boolean;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  // Clear the confirmation on its own so the label returns to the hex value.
  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy(hex: string) {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(hex);
    } catch {
      // Clipboard can be blocked by permissions or a non-secure origin. Saying
      // nothing is better than a failure toast for something this small — the
      // value is still on screen to select by hand.
    }
  }

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {colors.map((c) => {
          const isCopied = copied === c.hex;
          return (
            <button
              key={c.hex}
              type="button"
              onClick={() => copy(c.hex)}
              suppressHydrationWarning
              className="group inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1 text-xs transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label={`Copy ${c.label} colour ${c.hex}`}
            >
              <span
                aria-hidden="true"
                className="size-4 shrink-0 rounded border border-border"
                style={{ backgroundColor: c.hex }}
              />
              <span className="text-ink">{c.label}</span>
              <span
                aria-live="polite"
                className={`font-mono uppercase ${isCopied ? "text-good" : "text-ink-soft"}`}
              >
                {isCopied ? "Copied" : c.hex}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-x-2 gap-y-4">
      {colors.map((c) => {
        const isCopied = copied === c.hex;
        return (
          <button
            key={c.hex}
            type="button"
            onClick={() => copy(c.hex)}
            suppressHydrationWarning
            className="group w-32 shrink-0 text-left"
            aria-label={`Copy ${c.label} colour ${c.hex}`}
          >
            <span
              className="hover-lift block h-20 w-full rounded border border-border transition-transform duration-150 motion-reduce:transform-none"
              style={{ backgroundColor: c.hex }}
            />
            <span className="mt-2 block text-xs text-ink">{c.label}</span>
            <span
              aria-live="polite"
              className={`block font-mono text-xs uppercase transition-colors ${
                isCopied ? "text-good" : "text-ink-soft group-hover:text-ink"
              }`}
            >
              {isCopied ? "Copied" : c.hex}
            </span>
          </button>
        );
      })}
    </div>
  );
}
