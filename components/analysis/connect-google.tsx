"use client";

/**
 * "Click to next step" — the button, the fork, and the service chooser.
 *
 * A client island: a modal is open/closed state plus focus management, which a
 * `<form action={serverAction}>` cannot express. It holds no application data —
 * both destination URLs are resolved on the server and arrive as props.
 *
 * ## Two stages, on purpose
 *
 * The first screen asks WHETHER to connect Google at all, and offers moving on
 * to strategy instead. Connecting is genuinely optional — the strategy agent
 * works without it, just with less to go on — and going straight to a Google
 * consent chooser reads as a requirement. Someone who has no Analytics
 * property, or who is not the person who owns it, previously had no way out of
 * that dialog except the close button, which looks like abandoning setup
 * rather than choosing the other path.
 *
 * The second stage is the original chooser, unchanged.
 *
 * ## Three entry points, all of them at the fork
 *
 * The Connections page, the Search Console banner and the GEO page's "Next"
 * button all open on the fork, because in every one of them connecting Google
 * is one option and starting the strategy is the other. Nothing opens straight
 * at the chooser: landing on it presents connecting as the only way forward,
 * and taking the strategy path then means closing a dialog, which reads as
 * abandoning setup rather than choosing.
 *
 * The GEO button used to be a link to `/intelligence/connections`, and the
 * dialog is the point: that page is an inventory of integrations and shows what
 * we would ask Google for before anyone has agreed to ask. Here the customer
 * chooses a service, and the scope conversation happens where it belongs — on
 * Google's own consent screen.
 *
 * ## Colour
 *
 * The two accents are Google's own product colours, taken from the legacy app's
 * integrations config so both products agree:
 *
 *   Google Analytics  #E37400
 *   Search Console    #458CF5
 *
 * These are the ONE place raw hex is correct rather than a semantic token.
 * CLAUDE.md's rule exists to stop our own palette drifting; a third party's
 * brand colour is not ours to tokenise, and swapping in `accent` would make the
 * two services indistinguishable. Same reasoning as the brand sheet rendering
 * the customer's own extracted colours.
 *
 * ## Why the options are not symmetrical
 *
 * `google_unified_auth` requests BOTH scopes in one consent —
 * `webmasters.readonly` (Search Console) and `analytics.readonly`. Verified by
 * probing the endpoint on 2026-09-02. There is no Search-Console-only variant,
 * so choosing Search Console grants Analytics too. The card says so rather than
 * implying a narrower grant than Google will actually ask for.
 *
 * Each choice is a plain `<a>`, never a fetch: consent is a redirect chain the
 * browser has to walk itself.
 */

import { useScrollLock } from "@/lib/use-scroll-lock";
import { useEffect, useRef, useState } from "react";
import { skipGoogleAndPlan } from "@/app/(app)/growth/strategy/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConnectLink } from "@/components/ui/connect-link";

const ANALYTICS = "#E37400";
const SEARCH_CONSOLE = "#458CF5";

/** Bars — Analytics reads as volume over time. */
function BarsMark({ color }: { color: string }) {
  const heights = [10, 16, 12, 22, 18, 26, 20];
  return (
    <svg viewBox="0 0 84 30" className="h-10 w-28" role="img" aria-label="Traffic over time">
      {heights.map((h, i) => (
        <rect
          key={i}
          x={i * 12}
          y={30 - h}
          width={8}
          height={h}
          rx={1.5}
          fill={color}
          // Nearer bars read as more recent, so the series gains depth without
          // needing an axis.
          opacity={0.45 + (i / heights.length) * 0.55}
        />
      ))}
    </svg>
  );
}

/** A rising line — Search Console reads as ranking movement. */
function LineMark({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 84 30" className="h-10 w-28" role="img" aria-label="Ranking trend">
      <polyline
        points="0,26 14,22 28,24 42,15 56,17 70,8 84,5"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="84" cy="5" r="2.5" fill={color} />
    </svg>
  );
}

function AnalyticsIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true" fill="none">
      <path d="M3 17h14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M6.5 17V9.5M10 17V4.5M13.5 17v-5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SearchIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true" fill="none">
      <circle cx="9" cy="9" r="5.25" stroke={color} strokeWidth="1.5" />
      <path d="M13 13l3.5 3.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ServiceCard({
  title,
  subtitle,
  href,
  color,
  icon,
  mark,
  note,
}: {
  title: string;
  subtitle: string;
  href: string | null;
  color: string;
  icon: React.ReactNode;
  mark: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-start gap-2.5">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded"
          // 12% tint of the brand colour — enough to identify, light enough to
          // keep the card in our own light theme.
          style={{ backgroundColor: `${color}1F` }}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink">{title}</div>
          <div className="text-xs text-ink-soft">{subtitle}</div>
        </div>
      </div>

      {/* Fixed height, not flex-1: one card carries a note and the other does
          not, and stretching would leave the two charts different sizes. */}
      <div
        className="mb-3 flex h-20 items-center justify-center rounded px-3"
        style={{ backgroundColor: `${color}14` }}
      >
        {mark}
      </div>

      {note && <p className="mb-3 text-xs leading-relaxed text-ink-soft">{note}</p>}
      {/* Pins both Connect buttons to the same baseline. */}
      <div className="mt-auto" />

      {href ? (
        <ConnectLink
          href={href}
          pendingLabel="Opening…"
          className="flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-center text-sm font-medium transition-colors"
          style={{ color, borderColor: `${color}59` }}
        >
          Connect
        </ConnectLink>
      ) : (
        <span className="rounded-md border border-border px-3 py-2 text-center text-sm text-ink-soft">
          Unavailable
        </span>
      )}
    </div>
  );
}

/**
 * One route, three flows. The backend has a distinct OAuth start per option
 * (`google-analytics`, `google-search-console`, `google-unified`) and our route
 * picks between them from `flow`, so the hostname and the session-derived
 * `email` never touch the client.
 */
const CONNECT = {
  analytics: "/api/google/connect?flow=analytics",
  searchConsole: "/api/google/connect?flow=search-console",
  both: "/api/google/connect?flow=unified",
} as const;

