/**
 * The imported date range, as a chip beside a page title.
 *
 * Informational, not a picker: the range is whatever the backend has imported,
 * and there is no endpoint that would narrow it. A control that looks like a
 * date picker and changes nothing is worse than a label.
 */
export function DateWindow({ window }: { window: string | null }) {
  if (!window) return null;

  return (
    <p className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-xs tabular-nums text-ink-soft">
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        className="h-4 w-4"
      >
        <rect x="3" y="4" width="14" height="13" rx="2" />
        <path d="M6 2v4M14 2v4M3 8h14" />
      </svg>
      {window}
    </p>
  );
}
