import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import type { WriterState } from "@/lib/data/writer-repo";

export function WriterWorkspace({
  state,
  approveDraft,
}: {
  state: WriterState;
  approveDraft: (draftId: string) => Promise<void>;
}) {
  const draft = state.awaitingReview[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "In queue", value: state.queue.length, note: sourceSummary(state) },
          {
            label: "Awaiting your review",
            value: state.awaitingReview.length,
            note: state.awaitingReview.length > 0 ? "nothing publishes until you approve" : "all clear",
          },
          { label: "Published", value: state.published.length, note: "since 18 Aug" },
          {
            label: "Brand-voice match",
            value: `${state.brandVoiceMatch}%`,
            note: "scored against crawled pages",
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-surface p-4">
            <div className="font-mono text-2xl text-ink">{stat.value}</div>
            <div className="text-xs text-ink-soft">{stat.label}</div>
            <div className="mt-1 text-xs text-ink-soft">{stat.note}</div>
          </div>
        ))}
      </div>

      {draft ? (
        <div className="grid grid-cols-[1fr_20rem] gap-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Draft
              </span>
              <Badge variant="verdict-rescale">Needs your approval</Badge>
              <span className="ml-auto text-xs text-ink-soft">
                Nothing publishes until you approve it
              </span>
            </div>
            <h3 className="mb-3 text-lg font-bold text-ink">{draft.title}</h3>
            <div className="mb-4 grid grid-cols-4 gap-3 text-xs">
              <Field label="URL" value={draft.url} mono />
              <Field label="Words" value={String(draft.words)} mono />
              <Field label="Target keyword" value={draft.targetKeyword} />
              <Field label="Reading level" value={draft.readingLevel} mono />
            </div>
            <div className="mb-4">
              <div className="mb-1 text-xs uppercase tracking-wide text-ink-soft">
                Meta description
              </div>
              <p className="text-sm text-ink-soft">{draft.metaDescription}</p>
            </div>
            <p className="mb-5 text-sm text-ink">{draft.body}</p>
            <form
              action={async () => {
                "use server";
                await approveDraft(draft.id);
              }}
            >
              <SubmitButton
                pendingLabel="Publishing…"
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
              >
                Approve &amp; publish
              </SubmitButton>
            </form>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              The brief behind this draft
            </div>
            <Section title="Why this topic">{draft.brief.whyThisTopic}</Section>
            <Section title="Evidence used">
              <ul className="space-y-1">
                {draft.brief.evidenceUsed.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Section>
            <Section title="Competing answers">{draft.brief.competingAnswers}</Section>
            <Section title="Internal links planned">
              <span className="font-mono text-xs">
                {draft.brief.internalLinksPlanned.join(" · ")}
              </span>
            </Section>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface p-4 text-sm text-ink-soft">
          No drafts awaiting review — everything the agent has written is published.
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Published
        </div>
        {state.published.length === 0 ? (
          <div className="p-5 text-sm text-ink-soft">Nothing published yet.</div>
        ) : (
          state.published.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between border-b border-border px-4 py-3 text-sm last:border-b-0"
            >
              <div>
                <div className="font-medium text-ink">{p.title}</div>
                <div className="font-mono text-xs text-ink-soft">{p.url}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-ink-soft">{p.publishedDate}</div>
                <div className="text-xs text-ink-soft">{p.geoCitationStatus}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function sourceSummary(state: WriterState): string {
  const geo = state.queue.filter((t) => t.source === "GEO gap").length;
  const audit = state.queue.length - geo;
  return `${geo} from GEO gaps, ${audit} from the audit`;
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="mb-1 uppercase tracking-wide text-ink-soft">{label}</div>
      <div className={mono ? "font-mono text-ink" : "text-ink"}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1 text-xs uppercase tracking-wide text-ink-soft">{title}</div>
      <div className="text-sm text-ink-soft">{children}</div>
    </div>
  );
}
