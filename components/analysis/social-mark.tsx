import {
  FacebookLogo,
  InstagramLogo,
  LinkedinLogo,
  YoutubeLogo,
} from "@phosphor-icons/react/ssr";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

/**
 * A social platform's own mark, in its own colour.
 *
 * ## Why the colour is a raw hex
 *
 * This is the exception CLAUDE.md already names: a third party's brand colour
 * is not ours to tokenise. Rendering four social links in `accent` makes them
 * indistinguishable from each other and from every other link on the page,
 * and the mark is what a reader scans for here.
 *
 * ## Why it is its own file
 *
 * Two screens show these now — the brand sheet and the profile story — and one
 * is a Server Component while the other is a client island. A shared table
 * living in either of them would drag that file across the boundary, so it
 * lives here with no `"use client"` of its own and can be rendered from both.
 * The `/ssr` entry is deliberate for the same reason: the default Phosphor
 * barrel is a client module.
 *
 * A platform with no mark renders nothing rather than a fallback glyph. The
 * scraper reports whatever `social_links` holds and the list is not ours to
 * predict, so the label beside it carries the meaning on its own.
 */
const MARKS: Record<string, PhosphorIcon> = {
  linkedin: LinkedinLogo,
  instagram: InstagramLogo,
  youtube: YoutubeLogo,
  facebook: FacebookLogo,
};

const COLOURS: Record<string, string> = {
  linkedin: "#0A66C2",
  instagram: "#E4405F",
  youtube: "#FF0000",
  facebook: "#1877F2",
};

export function SocialMark({ platform, size = 15 }: { platform: string; size?: number }) {
  const key = platform.trim().toLowerCase();
  const Mark = MARKS[key];
  if (!Mark) return null;
  return <Mark size={size} weight="fill" aria-hidden="true" style={{ color: COLOURS[key] }} />;
}
