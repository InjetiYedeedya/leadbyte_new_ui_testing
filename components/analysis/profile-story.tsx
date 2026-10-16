"use client";

/**
 * The Business profile, read card by card as a scroll story.
 *
 * Chapters STACK: each one is sticky at the same offset, so the next slides
 * up over the one before it while that one shrinks and fades out behind. The
 * transition is driven by scroll POSITION, not by a chapter entering the
 * viewport. That distinction is the whole design: an enter-once animation
 * plays at whatever speed it was authored at and then sits there, while a
 * scroll-linked one is under the reader's hand the entire way and can be
 * scrubbed backwards.
 *
 * ## This mechanism is intentional product UX. Do not flatten it.
 *
 * It has now been removed and restored twice (2026-09-22). If a brief asks
 * for "connected sections", complains about the gap between cards, or asks
 * for a normal continuous document, the answer is to tighten what is INSIDE a
 * card and to talk about the dwell, NOT to replace the stack with stacked
 * `<section>`s. The last rebuild cost a full round trip because the working
 * implementation had to be recovered from git.
 *
 * The mechanism itself lives in `components/ui/scroll-stack.tsx`, which the
 * Overview dashboard also uses. Its doc comment carries the two traps that
 * make it subtle (a sticky element's rect is frozen at the pin, and the pin
 * offset must be measured rather than matched by hand). Read that before
 * touching the maths.
 *
 * ## Why it earns `"use client"`
 *
 * The rail's active chapter, and the per-card stagger. `ScrollStack` reports
 * the active index; this file holds it. `IntersectionObserver` cannot answer
 * that question here: once the stack is running every chapter is pinned in
 * the same place, so they are all "in view" at once. That is why the rail is
 * driven by scroll position and not by an observer.
 *
 * With `prefers-reduced-motion` the whole mechanism is dropped: no sticky, no
 * transforms, no scroll linkage, no stagger. The rail stays, because it is
 * information rather than decoration.
 *
 * It fetches nothing. `app/(app)/overview/business-profile/page.tsx` does
 * every read and hands down plain objects, per the repo's island rule.
 */

import { useState } from "react";
import Link from "@/components/ui/app-link";
import { Clock, Database, GearSix, Info, PencilSimple } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "framer-motion";
import type { StoryChapter } from "@/lib/data/profile-story";
import type { BusinessProfile } from "@/lib/data/types";
import { StoryChapterBody } from "@/components/analysis/story-chapters";
import {
  ScrollStack,
  scrollToStackItem,
  useHeaderOffset,
  type ScrollStackItem,
} from "@/components/ui/scroll-stack";

/**
 * The six sections, as navigation.
 *
 * It is a real `<nav>` of anchor links: the chapters have ids, so a keyboard
 * can use it and a screen reader can list it, and `aria-current` carries the
 * active state that colour alone does not.
 *
 * It carries NO counts and no ticks. It was briefly a progress tracker
 * ("2 of 6 reviewed"), and that is not what a reader needs from a table of
 * contents: they need to know what is in the document and where they are.
 *
 * On phones and tablets it becomes a horizontal strip above the stack. A
 * 10rem gutter on a 390px screen leaves the card unreadable, and the chapter
 * number already says where you are.
 */
