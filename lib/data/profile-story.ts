import { firstFilled } from "@/lib/data/profile-display";
import type { ProfileSection } from "@/lib/data/profile-sections";
import type { BusinessProfile } from "@/lib/data/types";

/**
 * The Business profile, as an ordered set of chapters.
 *
 * ## Why this is a pure module and not JSX
 *
 * The screen it drives is a scroll story: seven chapters, each revealed as the
 * reader arrives at it. Two decisions have to be made per chapter — what it is
 * called, and whether the crawl actually found anything for it — and both are
 * the kind of thing that silently rots when it lives inside a component. A
 * chapter that renders its heading over nothing is the exact failure this
 * product cannot afford: the page's whole claim is "here is what we found on
 * your site", so a heading with no finding under it reads as a broken promise
 * rather than a blank field.
 *
 * Keeping it here means the rule is tested. `npm test` asserts that an account
 * with no competitors gets the competitors chapter's EMPTY line and not a
 * fabricated one, which no amount of reading the JSX would guarantee.
 *
 * ## Why an empty chapter is kept rather than dropped
 *
 * The rest of the app drops a card with no data (`BrandSheet` does, and
 * CLAUDE.md says so). A story is different: the rail promises seven chapters
 * and the reader counts them, so a chapter that vanishes on one account and
 * appears on another makes the analysis look inconsistent rather than
 * thorough. Saying "no competitors identified yet" is a finding. Silence is
 * not.
 *
 * The page only renders the story once SOMETHING was extracted, so this is
 * never seven empty chapters in a row — that account gets the empty state the
 * page already had.
 */
export type StoryChapterId =
  | "business"
  | "brand"
  | "competitors"
  | "contact"
  | "website"
  | "images";

export interface StoryChapter {
  id: StoryChapterId;
  /** `01`, `02` … shown beside the eyebrow and in the rail. */
  number: string;
  /** The rail's label. One or two words: it sits in a narrow column. */
  label: string;
  /**
   * The rail's second line — what KIND of information the chapter holds.
   *
   * Static per chapter, and deliberately not `railNote`'s count. The rail is
   * a table of contents: it says what is in the document, and "Core details"
   * is true before the crawl has run, after it has failed, and on every
   * account. A count changes under the reader as they scroll, which makes a
   * contents list look like a scoreboard — the thing this rail had removed
   * from it on 2026-09-22.
   */
  caption: string;
  /** The line above the chapter's heading. */
  eyebrow: string;
  /** The chapter's heading. A sentence about what was found, not a field name. */
  title: string;
  /** One line under the heading, where the chapter needs a caveat. */
  subtitle?: string;
  /** Which form `?edit=` opens for this chapter, where one exists. */
  section?: ProfileSection;
  /**
   * What to say when the crawl found nothing for this chapter, or null when
   * it found something. Never a guess, and never a cheerful euphemism: the
   * reader is deciding whether to trust the rest of the page.
   */
  empty: string | null;
  /**
   * The rail's second line — what this chapter actually yielded.
   *
   * Counts only. "5 found", "12 terms", "Not found". Never a grade, a score
   * or a confidence: the data model holds none of those, so any word implying
   * one would be made up. Null where there is nothing honest to say.
   */
  railNote: string | null;
  /**
   * "What we found" — the crawl's own tally for this chapter, in a sentence.
   *
   * This is arithmetic on the extracted data and nothing else. It never
   * characterises the business, only the extraction.
   */
  found: string | null;
  /**
   * "Why this matters" — what this kind of information is FOR.
   *
   * A statement about the field, never about the account. "Local search and
   * your listings rely on this address matching your site" is true of every
   * address; "your local visibility is weak" would be a verdict we have not
   * measured. Only the first kind belongs here.
   */
  matters: string | null;
  /**
   * How far past this chapter the reader scrolls before the next one lands:
   * the section's bottom padding, as a plain CSS length.
   *
   * Per chapter, not one number for all of them. A fixed dwell makes a short
   * chapter a hole in the page and a long one feel hurried — reported as
   * "a lot of white space".
   *
   * ## Why a CSS length and not a Tailwind class
   *
   * These were `pb-[40vh]` and friends. On 2026-09-21 none of them could be
   * found in the stylesheet the dev server was serving — and a dwell class
   * that is not compiled is no dwell at all, which collapses the whole gap
   * between chapters silently. That server turned out to be in a bad state
   * at the time, so whether Tailwind genuinely misses this file is NOT
   * settled; what is settled is that a data module generating class names
   * depends on the scanner reaching it, and a `style` value does not depend
   * on anything. Measurements that come from data go through `style`.
   */
  dwell: string;
}

