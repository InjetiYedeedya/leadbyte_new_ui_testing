"use client";

/**
 * What each section of the profile actually shows.
 *
 * Split from `profile-story.tsx` so that file stays about the DOCUMENT — the
 * rail, the section frame, the provenance line — and this one stays about the
 * data. They change for different reasons: the frame is settled, the fields
 * grow every time the crawl learns something new.
 *
 * ## Every section is composed differently, on purpose
 *
 * Six sections rendered through one generic layout is what made this page
 * read as a pile of identical widgets. A brand has a palette and a typeface
 * and wants to be SEEN; a competitor list wants to be scanned; contact
 * details want to be copied. So the business section is a headline plus a
 * fact row, the brand section is a three-column blueprint, competitors are
 * rows that open, contact is a column set, terms are a wrapped list and
 * images are a gallery. The section frame is what makes them one document.
 *
 * ## The rule every section here follows
 *
 * Nothing is invented and nothing is padded. A field the crawl did not return
 * is absent from the section rather than rendered as a blank row, an em dash
 * or a hopeful placeholder. `profile-story.ts` has already decided whether a
 * section has anything at all, so the checks below are about individual
 * fields, not about the section.
 */

import { webHref } from "@/lib/data/profile-display";
import {
  ArrowSquareOut,
  CaretRight,
  FileText,
  LinkSimple,
  SquaresFour,
  Target,
} from "@phosphor-icons/react";
import { ColorSwatches } from "@/components/analysis/color-swatches";
import { SocialMark } from "@/components/analysis/social-mark";
import { absoluteUrl, altTextFor, firstFilled } from "@/lib/data/profile-display";
import { platformLabel } from "@/lib/data/labels";
import type { StoryChapter } from "@/lib/data/profile-story";
import type { BusinessProfile } from "@/lib/data/types";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Past this many characters a crawled description is clamped rather than
 * printed in full. Three lines of prose at this measure is roughly this, so
 * the clamp only ever engages on text that would actually have been cut.
 */
const LONG_DESCRIPTION = 260;

/** A quiet label above a value or a block. */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{children}</p>
  );
}

/**
 * One cell of the identity strip: a marker, a quiet label, and the value
 * carrying the weight.
 *
 * The icon is `aria-hidden` and adds no meaning — the label already says what
 * the value is. It is there so the four cells read as four separate facts at
 * a glance rather than as one run of small grey text.
 */
function StripFact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 shrink-0 text-accent" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-ink-soft">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-ink">{children}</p>
      </div>
    </div>
  );
}

/**
 * A list of extracted words.
 *
 * Plain text separated by hairline dividers rather than a row of pills. Six
 * sections of pills is the look this redesign is getting away from, and these
 * are words the crawl found, not statuses or filters.
 */
function TermList({ terms }: { terms: string[] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink">
      {terms.map((term) => (
        <li key={term} className="border-l border-border pl-3 first:border-l-0 first:pl-0">
          {term}
        </li>
      ))}
    </ul>
  );
}

