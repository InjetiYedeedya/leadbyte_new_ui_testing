import type { BusinessDetailsCheck } from "@/lib/data/business-details-check";
import { PendingLink } from "@/components/ui/pending-link";
import { RefreshButton } from "@/components/ui/refresh-button";

/**
 * Shown in place of an ad agent's setup form when the business profile is not
 * complete enough to build a campaign about (`business-details-check.ts`).
 *
 * A card in the page rather than the legacy modal over a blurred form: the
 * form behind it could not be used anyway, and this page already says the
 * Connect and Purchase steps the same way, in place.
 *
 * "Try again" is a `RefreshButton`, not a `Link` to this same page: the client
 * router answers a same-URL link from its 30s cache, so the read that failed
 * was not asked again and the button looked dead.
 */
export function BusinessDetailsBlock({
  check,
}: {
  check: Exclude<BusinessDetailsCheck, { kind: "ok" }>;
}) {
  if (check.kind === "unreadable") {
    return (
      <div role="alert" className="max-w-2xl rounded-lg border border-crit/30 bg-crit-soft p-4">
        <p className="text-sm font-semibold text-crit">We couldn&apos;t load your business details</p>
        <p className="mt-1 text-sm text-ink">
          Nothing is wrong with your profile — we just couldn&apos;t read it right now.
        </p>
        <RefreshButton
          pendingLabel="Trying again…"
          className="mt-3 inline-flex min-h-10 rounded-md bg-accent px-4 text-sm font-medium text-surface hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
        >
          Try again
        </RefreshButton>
      </div>
    );
  }

  return (
    <div className="max-w-2xl rounded-lg border border-warn/30 bg-warn-soft p-4">
      <p className="text-sm font-semibold text-warn">Complete your business details</p>
      <p className="mt-1 text-sm text-ink">
        The agent builds your campaign around your business, so it needs these first:
      </p>
      <ul className="mt-2 list-disc pl-5 text-sm text-ink">
        {check.missing.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <PendingLink
          href="/overview/business-profile"
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
        >
          Go to business details
        </PendingLink>
        <PendingLink
          href="/agents"
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium text-ink transition hover:bg-surface-raised active:scale-[0.98] motion-reduce:transform-none"
        >
          Back to agents
        </PendingLink>
      </div>
    </div>
  );
}