/** "a", "a and b", "a, b and c" — an Oxford-comma-free list. */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** `1 image` / `4 images`, so no sentence ever reads "1 images". */
function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Whether a list actually has entries. */
function some<T>(list: T[] | undefined): boolean {
  return Array.isArray(list) && list.length > 0;
}

export function buildStoryChapters(profile: BusinessProfile): StoryChapter[] {
  const brand = profile.brand;

  const hasBusiness =
    firstFilled(
      profile.businessName,
      profile.businessType,
      profile.industry,
      profile.description,
      profile.websiteUrl,
    ) !== null;

  const hasBrand =
    some(brand?.colors) ||
    some(brand?.fonts) ||
    some(brand?.brandValues) ||
    firstFilled(brand?.toneOfVoice, brand?.brandAesthetic) !== null;

  const hasLocation =
    some(brand?.location?.addresses) ||
    some(brand?.location?.hours) ||
    some(brand?.location?.mapLinks);

  const hasContact =
    some(brand?.emails) || some(brand?.phones) || some(brand?.socialLinks);

  const competitors = brand?.competitors ?? [];
  const addresses = brand?.location?.addresses ?? [];
  const hours = brand?.location?.hours ?? [];
  const mapLinks = brand?.location?.mapLinks ?? [];
  const emails = brand?.emails ?? [];
  const phones = brand?.phones ?? [];
  const socials = brand?.socialLinks ?? [];
  const keywords = brand?.keywords ?? [];
  const images = brand?.images ?? [];

  // Which of the core fields the crawl and the customer between them filled
  // in. Named rather than counted, because "3 of 5" tells the reader nothing
  // about WHICH two are missing.
  const businessFields = [
    firstFilled(profile.businessName) && "a name",
    firstFilled(profile.businessType) && "a type",
    firstFilled(profile.industry) && "an industry",
    firstFilled(profile.websiteUrl) && "a website",
    firstFilled(profile.description) && "a description",
  ].filter((f): f is string => typeof f === "string");

  const brandParts = [
    some(brand?.brandValues) && "tone",
    firstFilled(brand?.toneOfVoice) && "voice",
    some(brand?.colors) && "colours",
    some(brand?.fonts) && "typefaces",
    firstFilled(brand?.brandAesthetic) && "a described style",
  ].filter((f): f is string => typeof f === "string");

  const locationParts = [
    addresses.length > 0 && count(addresses.length, "address", "addresses"),
    hours.length > 0 && "opening hours",
    mapLinks.length > 0 && count(mapLinks.length, "map link"),
  ].filter((f): f is string => typeof f === "string");

  const contactParts = [
    emails.length > 0 && count(emails.length, "email address", "email addresses"),
    phones.length > 0 && count(phones.length, "phone number"),
    socials.length > 0 && count(socials.length, "social profile"),
  ].filter((f): f is string => typeof f === "string");

  return [
    {
      id: "business",
      number: "01",
      label: "Business",
      caption: "Core details",
      eyebrow: "Business understanding",
      title: "Core business details",
      subtitle: "Basic information about your business extracted from your website.",
      section: "business",
      empty: hasBusiness ? null : "We couldn't read the basics from your site yet.",
      railNote: hasBusiness ? "Identified" : "Not found",
      found: hasBusiness ? `Your site gave us ${joinList(businessFields)}.` : null,
      matters:
        "These are the fields the strategy agent and every ad agent read first, so a wrong one travels everywhere.",
      dwell: "5rem",
    },
    {
      id: "brand",
      number: "02",
      label: "Brand",
      caption: "Visual identity",
      eyebrow: "Brand intelligence",
      title: "How your brand presents itself",
      subtitle: "Inferred from your copy and design.",
      section: "brand",
      empty: hasBrand ? null : "Visual identity hasn't been extracted yet.",
      railNote: hasBrand ? "Extracted" : "Not found",
      found: hasBrand ? `Your pages supplied ${joinList(brandParts)}.` : null,
      matters:
        "This is read as your house style. Anything wrong here is worth correcting before it is used to write for you.",
      dwell: "5rem",
    },
    {
      id: "competitors",
      number: "03",
      label: "Competitors",
      caption: "Market landscape",
      eyebrow: "Competitive landscape",
      title: "Who you are competing with",
      // Not a ranking, and the copy says so: the backend returns an unordered
      // set and a reader shown a numbered list will read position as rank.
      subtitle: "Found from your market and what your site sells. Not a ranking.",
      section: "competitors",
      empty: competitors.length > 0 ? null : "No competitors identified yet.",
      railNote: competitors.length > 0 ? `${competitors.length} found` : "None found",
      found:
        competitors.length > 0
          ? `${count(competitors.length, "business", "businesses")} identified from the market signals on your site.`
          : null,
      // No scores, no ranking, no market share — the payload carries a name, a
      // url and sometimes a sentence, and nothing else may be implied.
      matters:
        "A set to compare your positioning and messaging against. Nothing here is measured or ranked.",
      dwell: "5rem",
    },
    {
      id: "contact",
      number: "04",
      label: "Contact",
      caption: "Reachability",
      /*
       * Location used to be chapter 04 on its own, and on most accounts it
       * held exactly one line — an address. A whole pinned viewport for one
       * fact is the emptiest a scene in this story got, so it was folded in
       * here: an address is a way of reaching a business, and the two share
       * the same caveat about only showing what the site publishes.
       */
      eyebrow: "Contact & location intelligence",
      title: "How people can reach you",
      subtitle: "Only what your site publishes. A business can have premises it never lists.",
      section: "contact",
      empty:
        hasContact || hasLocation
          ? null
          : "No contact details or address were published on the site.",
      railNote:
        hasContact || hasLocation
          ? count(
              emails.length + phones.length + socials.length + addresses.length,
              "channel",
            )
          : "Not published",
      found:
        hasContact || hasLocation
          ? `Your site publishes ${joinList([...contactParts, ...locationParts])}.`
          : null,
      matters:
        "These are the routes a visitor actually has, and an address has to match your listings for local search to trust it.",
      dwell: "5rem",
    },
    {
      id: "website",
      number: "05",
      label: "Website",
      caption: "Content intelligence",
      eyebrow: "Website intelligence",
      title: "What your site is about",
      subtitle: "The terms that appear most often.",
      section: "keywords",
      empty: keywords.length > 0 ? null : "No recurring terms were extracted yet.",
      railNote: keywords.length > 0 ? count(keywords.length, "term") : "None found",
      found:
        keywords.length > 0
          ? `${count(keywords.length, "term")} recur across the pages we crawled.`
          : null,
      // The payload is an unordered list of strings with no frequency attached,
      // so every chip is drawn at the same weight. Sizing them by an invented
      // frequency is the classic fake word cloud.
      matters:
        "What your pages repeat is what a search engine and an answer engine see most of.",
      dwell: "5rem",
    },
    {
      id: "images",
      number: "06",
      label: "Images",
      caption: "Visual signals",
      eyebrow: "Visual signals",
      title: "Images on your site",
      subtitle: "Every image the crawl captured, as it was found.",
      section: "images",
      empty: images.length > 0 ? null : "No website images detected.",
      railNote: images.length > 0 ? count(images.length, "image") : "None found",
      found: images.length > 0 ? `${count(images.length, "image")} captured from your pages.` : null,
      // The crawl returns urls and nothing else — no kind, no role, no alt.
      // So there is no "logos / product / illustration" breakdown to show.
      matters: "What a visitor sees before they read a word of your copy.",
      dwell: "2rem",
    },
  ];
}
