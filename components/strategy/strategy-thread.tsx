"use client";

import { useOptimistic } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { AgentProse, sectionHeadings } from "@/components/strategy/agent-prose";
import type { StrategyConversation } from "@/lib/data/strategy-conversation";
import type { StrategyTurn } from "@/lib/data/marketing-strategy";

/**
 * The strategy conversation, as a thread.
 *
 * A thread rather than a single answer because the agent is multi-turn: it asks
 * follow-up questions and expects replies on the same session. Rendering only
 * the latest reply would show a question with nowhere to answer it.
 *
 * ## Why this is a client island (2026-09-08)
 *
 * It was a Server Component, and a `<form action={serverAction}>` said
 * everything it needed to. What changed is the measured cost of a turn: the
 * agent takes 31-47 SECONDS to answer (timed against the live backend), and
 * for all of it the customer's message sat in the textarea under a spinner. It
 * read as a message that had not sent, on a screen where the previous reply
 * was already minutes old. People re-sent, which is a second paid agent run on
 * the same session — the thing `strategy-inflight.ts` exists to stop.
 *
 * `useOptimistic` puts the message in the thread the instant it is submitted.
 * That is not decoration: it is the only honest way to say "this is sent, the
 * agent is thinking", and it needs client state, so the whole thread is an
 * island now. `AgentProse` renders here too — it is pure and imports nothing
 * server-only.
 *
 * ## Newest first
 *
 * The thread reads top-down newest-to-oldest. Chronological is the instinct
 * and it is wrong here: one agent turn is a full screen of headed brief, so
 * the reply you are waiting for landed a screen and a half BELOW the last
 * thing you read. Newest-first puts every new answer where the eye already is.
 *
 * ## The layout, and why it changed (2026-09-08)
 *
 * It was a 768px column pinned to the left edge of a 1900px window, with the
 * agent's Markdown rendered as raw text — `## Section 1` and `**Business:**`
 * on screen, punctuation and all. Most of what read as "badly designed" was
 * that: a page whose whole job is presenting a strategy was presenting its
 * source.
 *
 * Three decisions carry the new one:
 *
 * - **The column is centred and measured.** Prose sits at roughly 70
 *   characters, which is the readable measure, and the column centres in
 *   whatever width is left. Left-pinning a narrow column in a wide window
 *   makes the empty half look like a mistake.
 * - **The two sides are shaped differently.** The customer writes a sentence;
 *   the agent writes a headed brief. Same bubble for both was the error — see
 *   `AgentProse`. The customer keeps a compact right-aligned card; the agent
 *   gets the document.
 * - **The composer is pinned to the bottom of the column.** The agent's turns
 *   run to a full screen and its question is always the LAST thing it writes,
 *   so the reply box was permanently below the fold. It now stays in view, and
 *   the thread scrolls behind it.
 */