export function ConnectGoogle({
  label = "Click to next step",
  variant = "accent",
}: {
  /** The trigger's text. */
  label?: string;
  /**
   * `accent` is the page's main action. `quiet` is the bordered pill used
   * where the control is a way onward rather than the point of the screen, and
   * has to sit beside other controls without outshouting them.
   */
  variant?: "accent" | "quiet";
} = {}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  // Which of the two screens the dialog is showing.
  const [stage, setStage] = useState<"choice" | "services">("choice");

  // `showModal()` is what gives focus trapping, Escape-to-close and the
  // backdrop for free; rendering the element open would give none of it.
  // The page behind a modal must not scroll; see the hook for what
  // `showModal()` does and does not give us.
  useScrollLock(open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        // Every open starts at the fork, never mid-flow: a dialog that reopens
        // on the screen you last left is disorienting when the button that
        // opened it says "next".
        onClick={() => {
          setStage("choice");
          setOpen(true);
        }}
        suppressHydrationWarning
        className={
          variant === "quiet"
            ? "group inline-flex shrink-0 items-center gap-2 rounded-md border border-border bg-surface px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-accent/40 hover:bg-surface-raised print:hidden"
            : "shrink-0 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-surface transition active:scale-[0.98] motion-reduce:transform-none hover:bg-accent-ink"
        }
      >
        <span>{label}</span>
        {variant === "quiet" && (
          <span
            aria-hidden="true"
            className="hover-nudge text-ink-soft transition-transform duration-150 motion-reduce:transform-none"
          >
            →
          </span>
        )}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        // The dialog element is the click target for its own backdrop, so a hit
        // on the element itself means the backdrop was clicked.
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
        aria-labelledby="connect-google-title"
        className="w-[min(42rem,calc(100vw-2rem))] rounded-lg border border-border bg-ground p-0 text-ink shadow-lg backdrop:bg-ink/50"
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="connect-google-title" className="text-base font-bold text-ink">
                {stage === "choice" ? "What next?" : "Connect to Google services"}
              </h2>
              <p className="mt-0.5 text-sm text-ink-soft">
                {stage === "choice"
                  ? "Connecting Google gives the strategy agent your real traffic and rankings. You can also skip it and come back later."
                  : "Choose what to bring in. You'll be sent to Google to approve access, then back here."}
              </p>
            </div>
            {/* 40px hit area, not the 24px the icon alone would give. */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              suppressHydrationWarning
              className="-mr-2 -mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-soft transition hover:bg-surface-raised hover:text-ink"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {stage === "choice" ? (
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => setStage("services")}
                suppressHydrationWarning
                className="flex w-full items-center justify-between gap-4 rounded-md border border-border bg-surface px-4 py-3 text-left transition hover:bg-surface-raised"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">
                    Connect Google services
                  </span>
                  <span className="block text-sm text-ink-soft">
                    Analytics and Search Console — traffic, queries, clicks and average position.
                  </span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-ink-soft">
                  →
                </span>
              </button>

              {/* A form, not a `Link`, because this choice has to be REMEMBERED.
                  As a link it navigated and recorded nothing, so the banner it
                  was declining was still on the strategy page when the customer
                  arrived, asking the same question. The action writes the "not
                  now" and then redirects — and a cookie can only be written
                  from a Server Action.

                  The three Google choices above it stay raw `<a>`: those are
                  Route Handlers that 302 into someone else's consent screen. */}
              <form action={skipGoogleAndPlan} className="contents">
                <SubmitButton
                  pendingLabel="Moving to strategy…"
                  className="flex w-full items-center justify-between gap-4 rounded-md border border-border bg-surface px-4 py-3 text-left transition hover:bg-surface-raised"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">Move to strategy</span>
                    <span className="block text-sm text-ink-soft">
                      Start the plan now. The agent works without this data, with less to go on.
                    </span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-ink-soft">
                    →
                  </span>
                </SubmitButton>
              </form>
            </div>
          ) : (
          <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <ServiceCard
              title="Google Analytics"
              subtitle="Traffic & behaviour"
              href={CONNECT.analytics}
              color={ANALYTICS}
              icon={<AnalyticsIcon color={ANALYTICS} />}
              mark={<BarsMark color={ANALYTICS} />}
            />
            <ServiceCard
              title="Search Console"
              subtitle="Search rankings"
              href={CONNECT.searchConsole}
              color={SEARCH_CONSOLE}
              icon={<SearchIcon color={SEARCH_CONSOLE} />}
              mark={<LineMark color={SEARCH_CONSOLE} />}
              note="Google asks for Analytics access in the same step — it has no separate Search Console consent."
            />
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <ConnectLink
              href={CONNECT.both}
              pendingLabel="Opening Google…"
              className="flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-center text-sm font-medium text-surface transition active:scale-[0.99] motion-reduce:transform-none hover:bg-accent-ink"
            >
              Connect both
            </ConnectLink>
            <p className="mt-2 text-center text-xs text-ink-soft">
              One approval covers rankings and traffic.
            </p>
            {/* Back to the fork, so choosing the other path does not mean
                closing the dialog and finding the button again. */}
            <button
              type="button"
              onClick={() => setStage("choice")}
              suppressHydrationWarning
              className="mt-3 block w-full rounded-md px-4 py-2 text-center text-sm text-ink-soft transition hover:bg-surface-raised"
            >
              ← Back
            </button>
          </div>
          </>
          )}
        </div>
      </dialog>
    </>
  );
}
