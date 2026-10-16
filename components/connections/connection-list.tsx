import Image from "next/image";
import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/badge";

/**
 * The connections screen, as a list rather than a gallery of cards.
 *
 * ## Why this replaced eight cards
 *
 * Every account was a `Card` in a two-column grid: name, status pill, purpose,
 * status sentence, button. Eight of them, identical, and the page's actual
 * question — WHAT IS STILL MISSING — was the hardest thing to answer from it.
 * Status sat at a different x-position in every card, so finding the
 * unconnected ones meant reading all eight in full.
 *
 * A list puts status and action in aligned columns. The unconnected rows line
 * up down the page and can be found in one glance, which is the entire job of
 * the screen. It is also about a third of the height, so the whole set fits
 * without scrolling.
 *
 * ## Why the meter counts segments rather than filling a bar
 *
 * Connections are a count of discrete accounts, not a continuous quantity. A
 * percentage bar at 50% invites "50% of what?"; six segments with three filled
 * says three of six, and maps one-to-one onto the rows underneath it. The
 * number is written out as well — the segments are the shape of the answer,
 * not the answer itself.
 */

export function ConnectionMeter({
  connected,
  total,
}: {
  connected: number;
  total: number;
}) {
  const complete = total > 0 && connected === total;

  return (
    // Compact and stacked: it sits at the top right of the page, opposite
    // the heading, rather than taking a full-width row of its own.
    <div className="flex flex-col items-start gap-1.5 rounded-lg border border-border bg-surface px-4 py-2.5 sm:items-end">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:justify-end">
      <p className="text-sm text-ink">
        <span className="font-semibold tabular-nums">
          {connected} of {total}
        </span>{" "}
        {/* Counts every card on the page — ads, analytics, social, Search
            Console, email, GitHub and WordPress (`meterTally`). It counted the
            seven ad/analytics/social platforms only, and read "7 of 7 …
            Everything is reporting" above cards saying Not connected. */}
        accounts connected
      </p>

      {/* Round dots, one per card (asked for 2026-10-13): each reads as one
          account, where stretched segments read as a bar. */}
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="img"
        aria-label={`${connected} of ${total} accounts connected`}
      >
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={`size-2.5 shrink-0 rounded-full ${
              index < connected ? "bg-good" : "bg-border"
            }`}
          />
        ))}
      </div>
      </div>

      {/* Says what is gained by finishing, or that it is finished. An empty
          right-hand side would leave the meter as a score with no stakes. */}
      <p className="text-xs text-ink-soft">
        {complete
          ? "Everything is reporting."
          : "Each account you connect gives the agents real numbers to plan against."}
      </p>
    </div>
  );
}

/**
 * A category — Analytics, Advertising… — as a tinted panel: its name and what
 * it is for on the left, its accounts as cards on the right (2026-10-12
 * design, which replaced the single bordered list).
 *
 * The cards sit in a CONTAINER-query grid rather than a window one, because
 * the same group renders full width and at half width (Email and Website code
 * share a row): three columns where there is room for three, whatever the
 * window is.
 */
export function ConnectionGroup({
  title,
  description,
  icon,
  tone = "bg-surface-raised/60",
  iconTone = "bg-surface text-ink-soft",
  wide = true,
  children,
}: {
  title: string;
  /** One line on what the category gives you. */
  description?: string;
  icon?: React.ReactNode;
  /** The panel's tint — a token at low opacity, never raw colour. */
  tone?: string;
  iconTone?: string;
  /** Full row, or half of one beside another half-width group. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      // Equal cards on every row: where Email and Website code share a row
      // (`xl`), a panel's heading column is ONE card wide, so a full panel is
      // heading + 3 cards (1 : 3) and each half panel heading + 1 (1 : 1) —
      // the same four parts per row, and the same card width everywhere.
      //
      // A half panel puts its heading ABOVE its card at `xl` (2026-10-12). Side
      // by side, the heading took half the panel and the card the other half:
      // the card was squeezed tall and the space under the heading sat empty.
      // Stacked, the card has the panel's width and fills the rest of the
      // row's height, so the two halves end level.
      className={`grid min-w-0 gap-3 rounded-lg p-3 lg:grid-cols-[13rem_minmax(0,1fr)] ${tone} ${
        wide
          ? "xl:col-span-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]"
          : "xl:grid-cols-1 xl:grid-rows-[auto_minmax(0,1fr)]"
      }`}
    >
      <header className="min-w-0">
        <div className="flex items-center gap-3">
          {icon && (
            <span
              aria-hidden="true"
              className={`flex size-10 shrink-0 items-center justify-center rounded-md ${iconTone}`}
            >
              {icon}
            </span>
          )}
          <h2 className="text-lg font-bold text-ink">{title}</h2>
        </div>
        {description && <p className="mt-2 text-sm text-ink-soft">{description}</p>}
      </header>
      <div className="min-w-0 xl:h-full">
        {/* By the window, like the panel split above, so the two agree: three
            columns on a full panel and one on a half panel at `xl` (every card
            the size of an Advertising card, Analytics' two leaving the third
            empty rather than stretching); two from `sm`; one on a phone. */}
        <div className={`grid gap-3 sm:grid-cols-2 ${wide ? "xl:grid-cols-3" : "xl:h-full xl:grid-cols-1"}`}>{children}</div>
      </div>
    </section>
  );
}

/** A platform's own mark, at the size the card's logo tile expects. */
export function ConnectionLogo({ src, className = "size-7" }: { src: string; className?: string }) {
  // Decorative: the platform's name is the card's heading. `unoptimized`
  // because these are SVGs, which the optimiser refuses. `className` sizes a
  // mark that fills its whole canvas (GitHub's) down to the same OPTICAL size
  // as marks drawn with margin inside theirs.
  return <Image src={src} alt="" aria-hidden="true" unoptimized width={28} height={28} className={`${className} object-contain`} />;
}

