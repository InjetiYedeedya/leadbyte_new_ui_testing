/**
 * A row of headline figures, each with a sentence saying what it is.
 *
 * `MetricLedger` is the compact form — a strip of label/value cells — and it
 * is still what the ad platforms use, where four figures sit under a platform
 * name that has already given them their context. This is the other form: one
 * figure per card, with an icon and a line of explanation, for the three
 * numbers that open Search visibility. "Average position 17.8" means nothing
 * without "lower is better", and a strip has no room to say it.
 *
 * A null value renders as an em dash. Search Console's average position is
 * null when there is nothing to average, and zero is the best rank there is —
 * printing it would read as perfect.
 */
export interface MetricCard {
  icon: "search" | "bars" | "list";
  label: string;
  description: string;
  value: string | null;
}

const TONES = {
  search: "bg-good-soft/60 text-good",
  bars: "bg-accent/8 text-accent",
  list: "bg-accent/8 text-accent",
};

function Icon({ name }: { name: MetricCard["icon"] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {name === "search" ? (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 5 5" />
        </>
      ) : name === "bars" ? (
        <path d="M5 20v-6M12 20V9M19 20V4" strokeWidth="3.5" />
      ) : (
        <>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </>
      )}
    </svg>
  );
}

export function MetricCards({ cards }: { cards: MetricCard[] }) {
  if (cards.length === 0) return null;

  return (
    <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          // `flex-col` with the figure pushed down: one card's description
          // wraps to two lines and the others' do not, and figures that do not
          // share a baseline read as three unrelated numbers.
          className="flex min-w-0 flex-col rounded-lg border border-border bg-surface p-4"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${TONES[card.icon]}`}
            >
              <Icon name={card.icon} />
            </span>
            <div className="min-w-0">
              <dt className="text-sm font-semibold text-ink">{card.label}</dt>
              <p className="mt-0.5 text-xs leading-5 text-ink-soft">{card.description}</p>
            </div>
          </div>
          <dd className="mt-auto pt-3 text-[1.75rem] font-semibold leading-9 tracking-tight tabular-nums text-ink">
            {card.value ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
