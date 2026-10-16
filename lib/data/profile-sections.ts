import type { BrandDetails } from "@/lib/data/types";

/**
 * Editing every card on the Business profile, not just the first one.
 *
 * ## Why brand edits are stored as an OVERRIDE
 *
 * The scalar fields (name, type, industry, description) live on the customer's
 * own `Leadbyte_User_Overall_Details` row, and the repo lets that row win over
 * the crawl. The brand block does not: `brand` is read straight off
 * `/api/website-analyze`, and the details table has no equivalent columns. So
 * writing a corrected colour or competitor into that table the way the
 * description is written would report success and change nothing on screen —
 * the same class of bug as writing `businessName` instead of `companyName`.
 *
 * One row field, `brandOverrides`, holds a JSON object of whatever the customer
 * has corrected, and the repo merges it OVER the extracted brand. Partial by
 * construction: an untouched field keeps coming from the crawl, so a later
 * analysis still improves the parts nobody has edited.
 *
 * ## Why the list editors are line-based
 *
 * Keywords, emails, competitors and the rest are arrays, and an "add another
 * row" editor is a client island with its own state. A textarea, one item per
 * line, is a plain `<form action={serverAction}>` — the same reason the rest of
 * this screen has no `"use client"` in it. The multi-part rows use ` | ` and
 * say so on the field.
 */
export const PROFILE_SECTIONS = [
  "business",
  "keywords",
  "contact",
  "apps",
  "brand",
  "cta",
  "competitors",
  "images",
] as const;

export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

/** What each card's Edit button opens, and what the form calls itself there. */
export const SECTION_TITLES: Record<ProfileSection, string> = {
  business: "What your business is",
  keywords: "The terms that appear most often",
  contact: "Contact details",
  apps: "Apps",
  brand: "Brand intelligence",
  cta: "What your site asks visitors to do",
  competitors: "Who you are competing with",
  images: "Images on your site",
};

/**
 * An unknown or missing `?edit=` opens the business section rather than
 * erroring. A stale link is a link with no preference, not a failure — the same
 * rule the explore page's `?source=` follows.
 */
export function readSection(value: string | undefined): ProfileSection | null {
  if (value === undefined || value === "") return null;
  if (value === "1") return "business";
  return (PROFILE_SECTIONS as readonly string[]).includes(value)
    ? (value as ProfileSection)
    : "business";
}

/* ---------- line-based list encoding ---------- */

export function linesToList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

export function listToLines(list: readonly string[] | undefined): string {
  return (list ?? []).join("\n");
}

/** Split one line on ` | ` into a fixed number of trimmed parts. */
function parts(line: string, count: number): string[] {
  const split = line.split("|").map((part) => part.trim());
  return Array.from({ length: count }, (_, i) => split[i] ?? "");
}

/** A row whose FIRST part is empty is dropped, never rendered blank. Rule 5. */
function rows<T>(value: string, count: number, build: (p: string[]) => T): T[] {
  return linesToList(value)
    .map((line) => parts(line, count))
    .filter((p) => p[0] !== "")
    .map(build);
}

export function readBrandSection(
  section: ProfileSection,
  get: (name: string) => string,
): Partial<BrandDetails> {
  switch (section) {
    case "keywords":
      return { keywords: linesToList(get("keywords")) };
    case "cta":
      return { callsToAction: linesToList(get("callsToAction")) };
    case "images":
      return { images: linesToList(get("images")) };
    case "contact":
      return {
        emails: linesToList(get("emails")),
        phones: linesToList(get("phones")),
        socialLinks: rows(get("socialLinks"), 2, (p) => ({ platform: p[0]!, url: p[1]! })),
      };
    case "competitors":
      return {
        competitors: rows(get("competitors"), 3, (p) => ({
          name: p[0]!,
          url: p[1] === "" ? undefined : p[1],
          reason: p[2] === "" ? undefined : p[2],
        })),
      };
    case "apps":
      return {
        appStats: rows(get("appStats"), 5, (p) => ({
          store: p[0]!,
          downloads: p[1] === "" ? undefined : p[1],
          rating: p[2] === "" ? undefined : p[2],
          ratingsCount: p[3] === "" ? undefined : p[3],
          url: p[4] === "" ? undefined : p[4],
        })),
      };
    case "brand":
      return {
        toneOfVoice: get("toneOfVoice"),
        brandAesthetic: get("brandAesthetic"),
        brandValues: linesToList(get("brandValues")),
        colors: rows(get("colors"), 2, (p) => ({ hex: p[0]!, label: p[1]! })),
        fonts: rows(get("fonts"), 2, (p) => ({ name: p[0]!, label: p[1]! })),
      };
    default:
      return {};
  }
}

/* ---------- prefill ---------- */

export function socialLinksToLines(brand: BrandDetails | undefined): string {
  return (brand?.socialLinks ?? []).map((s) => `${s.platform} | ${s.url}`).join("\n");
}

export function competitorsToLines(brand: BrandDetails | undefined): string {
  return (brand?.competitors ?? [])
    .map((c) => [c.name, c.url ?? "", c.reason ?? ""].join(" | "))
    .join("\n");
}

export function appStatsToLines(brand: BrandDetails | undefined): string {
  return (brand?.appStats ?? [])
    .map((a) =>
      [a.store, a.downloads ?? "", a.rating ?? "", a.ratingsCount ?? "", a.url ?? ""].join(" | "),
    )
    .join("\n");
}

export function colorsToLines(brand: BrandDetails | undefined): string {
  return (brand?.colors ?? []).map((c) => `${c.hex} | ${c.label}`).join("\n");
}

export function fontsToLines(brand: BrandDetails | undefined): string {
  return (brand?.fonts ?? []).map((f) => `${f.name} | ${f.label}`).join("\n");
}
