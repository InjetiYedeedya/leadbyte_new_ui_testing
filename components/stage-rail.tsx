import Link from "@/components/ui/app-link";
import type { StageFlag, StageFlagsResult } from "@/lib/onboarding/stage-flags";

/**
 * The four onboarding stages, as navigation.
 *
 * Each stage links to the screen that completes it, so the rail answers "what
 * have I connected, and what haven't I?" and then lets you go and do something
 * about it. As plain text it could only pose the question — and `Connections`
 * was, for a while, the ONLY way to see that stage at all while its page had no
 * link anywhere in the app.
 *
 * `aria-current` marks the stage you are on, and each link carries its state in
 * words, because the tick and the number are colour and shape only.
 */
function stageState(stage: StageFlag, currentStageId: string): string {
  if (stage.complete) return "done";
  return stage.id === currentStageId ? "in progress" : "not started";
}

export function StageRail({
  flags,
  currentStageId,
}: {
  flags: StageFlagsResult;
  currentStageId: string;
}) {
  if (flags.allComplete) {
    return null;
  }

  return (
    <nav
      aria-label="Setup progress"
      className="flex items-center gap-3 border-b border-border bg-surface px-6 py-3 text-sm"
    >
      {flags.stages.map((stage, i) => {
        const current = stage.id === currentStageId;

        return (
          <div key={stage.id} className="flex items-center gap-3">
            <Link
              href={stage.href}
              aria-current={current ? "step" : undefined}
              className="flex items-center gap-3 rounded-md px-1.5 py-1 -mx-1.5 transition-colors hover:bg-surface-raised"
            >
              <span
                aria-hidden="true"
                className={
                  stage.complete
                    ? "flex h-5 w-5 items-center justify-center rounded-full bg-good text-[11px] text-surface"
                    : current
                      ? "flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] text-surface"
                      : "flex h-5 w-5 items-center justify-center rounded-full border border-border font-mono text-[10px] text-ink-soft"
                }
              >
                {stage.complete ? "✓" : String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={
                  stage.complete || current ? "font-medium text-ink" : "text-ink-soft"
                }
              >
                {stage.label}
              </span>
              {/* The tick and the number carry the state visually; this carries
                  it for anyone not reading colour and shape. */}
              <span className="sr-only">({stageState(stage, currentStageId)})</span>
            </Link>
            {i < flags.stages.length - 1 && (
              <span aria-hidden="true" className="text-border">
                —
              </span>
            )}
          </div>
        );
      })}
      <span className="ml-auto font-mono text-xs text-ink-soft">
        {flags.completeCount} of {flags.total} stages complete
      </span>
    </nav>
  );
}
