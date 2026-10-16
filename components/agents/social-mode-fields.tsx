"use client";

/**
 * Full or Semi automation, and the questions that belong to the choice.
 *
 * ## Why this earns `"use client"`
 *
 * Full automation asks for a media type and when to post; Semi asks for the
 * customer's own images or video. Showing one set on a choice made a moment
 * ago is state, which a form POST cannot express. Both sets are
 * server-rendered and handed in — this owns which one shows, not what is in
 * it — and `readSocialForm` applies the same rule on the server (semi media
 * is read only in semi mode).
 *
 * The cards are real radios (visually hidden, the card carries the focus
 * ring), so arrow keys move between them and the choice is announced.
 */

import { useState, type ReactNode } from "react";
import { SOCIAL_INPUT, type SocialMode } from "@/lib/data/social-media-setup";

const MODES: { value: SocialMode; title: string; body: string }[] = [
  {
    value: "full",
    title: "Full automation",
    body: "We handle everything. The agent writes the posts, including the images and the copy.",
  },
  {
    value: "semi",
    title: "Semi automation",
    body: "You provide your own images or video. We handle the writing, scheduling and posting.",
  },
];

export function SocialModeFields({
  defaultMode,
  full,
  semi,
}: {
  defaultMode: SocialMode;
  /** Media type and schedule. */
  full: ReactNode;
  /** The uploader. */
  semi: ReactNode;
}) {
  const [mode, setMode] = useState<SocialMode>(defaultMode);

  return (
    <>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">How should the agent work?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {MODES.map((option) => (
            <label
              key={option.value}
              className="cursor-pointer rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-raised has-[:checked]:border-accent has-[:checked]:bg-accent/5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
            >
              <input
                type="radio"
                name={SOCIAL_INPUT.mode}
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
                className="sr-only"
              />
              <span className="block text-sm font-semibold text-ink">{option.title}</span>
              <span className="mt-1 block text-sm text-ink-soft">{option.body}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {/* Unmounted, not hidden: a hidden field still submits, and uploads
          chosen under Semi must not ride along after switching to Full. */}
      {mode === "full" ? full : semi}
    </>
  );
}
