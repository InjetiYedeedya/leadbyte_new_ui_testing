"use client";

/**
 * "Let the models write your creative prompt" — three candidates, one pick.
 *
 * ## Why it earns `"use client"`
 *
 * It polls a background job on a timer and then holds a selection that is only
 * spent when the surrounding form is submitted. A `<form action>` cannot poll,
 * and submitting to record the pick would lose the creative files already
 * chosen in the form around it.
 *
 * ## Why it is optional and says so
 *
 * Skipping it launches the campaign exactly the way every campaign launched
 * before the pipeline was wired — the four prompt fields are simply absent from
 * the body. So a failure here is never a blocker, and the copy never implies
 * the customer must wait for it.
 *
 * The pick is recorded with the pipeline the moment it is made, not at submit:
 * `select-prompt` is what makes the pipeline's record match the prompt that
 * ends up on the launch body.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { PromptChoice } from "@/lib/data/creative-prompts";
import { Spinner } from "@/components/ui/spinner";
import { whenVisible } from "@/lib/poll-pacing";

/** The legacy spec's cadence: three models take about a minute, so 5s loses nothing. */
const POLL_MS = 5000;

/**
 * When to stop waiting (legacy spec: three minutes). Past it the screen says
 * so and offers a retry, rather than "Preparing your prompts" forever — the
 * launch never needed a prompt, and the page's "Launch without choosing a
 * prompt" link stays the way forward either way.
 */
const GIVE_UP_MS = 3 * 60 * 1000;

