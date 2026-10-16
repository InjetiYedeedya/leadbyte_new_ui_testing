"use client";

/**
 * The campaign plan, as something to change rather than something to read.
 *
 * ## Why this earns `"use client"`
 *
 * Three things a `<form action={serverAction}>` cannot express on its own: a
 * live character count against a limit the service enforces by TRIMMING, a
 * topic list you add to and remove from, and a bid box shown only when the
 * campaign needs one. All three are about seeing the consequence before
 * submitting.
 *
 * The counters matter more than they look. The service does not reject a
 * headline over 50 characters — it cuts it and reports the cut as a note, so
 * without a counter the advert that runs is one the customer never saw.
 *
 * ## What it does not own
 *
 * Nothing is fetched here. Every call goes through an injected Server Action,
 * and the advice, copy and bidding all arrive as props.
 */

import { useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Spinner } from "@/components/ui/spinner";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_TARGET_MIN,
  TITLE_MAX,
  TOPICS_MAX,
} from "@/lib/data/ads-copy";
import type { AdsCopy } from "@/lib/data/ads-campaign-request";
import type { AdsAdType, AdsBidding } from "@/lib/data/ads-types";

interface Props {
  copy: AdsCopy;
  adType: AdsAdType;
  bidAmount: number;
  /** True when this campaign has no automatic bidding and must name a price. */
  needsBid: boolean;
  bidding?: AdsBidding;
  /** `generate`'s advisory notes. Shown, never blocking. */
  notes: string[];
  save: (formData: FormData) => Promise<void>;
  redraft: () => Promise<void>;
}

