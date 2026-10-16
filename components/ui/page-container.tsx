import type { ReactNode } from "react";
import { FitToWindow } from "@/components/ui/fit-to-window";

/**
 * The app's ONE page container, and the ONE page header.
 *
 * Before this existed there was no container anywhere in the chain —
 * `globals.css` has no spacing tokens, `app/layout.tsx` renders a bare
 * `<body>`, `app/(app)/layout.tsx` adds only `min-h-screen`, and `PageShell`
 * adds no wrapper at all. So every route wrote its own `<main>`, and the app
 * ended up with four page paddings, three `h1` sizes and two opposite
 * directions for the same section gap (`website-audit` separated sections with
 * `mt-6` while `geo-analysis` used `mb-6`, for the identical report shape).
 *
 * Two rules live here:
 *
 * - **Sections carry no vertical margin.** The gap between them is
 *   `flex flex-col gap-4` on the container, which is what makes the
 *   `mt-6`-vs-`mb-6` disagreement structurally impossible rather than merely
 *   fixed once.
 * - **Header→body must be strictly smaller than section→section.** 2-8px
 *   against 16px. The old pages used `mb-6`/`mb-8` for an intro paragraph —
 *   the same distance as the gap between unrelated sections — so the two
 *   relationships were indistinguishable. `PageHeader` has no bottom margin
 *   for exactly this reason: the container's `gap-4` owns it.
 *
 * `CONTAINER_CLASSES` is exported because the sticky chrome in `tab-bar.tsx`
 * and the `PageLoading` fallback have to agree with it. A loader at a
 * different width than the page it stands in for shifts the layout the instant
 * the real page arrives, which is the bug `HeaderFrame` already exists to
 * avoid one row higher up.
 */
export const CONTAINER_CLASSES = "mx-auto w-full max-w-[1440px] px-5 sm:px-6";

/**
 * How wide the page's own content column is.
 *
 * `full` is the default and right for anything that USES the width — charts,
 * card grids, wide tables. `reading` is for a report: a list of findings, or a
 * label-bar-score row. Those do not get better at 1440px, they get worse — a
 * 1.5px progress bar stretched to 1200px stops reading as a bar, and a
 * finding ends up ~1100px from the category label that belongs to it.
 *
 * It caps the COLUMN, not the elements inside it, so the cards still end where
 * their content does instead of holding a void on the right.
 */
const WIDTHS = {
  full: "",
  reading: "max-w-5xl",
} as const;

/**
 * What the page's content sits on.
 *
 * `frosted` (the default) is a translucent, blurred panel over the moving
 * background. Every page's headings, descriptions and empty states sit
 * straight on the footage otherwise, and dark navy text over dark desks and
 * chairs could not be read — a per-letter halo (`.on-photo`) was tried first
 * and was not enough below the windows. The footage still shows in the
 * gutters and, softened, through the panel.
 *
 * Since 2026-10-09 it is lighter (`ground` at 10% rather than 70%) with a
 * stronger blur, and the Overview uses it too: one pane of glass on every
 * page, so moving between tabs does not swap a clear photo for a fogged one.
 * The stronger blur is what keeps text readable through a thinner tint.
 *
 * `none` is kept for a page that genuinely needs the bare footage; nothing
 * uses it today.
 *
 * The blur is on a `before:` layer rather than the panel itself on purpose:
 * `backdrop-filter` on an element makes it the containing block for every
 * `position: fixed` descendant, which would pin drawers and popovers inside
 * the panel instead of the viewport. A pseudo-element has no descendants.
 */
/** The frosted card's look without its padding: `fit` puts the padding on
    the layer that scrolls, not on the frame that holds still. */
const FROSTED_FRAME =
  "relative isolate before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-lg before:border before:border-white/30 before:bg-ground/10 before:shadow-[0_24px_60px_-30px_rgb(12_21_63/0.35)] before:backdrop-blur-xl before:backdrop-saturate-150 print:before:hidden";

export const FROSTED_PANEL = `${FROSTED_FRAME} p-4 print:p-0`;

const SURFACES = {
  frosted: FROSTED_PANEL,
  none: "",
} as const;

export function PageContainer({
  children,
  width = "full",
  surface = "frosted",
  className = "",
  fit = false,
}: {
  children: ReactNode;
  width?: keyof typeof WIDTHS;
  surface?: keyof typeof SURFACES;
  /** Escape hatch for a page that needs an extra layout class. Not for padding. */
  className?: string;
  /**
   * The frosted card holds still and its contents scroll INSIDE it, leaving
   * the page around it still (`FitToWindow`). `true`: the card is at most the
   * window's height, so a short page keeps a short card. `"fill"`: exactly the
   * window's height, for a page whose contents size themselves to the card
   * (the agents dashboard split). `false`, the default: the page scrolls the
   * window, as every page did before 2026-10-12.
   *
   * Opt-in, not the default as on the UI-modifications branch: only Agents
   * and Connections use it (`"fill"`). Every other page — the business
   * profile's scroll story in particular, which reads the window's scroll —
   * is unchanged until it is moved deliberately.
   */
  fit?: boolean | "fill";
}) {
  if (fit !== false && surface === "frosted") {
    return (
      <main className={`${CONTAINER_CLASSES} py-5 ${className}`}>
        <FitToWindow frameClassName={`${WIDTHS[width]} ${FROSTED_FRAME}`} mode={fit === "fill" ? "fill" : "cap"}>
          <div className="flex flex-col gap-4">{children}</div>
        </FitToWindow>
      </main>
    );
  }
  return (
    <main className={`${CONTAINER_CLASSES} py-5 ${className}`}>
      <div className={`flex flex-col gap-4 ${WIDTHS[width]} ${SURFACES[surface]}`}>{children}</div>
    </main>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  /** One line saying what the screen answers. Omit rather than pad it out. */
  description?: ReactNode;
  /** Controls that belong to the screen as a whole, right-aligned. */
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {/* 24px BOLD, not 18px semibold. At semibold in Inter a heading sits
            close enough to body weight that a screen reads as a run of
            paragraphs — reported 2026-09-20 as "not even bold, how do people
            understand what it is". This is the page's name, so it is the
            heaviest thing on the screen after a headline figure. */}
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description && (
          <p className="mt-0.5 max-w-prose text-sm text-ink-soft">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
