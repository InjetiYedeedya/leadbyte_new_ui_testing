export type BadgeVariant =
  | "confidence-high"
  | "confidence-medium"
  | "confidence-low"
  | "confidence-partial"
  | "verdict-scale"
  | "verdict-keep"
  | "verdict-pause"
  | "verdict-rescale"
  | "agent-ready"
  | "agent-needs-setup"
  | "agent-blocked"
  | "agent-recommended"
  | "connection-connected"
  | "connection-not-connected"
  | "connection-analysing"
  // Campaign lifecycle, from the ad platforms' own status fields. Paused is
  // deliberately neutral rather than a warning: pausing a campaign is a normal
  // decision someone made, not a fault. Removed is quieter still — it is over.
  | "campaign-active"
  | "campaign-paused"
  | "campaign-removed"
  // A provider we list but cannot connect yet. Its own variant rather than a
  // reused verdict word, because "coming soon" is a statement about us, not a
  // status of the customer's account.
  | "coming-soon"
  // The admin panel. One family per question an admin asks of a row, so each
  // word keeps one colour everywhere it appears.
  | "admin-super"
  | "admin-role"
  | "severity-critical"
  | "severity-high"
  | "severity-medium"
  | "severity-low"
  | "issue-open"
  | "issue-cleared"
  | "request-pending"
  | "request-completed"
  | "request-rejected"
  | "purchase-yes"
  | "purchase-no"
  | "provider-google"
  | "provider-email"
  | "activity-login"
  | "activity-logout"
  // A fix the AEO agent wrote. Held is amber, not red: waiting for a person
  // is the normal state for body copy, not a fault.
  | "fix-ready"
  | "fix-awaiting"
  // The delivery route the AEO service would use for this site.
  | "route-suggested"
  | "neutral";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  "confidence-high": "bg-good-soft text-good",
  "confidence-medium": "bg-warn-soft text-warn",
  "confidence-low": "bg-crit-soft text-crit",
  "confidence-partial": "bg-warn-soft text-warn",
  "verdict-scale": "bg-good-soft text-good",
  "verdict-keep": "bg-info-soft text-info",
  "verdict-pause": "bg-crit-soft text-crit",
  "verdict-rescale": "bg-warn-soft text-warn",
  "agent-ready": "bg-good-soft text-good",
  "agent-needs-setup": "bg-warn-soft text-warn",
  "agent-blocked": "bg-crit-soft text-crit",
  "agent-recommended": "bg-info-soft text-info",
  "connection-connected": "bg-good-soft text-good",
  "connection-not-connected": "bg-surface-raised text-ink-soft",
  "connection-analysing": "bg-info-soft text-info",
  "campaign-active": "bg-good-soft text-good",
  "campaign-paused": "bg-surface-raised text-ink-soft",
  "campaign-removed": "bg-surface-raised text-ink-soft",
  "coming-soon": "bg-warn-soft text-warn",
  "admin-super": "bg-accent-soft text-accent-ink",
  "admin-role": "bg-info-soft text-info",
  "severity-critical": "bg-crit-soft text-crit",
  "severity-high": "bg-crit-soft text-crit",
  "severity-medium": "bg-warn-soft text-warn",
  "severity-low": "bg-surface-raised text-ink-soft",
  // Open is a warning, not a crisis: the severity badge beside it says how bad.
  "issue-open": "bg-warn-soft text-warn",
  "issue-cleared": "bg-good-soft text-good",
  "request-pending": "bg-warn-soft text-warn",
  "request-completed": "bg-good-soft text-good",
  "request-rejected": "bg-surface-raised text-ink-soft",
  "purchase-yes": "bg-good-soft text-good",
  // Not having bought is not a fault, so it is quiet rather than red.
  "purchase-no": "bg-surface-raised text-ink-soft",
  "provider-google": "bg-info-soft text-info",
  "provider-email": "bg-surface-raised text-ink-soft",
  "activity-login": "bg-good-soft text-good",
  "activity-logout": "bg-surface-raised text-ink-soft",
  "fix-ready": "bg-good-soft text-good",
  "fix-awaiting": "bg-warn-soft text-warn",
  "route-suggested": "bg-info-soft text-info",
  neutral: "bg-surface-raised text-ink-soft",
};

export function Badge({
  variant,
  children,
}: {
  variant: BadgeVariant;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold uppercase ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}
