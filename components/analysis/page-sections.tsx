"use client";

/**
 * Every analysed page, listed in the report, each opening where it sits.
 *
 * Earns `"use client"`: which sections are open is state, and there is nothing
 * to submit.
 *
 * ## Three shapes, and why this is the third
 *
 * It began as every page rendered EXPANDED, one after another — on a 17-page
 * site that is a report nobody reaches the end of, and the 90-day plan below it
 * was unreachable. It became a dropdown, which fixed the length but hid the
 * list: you had to open a menu to find out what was even in the report, then
 * pick, then read. Two clicks and a hidden inventory to answer "which page
 * needs work".
 *
 * This is the shape that answers it: every page visible as a row, ranked by its
 * own figure, and ONE click opens the one you want, in place. Nothing is hidden
 * behind a control, and nothing is longer than it needs to be.
 *
 * The sections themselves are still rendered on the server and handed over as
 * `content` — this island owns which are open, not the data (see the "islands
 * take data as props" rule in CLAUDE.md).
 *
 * ## Printing opens everything
 *
 * A collapsed row is unmounted, so a PDF would have carried whichever single
 * page happened to be open — a report that silently omits sixteen of its
 * seventeen pages is worse than no report. On `beforeprint` every section is
 * rendered, every `<details>` inside them is forced open, and the controls that
 * only make sense on a screen are dropped. See `usePrinting` for why this
 * cannot be a print stylesheet.
 *
 * ## Rows are independent, and that is deliberate
 *
 * Opening one does not close another. A single-open accordion would mean the
 * page you were reading disappears the moment you glance at a second one, and
 * comparing two pages is a real thing to want here. The cost is that someone
 * can open all seventeen — but that is then their choice, which is exactly what
 * the original always-expanded version took away.
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePrinting } from "@/lib/use-printing";

export interface PickerPage {
  /** Stable identity — the page URL. */
  key: string;
  /** What the row reads as: the short URL. */
  label: string;
  /**
   * A figure shown on the row, like `4 issues` or `62/100`.
   *
   * Over seventeen URLs a list of bare paths cannot answer the question the
   * reader actually has — WHICH page needs work. The figure on every row, and
   * the gauge drawn from it, make the list itself the ranking.
   */
  hint?: string;
  /**
   * Secondary text beside the label, e.g. the page's own <title>.
   *
   * Not decoration: the row is label-left / figures-right, and on a wide page
   * that put ~1300px of nothing between a URL and its issue count. This fills
   * that span with the one thing a reader wants next to a URL — what the page
   * actually is — so the row reads as one line instead of two edges.
   */
  meta?: string;
  content: ReactNode;
}

/**
 * How a row's figure reads, taken from the hint text.
 *
 * The hint is written by the calling page and both screens phrase it their own
 * way (`4 issues`, `no issues`, `62/100 extractable`), so the tone is read back
 * out of it rather than passed as a second prop nobody would keep in step. An
 * unrecognised hint is neutral — a wrong colour on a figure is worse than none.
 */
type Tone = "good" | "warn" | "crit" | "none";

export function toneOf(hint: string | undefined): Tone {
  if (hint === undefined) return "none";

  // "no issues" / "0 issues" — nothing to fix.
  if (/^(no|0)\s+issues?$/i.test(hint)) return "good";

  // "4 issues" — a count, where more is worse.
  const issues = /^(\d+)\s+issues?$/i.exec(hint);
  if (issues) {
    const count = Number(issues[1]);
    if (count >= 5) return "crit";
    return "warn";
  }

  // "62/100 extractable" — a score, where less is worse.
  const score = /^(\d+)\s*\/\s*100/.exec(hint);
  if (score) {
    const value = Number(score[1]);
    if (value >= 70) return "good";
    if (value >= 40) return "warn";
    return "crit";
  }

  return "none";
}

/**
 * How full a row's gauge is drawn, 0 to 1.
 *
 * A score is its own percentage. An issue count has no ceiling, so it is drawn
 * against the worst page in THIS report — the gauge answers "how bad is this
 * one compared with the others", which is the only comparison on the screen.
 */
