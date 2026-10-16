import { Spinner } from "@/components/ui/spinner";

/**
 * The dashboard card while its first read is on the way.
 *
 * The panel slides in the moment a dashboard is picked, and this is what it
 * carries until the figures land — the ONE loader for that wait. There used to
 * be two: a ring beside the row's arrow and the whole page swapping to
 * `PageLoading`, because opening a dashboard was a navigation (CLAUDE.md,
 * "Loading is ONE animation").
 *
 * Tall enough that the slide has something to show, and no figure of any kind:
 * there is no source for a percentage.
 */
export function PanelLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-surface px-4 py-10 text-center"
    >
      <span className="text-accent">
        <Spinner size="lg" />
      </span>
      <p className="text-sm font-medium text-ink">Loading dashboard…</p>
      <p className="text-xs text-ink-soft">Reading this agent&rsquo;s latest figures.</p>
    </div>
  );
}
