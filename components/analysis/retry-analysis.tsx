import { retryAnalysis } from "@/app/(app)/overview/website-audit/actions";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Retry control for a failed analysis.
 *
 * Still a Server Component: the form and the action are all this needs. The
 * BUTTON is the one island, because a retry queues a crawl and the press had
 * no acknowledgement of any kind — `SubmitButton` disables it and says
 * "Starting…" while the action runs. Shown by `AnalysisFailedState` on all
 * three Intelligence screens.
 */
export function RetryAnalysis({ label = "Try again" }: { label?: string }) {
  return (
    <form action={retryAnalysis}>
      <SubmitButton
        pendingLabel="Starting…"
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
      >
        {label}
      </SubmitButton>
    </form>
  );
}
