/**
 * Display helpers for profile fields that may exist but be unfilled.
 *
 * ## Why this exists
 *
 * `mapProfile()` in `business-profile-repo.ts` coerces every missing string
 * field to `""` (see its local `str()` helper), so a profile row that exists
 * but has never had its business details filled in comes back as
 * `{ businessName: "", businessType: "", industry: "", description: "" }`.
 *
 * That made `??` fallbacks silently dead — `"" ?? businessId` is `""`, not
 * `businessId`, because `??` only catches null and undefined. The result was
 * blank headings and sentences with holes in them:
 *
 *     "High confidence ·  · novaflow.io"          (overview)
 *     "How visible  is inside answer engines."     (GEO)
 *     "Workspace name:  "                          (settings)
 *
 * Every read of a profile string for display must treat `""` as absent. These
 * helpers are the one place that rule lives.
 */

/** True when a string field carries something worth rendering. */
export function isFilled(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * First value that is actually filled in, or null when none are.
 *
 * Use instead of `a ?? b ?? c` for profile strings.
 */
export function firstFilled(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (isFilled(value)) return value.trim();
  }
  return null;
}

/**
 * Joins the parts that are filled in with a separator, skipping the blanks.
 *
 * `["", "", "novaflow.io"]` renders as `"novaflow.io"`, not `" ·  · novaflow.io"`.
 * Returns null when nothing is filled, so the caller can drop the line entirely
 * rather than render an empty one.
 */
export function joinFilled(
  values: Array<string | null | undefined>,
  separator = " · ",
): string | null {
  const filled = values.filter(isFilled).map((v) => v.trim());
  return filled.length > 0 ? filled.join(separator) : null;
}

/**
 * The customer's identity for the header band.
 *
 * The header used to show only our own wordmark, which left no answer to
 * "whose data am I looking at?" — and the design it replaces showed a
 * hard-coded business name. This reads the real one instead.
 *
 * Three rules, all of them rule 5 in CLAUDE.md wearing different clothes:
 *
 * - **The website's host is the fallback name.** A profile row can exist with
 *   `businessName: ""` — that is the common case for a brand-new account whose
 *   analysis has not finished — and `businessName ?? host` would have rendered
 *   an empty chip. The host is what the customer typed, so it is never a guess.
 * - **No name and no website means no chip.** An empty pill next to our logo
 *   reads as a broken header, which is worse than a header without it.
 * - **A monogram stands in for a missing logo**, because `brand` is absent in
 *   mock mode and until the analysis extracts one. An `<img>` with `src=""`
 *   requests the current page in some browsers.
 */
export function brandChip(
  profile: { businessName: string; websiteUrl: string; brand?: { logo?: string } } | null,
): { name: string; logo: string; monogram: string; href: string } | null {
  if (!profile) return null;

  const name = firstFilled(profile.businessName, host(profile.websiteUrl));
  if (name === null) return null;

  return {
    name,
    logo: firstFilled(profile.brand?.logo) ?? "",
    monogram: name.slice(0, 1).toUpperCase(),
    href: absoluteUrl(profile.websiteUrl),
  };
}

/**
 * A stored website URL, safe to put in an `href`.
 *
 * Stage 01 accepts a bare host, so the profile row routinely holds
 * `go.chefgaa.com` with no scheme — and a scheme-less value in an `href` is a
 * RELATIVE path, not a website. The header chip on every page therefore linked
 * to `/overview/go.chefgaa.com`, a 404 on our own domain (seen live
 * 2026-09-07). `https` rather than `http`: the value came from a site we
 * successfully crawled.
 *
 * Returns `""` for a missing URL, which is `brandChip`'s signal to render the
 * chip as plain text with no affordance at all.
 */
export function absoluteUrl(websiteUrl: string | null | undefined): string {
  if (!isFilled(websiteUrl)) return "";
  const trimmed = websiteUrl.trim();
  // Only web links. This value comes from a crawl and from what a customer
  // typed, and any other scheme (`javascript:`, `data:`) in an `href` is a
  // link that runs or smuggles content rather than opening a website
  // (audit, 2026-09-25). Anything else renders as plain text.
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return "";
  return `https://${trimmed}`;
}

/** `absoluteUrl` for any crawled link: a safe web address, or `undefined`. */
export function webHref(url: string | null | undefined): string | undefined {
  const href = absoluteUrl(url);
  return href === "" ? undefined : href;
}

/**
 * `https://www.zippygo.ai/pricing` → `zippygo.ai`.
 *
 * Hand-parsed rather than `new URL()`, which throws on the bare `zippygo.ai`
 * that Stage 01 accepts — and a throw here would take out the header on every
 * page.
 */
function host(websiteUrl: string | null | undefined): string {
  if (!isFilled(websiteUrl)) return "";
  return websiteUrl
    .trim()
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]!;
}

/**
 * The avatar's initials, from the account address.
 *
 * The session holds an email and nothing else — there is no display name
 * anywhere in the backend — so the initials come from the local part:
 * `charan.pullepu@` → `CP`, `thilak@` → `TH`.
 *
 * Digits are skipped rather than shown: `2024.team@` reading as "2T" looks
 * like a bug, and an address is not a name. When there is nothing to initial
 * at all the avatar shows an em dash, because an empty circle reads as a
 * failed image and a crash in the header would take out every page.
 */
export function accountInitials(email: string | null | undefined): string {
  if (!isFilled(email)) return "—";

  const letters = email
    .split("@")[0]!
    .split(/[.\-_+]/)
    .map((part) => part.replace(/[^a-z]/gi, ""))
    .filter((part) => part !== "");

  if (letters.length === 0) return "—";
  const initials =
    letters.length === 1 ? letters[0]!.slice(0, 2) : letters[0]![0]! + letters[1]![0]!;

  return initials.toUpperCase();
}

/**
 * Moved here from `brand-sheet.tsx` on 2026-09-21, and the reason is a bundle
 * boundary rather than tidiness. It is a pure function, but it lived in a
 * Server Component that imports icons, `Link`, `Badge` and `ColorSwatches`.
 * The profile story is a client island and needs this one function, so
 * importing it from there would have pulled that entire component tree across
 * the boundary and into the browser's bundle for a string helper.
 */
/**
 * Alt text for a scraped image we know nothing about beyond its URL.
 *
 * Nothing here is invented, same rule as the rest of this file: there is no
 * caption or description in the crawl payload, so guessing what is IN the
 * image is not an option. A filename is sometimes a real hint ("team-photo",
 * "app-screenshot-dashboard") and sometimes a CDN hash that describes
 * nothing — only the first case is worth surfacing to a screen reader.
 */
export function altTextFor(src: string, index: number, siteName: string): string {
  const generic = `Image ${index + 1} from ${siteName}`;
  let words: string;
  try {
    const file = new URL(src).pathname.split("/").pop() ?? "";
    words = file.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
  } catch {
    return generic;
  }
  // A hash/id filename is all hex, or has no letter runs long enough to read
  // as a word — either way it says nothing a reader could use.
  const looksDescriptive = /[a-z]{3,}/i.test(words) && !/^[0-9a-f\s]+$/i.test(words);
  return looksDescriptive ? `${words}, from ${siteName}` : generic;
}
