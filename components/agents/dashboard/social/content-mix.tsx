import { Panel } from "@/components/agents/dashboard/parts";
import type { MediaMixSlice } from "@/lib/data/dashboard/social-performance";
import { formatCount } from "@/lib/format";
import { formatShare } from "@/lib/data/dashboard/fields";

/**
 * Instagram's posts by media type, as one stacked bar (implementation guide
 * §5.3). Instagram only because it is the only platform whose rows carry a
 * type.
 *
 * A single bar rather than a donut: the question is "what share of what I
 * post is reels", and lengths along one line compare better than angles.
 * Slices take the palette's tokens in order; "Type not reported" is always
 * the muted one, so it never reads as a real category.
 */
const SLICE_FILLS = ["bg-accent", "bg-info", "bg-good", "bg-warn", "bg-crit"] as const;

export function ContentMix({ slices }: { slices: MediaMixSlice[] }) {
  let colour = 0;
  const painted = slices.map((slice) => ({
    ...slice,
    fill:
      slice.label === "Type not reported"
        ? "bg-ink-soft/40"
        : (SLICE_FILLS[colour++ % SLICE_FILLS.length] ?? "bg-accent"),
  }));
  const total = slices.reduce((sum, s) => sum + s.count, 0);

  return (
    <Panel title="Content mix" hint={`What your ${formatCount(total)} Instagram posts are, by media type.`}>
      <div
        role="img"
        aria-label={painted.map((s) => `${s.label} ${formatShare(s.share)}`).join(", ")}
        className="flex h-3 overflow-hidden rounded-full bg-border/60"
      >
        {painted.map((slice) => (
          <span key={slice.label} className={`h-full ${slice.fill}`} style={{ width: `${slice.share * 100}%` }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {painted.map((slice) => (
          <li key={slice.label} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${slice.fill}`} />
            <span className="text-ink">{slice.label}</span>
            <span className="tabular-nums text-ink-soft">
              {formatCount(slice.count)} · {formatShare(slice.share)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
