import { readSignedText } from "@/lib/signed-text";
import { FlashNotice } from "@/components/ui/flash-notice";
import Link from "@/components/ui/app-link";

/**
 * Small server-rendered pieces every admin screen shares.
 *
 * Kept together because they are one visual system — the panel, the filter
 * pills, the result banner — and splitting five twenty-line components into
 * five files would scatter it.
 */

/** A titled card. The panel's one container, at the app's card padding. */
export function AdminPanel({
  title,
  hint,
  actions,
  children,
}: {
  title?: React.ReactNode;
  hint?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="text-base font-bold text-ink">{title}</h2>}
            {hint && <p className="mt-0.5 text-sm text-ink-soft">{hint}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * What the last action did, from `?notice=` or `?error=`.
 *
 * The house pattern for Server Action feedback: the action redirects with the
 * sentence in the URL, and the page says it once: `FlashNotice` wipes the
 * value from the address and fades the banner, so a refresh does not replay
 * an old result as though it had just happened.
 */
export function ActionResult({ notice: rawNotice, error: rawError }: { notice?: string; error?: string }) {
  // Only sentences our own actions signed; a crafted link shows nothing.
  const notice = readSignedText(rawNotice);
  const error = readSignedText(rawError);
  if (error) {
    return (
      <FlashNotice role="alert" clear={["notice", "error"]} className="rounded-lg border border-crit/30 bg-crit-soft px-4 py-3 text-sm text-crit">
        {error}
      </FlashNotice>
    );
  }
  if (notice) {
    return (
      <FlashNotice clear={["notice", "error"]} className="rounded-lg border border-good/30 bg-good-soft px-4 py-3 text-sm text-good">
        {notice}
      </FlashNotice>
    );
  }
  return null;
}

/**
 * A row of filters as links, so the choice lives in the URL.
 *
 * Links rather than buttons: a filtered view is a place, and a place can be
 * reloaded, bookmarked and sent to a colleague. `aria-current` marks the one
 * in force.
 */
export function FilterPills({
  label,
  options,
  active,
  hrefFor,
}: {
  label: string;
  options: readonly { id: string; label: string; count?: number }[];
  active: string;
  hrefFor: (id: string) => string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const current = option.id === active;
        return (
          <Link
            key={option.id}
            href={hrefFor(option.id)}
            aria-current={current ? "true" : undefined}
            scroll={false}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              current
                ? "border-accent bg-accent-soft font-semibold text-accent-ink"
                : "border-border bg-surface text-ink-soft hover:bg-surface-raised hover:text-ink"
            }`}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="tabular-nums text-xs opacity-80">{option.count}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

/** A figure tile, the legacy panel's StatTile: label, value, one line of context. */
export function AdminStat({
  label,
  value,
  note,
  tone = "neutral",
  text = false,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
  tone?: "neutral" | "good" | "warn" | "crit";
  /** For a value that is a name, not a number: it wraps and drops tabular figures. */
  text?: boolean;
}) {
  const dot = {
    neutral: "bg-border",
    good: "bg-good",
    warn: "bg-warn",
    crit: "bg-crit",
  }[tone];
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
      <span className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
        <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
        {label}
      </span>
      <span
        className={
          text
            ? "text-lg font-semibold leading-snug text-ink [overflow-wrap:anywhere]"
            : "text-2xl font-semibold tabular-nums tracking-tight text-ink"
        }
      >
        {value}
      </span>
      {note && <span className="text-xs text-ink-soft">{note}</span>}
    </div>
  );
}

/** A read that failed, said plainly — never an empty state standing in for it. */
export function ReadFailed({ what }: { what: string }) {
  return (
    <p role="alert" className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
      We couldn&apos;t load {what} from the backend. Anything shown below may be incomplete — try
      again in a moment.
    </p>
  );
}

/** First value of a search param. */
export function param(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/** A URL for this screen with some params changed; empty values are dropped. */
export function withParams(
  path: string,
  current: Record<string, string | undefined>,
  changes: Record<string, string | undefined>,
): string {
  const merged = { ...current, ...changes };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== "" && value !== "all") query.set(key, value);
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
