import { webHref } from "@/lib/data/profile-display";
import Link from "@/components/ui/app-link";
import { CardColumns, SpanAllColumns } from "@/components/ui/card-columns";
import { Badge } from "@/components/ui/badge";
import { ColorSwatches } from "@/components/analysis/color-swatches";
import { absoluteUrl, altTextFor, firstFilled } from "@/lib/data/profile-display";
import {
  Buildings,
  CaretRight,
  FacebookLogo,
  FileText,
  IdentificationCard,
  Images,
  InstagramLogo,
  LinkedinLogo,
  MapPin,
  PencilSimple,
  Phone,
  Sparkle,
  Storefront,
  Tag,
  UsersThree,
  YoutubeLogo,
} from "@phosphor-icons/react/ssr";
// Type only, so it pulls no runtime code across the server boundary — the
// components themselves come from the `/ssr` entry above.
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { platformLabel } from "@/lib/data/labels";
import type { ProfileSection } from "@/lib/data/profile-sections";
import type { BusinessProfile } from "@/lib/data/types";


/**
 * SUPERSEDED, and kept rather than deleted.
 *
 * `/overview/business-profile` renders `components/analysis/profile-story.tsx`
 * from 2026-09-21: the same data, the same edit flow, read as a scroll story
 * instead of a board of cards. Nothing imports this component now.
 *
 * It is kept for the same reason `ui/card.tsx` and `stage-rail.tsx` are —
 * this board is the shape every other report screen in the app still uses,
 * and it is the reference for that pattern. Delete it only when a second
 * screen has moved to the story and the board is genuinely dead.
 */

/**
 * The platforms' own marks and their own colours.
 *
 * This is the exception CLAUDE.md already names: a third party's brand colour
 * is not ours to tokenise, and rendering four social links in `accent` makes
 * them indistinguishable from each other and from every other link on the
 * page. The mark is what a reader actually scans for here, so it carries the
 * colour and the pill stays neutral.
 *
 * A platform with no mark still renders, as a text-only pill. That matters:
 * the scraper reports whatever `social_links` holds, and the list is not
 * ours to predict.
 */
const SOCIAL_MARKS: Record<string, PhosphorIcon> = {
  linkedin: LinkedinLogo,
  instagram: InstagramLogo,
  youtube: YoutubeLogo,
  facebook: FacebookLogo,
};

const SOCIAL_COLOURS: Record<string, string> = {
  linkedin: "#0A66C2",
  instagram: "#E4405F",
  youtube: "#FF0000",
  facebook: "#1877F2",
};

/**
 * What the crawl found, as a board of cards.
 *
 * ## Why cards, and why two columns
 *
 * This was one tall surface with a label rail down the left, and it read as a
 * single undifferentiated list: nine unrelated facts — a palette, a phone
 * number, a set of FAQ questions — given identical weight and stacked in one
 * column, so the page was a scroll rather than a summary. It also opened with a
 * full-width dark masthead that repeated the business name already sitting in
 * the header band two rows above it.
 *
 * Each subject now owns a card, and the cards sit in two columns that fill
 * independently. That does two things the rail could not: the facts about the
 * business (left) are separated from the inferences about its brand (right),
 * and a business with no palette no longer leaves a labelled gap where one
 * would have been — a card with nothing in it is not rendered at all.
 *
 * ## Nothing here is invented
 *
 * Every card is driven by a field the analysis actually returns. Where the
 * reference design had a card we cannot fill — "Products & services",
 * "Founded / size", the Edit buttons and the PDF export — there is no card
 * rather than an empty one or a control that does nothing.
 *
 * `items-start` on the grid is load-bearing: without it the two columns stretch
 * to match each other and every card in the shorter column grows tall and
 * hollow.
 */

