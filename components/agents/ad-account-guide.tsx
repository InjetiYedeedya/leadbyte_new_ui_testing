/**
 * How to create a Google Ads or Meta ad account, for someone who has none.
 *
 * Reached from a small "Don't have an account yet?" link under the agent's
 * Connect card (`?account=no`). It used to sit behind a "Do you have an
 * account?" question shown to everyone before Connect; that question went on
 * 2026-09-30 — someone who has just paid for an ads agent almost always has
 * the account, so Connect comes first and the guide is the exception.
 *
 * A Server Component: every control here is a link.
 */

import Link from "@/components/ui/app-link";
import { ConnectLink } from "@/components/ui/connect-link";
import type { AdAccountGuide } from "@/lib/data/ad-account-guides";

const PRIMARY =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none";

export function AdAccountGuideView({
  guide,
  pathname,
  connectHref,
}: {
  guide: AdAccountGuide;
  pathname: string;
  /** The same consent start the connect card uses (`runGate.fixHref`). */
  connectHref: string;
}) {
  const connect = (
    <ConnectLink href={connectHref} pendingLabel="Opening…" className={PRIMARY}>
      I&apos;ve created my account — Connect it
    </ConnectLink>
  );

  return (
    <section aria-labelledby="ad-account-guide" className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={pathname} className="text-sm text-ink-soft transition-colors hover:text-ink">
          ← Back
        </Link>
        {connect}
      </div>

      <header>
        <h2 id="ad-account-guide" className="text-lg font-bold text-ink">
          {guide.title}
        </h2>
        <p className="mt-1 max-w-prose text-sm text-ink-soft">{guide.intro}</p>
      </header>

      {guide.parts.map((part, index) => (
        <div key={part.heading ?? index} className="flex flex-col gap-2">
          {part.heading && <h3 className="text-sm font-semibold text-ink">{part.heading}</h3>}
          <ol className="divide-y divide-border rounded-lg border border-border bg-surface">
            {part.steps.map((step) => (
              <li key={step.n} className="flex gap-3 p-4">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold tabular-nums text-accent-ink"
                >
                  {step.n}
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold text-ink">
                    <span className="sr-only">Step {step.n}: </span>
                    {step.title}
                  </h4>
                  <p className="mt-1 text-sm text-ink-soft">{step.body}</p>
                  {step.bullets && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                      {step.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  )}
                  {step.note && (
                    <p className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-sm text-ink">
                      <span className="font-semibold text-warn">Note: </span>
                      {step.note}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}

      {guide.notes && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold text-ink">Before you finish</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            {guide.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink">Done? Connect your {guide.platform} account to continue.</p>
        {connect}
      </div>
    </section>
  );
}