export function AdsPlanEditor({
  copy,
  adType,
  bidAmount,
  needsBid,
  bidding,
  notes,
  save,
  redraft,
}: Props) {
  const [title, setTitle] = useState(copy.title);
  const [description, setDescription] = useState(copy.description);
  const [topics, setTopics] = useState<string[]>(copy.topics);
  const [newTopic, setNewTopic] = useState("");

  function addTopic(value: string) {
    const topic = value.trim();
    // Silently ignoring a duplicate is the right answer: the same topic twice is
    // not twice the targeting, and an error for it would be pedantry.
    if (topic === "" || topics.includes(topic) || topics.length >= TOPICS_MAX) return;
    setTopics([...topics, topic]);
    setNewTopic("");
  }

  // Pressing Add with nothing new to add used to do nothing at all; a
  // disabled button says so before the press instead.
  const candidate = newTopic.trim();
  const canAdd = candidate !== "" && !topics.includes(candidate);

  const titleOver = title.trim().length > TITLE_MAX;
  const descriptionOver = description.trim().length > DESCRIPTION_MAX;
  const descriptionShort =
    description.trim().length > 0 && description.trim().length < DESCRIPTION_TARGET_MIN;

  return (
    <>
      {/* One form for the advert AND the bid: arguing with the advice must not
          cost someone the headline they have just rewritten, so both actions
          submit the same fields. */}
      <form action={save} id="plan-form" className="mt-6">
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">
              The advert
            </h2>
            <span className="text-xs text-ink-soft">A first draft — edit it</span>
          </div>

          <label htmlFor="headline" className="mt-3 block text-sm font-medium text-ink">
            Headline
          </label>
          <input
            id="headline"
            name="headline"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            suppressHydrationWarning
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
          />
          <Counter length={title.trim().length} max={TITLE_MAX} over={titleOver} />

          <label htmlFor="description" className="mt-4 block text-sm font-medium text-ink">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            suppressHydrationWarning
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
          />
          <Counter
            length={description.trim().length}
            max={DESCRIPTION_MAX}
            over={descriptionOver}
            hint={descriptionShort ? `shorter than the ${DESCRIPTION_TARGET_MIN} the service prefers` : undefined}
          />

          {notes.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-ink-soft">
              {/* Advisory. The service says these and still runs the advert, so
                  they inform and never block. */}
              {notes.map((note) => (
                <li key={note}>· {note}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-4 rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">
            Topics it will appear against
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            The only targeting this platform offers — these decide who sees the advert.
          </p>

          <ul className="mt-3 flex flex-wrap gap-2">
            {topics.map((topic) => (
              <li key={topic}>
                <input type="hidden" name="topics" value={topic} />
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-raised px-3 py-1 text-xs text-ink">
                  {topic}
                  <button
                    type="button"
                    onClick={() => setTopics(topics.filter((t) => t !== topic))}
                    aria-label={`Remove ${topic}`}
                    suppressHydrationWarning
                    className="text-ink-soft transition-colors hover:text-crit"
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>

          {topics.length === 0 && (
            <p role="alert" className="mt-2 text-sm text-crit">
              Add at least one topic, or the advert has nothing to appear against.
            </p>
          )}

          {topics.length < TOPICS_MAX && (
            <div className="mt-3 flex gap-2">
              <input
                value={newTopic}
                onChange={(event) => setNewTopic(event.target.value)}
                onKeyDown={(event) => {
                  // Enter adds the topic instead of submitting the whole form —
                  // which would otherwise save a campaign because someone
                  // finished typing a word.
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTopic(newTopic);
                  }
                }}
                placeholder="Add a topic"
                suppressHydrationWarning
                className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
              />
              <button
                type="button"
                onClick={() => addTopic(newTopic)}
                disabled={!canAdd}
                title={candidate !== "" && !canAdd ? "Already added" : undefined}
                suppressHydrationWarning
                className="rounded-md border border-border px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              >
                Add
              </button>
            </div>
          )}
        </section>

        {/* Shown only when this campaign genuinely has to name a price.
            `needs_bid_amount: false` means bidding is automatic and an amount is
            NOT wanted — a number typed into a box we should not have shown
            becomes a cap nobody meant to set. */}
        {needsBid && (
          <section className="mt-4 rounded-lg border border-border bg-surface p-4">
            <label htmlFor="bidAmount" className="block text-sm font-medium text-ink">
              Bid amount
            </label>
            <p className="mt-1 text-sm text-ink-soft">
              {bidding?.charged_for
                ? `The most you will pay for ${bidding.charged_for}.`
                : "The most you will pay per result."}{" "}
              This campaign has no automatic bidding, so it cannot run without one.
            </p>
            <input
              id="bidAmount"
              name="bidAmount"
              type="number"
              min={0}
              step="0.01"
              defaultValue={bidAmount > 0 ? bidAmount : ""}
              required
              suppressHydrationWarning
              className="mt-2 w-40 rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
            />
            {bidding?.watch_out_for && (
              <p className="mt-2 text-xs text-ink-soft">{bidding.watch_out_for}</p>
            )}
          </section>
        )}

        <section className="mt-4 rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">
            Who makes the picture
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <ModeCard
              value="semi"
              checked={adType === "semi"}
              title="I'll supply the image"
              blurb="Upload your own picture and the copy is written to match it."
            />
            <ModeCard
              value="full"
              checked={adType === "full"}
              title="Generate one for me"
              blurb="The service renders the image. It takes a few minutes."
            />
          </div>
        </section>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <SubmitButton
            pendingLabel="Saving…"
            disabled={titleOver || descriptionOver || topics.length === 0}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
          >
            Continue
          </SubmitButton>
          <RedraftButton redraft={redraft} />
        </div>
      </form>

    </>
  );
}

function Counter({
  length,
  max,
  over,
  hint,
}: {
  length: number;
  max: number;
  over: boolean;
  hint?: string;
}) {
  return (
    <p className={`mt-1 text-xs ${over ? "text-crit" : "text-ink-soft"}`}>
      {length} / {max}
      {over && " — the service would cut this, and you would never see the version that ran"}
      {!over && hint && ` — ${hint}`}
    </p>
  );
}

function ModeCard({
  value,
  checked,
  title,
  blurb,
}: {
  value: AdsAdType;
  checked: boolean;
  title: string;
  blurb: string;
}) {
  return (
    <label className="cursor-pointer rounded-lg border border-border p-3 transition-colors hover:bg-surface-raised has-[:checked]:border-accent has-[:checked]:bg-accent/5">
      <input
        type="radio"
        name="adType"
        value={value}
        defaultChecked={checked}
        suppressHydrationWarning
        className="h-4 w-4 accent-accent"
      />
      <span className="mt-1.5 block text-sm font-medium text-ink">{title}</span>
      <span className="mt-0.5 block text-sm text-ink-soft">{blurb}</span>
    </label>
  );
}

/**
 * Its own form, outside the editor's, because it takes no fields — and because
 * a submit button inside another form would save the advert as well as
 * replacing it.
 */
function RedraftButton({ redraft }: { redraft: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void redraft().finally(() => setBusy(false));
      }}
      aria-busy={busy}
      suppressHydrationWarning
      className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-raised hover:text-ink disabled:opacity-60"
    >
      {busy && <Spinner />}
      {busy ? "Writing…" : "Write it again"}
    </button>
  );
}