export function StrategyThread({
  conversation,
  onBegin,
  onSend,
  onRestart,
}: {
  conversation: StrategyConversation;
  onBegin: () => Promise<void>;
  onSend: (formData: FormData) => Promise<void>;
  onRestart: () => Promise<void>;
}) {
  const { turns, error } = conversation;
  const started = turns.length > 0;

  // Nothing sent yet. The opening message is not fired on render — a page load
  // must not have side effects, and a refresh would start a second
  // conversation — so the customer presses once and the agent takes over.
  if (!started) {
    return (
      <form action={onBegin}>
        {/* The agent's first turn takes as long as it takes to think — the
            budget is 120s. Without a pending state this button looked dead for
            two minutes, and people pressed it again. */}
        <SubmitButton
          pendingLabel="Asking the agent…"
          className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-surface transition active:scale-[0.99] motion-reduce:transform-none hover:bg-accent-ink"
        >
          Start the strategy
        </SubmitButton>
      </form>
    );
  }

  // The message goes into the thread the moment it is submitted, and stays
  // there until the server's own copy replaces it. React discards this by
  // itself when the action settles, so a failed turn does not leave a message
  // on screen that was never delivered — the error panel below reports that.
  const [shown, showSent] = useOptimistic(turns, (current, text: string) => [
    ...current,
    { role: "user" as const, text, at: new Date().toISOString() },
  ]);

  // Pending is derived, not a second piece of state: an optimistic turn is
  // present exactly while the action is in flight. One source, so the spinner
  // and the message can never disagree.
  const sending = shown.length > turns.length;

  async function send(formData: FormData) {
    const text = String(formData.get("message") ?? "").trim();
    if (text === "") return;
    showSent(text);
    await onSend(formData);
  }

  // The rail indexes the LATEST agent turn. Earlier turns are superseded
  // drafts of the same plan, and listing every section the agent has ever
  // written would be a list of things that are no longer true.
  const latestAgentTurn = [...turns].reverse().find((t: StrategyTurn) => t.role === "agent");
  const sections = latestAgentTurn ? sectionHeadings(latestAgentTurn.text) : [];

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-x-12 xl:grid-cols-[minmax(0,1fr)_13rem]">
      <div className="min-w-0">
        <div className="space-y-4 pb-4">
        {/* Chronological: the first message sits at the top and the thread
            reads downward, newest last — the standard chat order. The "Hi"
            opener therefore shows first, not buried at the bottom. */}
        {shown.map((turn, i) =>
          turn.role === "user" ? (
            <div key={`${turn.at}-${i}`} className="flex justify-end">
              <div className="max-w-[28rem] rounded-lg rounded-br-md bg-accent px-4 py-2.5 text-[0.9375rem] leading-6 text-surface">
                <p className="whitespace-pre-wrap">{turn.text}</p>
              </div>
            </div>
          ) : (
            <article key={`${turn.at}-${i}`} className="border-l-2 border-accent/25 pl-5">
              <AgentProse text={turn.text} />
            </article>
          ),
        )}

        {/* At the BOTTOM now, with the newest turns and beside the input, so
            the agent's answer lands where the reader is looking and nothing
            above it shifts when it arrives. */}
        {sending && (
          <div
            aria-live="polite"
            className="flex items-center gap-3 border-l-2 border-accent/25 pl-5 text-sm text-ink-soft"
          >
            <span className="flex gap-1" aria-hidden="true">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent motion-reduce:animate-none [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent motion-reduce:animate-none [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent motion-reduce:animate-none" />
            </span>
            The strategy agent is writing. This usually takes under a minute.
          </div>
        )}

        {/* A failure sits at the bottom by the input; the message itself is
            kept in the box so it can be sent again without retyping. */}
        {error && (
          <div role="alert" className="rounded-lg border border-crit/30 bg-crit-soft p-4">
            <p className="text-sm font-medium text-crit">That message didn&apos;t go through</p>
            <p className="mt-0.5 text-sm text-ink">{error}</p>
          </div>
        )}

      </div>

      {/* Pinned so the agent's question and the box for answering it are on
          screen together. `bottom-0` against the page scroll rather than a
          nested scroller: a second scroll region inside a page that already
          scrolls is the thing that makes long threads impossible to navigate. */}
      {/* Near-solid rather than blurred: it sits over the moving background
          video, and a backdrop blur there is recomputed at the video's frame
          rate for as long as the bar is on screen. */}
      <div className="sticky bottom-0 -mx-1 bg-ground/95 px-1 pb-4 pt-3">
        <form action={send}>
          <label className="block">
            <span className="sr-only">
              {error ? "Send it again, or say something else" : "Reply to the agent"}
            </span>
            <div className="flex items-end gap-2 rounded-lg border border-border bg-surface p-2 shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent">
              <textarea
                name="message"
                rows={2}
                required
                placeholder={
                  error ? "Send it again, or say something else…" : "Answer the agent, or ask for a change…"
                }
                suppressHydrationWarning
                className="min-h-11 flex-1 resize-y bg-transparent px-2 py-1.5 text-[0.9375rem] leading-6 text-ink outline-none placeholder:text-ink-soft"
              />
              <SubmitButton
                pendingLabel="Sending…"
                className="shrink-0 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-surface transition active:scale-[0.99] motion-reduce:transform-none hover:bg-accent-ink"
              >
                Send
              </SubmitButton>
            </div>
          </label>
        </form>

        {/* A new session id, so the agent forgets too — reusing it would leave
            it answering from a conversation the customer can no longer see.
            Quiet and beneath the composer: it throws the thread away, and it
            should never be the thing the eye lands on first. */}
        <form action={onRestart} className="mt-2 flex justify-end">
          <SubmitButton
            pendingLabel="Starting over…"
            className="text-xs text-ink-soft underline underline-offset-2 hover:text-ink"
          >
            Start over
          </SubmitButton>
        </form>
        </div>
      </div>

      {/* The agent writes a headed brief that runs well past one screen, and
          the question it wants answered is always at the bottom of it. This is
          the way back up.

          It appears only from `xl` — below that the space does not exist and a
          contents list stacked above the document would just push the document
          down. It is also skipped entirely when the agent has written no
          sections, because an index of nothing is furniture. */}
      {sections.length > 1 && (
        <aside className="hidden xl:block">
          <nav aria-label="Sections of this plan" className="sticky top-28">
            <p className="mb-3 text-xs font-medium text-ink-soft">In this plan</p>
            <ul className="space-y-1 border-l border-border">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="-ml-px block border-l border-transparent py-1 pl-3 text-xs leading-5 text-ink-soft transition-colors hover:border-accent hover:text-ink"
                  >
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      )}
    </div>
  );
}
