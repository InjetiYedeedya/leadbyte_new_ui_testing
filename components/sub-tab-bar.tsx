import Link from "@/components/ui/app-link";
import { NavTabLink } from "@/components/nav-transition";
import { CONTAINER_CLASSES } from "@/components/ui/page-container";

/**
 * The sub-tab strip beneath the primary tabs.
 *
 * ## Why it scrolls rather than wraps
 *
 * It was a bare `flex … gap-5 px-6` with no overflow handling, and its four
 * labels need a measured **455px** (64 + 106 + 90 + 87, plus 3×20 of gap and
 * 48 of padding). A flex row will not shrink below its content's min-content
 * width, so below 455px the strip pushed the document wider than the viewport
 * and every Overview screen scrolled sideways — at 375px and at 414px, i.e.
 * every phone.
 *
 * `components/tab-bar.tsx` had already solved exactly this for the primary
 * strip; this file simply never got it. Same three parts, same reasons:
 * `overflow-x-auto` so the STRIP scrolls instead of the page,
 * `whitespace-nowrap` + `shrink-0` so a label never wraps mid-word, and
 * `overflow-y-hidden` so the horizontal scroller cannot introduce a vertical
 * one.
 *
 * ## Why it is left-aligned
 *
 * Asked for directly (2026-09-11), and it is also the easier of the two to get
 * right. Centring a scroller is the awkward case: centred content that
 * overflows its own container is clipped unreachably at the START in every
 * engine, which is why the primary strip in `tab-bar.tsx` needs `w-max` +
 * `mx-auto` rather than `justify-center`. Left-aligned content has no such
 * problem — it simply scrolls from where it begins. `w-max` stays because the
 * inner row must size to its content for the overflow above to work.
 *
 * ## Why `<nav>` and `aria-current`
 *
 * It is navigation and it has an active item. It was a `<div>` with the active
 * state carried by colour and a bottom border alone, so there was nothing for a
 * screen reader to read as "you are here" — while the primary strip sets
 * `aria-current="page"` correctly.
 */
export function SubTabBar({
  tabs,
  activeHref,
}: {
  tabs: readonly { href: string; label: string }[];
  activeHref: string;
}) {
  return (
    /* The border stays full-bleed; the SCROLLER carries the page's gutter and
       cap, so the first sub-tab lines up with the page body's left edge.
       The cap must not go on the `w-max` row itself: `mx-auto` on content
       sized to itself centres it, and these are left-aligned — unlike the
       primary strip above, which is centred on purpose. */
    <div className="border-b border-border bg-surface">
      <nav
        aria-label="Section"
        // The same edge fade as the primary strip: "GEO analysis" sat cut
        // off at a phone's edge with nothing saying it scrolls.
        className={`overflow-x-auto overflow-y-hidden whitespace-nowrap max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] ${CONTAINER_CLASSES}`}
      >
        {/* `gap-1` and padded items rather than `gap-5` on bare text: the
            active sub-tab carries a tint as well as its underline, and a tint
            needs a box to sit in. The strip's own bottom border is the line
            the underline lands on, which is why the items pull down onto it. */}
        <div className="flex w-max items-center gap-1 pt-1.5 max-sm:pr-10">
        {tabs.map((tab) => {
          const active = activeHref === tab.href;
          return (
            <NavTabLink
              key={tab.href}
              href={tab.href}
              /**
               * FULL prefetch, for the same reason the primary strip uses it
               * (see `tab-bar.tsx`): every route here is dynamic and rule 0
               * bans `loading.tsx`, so Next's DEFAULT prefetch has no static
               * shell and no loading boundary to fetch — it resolves to
               * nothing at all.
               *
               * On INTENT, not on sight (2026-10-05). `true` rendered every
               * other sub-tab on the server the moment the strip appeared:
               * three extra full page renders per page view, at the same
               * time, each reading the whole website analysis. The note here
               * said a cross-request cache made that cheap; on Cloudflare
               * there never was one (no shared cache in `open-next.config.ts`),
               * and those parallel renders helped push the Worker past its
               * limits ("Error 1102"). A hover leads a click by a few hundred
               * ms, which still starts the render early — the same trade the
               * primary strip already made.
               *
               * NOTE it changes nothing in development, where Next disables
               * prefetching outright — localhost is not evidence either way.
               */
              // Not the tab already open: prefetching the page you are on
              // renders it a second time for nothing.
              prefetch={active ? false : "intent"}
              aria-current={active ? "page" : undefined}
              /* Quieter than the primary strip on purpose: 13px against 14,
                 and no pill. Matching weights is what made the two levels
                 read as two unrelated navbars. */
              className={
                active
                  ? "relative -mb-px shrink-0 rounded-t-md border-b-2 border-accent bg-accent/[0.06] px-2.5 py-1.5 text-[13px] font-medium text-ink"
                  : "relative -mb-px shrink-0 rounded-t-md border-b-2 border-transparent px-2.5 py-1.5 text-[13px] text-ink-soft transition-colors hover:bg-surface-raised hover:text-ink"
              }
            >
              {tab.label}
            </NavTabLink>
          );
        })}
        </div>
      </nav>
    </div>
  );
}
