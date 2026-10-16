/**
 * The surface every panel in the app sits on.
 *
 * Server component — no interactivity. Composed rather than configured, so a
 * panel that needs an unusual body can use `Card` + its own children without
 * fighting a prop API.
 */

export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag className={`rounded-lg border border-border bg-surface ${className}`}>{children}</Tag>
  );
}

/** Title row with an optional action on the right (a link, a filter, a count). */
export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}

/**
 * Section label used above a group of cards.
 */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold text-ink-soft">{children}</h2>;
}