function Card({
  title,
  icon: CardIcon,
  badge,
  hint,
  action,
  flush,
  children,
}: {
  title: string;
  /**
   * The card's subject, as a glyph in a tinted chip beside the title.
   *
   * Nine cards of identical text-only headers gave the board no landmarks,
   * so finding "Contact details" meant reading every heading on the way
   * down. The chip is the thing the eye can skip between. Server-safe entry
   * (`@phosphor-icons/react/ssr`) because this whole sheet is a Server
   * Component; the default barrel is a client module and importing it here
   * would pull the entire board over the boundary.
   */
  icon: PhosphorIcon;
  badge?: { label: string; variant: "confidence-high" | "confidence-partial" };
  /** One line under the title, for a card whose purpose is not self-evident. */
  hint?: string;
  /**
   * A control for THIS card, on its own row.
   *
   * Only a card whose fields something can actually change gets one. The page
   * carried a single "Edit details" button in its header, which read as though
   * it edited the whole sheet — it edits three fields on one card. A control
   * sitting on the card it changes says what it covers without a sentence.
   */
  action?: React.ReactNode;
  /**
   * Drop the body's padding, for a card that draws its own cell grid to the
   * card's edge. The grid supplies the padding per cell instead — the two
   * together would inset the hairlines and leave a margin around them.
   */
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      {/* The hairline under the header belongs to `flush` cards only. Those
          draw a grid or a row list to the card's edge, so the rule separates
          two banded regions; on a padded card it drew a line across open
          space for no reason. */}
      <div
        // The border is always THERE, and only sometimes visible. A 1px rule
        // on flush headers alone made them 1px taller than padded ones, which
        // is small enough to look like nothing and is still the difference
        // between two card bodies starting level and not.
        className={`flex items-start gap-3 border-b px-4 py-4 ${flush ? "border-border" : "border-transparent"}`}
      >
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent-ink"
        >
          <CardIcon size={18} weight="regular" />
        </span>
        {/* The hint's line is RESERVED whether or not the card has one.
            ------------------------------------------------------------
            Without this the header is one line tall on a card with no hint
            and two on a card with one, so two cards sitting side by side
            start their content at different heights: on Business profile,
            "Business information" opened its field grid 13px above the
            first competitor row beside it, and the pair read as misaligned
            even though both cards, both borders and both insets matched.

            A reserved line is the only fix that survives the board being
            re-ordered. Equalising by giving every card a hint would mean
            inventing sentences, and matching heights per row is not
            possible here at all: `CardColumns` balances on real column
            height, so which two cards end up adjacent is not known when
            this renders.

            The numbers are PINNED, not inherited: `leading-7` on the title
            (28px) and `leading-5` on the hint (20px) plus the 2px between
            them is exactly the 3.125rem reserved here. Measured first, and
            the reason an earlier 2.875rem guess failed by 3px: this app's
            `text-base` is a step larger than Tailwind's, so its natural
            line box is not 24px. Do not swap these for `leading-relaxed`
            or the reserve stops matching its content. */}
        <div className="min-h-[3.125rem] min-w-0 flex-1">
          <div className="flex min-h-7 flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="text-base font-bold leading-7 text-ink">{title}</h2>
            {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
          </div>
          {hint && <p className="mt-0.5 text-xs leading-5 text-ink-soft">{hint}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={flush ? "" : "px-4 pb-4"}>{children}</div>
    </section>
  );
}

/**
 * One labelled fact in a divided grid.
 *
 * The hairlines between cells are NOT borders on the cells. A card's fields
 * are all conditional — a profile with no industry renders three cells, not
 * four — so per-cell borders leave a rule hanging where the missing cell
 * would have been, and which edge needs the border changes with the count.
 * `gap-px` over a `bg-border` grid lets the grid's own background show
 * through the gaps instead, so the rules land between whatever actually
 * rendered and nowhere else.
 */
function Cell({
  label,
  full,
  children,
}: {
  label: string;
  /** Span the row — for a paragraph that would be unreadable in half a card. */
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-surface p-4 ${full ? "sm:col-span-2" : ""}`}>
      <dt className="text-xs font-medium text-ink-soft">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

/**
 * A labelled fact.
 *
 * The label is small and quiet, in sentence case; the value carries the
 * weight. A reader scans the values and uses the labels only when something
 * surprises them. It was upper-case with wide tracking until the 2026-09-21
 * design, which is the treatment CLAUDE.md has wanted gone for months: at
 * 11px the caps are genuinely harder to read than the sentence case.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-ink-soft">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

/** A section inside a card — used where one card carries several subjects. */
function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-ink-soft">{label}</h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/**
 * A one-line summary row: label left, value right, hairline above.
 *
 * For a fact a reader CHECKS rather than reads — the typeface, the visual
 * style. Stacked on a narrow card, because a label and a long value on one
 * line at 320px leaves about six characters for the value.
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-sm text-ink-soft">{label}</dt>
      <dd className="text-sm font-medium text-ink sm:text-right">{children}</dd>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-border bg-ground px-2.5 py-1 text-xs text-ink">
      {children}
    </span>
  );
}

/**
 * The order the cards are read in, top to bottom.
 *
 * `CardColumns` flows this down the first column and then the second, and
 * balances the two on their real heights — so this is a reading order, not a
 * column assignment. The board cannot leave a hole at the foot of one column,
 * which is what the previous per-card height ESTIMATES kept doing.
 *
 * The order is a decision, not an outcome. Cards were dealt by estimated size
 * before, which put whichever card carried the most rows at the top: on a real
 * account that was the competitor list, so a screen titled "Here's what we
 * learned about your business" opened on five rival companies with the
 * business's own name below them.
 *
 * What the crawler FOUND comes first — the business's own facts, then the
 * lines it leads with — followed by what the model INFERRED from them, then
 * the supporting detail. A card with no data is skipped, so the order holds
 * for an account with three cards as well as one with ten.
 */
const CARD_ORDER = [
  "business",
  "brand",
  "messaging",
  "competitors",
  "location",
  "contact",
  "keywords",
  "cta",
  "apps",
  "images",
] as const;

export function BrandSheet({
  profile,
  editBase,
}: {
  profile: BusinessProfile;
  /**
   * The page path every card's "Edit" links to, when editing is offered.
   *
   * Each card appends its own `?edit=<section>`, so the form that opens holds
   * that card's fields and nothing else. Omitted while the form is already up.
   */
  editBase?: string;
}) {
  /** The Edit control for one card, or nothing while the form is open. */
  const edit = (section: ProfileSection) =>
    editBase ? (
      <Link
        href={`${editBase}?edit=${section}`}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-accent/40 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent print:hidden"
      >
        <PencilSimple size={13} aria-hidden="true" />
        Edit
      </Link>
    ) : undefined;

  const brand = profile.brand;
  const name = firstFilled(profile.businessName);
  const site = firstFilled(profile.websiteUrl);
  const description = firstFilled(profile.description);

  const hasBrand =
    Boolean(brand?.toneOfVoice) ||
    Boolean(brand?.brandAesthetic) ||
    (brand?.brandValues?.length ?? 0) > 0 ||
    (brand?.colors?.length ?? 0) > 0 ||
    (brand?.fonts?.length ?? 0) > 0;

  const location = brand?.location;
  const messaging = brand?.messaging;

  const contactCount =
    (brand?.emails?.length ?? 0) + (brand?.phones?.length ?? 0) + (brand?.socialLinks?.length ?? 0);

  /**
   * The cards. `PROFILE_COLUMNS` above decides where each one goes.
   *
   * `weight` is no longer what orders this screen, but it is still required
   * and still has to be honest: it is the fallback ranking used when an
   * account's data would leave a column empty, and it is a rough row count
   * taken from the DATA that fills each card rather than a pixel measurement.
   * Inflating one to move a card up the page would silently unbalance that
   * fallback for the accounts that need it — change `PROFILE_COLUMNS` instead.
   *
   * A card that renders nothing drops out before the layout runs, so three
   * cards lay out as sensibly as eight.
   *
   * `items-start` stays load-bearing: without it the shorter column's cards
   * stretch to match the taller one and each grows hollow.
   */
  const BASE = 4;
  // Punctuation with no letter or digit in it — a carousel's "‹"/"›" — is not
  // a call to action, whatever found it. See the "cta" card below.
  const realCtas = brand?.callsToAction?.filter((cta) => /[\p{L}\p{N}]/u.test(cta)) ?? [];
  const cards: { key: string; weight: number; block: React.ReactNode }[] = [
    {
      key: "business",
      weight: BASE + 3 + (description ? 4 : 0),
      block: (
        <Card
          title="Business information"
            icon={Buildings}
          action={edit("business")}
          // How COMPLETE the extraction is, which is all this can honestly
          // measure. It used to say "High confidence" for a name plus a
          // business type — a claim about accuracy drawn from two non-empty
          // strings, sitting above fields the crawler had mangled.
          badge={
            name && firstFilled(profile.businessType)
              ? { label: "Extracted", variant: "confidence-partial" }
              : { label: "Partly extracted", variant: "confidence-partial" }
          }
          flush
        >
          <dl className="grid gap-px bg-border sm:grid-cols-2">
            {name && <Cell label="Business name">{name}</Cell>}
            {firstFilled(profile.businessType) && (
              <Cell label="Business type">{profile.businessType}</Cell>
            )}
            {firstFilled(profile.industry) && <Cell label="Industry">{profile.industry}</Cell>}
            {site && (
              <Cell label="Website">
                <a
                  href={site.startsWith("http") ? site : `https://${site}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-ink underline-offset-2 hover:underline"
                >
                  {site.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              </Cell>
            )}
            {description && (
              <Cell label="Business description" full>
                {/* Clamped, because this is whatever the crawler scraped from
                    the About page — routinely 700+ characters of unbroken
                    prose, and on this account it ran to ten lines and made
                    this card twice the height of any other. Two things went
                    wrong with that: nobody reads a wall of text they did not
                    ask for, and one card that tall is what left a column
                    ending a screen above its neighbour.

                    One copy of the text, clamped by CSS and unclamped when
                    the disclosure opens — duplicating it for the two states
                    would read it twice to a screen reader and print it twice.
                    `<details>` keeps this a Server Component and gives the
                    keyboard and the accessibility tree the toggle for free. */}
                <details className="group">
                  <summary className="cursor-pointer list-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                    <span className="font-normal leading-relaxed text-ink line-clamp-4 group-open:line-clamp-none">
                      {description}
                    </span>
                    <span className="mt-1.5 inline-block text-sm font-medium text-accent-ink hover:underline">
                      <span className="group-open:hidden">Show more</span>
                      <span className="hidden group-open:inline">Show less</span>
                    </span>
                  </summary>
                </details>
              </Cell>
            )}
          </dl>
        </Card>
      ),
    },
    {
      key: "competitors",
      // The collapsed height, which is what this card is now: one line each.
      weight: BASE + (brand?.competitors?.length ?? 0),
      block: (
         brand?.competitors && brand.competitors.length > 0 && (
          <Card
            title="Who you are competing with"
            icon={UsersThree}
            hint="Found by the analysis from your market and what your site sells. Not a ranking."
            action={edit("competitors")}
            flush
          >
            {/* Names only until asked. Five competitors each carrying a
                sentence made this the tallest card on the page, so the answer
                to "who am I up against" — a list of five names — could not be
                read without scrolling past the reasoning for each one. The
                reason is the follow-up question, so it waits to be asked.

                `<details>` rather than React state: it opens and closes, is
                keyboard-operable and announces itself to a screen reader with
                no JavaScript, which keeps this whole sheet a Server Component.
                A row with nothing behind it is NOT made to look clickable. */}
            <ul className="divide-y divide-border">
              {brand.competitors.map((competitor) => {
                const detail = competitor.reason || competitor.url;
                return (
                  <li key={competitor.name}>
                    {detail ? (
                      <details className="group">
                        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-medium text-ink transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent">
                          <Buildings size={18} aria-hidden="true" className="shrink-0 text-ink-soft" />
                          <span className="min-w-0 flex-1 truncate">{competitor.name}</span>
                          {/* The chevron moved to the trailing edge and turned
                              into a real glyph. Leading it made every row read
                              as a bullet list; on the right it reads as the
                              affordance it is, and rotating it on open is the
                              only state this row has. */}
                          <CaretRight
                            size={16}
                            aria-hidden="true"
                            className="shrink-0 text-ink-soft transition-transform group-open:rotate-90 motion-reduce:transition-none"
                          />
                        </summary>
                        <div className="px-4 pb-4 pl-[2.875rem]">
                          {competitor.reason && (
                            <p className="text-sm leading-relaxed text-ink-soft">
                              {competitor.reason}
                            </p>
                          )}
                          {competitor.url && (
                            // Someone else's site, so a raw anchor — and an
                            // explicit action rather than the name itself,
                            // which sent a reader off to a rival's homepage
                            // when they only meant to read about them.
                            <a
                              href={absoluteUrl(competitor.url) ?? competitor.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1.5 inline-block text-sm text-accent-ink underline-offset-2 hover:underline"
                            >
                              Visit site
                            </a>
                          )}
                        </div>
                      </details>
                    ) : (
                      // No reason and no url behind it, so no chevron: a row
                      // that cannot open must not look like one that can.
                      <p className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-ink">
                        <Buildings size={18} aria-hidden="true" className="shrink-0 text-ink-soft" />
                        <span className="min-w-0 flex-1 truncate">{competitor.name}</span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )
      ),
    },
    {
      key: "keywords",
      weight: BASE + Math.ceil((brand?.keywords?.length ?? 0) / 6),
      block: (
         brand?.keywords && brand.keywords.length > 0 && (
          <Card
            title="What your site is about"
            icon={Tag}
            hint="The terms that appear most often."
            action={edit("keywords")}
          >
            <div className="flex flex-wrap gap-1.5">
              {brand.keywords.map((k) => (
                <Chip key={k}>{k}</Chip>
              ))}
            </div>
          </Card>
        )
      ),
    },
    {
      key: "apps",
      weight: BASE + (brand?.appStats?.length ?? 0),
      block: (
         brand?.appStats && brand.appStats.length > 0 && (
          <Card title="Apps" icon={Storefront} action={edit("apps")}>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {brand.appStats.map((a) => (
                <Field key={a.store} label={a.store}>
                  <span className="tabular-nums">
                    {a.downloads
                      ? `${a.downloads} downloads`
                      : a.ratingsCount
                        ? `${a.ratingsCount} ratings`
                        : "Listed"}
                  </span>
                  {a.url && (
                    <a
                      href={webHref(a.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-xs font-normal text-accent-ink"
                    >
                      View
                    </a>
                  )}
                </Field>
              ))}
            </dl>
          </Card>
        )
      ),
    },
    {
      key: "brand",
      weight: BASE + 6 + (brand?.colors?.length ? 3 : 0),
      block: (
         hasBrand && (
          <Card
            title="Brand intelligence"
            icon={Sparkle}
            hint="Inferred from your copy and design."
            action={edit("brand")}
          >
            {/* Reference-design order: what the brand SOUNDS like (its tone,
                then its voice), then what it LOOKS like. The summary rows sit
                last because they are a reference to check, not a read. */}
            <div className="space-y-4">
              {brand?.brandValues && brand.brandValues.length > 0 && (
                <Block label="Brand tone">
                  <div className="flex flex-wrap gap-1.5">
                    {brand.brandValues.map((v) => (
                      <Chip key={v}>{v}</Chip>
                    ))}
                  </div>
                </Block>
              )}

              {brand?.toneOfVoice && (
                <Block label="Brand voice">
                  <p className="text-sm leading-relaxed text-ink">{brand.toneOfVoice}</p>
                </Block>
              )}

              {brand?.colors && brand.colors.length > 0 && (
                <Block label="Visual identity">
                  {/* The customer's own palette, so it is exempt from our token
                      rule — see CLAUDE.md. Click to copy. */}
                  <ColorSwatches colors={brand.colors} />
                </Block>
              )}

              {/* A sentence, so it stays a paragraph. The reference design
                  sets visual style as a right-aligned row because its value is
                  three words ("Minimal · Editorial · Dense"); ours is ~110
                  characters from `brand_aesthetic`, and ragged-left across two
                  lines is harder to read than the label it belongs to. */}
              {brand?.brandAesthetic && (
                <Block label="Visual style">
                  <p className="text-sm leading-relaxed text-ink-soft">{brand.brandAesthetic}</p>
                </Block>
              )}

              {brand?.fonts && brand.fonts.length > 0 && (
                <dl className="-mx-4 -mb-4 mt-4 border-t border-border">
                  {brand.fonts.length > 0 && (
                    <Row label="Typography">
                      {/* Each face set in ITSELF where the reader has it —
                          recognising your own type is faster than reading its
                          name, and the name alone tells a customer nothing
                          they can check. */}
                      {brand.fonts.map((f, i) => (
                        <span key={f.name}>
                          {i > 0 && <span className="text-ink-soft"> / </span>}
                          <span style={{ fontFamily: `"${f.name}", var(--font-sans)` }}>
                            {f.name}
                          </span>
                        </span>
                      ))}
                    </Row>
                  )}
                </dl>
              )}
            </div>
          </Card>
        )
      ),
    },
    {
      key: "cta",
      // Filtered here, not just at extraction: a customer's stored correction
      // to this card is a full `callsToAction` array saved as one JSON blob
      // (`mergeBrandOverrides`), so a value captured before junk like a
      // carousel's "‹"/"›" was filtered out keeps overriding a fresh, clean
      // extraction indefinitely. Whatever the source, punctuation with no
      // letter or digit in it is not something a visitor is being asked to
      // do, so it never belongs on a card titled for exactly that.
      weight: BASE + realCtas.length,
      block: (
        realCtas.length > 0 && (
          <Card
            title="What your site asks visitors to do"
            icon={IdentificationCard}
            hint="The buttons and links the crawler found. Useful for matching ad copy to the action on the page."
            action={edit("cta")}
          >
            <ul className="space-y-2">
              {realCtas.map((cta) => (
                <li key={cta} className="text-sm leading-snug text-ink">
                  {cta}
                </li>
              ))}
            </ul>
          </Card>
        )
      ),
    },
    {
      key: "location",
      weight: BASE + (location?.addresses?.length ?? 0) + (location?.hours?.length ?? 0),
      block: (
        location && (
          <Card
            title="Location intelligence"
            icon={MapPin}
            // "Partial" is the honest badge and the only one this can wear.
            // The crawler reports what a site PUBLISHES, so a missing address
            // means the site does not list one — not that the business has
            // none. Anything stronger would be a claim about the world drawn
            // from a claim about a web page.
            badge={{ label: "Partial", variant: "confidence-partial" }}
            hint="Only what your site publishes. A business can have premises it never lists."
            flush
          >
            <dl className="grid gap-px bg-border">
              {location.addresses && location.addresses.length > 0 && (
                <Cell label={location.addresses.length > 1 ? "Addresses" : "Address"}>
                  <ul className="space-y-1">
                    {location.addresses.map((address) => (
                      <li key={address} className="font-normal leading-relaxed">
                        {address}
                      </li>
                    ))}
                  </ul>
                </Cell>
              )}
              {location.hours && location.hours.length > 0 && (
                <Cell label="Opening hours">
                  {/* Verbatim: sites write hours a dozen ways, and a parser
                      would blank the ones it did not recognise. */}
                  <ul className="space-y-1">
                    {location.hours.map((line) => (
                      <li key={line} className="font-normal tabular-nums">
                        {line}
                      </li>
                    ))}
                  </ul>
                </Cell>
              )}
              {location.mapLinks && location.mapLinks.length > 0 && (
                <Cell label="On the map">
                  <ul className="space-y-1">
                    {location.mapLinks.map((url, i) => (
                      <li key={url}>
                        {/* Someone else's site, so a raw anchor. */}
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent-ink underline-offset-2 hover:underline"
                        >
                          {location.mapLinks!.length > 1 ? `Open location ${i + 1}` : "Open in Maps"}
                        </a>
                      </li>
                    ))}
                  </ul>
                </Cell>
              )}
            </dl>
          </Card>
        )
      ),
    },
    {
      key: "messaging",
      weight: BASE + (messaging?.length ?? 0) * 2,
      block: (
        messaging && (
          <Card
            title="Detected messaging"
            icon={FileText}
            hint="The lines your home page leads with. What a visitor and a search result see first."
            flush
          >
            <dl className="divide-y divide-border">
              {messaging.map((line) => (
                <div key={line.kind} className="flex gap-3 px-4 py-3">
                  {/* The tag is an HTML element name — one of the few places
                      the monospace face is doing its actual job rather than
                      decorating. Fixed width so the lines start level. */}
                  <dt className="w-12 shrink-0 pt-0.5 font-mono text-[11px] uppercase text-ink-soft">
                    {line.kind}
                  </dt>
                  <dd className="min-w-0 flex-1 text-sm leading-relaxed text-ink">{line.text}</dd>
                </div>
              ))}
            </dl>
          </Card>
        )
      ),
    },
    {
      key: "contact",
      weight: BASE + contactCount,
      block: (
         contactCount > 0 && (
          <Card title="Contact details" icon={Phone} action={edit("contact")}>
            <div className="space-y-4">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {brand?.emails?.map((e) => (
                  <Field key={e} label="Email">
                    <a href={`mailto:${e}`} className="break-all text-accent-ink">
                      {e}
                    </a>
                  </Field>
                ))}
                {brand?.phones?.map((p) => (
                  <Field key={p} label="Phone">
                    <span className="tabular-nums">{p}</span>
                  </Field>
                ))}
              </dl>
              {brand?.socialLinks && brand.socialLinks.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {brand.socialLinks.map((s) => {
                    const Mark = SOCIAL_MARKS[s.platform.toLowerCase()];
                    return (
                      <a
                        key={s.platform}
                        href={webHref(s.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors duration-150 hover:border-accent/40 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
                      >
                        {Mark && (
                          <Mark
                            size={15}
                            weight="fill"
                            aria-hidden="true"
                            style={{ color: SOCIAL_COLOURS[s.platform.toLowerCase()] }}
                          />
                        )}
                        {/* Not a `capitalize` class: the key is `linkedin`, and
                            capitalising it spells the company's name wrong. */}
                        {platformLabel(s.platform)}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        )
      ),
    },
    {
      key: "images",
      weight: BASE + Math.ceil((brand?.images?.length ?? 0) / 4) * 3,
      block: (
         brand?.images && brand.images.length > 0 && (
          <Card title="Images on your site" icon={Images} action={edit("images")}>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {brand.images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- remote host
                <img
                  key={src}
                  src={src}
                  alt={altTextFor(src, i, name ?? "your site")}
                  width={120}
                  height={90}
                  loading="lazy"
                  // `object-contain`, not `object-cover`: these are whatever
                  // the crawler found on the page, logos and wordmarks
                  // included, and a wide logo (a 979x255 wordmark, measured on
                  // a real account) forced to cover a 4:3 box crops to a sliver
                  // of oversized letters rather than the mark itself. Contain
                  // letterboxes on the same neutral surface instead, which
                  // costs nothing for the photo-shaped images this card also
                  // holds and fixes the ones that are not photo-shaped.
                  className="aspect-[4/3] w-full rounded-md border border-border bg-surface-raised object-contain"
                />
              ))}
            </div>
          </Card>
        )
      ),
    },
  ].filter((card) => Boolean(card.block));

  // Ordered by CARD_ORDER; anything not named there still renders, at the end,
  // so a card added later appears even if nobody updates the list.
  const rank = (key: string) => {
    const i = (CARD_ORDER as readonly string[]).indexOf(key);
    return i === -1 ? CARD_ORDER.length : i;
  };

  const ordered = [...cards].sort((a, b) => rank(a.key) - rank(b.key));

  /**
   * "Business" and "brand" used to be pulled out of the board into their own
   * forced two-column grid row, so the facts and the read-off-them brand
   * would always land side by side. Two versions of that were tried and both
   * failed the same way for a different-looking reason:
   *
   * - Stretched to equal height, the shorter card's extra space sat INSIDE
   *   it, below its last field — which reads fine at the ~130px the pairing
   *   was measured at, and reads as an obviously hollow, broken card once
   *   Brand intelligence (which keeps gaining fields) pulled ahead further.
   * - `items-start` moves the child out of the stretch, but a CSS grid ROW
   *   is still exactly as tall as its tallest cell regardless of how the
   *   shorter cell aligns within it — so the same dead space just reappears
   *   BETWEEN the short card and whatever the board renders next. Same gap,
   *   different side of the border.
   *
   * Both are the same trap: forcing two cards of very different height into
   * one shared row always leaves that much dead space SOMEWHERE nearby. The
   * only way to not have it is to not force a shared row — so `business` and
   * `brand` now flow through the same balanced board as everything else,
   * first in `CARD_ORDER`. `CardColumns` balances on real column height, not
   * row height: a short card is simply followed immediately by the next card
   * in its own column, with no space reserved for a neighbour it isn't
   * sharing a row with.
   */

  // The images grid runs full width under both columns: it is the card that
  // most wants the room, and it closes the board on a straight edge rather
  // than whichever column happened to end lower.
  const SPANNING = "images";

  return (
    <CardColumns>
      {ordered.map((card) =>
        card.key === SPANNING ? (
          <SpanAllColumns key={card.key}>{card.block}</SpanAllColumns>
        ) : (
          <div key={card.key}>{card.block}</div>
        ),
      )}
    </CardColumns>
  );
}