export function CreativePromptPicker({
  onStart,
  onPoll,
  onChoose,
  onSkip,
  back,
  alreadyWriting = false,
}: {
  /** Absent when generation was started server-side — see `alreadyWriting`. */
  onStart?: () => Promise<{ ok: boolean; message?: string }>;
  onPoll: () => Promise<{ ready: boolean; prompts: PromptChoice[] }>;
  onChoose: (choice: PromptChoice) => Promise<{ ok: boolean; message?: string }>;
  /**
   * True when the pipeline is already running.
   *
   * Full automation starts generation the moment the details form is
   * submitted — the ad type lives in that form, so it cannot start earlier —
   * and the customer lands here with three prompts already being written.
   * Showing them a "start" button for work that is underway would invite a
   * second, paid, duplicate run.
   */
  alreadyWriting?: boolean;
  /**
   * "Launch without choosing a prompt". It lives here rather than in its own
   * `<form>` on the page because a separate form cannot see this component's
   * state: picking a prompt left skip pressable and skipping left every
   * "Use this and launch" pressable, two launches racing for one campaign.
   * Sharing `busy` makes each one lock the other.
   */
  onSkip?: () => Promise<void>;
  /** Rendered at the start of the skip row — the page's Back control. */
  back?: ReactNode;
}) {
  const [phase, setPhase] = useState<"idle" | "writing" | "timedOut" | "choosing" | "chosen">(
    alreadyWriting ? "writing" : "idle",
  );
  const [prompts, setPrompts] = useState<PromptChoice[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** Its own line: "You can launch without one" is no help when that failed. */
  const [skipNote, setSkipNote] = useState<string | null>(null);
  /**
   * Which control is mid-flight: `"start"`, the index of the prompt being
   * picked, or nothing.
   *
   * Both handlers await a paid pipeline call and neither reported it, so the
   * button sat there looking untouched — and the one labelled "Use this and
   * launch" would fire `select-prompt` again on a second press. The same
   * failure `SubmitButton` exists for, in a component a form action cannot
   * reach.
   */
  const [busy, setBusy] = useState<"start" | "skip" | number | null>(null);
  const polling = useRef(false);
  const reduce = useReducedMotion();

  // A self-scheduling chain, not `setInterval`: three models writing takes as
  // long as it takes, and overlapping polls would stack on a pipeline that is
  // already busy. Each entry into "writing" — the first and every "Try again"
  // — gets its own three minutes.
  useEffect(() => {
    if (phase !== "writing") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Its own timer rather than a check inside `tick`, so a poll that never
    // answers still ends the wait.
    const giveUp = setTimeout(() => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      setPhase("timedOut");
    }, GIVE_UP_MS);

    async function tick() {
      // Never from a hidden tab (Error 1102, `lib/poll-pacing.ts`).
      await whenVisible();
      if (cancelled) return;
      // A poll from before a retry may still be in flight; wait it out rather
      // than ending the new chain before it starts.
      if (polling.current) {
        if (!cancelled) timer = setTimeout(tick, POLL_MS);
        return;
      }
      polling.current = true;
      let result: Awaited<ReturnType<typeof onPoll>>;
      try {
        result = await onPoll();
      } catch {
        // One failed check used to leave `polling` stuck on, so "Writing
        // three options…" showed forever. Try again on the next tick.
        polling.current = false;
        if (!cancelled) timer = setTimeout(tick, POLL_MS);
        return;
      }
      polling.current = false;
      if (cancelled) return;

      if (result.ready) {
        clearTimeout(giveUp);
        setPrompts(result.prompts);
        setPhase("choosing");
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearTimeout(giveUp);
    };
  }, [phase, onPoll]);

  async function start() {
    if (!onStart || busy !== null) return;
    setNote(null);
    setBusy("start");
    try {
      const result = await onStart();
      if (!result.ok) {
        setNote(result.message ?? "We couldn't start the creative writer.");
        return;
      }
      setPhase("writing");
    } catch {
      setNote("We couldn't reach the creative writer. Please try again.");
    } finally {
      // `finally`, so a thrown action re-arms the button instead of leaving it
      // disabled with no way forward.
      setBusy(null);
    }
  }

  async function choose(choice: PromptChoice) {
    if (busy !== null) return;
    setNote(null);
    setBusy(choice.index);
    try {
      const result = await onChoose(choice);
      if (!result.ok) {
        setNote(result.message ?? "We couldn't record that choice.");
        return;
      }
      setChosen(choice.index);
      setPhase("chosen");
    } catch {
      setNote("We couldn't record that choice. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function skip() {
    if (!onSkip || busy !== null) return;
    setSkipNote(null);
    setBusy("skip");
    try {
      // Ends in a redirect, so on success the page navigates away while the
      // button still says "Launching…".
      await onSkip();
    } catch {
      setSkipNote("We couldn't launch the campaign. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const card = (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">Creative prompt</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {phase === "chosen"
              ? "Chosen. Launching the campaign…"
              : alreadyWriting
                ? "Three models each write one. Pick a direction and the campaign launches."
                : "Optional. Three models each write one, you pick the direction you want."}
          </p>
        </div>

        {phase === "idle" && (
          <button
            type="button"
            onClick={start}
            disabled={busy !== null}
            aria-busy={busy === "start"}
            suppressHydrationWarning
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium text-ink transition hover:bg-surface-raised disabled:opacity-70"
          >
            {busy === "start" && <Spinner />}
            {busy === "start" ? "Starting…" : "Write three options"}
          </button>
        )}
      </div>

      {phase === "writing" && (
        <p role="status" className="mt-3 text-sm text-ink-soft">
          <span
            aria-hidden="true"
            className="mr-2 inline-block h-3 w-3 animate-pulse rounded-sm bg-accent align-middle motion-reduce:animate-none"
          />
          {alreadyWriting
            ? "Preparing your prompts. Three models are writing — this usually takes about a minute."
            : "Writing three options… you can carry on filling in the form below."}
        </p>
      )}

      {phase === "timedOut" && (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warn-soft px-3 py-2">
          <p className="text-sm text-warn">We couldn&apos;t write prompts right now.</p>
          <button
            type="button"
            onClick={() => setPhase("writing")}
            disabled={busy !== null}
            suppressHydrationWarning
            className="inline-flex min-h-11 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-ink transition hover:bg-surface-raised disabled:opacity-70"
          >
            Try again
          </button>
        </div>
      )}

      {/* The ONE animated moment in this flow, and the only place motion has
          anything to report: three prompts arrive together after about a
          minute of nothing. Staggered so they read as three separate options
          rather than a block appearing, which is the difference between
          "here are your choices" and a layout shift.

          Deliberately not applied to hover, to the step cards, or to the
          form sections — motion on every surface is the generic default and
          says nothing. `useReducedMotion` collapses it to an instant reveal;
          the prompts are the content, so they always appear. */}
      {phase !== "idle" && prompts.length > 0 && (
        <motion.ul
          className="mt-4 space-y-3"
          initial="hidden"
          animate="shown"
          variants={{ shown: { transition: { staggerChildren: reduce ? 0 : 0.08 } } }}
        >
          <AnimatePresence initial={false}>
          {prompts.map((choice) => {
            const picked = chosen === choice.index;
            return (
              <motion.li
                key={choice.index}
                layout={!reduce}
                // Full `transform` string rather than the `y` shorthand,
                // which Motion applies per frame from JS and which drops
                // frames under load. (Animation review, 2026-09-20.)
                variants={{
                  hidden: { opacity: 0, transform: reduce ? "translateY(0px)" : "translateY(8px)" },
                  shown: { opacity: 1, transform: "translateY(0px)" },
                }}
                transition={
                  reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }
                }
                className={`rounded-lg border p-3 ${
                  picked ? "border-accent bg-accent/5" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-ink-soft">{choice.model}</span>
                  {phase === "choosing" ? (
                    <button
                      type="button"
                      onClick={() => choose(choice)}
                      disabled={busy !== null}
                      aria-busy={busy === choice.index}
                      suppressHydrationWarning
                      className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] disabled:opacity-70 motion-reduce:transform-none"
                    >
                      {busy === choice.index && <Spinner />}
                      {busy === choice.index
                        ? alreadyWriting
                          ? "Launching…"
                          : "Recording…"
                        : alreadyWriting
                          ? "Use this and launch"
                          : "Use this one"}
                    </button>
                  ) : (
                    picked && <span className="text-xs font-medium text-accent">chosen</span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{choice.prompt}</p>
                {/* The pipeline's own warnings, about the prompt being picked. */}
                {choice.warnings.length > 0 && (
                  <p className="mt-2 text-xs text-warn">{choice.warnings.join(" · ")}</p>
                )}
              </motion.li>
            );
          })}
          </AnimatePresence>
        </motion.ul>
      )}

      {note && (
        <p role="alert" className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          {note} You can launch without one.
        </p>
      )}
    </div>
  );

  if (!onSkip) return card;

  return (
    <>
      {card}
      {/* A way past a creative writer that never answers. The campaign is
          complete either way, so being unable to launch it because three
          prompts did not arrive would be the worst outcome here — the agent
          writes its own creative in full automation. Quiet, because it is the
          lesser path, not the one to reach for first. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {back}
        <button
          type="button"
          onClick={skip}
          disabled={busy !== null}
          aria-busy={busy === "skip"}
          suppressHydrationWarning
          className="inline-flex min-h-11 items-center gap-2 text-sm text-ink-soft underline underline-offset-2 transition hover:text-ink disabled:opacity-70"
        >
          {busy === "skip" && <Spinner />}
          {busy === "skip" ? "Launching…" : "Launch without choosing a prompt"}
        </button>
      </div>
      {skipNote && (
        <p role="alert" className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          {skipNote}
        </p>
      )}
    </>
  );
}