function barShare(hint: string | undefined, worstIssueCount: number): number {
  if (hint === undefined) return 0;
  if (/^(no|0)\s+issues?$/i.test(hint)) return 0;

  const issues = /^(\d+)\s+issues?$/i.exec(hint);
  if (issues) {
    const count = Number(issues[1]);
    return worstIssueCount > 0 ? Math.min(1, count / worstIssueCount) : 0;
  }

  const score = /^(\d+)\s*\/\s*100/.exec(hint);
  if (score) return Math.min(1, Number(score[1]) / 100);

  return 0;
}

function issueCountOf(hint: string | undefined): number {
  const issues = hint === undefined ? null : /^(\d+)\s+issues?$/i.exec(hint);
  return issues ? Number(issues[1]) : 0;
}

const TONE_TEXT: Record<Tone, string> = {
  good: "text-good",
  warn: "text-warn",
  crit: "text-crit",
  none: "text-ink-soft",
};

const TONE_BAR: Record<Tone, string> = {
  good: "bg-good",
  warn: "bg-warn",
  crit: "bg-crit",
  none: "bg-border",
};

/** Above this many pages the list offers a filter; below it, one is ceremony. */
const FILTER_THRESHOLD = 8;

export function PageSections({
  pages,
  label = "Page",
  summary,
}: {
  pages: PickerPage[];
  /** What one row IS, used in the summary line and the filter's label. */
  label?: string;
  /**
   * Replaces the "N pages analysed" line, for a list whose rows are not all
   * pages — the AEO report adds a "Whole site" row for the sitemap, and
   * counting it would claim one more page than the audit looked at.
   */
  summary?: string;
}) {
  const baseId = useId();
  const reduce = useReducedMotion();
  const printing = usePrinting();
  const rootRef = useRef<HTMLDivElement>(null);

  // The first page starts open, so the report shows what a section looks like
  // rather than opening as a wall of closed rows.
  const [openKeys, setOpenKeys] = useState<string[]>(() =>
    pages[0] ? [pages[0].key] : [],
  );
  const [query, setQuery] = useState("");

  const worstIssueCount = useMemo(
    () =>
      pages.reduce(
        (worst, page) => Math.max(worst, issueCountOf(page.hint)),
        0,
      ),
    [pages],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return pages;
    return pages.filter((page) => page.label.toLowerCase().includes(needle));
  }, [pages, query]);

  // A filter is a way of looking at the report, not an edit to it. Printing
  // while one is typed must still produce the WHOLE report, or the PDF quietly
  // depends on what was in a text box at the time.
  const rows = printing ? pages : visible;

  // `<details>` blocks inside a section (the audit's per-issue detail) are
  // closed by default, and a closed one prints as its summary line alone. CSS
  // cannot open them reliably across engines, so the attribute is set directly
  // and restored after — a layout effect, because `flushSync` in `usePrinting`
  // runs these before the browser takes its snapshot.
  useLayoutEffect(() => {
    if (!printing) return;
    const root = rootRef.current;
    if (!root) return;

    const wereClosed = Array.from(root.querySelectorAll("details")).filter(
      (d) => !d.open,
    );
    for (const detail of wereClosed) detail.open = true;

    return () => {
      for (const detail of wereClosed) detail.open = false;
    };
  }, [printing]);

  if (pages.length === 0) return null;

  function toggle(key: string) {
    setOpenKeys((open) =>
      open.includes(key) ? open.filter((k) => k !== key) : [...open, key],
    );
  }

  const allOpen = openKeys.length === pages.length;

  return (
    <div ref={rootRef}>
      {/* Screen chrome. On paper the count is worth keeping — a reader holding
          the PDF still wants to know it covers ten pages — but a control that
          expands what is already expanded is a dead button. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-soft">
          {summary ?? (
            <>
              {pages.length} {label.toLowerCase()}
              {pages.length === 1 ? "" : "s"} analysed
            </>
          )}
        </p>

        {/* One control for the whole list, for the reader who wants to print or
            scan everything. It says what it will DO, and changes when it has. */}
        <button
          type="button"
          onClick={() =>
            setOpenKeys(allOpen ? [] : pages.map((page) => page.key))
          }
          suppressHydrationWarning
          className="rounded-md px-2 py-1 text-xs font-medium text-accent-ink transition hover:bg-surface-raised print:hidden"
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>

      {pages.length > FILTER_THRESHOLD && (
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Filter ${label.toLowerCase()}s`}
          aria-label={`Filter ${label.toLowerCase()}s`}
          suppressHydrationWarning
          className="mb-2 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent print:hidden"
        />
      )}

      {/* `break-inside-auto` overrides the global print rule that keeps every
          `.rounded-lg` whole: on ten expanded sections that would mean asking
          the browser to fit the entire report on one sheet. The individual
          sections carry the rule instead. */}
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface print:break-inside-auto">
        {rows.map((page, index) => {
          const tone = toneOf(page.hint);
          const share = barShare(page.hint, worstIssueCount);
          const isOpen = printing || openKeys.includes(page.key);
          const panelId = `${baseId}-panel-${index}`;
          const headerId = `${baseId}-header-${index}`;

          return (
            <div key={page.key} className="print:break-inside-avoid">
              <h3>
                <button
                  id={headerId}
                  type="button"
                  onClick={() => toggle(page.key)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  suppressHydrationWarning
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:-outline-offset-2 ${
                    isOpen ? "bg-surface-raised" : ""
                  }`}
                >
                  <span
                    className={`min-w-0 shrink-0 truncate font-mono text-sm ${
                      page.meta ? "max-w-[45%]" : "flex-1"
                    } ${isOpen ? "text-ink" : "text-ink-soft"}`}
                  >
                    {page.label}
                  </span>

                  {page.meta && (
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">
                      {page.meta}
                    </span>
                  )}

                  {/* The ranking, readable at a glance. The figure beside it
                      says the same thing in words — colour and length never
                      carry it alone. */}
                  {page.hint !== undefined && (
                    <span className="hidden h-1 w-16 shrink-0 overflow-hidden rounded-full bg-border/70 sm:block">
                      <span
                        className={`block h-full origin-left ${TONE_BAR[tone]}`}
                        style={{ transform: `scaleX(${share})` }}
                      />
                    </span>
                  )}

                  {/* Narrower on a phone: at `w-28` the figures aligned
                      beautifully and `/services/weddings` and
                      `/services/corporate` both truncated to `/services/…`,
                      which is two rows the reader cannot tell apart. The column
                      alignment is worth less than that. */}
                  {page.hint !== undefined && (
                    <span
                      className={`w-20 shrink-0 text-right text-xs font-medium tabular-nums sm:w-28 ${TONE_TEXT[tone]}`}
                    >
                      {page.hint}
                    </span>
                  )}

                  {/* The affordance, and the loudest thing on the row on
                      purpose: a bare chevron at the end of a long line does not
                      read as "this opens", which is the one thing every row
                      here does. Open rows fill it with the accent, so which
                      sections are expanded is legible down the whole list
                      without reading a word. */}
                  <motion.span
                    aria-hidden="true"
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{
                      duration: reduce ? 0 : 0.2,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors print:hidden ${
                      isOpen
                        ? "border-accent bg-accent text-surface"
                        : "border-border bg-ground text-ink"
                    }`}
                  >
                    <svg viewBox="0 0 20 20" fill="none" className="size-4">
                      <path
                        d="M5 7.5 10 12.5 15 7.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </motion.span>
                </button>
              </h3>

              {/* ONE tree, whether printing or not. An earlier version swapped
                  in a plain `<div>` for the print, which remounted every
                  section — losing any `<details>` the reader had opened, and
                  handing the effect below a set of stale nodes. Printing
                  changes only whether the entrance animation runs. */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    id={panelId}
                    role="region"
                    aria-labelledby={headerId}
                    // `false` renders straight at the target: a panel that
                    // mounts at height 0 and animates open can be snapshotted
                    // by the printer at height 0, which is a blank section.
                    initial={
                      printing || reduce ? false : { height: 0, opacity: 0 }
                    }
                    animate={
                      reduce && !printing
                        ? { opacity: 1 }
                        : { height: "auto", opacity: 1 }
                    }
                    exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={{
                      duration: printing || reduce ? 0 : 0.22,
                      ease: [0.22, 1, 0.36, 1],
                      // Out faster than in, so closing feels like a dismissal
                      // rather than a second animation to sit through.
                      opacity: {
                        duration: printing || reduce ? 0 : isOpen ? 0.18 : 0.1,
                      },
                    }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 pt-1">{page.content}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {rows.length === 0 && (
          <p className="px-4 py-5 text-center text-sm text-ink-soft">
            No {label.toLowerCase()} matches “{query}”.
          </p>
        )}
      </div>
    </div>
  );
}
