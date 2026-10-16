import { FacebookLogo, InstagramLogo, XLogo, YoutubeLogo } from "@phosphor-icons/react/ssr";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { PlatformId } from "@/lib/data/dashboard/social-performance";

/**
 * A social platform's mark in its own colour, for the Social Media tab.
 *
 * The colours are raw hex on purpose — a third party's brand colour is not
 * ours to tokenise (CLAUDE.md, "Styling"). Four platforms in `accent` would be
 * four identical rows, and the mark is what the reader scans for.
 *
 * Not `components/analysis/social-mark.tsx`: that one is keyed by whatever
 * the scraper found and has no X. This one is keyed by the four platforms the
 * agent actually posts to. No `"use client"` and the `/ssr` icons, so the
 * posts island and the server tab can both render it.
 */
const MARKS: Record<PlatformId, PhosphorIcon> = {
  instagram: InstagramLogo,
  facebook: FacebookLogo,
  x: XLogo,
  youtube: YoutubeLogo,
};

/** Third-party brand colours, not LeadByte tokens. */
const BRAND: Record<PlatformId, string> = {
  instagram: "#E4405F",
  facebook: "#1877F2",
  x: "#000000",
  youtube: "#FF0000",
};

export function PlatformMark({ platform, size = 16 }: { platform: PlatformId; size?: number }) {
  const Mark = MARKS[platform];
  return <Mark size={size} weight="fill" aria-hidden="true" style={{ color: BRAND[platform] }} />;
}