export function StoryChapterBody({
  chapter,
  profile,
  onRemoveImage,
}: {
  chapter: StoryChapter;
  profile: BusinessProfile;
  /** Drops one extracted image, for the Visual signals section. */
  onRemoveImage: (formData: FormData) => void | Promise<void>;
}) {
  const brand = profile.brand;

  switch (chapter.id) {
    case "business": {
      const name = firstFilled(profile.businessName);
      const type = firstFilled(profile.businessType);
      const industry = firstFilled(profile.industry);
      const site = firstFilled(profile.websiteUrl);
      const description = firstFilled(profile.description);
      const href = site ? absoluteUrl(site) : null;

      const logo = firstFilled(brand?.logo);

      return (
        <div>
          {/*
           * The identity strip: who this is, then the three fields that
           * classify them, divided rather than gridded.
           *
           * The hairlines are the point. As a plain three-column grid of
           * label/value pairs the row read as a table with a name stuck on
           * the front; the rules say these are four separate answers about
           * one business, which is what a reviewer is checking one at a time.
           * Each cell is dropped when the crawl returned nothing for it, so
           * a thin profile gets a short strip, never an empty column.
           */}
          {(name || logo || type || industry || site) && (
            <div className="grid gap-5 rounded-lg border border-border p-5 sm:grid-cols-2 lg:flex lg:items-center lg:gap-0 lg:divide-x lg:divide-border">
              {(name || logo) && (
                <div className="flex items-center gap-4 lg:flex-[1.3] lg:pr-6">
                  {logo && (
                    /* eslint-disable-next-line @next/next/no-img-element -- remote host */
                    <img
                      src={logo}
                      alt={name ? `${name} logo` : "Logo"}
                      className="size-14 shrink-0 rounded-lg border border-border bg-surface-raised object-contain p-1.5"
                    />
                  )}
                  {/* The name, and nothing under it. The reference design put
                      the business type here as a tag AS WELL as in its own
                      labelled cell two columns along — the same string printed
                      twice in one 60px row, where the second one is the only
                      copy that says what the value means. */}
                  {name && (
                    <p className="min-w-0 truncate text-xl font-bold tracking-tight text-ink">
                      {name}
                    </p>
                  )}
                </div>
              )}
              {type && (
                <div className="lg:flex-1 lg:px-6">
                  <StripFact icon={<Target size={20} />} label="Business type">
                    {type}
                  </StripFact>
                </div>
              )}
              {industry && (
                <div className="lg:flex-1 lg:px-6">
                  <StripFact icon={<SquaresFour size={20} />} label="Industry">
                    {industry}
                  </StripFact>
                </div>
              )}
              {site && (
                <div className="lg:flex-1 lg:pl-6">
                  <StripFact icon={<LinkSimple size={20} />} label="Website">
                    {href ? (
                      // Someone else's site, so a raw anchor.
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 break-all text-accent-ink underline-offset-2 hover:underline"
                      >
                        {site}
                        <ArrowSquareOut size={14} aria-hidden="true" className="shrink-0" />
                      </a>
                    ) : (
                      site
                    )}
                  </StripFact>
                </div>
              )}
            </div>
          )}

          {description && (
            <div className="mt-6 border-t border-border pt-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <FileText size={18} weight="regular" aria-hidden="true" className="text-accent" />
                Business description
              </p>
              {description.length <= LONG_DESCRIPTION ? (
                <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink">{description}</p>
              ) : (
                /*
                 * A crawled description runs to whatever the site put on its
                 * about page, and printing all of it made the first thing a
                 * reviewer met a wall of marketing copy, with the fields they
                 * are actually checking pushed below it.
                 *
                 * `<details>` rather than state, and the text is in the DOM
                 * ONCE: the summary holds the paragraph and the clamp lifts
                 * when it opens. Rendering a short copy and a full copy would
                 * read the description twice to a screen reader and duplicate
                 * it into the PDF.
                 */
                <details className="group mt-2">
                  <summary className="cursor-pointer list-none rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                    <span className="line-clamp-3 max-w-prose text-sm leading-relaxed text-ink group-open:line-clamp-none">
                      {description}
                    </span>
                    <span className="mt-2 inline-block text-sm font-medium text-accent-ink underline-offset-4 group-hover:underline">
                      <span className="group-open:hidden">View full description</span>
                      <span className="hidden group-open:inline">Show less</span>
                    </span>
                  </summary>
                </details>
              )}
            </div>
          )}
        </div>
      );
    }

    case "brand": {
      const values = brand?.brandValues ?? [];
      const voice = firstFilled(brand?.toneOfVoice);
      const aesthetic = firstFilled(brand?.brandAesthetic);
      const colors = brand?.colors ?? [];
      const fonts = brand?.fonts ?? [];
      const logo = firstFilled(brand?.logo);
      const name = firstFilled(profile.businessName);
      const primary = colors[0];

      /*
       * A blueprint, not a table of five label/value rows.
       *
       * The brand is the one section whose data is visual: a logo, a palette,
       * a typeface. Printing "Colours  #12126E" as a row of text describes
       * the brand instead of showing it. Three columns: what the brand looks
       * like, how it speaks, and the system behind it.
       *
       * Each column is omitted when the crawl found nothing for it, so an
       * account with only a palette gets a palette rather than two empty
       * headings.
       */
      const hasPersonality = values.length > 0 || voice !== null || aesthetic !== null;
      const hasSystem = colors.length > 0 || fonts.length > 0;

      return (
        <div className="grid gap-8 lg:grid-cols-3 lg:gap-10">
          {/* The brand as it appears, tinted with the extracted primary
              colour where there is one. This is the one place on the page a
              customer's own colour may set a surface, which is CLAUDE.md's
              standing exception for the extracted palette.

              `self-start` matters: as a grid child it would otherwise stretch
              to the height of the tallest column and become a mostly empty
              tinted box, which is the exact thing this redesign is removing. */}
          <div className="flex flex-col gap-3 self-start">
            <Label>Brand preview</Label>
            <div
              className="flex min-h-28 flex-col justify-center gap-3 rounded-lg border border-border px-5 py-6"
              style={primary ? { backgroundColor: `${primary.hex}0F` } : undefined}
            >
              {logo && (
                /* eslint-disable-next-line @next/next/no-img-element -- remote host */
                <img
                  src={logo}
                  alt={name ? `${name} logo` : "Logo"}
                  className="h-8 w-auto max-w-[80%] object-contain object-left"
                />
              )}
              {name && (
                <p
                  className={
                    logo
                      ? "text-sm font-medium text-ink"
                      : "text-lg font-semibold tracking-tight text-ink"
                  }
                >
                  {name}
                </p>
              )}
            </div>
          </div>

          {hasPersonality && (
            <div className="flex flex-col gap-5">
              <Label>Brand personality</Label>
              {values.length > 0 && (
                <div>
                  <p className="text-xs text-ink-soft">Tone</p>
                  <ul className="mt-1.5 space-y-0.5 text-sm text-ink">
                    {values.map((v) => (
                      <li key={v}>{v}</li>
                    ))}
                  </ul>
                </div>
              )}
              {voice && (
                <div>
                  <p className="text-xs text-ink-soft">Voice</p>
                  <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink">{voice}</p>
                </div>
              )}
              {aesthetic && (
                <div>
                  <p className="text-xs text-ink-soft">Visual style</p>
                  <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink">{aesthetic}</p>
                </div>
              )}
            </div>
          )}

          {hasSystem && (
            <div className="flex flex-col gap-5">
              <Label>Brand system</Label>
              {colors.length > 0 && (
                <div>
                  <p className="text-xs text-ink-soft">Colour palette</p>
                  <div className="mt-2">
                    <ColorSwatches colors={colors} compact />
                  </div>
                </div>
              )}
              {fonts.length > 0 && (
                <div>
                  <p className="text-xs text-ink-soft">Typography</p>
                  {/* The typefaces named, at a size where the name is worth
                      reading. A rendered "Aa" would be drawn in OUR font,
                      not theirs, which would be a claim about their brand
                      that the page cannot support. */}
                  <p className="mt-1.5 text-sm font-medium text-ink">
                    {fonts.map((f) => f.name).join(" / ")}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
                    {fonts.map((f) => (
                      <li key={f.name}>
                        {f.label}: {f.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    case "competitors": {
      const competitors = brand?.competitors ?? [];
      return (
        <ul className="divide-y divide-border border-y border-border">
          {competitors.map((competitor) => {
            const url = competitor.url ? absoluteUrl(competitor.url) : null;
            const detail = competitor.reason ?? competitor.url;

            if (!detail) {
              // Nothing behind it, so no chevron: a row that cannot open must
              // not look like one that can.
              return (
                <li key={competitor.name} className="py-3 text-sm font-medium text-ink">
                  {competitor.name}
                </li>
              );
            }

            return (
              <li key={competitor.name}>
                {/* `<details>` rather than React state: it opens, closes, is
                    keyboard-operable and announces itself. Closed by default,
                    so the section is a scannable list of names first. */}
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-4 py-3 text-sm transition-colors hover:text-accent-ink focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent">
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">
                      {competitor.name}
                    </span>
                    {competitor.url && (
                      <span className="hidden truncate text-xs text-ink-soft sm:block">
                        {competitor.url}
                      </span>
                    )}
                    <CaretRight
                      size={14}
                      aria-hidden="true"
                      className="shrink-0 text-ink-soft transition-transform group-open:rotate-90 motion-reduce:transition-none"
                    />
                  </summary>
                  <div className="pb-4">
                    {competitor.reason && (
                      <p className="max-w-prose text-sm leading-relaxed text-ink-soft">
                        {competitor.reason}
                      </p>
                    )}
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-sm text-accent-ink underline-offset-4 hover:underline"
                      >
                        Visit site
                      </a>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      );
    }

    case "contact": {
      const emails = brand?.emails ?? [];
      const phones = brand?.phones ?? [];
      const socials = brand?.socialLinks ?? [];
      // Location lives here since the two sections merged. Order is
      // deliberate: the ways someone reaches you remotely first, then where
      // they would go in person.
      const addresses = brand?.location?.addresses ?? [];
      const hours = brand?.location?.hours ?? [];
      const mapLinks = brand?.location?.mapLinks ?? [];

      return (
        <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {emails.length > 0 && (
            <div>
              <p className="text-xs text-ink-soft">Email</p>
              <ul className="mt-1.5 space-y-1">
                {emails.map((e) => (
                  <li key={e}>
                    <a href={`mailto:${e}`} className="break-all text-sm text-accent-ink">
                      {e}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {phones.length > 0 && (
            <div>
              <p className="text-xs text-ink-soft">Phone</p>
              <ul className="mt-1.5 space-y-1 text-sm tabular-nums text-ink">
                {phones.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {addresses.length > 0 && (
            <div>
              <p className="text-xs text-ink-soft">
                {addresses.length === 1 ? "Address" : "Addresses"}
              </p>
              <ul className="mt-1.5 space-y-1 text-sm text-ink">
                {addresses.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {socials.length > 0 && (
            <div>
              <p className="text-xs text-ink-soft">Social profiles</p>
              {/* Only the platforms the crawl actually found, each linking to
                  the url it found. Nothing is filled in. */}
              <ul className="mt-1.5 space-y-1">
                {socials.map((s) => (
                  <li key={s.platform}>
                    <a
                      href={webHref(s.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-accent-ink underline-offset-4 hover:underline"
                    >
                      <SocialMark platform={s.platform} />
                      {platformLabel(s.platform)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hours.length > 0 && (
            <div>
              <p className="text-xs text-ink-soft">Opening hours</p>
              <ul className="mt-1.5 space-y-1 text-sm text-ink">
                {hours.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}
          {mapLinks.length > 0 && (
            <div>
              <p className="text-xs text-ink-soft">On the map</p>
              <ul className="mt-1.5 space-y-1">
                {mapLinks.map((link) => {
                  const href = absoluteUrl(link);
                  return (
                    <li key={link}>
                      <a
                        href={href ?? link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-sm text-accent-ink underline-offset-4 hover:underline"
                      >
                        {link}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      );
    }

    case "website": {
      const keywords = brand?.keywords ?? [];
      /*
       * The design asked for primary terms, secondary terms, page counts and
       * relevance. The payload carries ONE flat list of keywords with no
       * ranking, no frequency and no page attached to any of them, so a
       * "primary" heading here would be a claim the data does not make.
       * The terms are shown as they came, in the order they came.
       */
      return (
        <div>
          <Label>Recurring terms</Label>
          <div className="mt-3">
            <TermList terms={keywords} />
          </div>
        </div>
      );
    }

    case "images": {
      const images = brand?.images ?? [];
      const name = firstFilled(profile.businessName) ?? "your site";

      /*
       * Preview and Remove, and deliberately NO "possible mismatch" warning.
       *
       * One was built on 2026-09-22 and taken out the same day. It compared
       * each image's host against the customer's own domain, on the
       * assumption that an extracted image keeps the URL it was found at. It
       * does not: the analysis pipeline copies every image it finds into our
       * own S3 bucket, so all of them are served from the same
       * `email-templates-...amazonaws.com` host whoever they belong to. The
       * check flagged 100% of images, the customer's own logo included, and a
       * warning that fires on everything teaches people to ignore the
       * warnings that are real.
       *
       * There is nothing else in the payload to judge one by: an image is a
       * bare URL, with no alt text, no classification and no source page. So
       * the section shows what was found and lets the customer decide. If
       * images ever arrive with their source page attached, THAT is the field
       * to flag on.
       */
      return (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((src, i) => (
            <li key={src} className="min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote host */}
              <img
                src={src}
                alt={altTextFor(src, i, name)}
                width={160}
                height={120}
                loading="lazy"
                // `object-contain`: these are whatever the crawler found,
                // logos included, and a wide wordmark forced to cover crops
                // to a sliver of oversized letters.
                className="h-24 w-full rounded-md border border-border bg-surface-raised object-contain"
              />
              <form action={onRemoveImage} className="mt-1.5">
                <input type="hidden" name="image" value={src} />
                <SubmitButton
                  className="rounded text-xs text-ink-soft underline-offset-4 hover:text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  pendingLabel="Removing"
                >
                  Remove
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      );
    }
  }
}
