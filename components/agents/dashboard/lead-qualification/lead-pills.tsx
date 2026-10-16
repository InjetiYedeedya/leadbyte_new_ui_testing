import {
  SCORE_GROUP_LABEL,
  statusLabel,
  statusTone,
  type ScoreGroup,
} from "@/lib/data/dashboard/lead-pipeline";

/**
 * The two pills on a lead: its status and its score.
 *
 * Local rather than `Badge` variants, and that is a known gap: `Badge` is a
 * fixed union, and `lead_status` values are not known in advance, so its
 * colour comes from hashing the text (`statusTone`). Same shape as `Badge`
 * (`rounded`, `px-2 py-0.5`, `text-xs font-semibold`) so the two sit together,
 * but in sentence case. No state — renders on either side of the boundary.
 */

const PILL = "inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold";

export function StatusPill({ status }: { status: string }) {
  if (status === "") return <span className="text-ink-soft">—</span>;
  return <span className={`${PILL} ${statusTone(status)}`}>{statusLabel(status)}</span>;
}

/**
 * Hot is an outcome colour, Warm a caution. Cold is grey, NOT red: a cold lead
 * is early in the funnel, not a fault, and red would read as the agent having
 * failed it.
 */
export const SCORE_TONE: Record<ScoreGroup, string> = {
  hot: "bg-good-soft text-good",
  warm: "bg-warn-soft text-warn",
  cold: "bg-surface-raised text-ink-soft",
  unscored: "bg-transparent text-ink-soft",
};

/** The segment and dot colours for the same four groups. */
export const SCORE_FILL: Record<ScoreGroup, string> = {
  hot: "bg-good",
  warm: "bg-warn",
  cold: "bg-ink-soft/60",
  unscored: "bg-border",
};

/** The number is shown; the group is in the tooltip and the accessible name, never colour alone. */
export function ScorePill({ score, group }: { score: number | null; group: ScoreGroup }) {
  // `aria-label` on a plain span is not reliably read out, so the words ride
  // along as screen-reader text and the visible number is hidden from it.
  if (score === null) {
    return (
      <span className="text-ink-soft" title="Not scored yet">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Not scored yet</span>
      </span>
    );
  }
  const words = `${SCORE_GROUP_LABEL[group]} lead, score ${Math.round(score)}`;
  return (
    <span className={`${PILL} tabular-nums ${SCORE_TONE[group]}`} title={words}>
      <span aria-hidden="true">{Math.round(score)}</span>
      <span className="sr-only">{words}</span>
    </span>
  );
}