function ProfileRail({
  chapters,
  activeIndex,
  top,
}: {
  chapters: StoryChapter[];
  activeIndex: number;
  top: number;
}) {
  const reduce = useReducedMotion() === true;
  return (
    <nav aria-label="Profile sections" className="on-photo lg:sticky lg:self-start" style={{ top }}>
      <div className="-mx-5 overflow-x-auto overflow-y-hidden whitespace-nowrap border-b border-border px-5 pb-2.5 sm:-mx-6 sm:px-6 lg:mx-0 lg:overflow-visible lg:whitespace-normal lg:border-0 lg:p-0">
        <ol className="relative flex w-max gap-1 lg:w-auto lg:flex-col lg:gap-1.5">
          {/* The stepper's spine, drawn ONCE behind the numbers rather than as
              a fragment per row. Per-row segments have to bridge the gap
              between rows, so every change to the row's padding or the list's
              gap silently leaves a dashed line. This is one element, and the
              discs are opaque and paint over it. Desktop only: the mobile
              rail is a horizontal strip. */}
          <span
            aria-hidden="true"
            className="absolute bottom-6 left-4 top-6 hidden w-px bg-border lg:block"
          />
          {chapters.map((chapter, i) => {
            const active = i === activeIndex;
            return (
              <li key={chapter.id} className="relative">
                <a
                  href={`#chapter-${chapter.id}`}
                  // To where the chapter has ARRIVED, not where the anchor
                  // puts it — see `scrollToStackItem`. Plain anchor otherwise.
                  onClick={(event) => {
                    if (scrollToStackItem(`chapter-${chapter.id}`, !reduce)) event.preventDefault();
                  }}
                  aria-current={active ? "step" : undefined}
                  className="flex shrink-0 items-center gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {/* The number as a disc, filled when it is the chapter you
                      are reading. `bg-surface` is not decoration: it is what
                      masks the spine behind an inactive disc. */}
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors motion-reduce:transition-none ${
                      active
                        ? "border-accent bg-accent text-ground"
                        : "border-border bg-surface text-ink-soft"
                    }`}
                  >
                    {chapter.number}
                  </span>
                  {/* The tint sits on the LABEL, not on the whole row: a pill
                      that swallowed the disc as well would read as one long
                      bar rather than as a step that is lit. */}
                  <span
                    className={`min-w-0 rounded-md px-2.5 py-1.5 transition-colors motion-reduce:transition-none ${
                      active ? "bg-accent-soft/70" : ""
                    }`}
                  >
                    <span
                      className={`block text-sm font-semibold ${active ? "text-ink" : "text-ink-soft"}`}
                    >
                      {chapter.label}
                    </span>
                    {/* Hidden on the horizontal strip, where a second line
                        would double the height of the band above the card on
                        the screens with the least room for it. */}
                    <span className="hidden text-xs text-ink-soft lg:block short:hidden">
                      {chapter.caption}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </div>
      <RailNote />
    </nav>
  );
}

/**
 * What the page is for, in the reader's own words rather than ours.
 *
 * Desktop only, and below the contents rather than above it: on a phone the
 * rail is a horizontal band directly above the first card, and a marketing
 * panel wedged in there would be the first thing between the heading and the
 * data it promises.
 */
function RailNote() {
  return (
    <div className="mt-8 hidden rounded-lg bg-accent-soft/40 p-4 lg:block short:hidden">
      <span
        aria-hidden="true"
        className="flex size-9 items-center justify-center rounded-md bg-surface text-accent"
      >
        <GearSix size={18} weight="fill" />
      </span>
      <p className="mt-3 text-base font-medium leading-snug text-ink">
        Turning business data into growth opportunities.
      </p>
      <p className="mt-2 text-xs text-ink-soft">— LeadByte</p>
    </div>
  );
}

/**
 * The one line of provenance a chapter carries.
 *
 * It replaced a three-block right-hand column headed "What we found", "Why
 * this matters" and "Source", repeated on all six. Two of those said the same
 * thing on every chapter of every account, so half the card's width was spent
 * restating that a website crawl produced the website data, and each card was
 * as tall as its explanation rather than as tall as its content.
 */
function SectionMeta({ chapter, analysedAt }: { chapter: StoryChapter; analysedAt?: string }) {
  return (
    // `items-baseline`, not `items-center`: the disclosure grows downwards
    // when it is opened, and centred siblings would drift to the middle of a
    // paragraph they have nothing to do with.
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 text-xs text-ink-soft">
      <span className="inline-flex items-center gap-1.5">
        <Database size={14} aria-hidden="true" />
        Source: Website crawl
      </span>
      {/* The date is its own item rather than " · Updated …" glued to the
          source, because it is a different fact about the same reading and
          only one of the two can be absent. */}
      {analysedAt && (
        <span className="inline-flex items-center gap-1.5 border-l border-border pl-4">
          <Clock size={14} aria-hidden="true" />
          Updated {analysedAt}
        </span>
      )}
      {chapter.matters && (
        <details className="group border-l border-border pl-4">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded text-accent-ink underline-offset-2 transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none">
            <Info size={14} aria-hidden="true" />
            Why this matters
          </summary>
          <p className="mt-2 max-w-prose leading-relaxed text-ink-soft">{chapter.matters}</p>
        </details>
      )}
    </div>
  );
}

/**
 * The stagger applied to a chapter's own blocks once it arrives.
 *
 * Unhurried but not slow. The first pass ran the whole cascade inside a third
 * of a second, which read as the content simply being there rather than being
 * revealed. At 70ms apart over 550ms the label, heading and description
 * arrive in a sequence the eye can actually follow.
 */
const CARD = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const LINE = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const } },
};

/**
 * One chapter, as the card that stacks.
 *
 * The shape is the same on all six — number, eyebrow, heading, one
 * explanatory line, the content, then the provenance footer — because six
 * cards that each arrange themselves differently is what makes a page of this
 * length tiring to check. What varies is the composition INSIDE, which is
 * `story-chapters.tsx`.
 */
function StoryCard({
  chapter,
  profile,
  editBase,
  analysedAt,
  onRemoveImage,
  still,
}: {
  chapter: StoryChapter;
  profile: BusinessProfile;
  editBase?: string;
  analysedAt?: string;
  onRemoveImage: (formData: FormData) => void | Promise<void>;
  /** Reduced motion: no stagger, no entrance. */
  still: boolean;
}) {
  const Line = still ? "div" : motion.div;
  return (
    <motion.article
      variants={still ? undefined : CARD}
      initial={still ? false : "hidden"}
      whileInView={still ? undefined : "shown"}
      viewport={{ once: true, amount: 0.2 }}
      /* A hairline and a very soft lift. The shadow was `0 12px 32px -16px`
         at 28%, which read as a card hovering over the page; depth here is
         the job of the stack itself. */
      className="overflow-hidden rounded-lg border border-border bg-surface shadow-[0_1px_2px_0_rgb(15_23_42/0.04),0_8px_20px_-18px_rgb(15_23_42/0.25)]"
      aria-labelledby={`chapter-${chapter.id}-heading`}
    >
      {/* The masthead: which chapter this is, what kind of information it
          holds, and the way to correct it. It carries the STANDING
          description — the one that is true of every account — so that the
          heading below it can be about this account's findings. */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 px-5 pt-5 sm:px-7 sm:pt-6">
        <Line variants={still ? undefined : LINE} className="shrink-0">
          {/* A numeral in a tile rather than beside the eyebrow in grey. It is
              the one thing that tells a reader where they are in a document
              they meet six pinned screens of, so it is sized to be seen from
              the rail. */}
          <span className="flex size-12 items-center justify-center rounded-lg bg-accent text-base font-bold tabular-nums text-ground">
            {chapter.number}
          </span>
        </Line>
        {/* `basis-56` is what makes the row wrap sensibly on a phone rather
            than shrink: without a floor the description column collapsed to
            about 180px beside the tile and the Edit button, and a one-line
            caption became five. Below that width the button drops to its own
            line instead. */}
        <div className="min-w-0 flex-1 basis-56">
          <Line variants={still ? undefined : LINE}>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">
              {chapter.eyebrow}
            </p>
          </Line>
          {chapter.subtitle && (
            <Line variants={still ? undefined : LINE}>
              <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-soft">
                {chapter.subtitle}
              </p>
            </Line>
          )}
        </div>

        {editBase && chapter.section && (
          <Link
            href={`${editBase}?edit=${chapter.section}`}
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-ground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            <PencilSimple size={16} aria-hidden="true" />
            Edit
          </Link>
        )}
      </div>

      <div className="px-5 pb-6 pt-5 sm:px-7">
        <Line variants={still ? undefined : LINE}>
          <h2
            id={`chapter-${chapter.id}-heading`}
            className="text-xl font-bold tracking-tight text-ink sm:text-2xl"
          >
            {chapter.title}
          </h2>
        </Line>
        {/* The per-account tally, and it sits under the heading rather than in
            the masthead: "Your site gave us a name, a type and an industry" is
            a finding about THIS account, not a description of the section. */}
        {chapter.found && (
          <Line variants={still ? undefined : LINE}>
            <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-soft">
              {chapter.found}
            </p>
          </Line>
        )}

        <div className="mt-5">
          {chapter.empty ? (
            // Said plainly, and never dressed up. The reader is deciding
            // whether to trust everything else on the page.
            <p className="text-sm text-ink-soft">{chapter.empty}</p>
          ) : (
            <StoryChapterBody chapter={chapter} profile={profile} onRemoveImage={onRemoveImage} />
          )}
        </div>
      </div>

      <div className="border-t border-border bg-ground/40 px-5 py-2.5 sm:px-7">
        <SectionMeta chapter={chapter} analysedAt={analysedAt} />
      </div>
    </motion.article>
  );
}

/**
 * The end of the story.
 *
 * It states that the information is ready and offers the one way on. It
 * carries no count: a number here would be a score for reading a page, and
 * the page cannot know whether anyone checked anything.
 */
function ProfileReady({ next }: { next: React.ReactNode }) {
  return (
    <section className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface px-5 py-5 sm:px-7">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">Profile ready</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-soft">
          Your business information is ready for the next step.
        </p>
      </div>
      {next}
    </section>
  );
}

export function ProfileStory({
  profile,
  chapters,
  editBase,
  analysedAt,
  onRemoveImage,
  intro,
  completionAction,
}: {
  profile: BusinessProfile;
  chapters: StoryChapter[];
  /** Omitted while the edit form is open, exactly as the board did. */
  editBase?: string;
  /**
   * When the analysis behind this profile ran, already formatted.
   *
   * Formatted on the SERVER and passed down as a string: `toLocaleDateString`
   * resolves against the runtime's locale, and a client island that formats
   * it itself renders one date on the server and possibly another in the
   * browser, which is a hydration mismatch on every load.
   */
  analysedAt?: string;
  onRemoveImage: (formData: FormData) => void | Promise<void>;
  /**
   * The page's own heading block, rendered at the top of the reading column.
   *
   * It is passed IN rather than left on the page because the rail is a column
   * beside the document and has to start level with the title — with the
   * heading above the whole grid, the contents list began a heading's height
   * down the page and the first thing in the left column was empty air. It is
   * a server-rendered element handed to a client island, exactly as
   * `completionAction` is.
   */
  intro?: React.ReactNode;
  /** The forward link rendered at the foot of the story. */
  completionAction: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const still = reduce === true;
  const top = useHeaderOffset();
  const [activeIndex, setActiveIndex] = useState(0);

  const items: ScrollStackItem[] = chapters.map((chapter) => ({
    key: chapter.id,
    // The rail's anchors point at these, so the id belongs on the stacked
    // section rather than on the card inside it.
    id: `chapter-${chapter.id}`,
    dwell: chapter.dwell,
    content: (
      <StoryCard
        chapter={chapter}
        profile={profile}
        editBase={editBase}
        analysedAt={analysedAt}
        onRemoveImage={onRemoveImage}
        still={still}
      />
    ),
  }));

  return (
    <div className="relative isolate lg:grid lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-8">
      <ProfileRail chapters={chapters} activeIndex={activeIndex} top={top} />
      <div className="min-w-0">
        {intro && <div className="mb-4">{intro}</div>}
        <ScrollStack items={items} onActiveIndexChange={setActiveIndex} />
        {/* Outside the stack on purpose: it is the end of the document, not
            another card to be covered by one. */}
        <ProfileReady next={completionAction} />
      </div>
    </div>
  );

}
