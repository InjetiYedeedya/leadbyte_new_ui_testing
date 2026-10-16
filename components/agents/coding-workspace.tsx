import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import type { CodingState, PullRequest } from "@/lib/data/coding-repo";

const STATUS_VARIANT: Record<PullRequest["status"], BadgeVariant> = {
  "AWAITING REVIEW": "verdict-rescale",
  MERGED: "verdict-scale",
  "DRAFT PR": "verdict-keep",
};

const RISK_VARIANT: Record<PullRequest["risk"], BadgeVariant> = {
  LOW: "confidence-high",
  MEDIUM: "confidence-medium",
  HIGH: "confidence-low",
};

export function CodingWorkspace({
  state,
  approveAndShip,
}: {
  state: CodingState;
  approveAndShip: (prId: string) => Promise<void>;
}) {
  const [covered, ofTotal] = state.findingsCoveredOf;
  const [passing, ofChecks] = state.checksPassingOf;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {[
          {
            label: "Open PRs",
            value: String(state.openPrs),
            note: `${state.pullRequests.filter((p) => p.status === "AWAITING REVIEW").length} blocking other agents`,
          },
          { label: "Merged", value: String(state.merged), note: "by CI, no manual deploy" },
          {
            label: "Findings covered",
            value: `${covered} of ${ofTotal}`,
            note: "the rest need no code",
          },
          {
            label: "Checks passing",
            value: `${passing} of ${ofChecks}`,
            note: "build, lint, Lighthouse",
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-surface p-4">
            <div className="font-mono text-2xl text-ink">{stat.value}</div>
            <div className="text-xs text-ink-soft">{stat.label}</div>
            <div className="mt-1 text-xs text-ink-soft">{stat.note}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {state.pullRequests.map((pr) => (
          <div key={pr.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-ink-soft">#{pr.number}</span>
                <h3 className="font-medium text-ink">{pr.title}</h3>
              </div>
              <Badge variant={STATUS_VARIANT[pr.status]}>{pr.status}</Badge>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="confidence-low">{pr.source}</Badge>
              <Badge variant={RISK_VARIANT[pr.risk]}>Risk {pr.risk}</Badge>
              <span className="font-mono text-xs text-ink-soft">
                {pr.filesChanged} {pr.filesChanged === 1 ? "file" : "files"} ·{" "}
                <span className="text-good">+{pr.linesAdded}</span>{" "}
                <span className="text-crit">-{pr.linesRemoved}</span>
              </span>
            </div>

            <p className="mb-4 text-sm text-ink-soft">{pr.detail}</p>

            <div className="flex items-center gap-3">
              {pr.status !== "MERGED" && (
                <form
                  action={async () => {
                    "use server";
                    await approveAndShip(pr.id);
                  }}
                >
                  <SubmitButton
                    pendingLabel="Shipping…"
                    className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
                  >
                    Approve &amp; ship
                  </SubmitButton>
                </form>
              )}
              <span className="font-mono text-xs text-ink-soft">{pr.branch}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-ink-soft">
        Prototype: the repository, PR numbers and diffs are sample data. No GitHub account is
        connected.
      </p>
    </div>
  );
}
