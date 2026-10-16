/**
 * The panel a screen shows when it has no data yet.
 *
 * Exists because several pages previously rendered their heading and then
 * nothing at all when their repo returned null — which reads as a broken page
 * rather than an empty one. An empty state has to answer two questions: why is
 * this blank, and what happens next.
 */
export function EmptyState({
  title,
  description,
  note,
  action,
}: {
  title: string;
  description: string;
  /** Optional smaller line for context the user can't act on. */
  note?: string;
  /**
   * The way out, when there is one.
   *
   * Several empty states could name the next step but had nowhere to put a
   * control, so they said "no data yet" and stopped. `note` is for context
   * that cannot be acted on; this is for the case where it can.
   */
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-soft">{description}</p>
      {note && <p className="mx-auto mt-3 max-w-md text-xs text-ink-soft">{note}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
