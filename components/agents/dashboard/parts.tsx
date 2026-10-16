import type { ReactNode } from "react";
import { PanelControls } from "@/components/agents/agent-dashboard-split";

/**
 * The agent dashboard's building blocks, shared by every tab.
 *
 * From the legacy dashboard's implementation guide (§6.5) — a section header,
 * summary cards, panels and bar rows — built on THIS app's tokens rather than
 * the guide's own palette, so the dashboard reads as part of the product
 * (`docs/design-system.md`, CLAUDE.md "Styling"): `rounded-lg` cards with
 * `p-4`, a `size-9` icon chip, sentence-case labels, `tabular-nums` figures.
 *
 * Server Components, props only, no state — safe to render from a client
 * island too.
 */

/* ---------- section header ---------- */

export function SectionHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: ReactNode;
  title: string;
  subtitle: ReactNode;
  /** Controls for the whole tab, right-aligned (a Data / Chart switch). */
  action?: ReactNode;
}) {
  return (
    // Pinned to the top of the dashboard's scroll box (`xl`, where it has one)
    // so the title and the panel's close stay in reach while the figures under
    // it scroll. Opaque, in the card's own colour, so they scroll beneath it.
    <header className="z-10 flex flex-wrap items-center gap-3 border-b border-border bg-surface-raised pb-3 xl:sticky xl:top-0">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-surface"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-bold text-ink">{title}</h3>
        <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>
      </div>
      {/* The tab's own control, then the panel's (refresh, close) — which
          sit here so the panel needs no second row above this one. Outside
          the panel `PanelControls` draws nothing. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {action}
        <PanelControls />
      </div>
    </header>
  );
}

/* ---------- summary cards ---------- */

export type SummaryTone = "primary" | "neutral" | "success";

const TONE_CHIP: Record<SummaryTone, string> = {
  primary: "bg-accent text-surface",
  neutral: "bg-accent/10 text-accent-ink",
  success: "bg-good-soft text-good",
};

/**
 * One key figure. `value` is pre-formatted; pass null for "—" — a missing
 * figure is never printed as 0. `primary` marks the most important card in a
 * row, `success` an outcome (backlinks won, the best platform).
 */
export function SummaryCard({
  label,
  value,
  note,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string | null;
  note?: ReactNode;
  icon?: ReactNode;
  tone?: SummaryTone;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-surface p-4">
      {icon && (
        <span
          aria-hidden="true"
          className={`flex size-9 shrink-0 items-center justify-center rounded-md ${TONE_CHIP[tone]}`}
        >
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-soft">{label}</p>
        <p className="mt-0.5 truncate text-2xl font-bold tabular-nums tracking-tight text-ink">
          {value ?? "—"}
        </p>
        {note && <p className="mt-0.5 text-xs text-ink-soft">{note}</p>}
      </div>
    </div>
  );
}

/**
 * A row of summary cards that wraps when there is no room.
 *
 * CONTAINER queries, not screen ones: the dashboard lives in a slide-in that
 * is half the page on a wide screen and all of it on a narrow one, so the
 * screen's width says nothing about the room this row actually has — three
 * cards across at `sm:` squeezed into a 600px panel on a laptop.
 */
export function SummaryRow({ children, columns = 3 }: { children: ReactNode; columns?: 2 | 3 | 4 | 6 }) {
  const cols = {
    2: "@sm:grid-cols-2",
    3: "@sm:grid-cols-2 @xl:grid-cols-3",
    4: "@sm:grid-cols-2 @3xl:grid-cols-4",
    6: "@sm:grid-cols-2 @2xl:grid-cols-3",
  }[columns];
  return (
    <div className="@container">
      <div className={`grid grid-cols-1 gap-3 ${cols}`}>{children}</div>
    </div>
  );
}

/* ---------- panels ---------- */

/** A card holding one chart, list or table. */
export function Panel({
  title,
  hint,
  action,
  children,
  className = "",
}: {
  title: string;
  /** One line saying what the panel measures, or how. */
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-ink">{title}</h4>
          {hint && <p className="mt-0.5 text-xs text-ink-soft">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Two panels side by side when the PANEL is wide, stacked when it is not (see `SummaryRow`). */
export function PanelPair({ children }: { children: ReactNode }) {
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2">{children}</div>
    </div>
  );
}

/* ---------- bar rows ---------- */

export type BarTone = "accent" | "good" | "warn" | "info" | "muted";

const BAR_FILL: Record<BarTone, string> = {
  accent: "bg-accent",
  good: "bg-good",
  warn: "bg-warn",
  info: "bg-info",
  muted: "bg-ink-soft",
};

/**
 * One bar: the rail is the whole, the fill's LENGTH is the value, and the
 * number sits on the row so nothing needs a legend. The fill never drops
 * below 1.5% so a small non-zero value stays visible; zero is empty.
 */
export function BarRow({
  label,
  value,
  max,
  display,
  note,
  tone = "accent",
  ariaLabel,
}: {
  label: ReactNode;
  value: number;
  /** What a full bar means. */
  max: number;
  /** The number as shown on the row. */
  display: string;
  /** A second line under the bar ("12% of emails sent got a reply"). */
  note?: ReactNode;
  tone?: BarTone;
  /** The value in words, for screen readers. */
  ariaLabel: string;
}) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const width = value > 0 ? Math.max(1.5, share * 100) : 0;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-ink">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums text-ink">{display}</span>
      </div>
      <div role="img" aria-label={ariaLabel} className="mt-1 h-2 overflow-hidden rounded-full bg-border/60">
        <div
          className={`h-full origin-left rounded-full ${BAR_FILL[tone]} motion-safe:animate-[bar-grow_0.5s_cubic-bezier(0.16,1,0.3,1)]`}
          style={{ width: `${width}%` }}
        />
      </div>
      {note && <p className="mt-1 text-xs text-ink-soft">{note}</p>}
    </div>
  );
}

/* ---------- the states every panel needs ---------- */

/** The read failed. Said as a connection problem, never as an empty account. */
export function LoadFailed({ what }: { what: string }) {
  return (
    <div role="alert" className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-ink">
      <p className="font-medium text-warn">Couldn&apos;t load {what}</p>
      <p className="mt-0.5 text-ink-soft">
        This is a connection problem, not an empty account. Use Refresh above to try again.
      </p>
    </div>
  );
}

/** The read worked and there is nothing yet — with a line on when there will be. */
export function NothingYet({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-prose text-sm text-ink-soft">{description}</p>
    </div>
  );
}