/** The tile a connection's mark sits in. Shared with the WordPress half of
    the GitHub card (`WordpressLine`), so both halves line up. */
export function LogoTile({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface shadow-[0_4px_12px_-8px_rgb(12_21_63/0.4)]">
      {children}
    </span>
  );
}

/**
 * Every connection card's look. Raised clearly OFF its panel (2026-10-12): a
 * firmer edge and a two-layer shadow — a tight contact shadow plus a soft
 * lift — because white cards on a near-white frosted panel read as one
 * surface.
 *
 * On hover it LIFTS (2026-10-13): up 2px, the soft shadow deepening, the edge
 * taking a hint of the accent. A transform, so nothing around it moves; still
 * under reduced motion, where only the shadow and edge change.
 */
const CARD =
  "flex min-h-[9.75rem] min-w-0 items-start gap-3 rounded-lg border border-ink/10 bg-surface p-3 shadow-[0_1px_2px_rgb(12_21_63/0.08),0_14px_32px_-14px_rgb(12_21_63/0.38)] transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-[0_2px_4px_rgb(12_21_63/0.08),0_24px_44px_-16px_rgb(12_21_63/0.48)] focus-within:border-accent/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0";

/** `statusLabel()`'s word for an account with no connection at all. */
const NOT_CONNECTED = "Not connected";

export function ConnectionRow({
  label,
  purpose,
  status,
  statusLabel,
  note,
  detail,
  action,
  secondaryAction,
  logo,
  href,
  footer,
}: {
  label: string;
  /** What connecting this gets you, in the reader's terms. */
  purpose: string;
  status: BadgeVariant;
  statusLabel: string;
  /** Expiry, or which authorisation this shares. Small, and often absent. */
  note?: string;
  /** Anything specific to this row — the connected mailbox address, say. */
  detail?: React.ReactNode;
  action: React.ReactNode;
  /** A second, quieter route — "Choose account" after an abandoned consent. */
  secondaryAction?: React.ReactNode;
  /** The platform's mark (`ConnectionLogo`), or any node of that size. */
  logo?: React.ReactNode;
  /**
   * Where the platform's NAME leads — its agent's dashboard, or Performance
   * for the analytics accounts. None: the name is plain text (GitHub,
   * WordPress). Only the name links; the buttons keep their own jobs.
   */
  href?: string;
  /**
   * A closely related connection inside this card, on its own line under the
   * actions — WordPress in the GitHub card, the other way Blog Posting
   * publishes (2026-10-12: a second card read as a second thing to set up).
   */
  footer?: React.ReactNode;
}) {
  const badge = statusLabel !== NOT_CONNECTED && <Badge variant={status}>{statusLabel}</Badge>;
  const body = (
    <>
      {logo && <LogoTile>{logo}</LogoTile>}

      <div className="flex min-w-0 flex-1 flex-col self-stretch">
        {/* `shrink-0`: a card holding more than its height must not squeeze
            the name away (a `truncate` heading can shrink to nothing). The
            status sits at the top RIGHT, level with the name (2026-10-13), so
            the bottom row holds only the buttons. */}
        <div className="flex shrink-0 items-start justify-between gap-2">
          <h3 className="min-w-0 truncate text-base font-semibold text-ink" title={detail ? purpose : undefined}>
            {href ? (
              <Link
                href={href}
                className="rounded-sm underline-offset-2 transition-colors hover:text-accent-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {label}
              </Link>
            ) : (
              label
            )}
          </h3>
          {badge && <span className="mt-0.5 flex shrink-0">{badge}</span>}
        </div>
        {/* Not connected: what connecting gets you. Connected: the account
            details below say more, so the description gives way to them —
            still a hover away on the name. */}
        {!detail && (
          <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft" title={purpose}>
            {purpose}
          </p>
        )}
        {detail}
        {note && (
          <p className="mt-1 truncate text-xs text-ink-soft" title={note}>
            {note}
          </p>
        )}
        {/* The buttons, apart from the details above them. No badge for plain
            "Not connected": the Connect button says exactly that, and is the
            thing to press. Every other state keeps its word at the top —
            Connected, Finish setup, Expired, Unknown, Not available — because
            the button cannot say those. */}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          {secondaryAction}
          {action}
        </div>
      </div>
    </>
  );

  if (footer) {
    // Two connections in one card. BESIDE each other, split by a hairline,
    // once the card is wide enough for both (a container query: it is the
    // card's width that matters, not the window's); stacked under a hairline
    // when it is not. Side by side, the two buttons sit level on the bottom.
    return (
      <article className={`${CARD} @container`}>
        <div className="flex w-full flex-col gap-3 self-stretch @xl:flex-row @xl:gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">{body}</div>
          <div className="min-w-0 border-t border-border pt-3 @xl:flex @xl:flex-1 @xl:flex-col @xl:border-l @xl:border-t-0 @xl:pl-4 @xl:pt-0">
            {footer}
          </div>
        </div>
      </article>
    );
  }

  return (
    // ONE size for every card on the page, whatever it holds: a fixed height,
    // and a fixed budget of lines inside it — description two (one once the
    // card has account details, which are what a connected card is read
    // for), account details two, note one (each in full on hover, via
    // `title`). The actions sit on the bottom edge, always visible — Connect
    // where it is not connected, Disconnect (where the platform offers one)
    // where it is — so they line up across a whole row of cards.
    // A MINIMUM height, not a fixed one: every card is that size, but a card
    // that cannot fit (its buttons wrapping on a narrow window) grows rather
    // than spilling a button out of its bottom edge.
    <article className={CARD}>{body}
    </article>
  );
}
