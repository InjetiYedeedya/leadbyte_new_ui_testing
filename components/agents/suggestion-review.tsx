"use client";

/**
 * The agent's proposed campaign, and the three things you can do with it.
 *
 * A client island for one reason: "Yes, proceed" opens a modal to choose the
 * automation mode, and a modal is open/close state plus focus management. The
 * plan itself is parsed on the server and arrives as a prop — nothing is
 * fetched here.
 *
 * ## The order of the questions
 *
 * Approve first, then choose how it runs. The automation mode used to sit in
 * the setup form, before the agent had said anything — which asked someone to
 * decide how much autonomy to grant a plan they had not read. Asking after they
 * have read it, and only once they have said yes, is both fewer questions and
 * a better-informed answer.
 *
 * "I have a suggestion" reveals a textarea rather than opening a second modal:
 * it is one field, and a dialog for one field is ceremony.
 *
 * ## Semi collects the creative in the dialog
 *
 * Choosing Semi reveals the platform's uploader inside this same modal, and
 * "Proceed" stays disabled until the files have landed in S3. Meta has worked
 * that way since 2026-09-08; Google joined it, moving five file inputs off the
 * campaign-details form. The reason is ordering: the creative exists before the
 * agent is asked to build a campaign around it, rather than being uploaded
 * inside the action that also launches.
 */

import { useScrollLock } from "@/lib/use-scroll-lock";
import { SubmitButton } from "@/components/ui/submit-button";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { SuggestionSection } from "@/lib/data/ads-suggestion";
import { MetaSemiMedia } from "@/components/agents/meta-semi-media";
import { GoogleSemiCreatives } from "@/components/agents/google-semi-creatives";
import { PageContainer } from "@/components/ui/page-container";
import { humaniseKey } from "@/lib/data/labels";

export function SuggestionReview({
  sections,
  userDetails,
  onApprove,
  onRevise,
  onSuggest,
  creativeStep = null,
  semiAllowed = true,
  modeLater = false,
}: {
  sections: SuggestionSection[];
  userDetails: Record<string, string>;
  /** Takes the chosen automation mode. */
  onApprove: (formData: FormData) => Promise<void>;
  onRevise: () => Promise<void>;
  onSuggest: (formData: FormData) => Promise<void>;
  /**
   * Which creative uploader Semi reveals, or null for a platform that still
   * collects its creative on the details form (LinkedIn).
   *
   * Both Meta and Google supply their own creative, so choosing Semi reveals
   * the uploader right here — the files are in S3 and validated before
   * "Proceed" fetches the campaign form. They differ only in what a platform
   * buys: Meta one asset in one of three shapes, Google five shapes at once.
   */
  creativeStep?: "meta" | "google" | null;
  /**
   * False when the agent said this campaign runs on full automation only
   * (`user_details.automation_mode: null`). Semi is shown, disabled, with the
   * reason — a choice that silently vanished would read as a missing feature.
   */
  semiAllowed?: boolean;
  /**
   * Google and Meta (2026-10-06): "Yes, proceed" approves straight away and
   * the Full/Semi choice comes AFTER the campaign details, on its own step —
   * so no dialog here.
   */
  modeLater?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [choosingMode, setChoosingMode] = useState(false);
  const [writing, setWriting] = useState(false);
  // Which mode is selected right now, so the file inputs can appear under
  // "Semi" the moment it is chosen. This is the whole reason the modal is a
  // client island rather than a plain form.
  const [mode, setMode] = useState<"full" | "semi">("full");
  // Whether the uploaded creative is complete, so "Proceed" can stay disabled
  // until it is. The Server Action re-checks it regardless.
  const [mediaValid, setMediaValid] = useState(false);
  // Whether the approval is in flight. A ref, not state: only the dialog's
  // close handlers read it, and they read it at the moment of the event.
  // `useFormStatus` can only be called beneath the form, so `ModeActions`
  // reports it up here.
  const approvingRef = useRef(false);

  // Blocked only when Semi is chosen on a platform that collects creative here
  // and that creative is not yet ready.
  const blockProceed = creativeStep !== null && mode === "semi" && !mediaValid;

  // The page behind a modal must not scroll; see the hook for what
  // `showModal()` does and does not give us.
  useScrollLock(choosingMode);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (choosingMode && !dialog.open) dialog.showModal();
    if (!choosingMode && dialog.open) dialog.close();
  }, [choosingMode]);

  return (
    <div className="max-w-5xl">
      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          AI campaign suggestion
        </div>

        <div className="space-y-4 p-4">
          {sections.map((section, i) => (
            <div key={`${section.title}-${i}`}>
              {section.title !== "" && (
                <h3 className="text-sm font-bold text-ink">{section.title}</h3>
              )}
              {/* Index keys: two identical lines are legal plan text, and the
                  line as its own key gave React duplicate-key errors. */}
              {section.body.map((line, j) => (
                <p key={j} className="mt-0.5 text-sm text-ink-soft">
                  {line}
                </p>
              ))}
              {section.bullets.length > 0 && (
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {section.bullets.map((bullet, j) => (
                    <li key={j} className="text-sm text-ink-soft">
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {/* What the agent understood, so a wrong answer is visible before it
            spends money rather than after. */}
        {Object.keys(userDetails).length > 0 && (
          <details className="border-t border-border px-4 py-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-ink-soft">
              What it understood
            </summary>
            <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {Object.entries(userDetails).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 text-sm">
                  {/* The agent's own key, which is usually already a label
                      ("Ad goal") and occasionally is not. */}
                  <dt className="text-ink-soft">{humaniseKey(label)}</dt>
                  <dd className="text-right text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {modeLater ? (
          <form action={onApprove}>
            <SubmitButton
              pendingLabel="Getting the campaign details…"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
            >
              Yes, proceed
            </SubmitButton>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setChoosingMode(true)}
            suppressHydrationWarning
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
          >
            Yes, proceed
          </button>
        )}

        <form action={onRevise}>
          <SubmitButton
            pendingLabel="Opening…"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-raised"
          >
            Revise suggestion
          </SubmitButton>
        </form>

        <button
          type="button"
          onClick={() => setWriting((open) => !open)}
          suppressHydrationWarning
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-raised"
        >
          I have a suggestion
        </button>
      </div>

      {writing && (
        <form action={onSuggest} className="mt-4">
          <label className="block">
            <span className="mb-1 block text-sm text-ink">What should it change?</span>
            <textarea
              name="suggestion"
              rows={3}
              required
              placeholder="e.g. focus on Search only, and put more budget on the call extensions"
              suppressHydrationWarning
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
            />
          </label>
          <SubmitButton
            pendingLabel="Sending…"
            className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
          >
            Send to the agent
          </SubmitButton>
        </form>
      )}

      <dialog
        ref={dialogRef}
        onClose={() => setChoosingMode(false)}
        // While the approval is sending, the dialog holds still. Closing it
        // hid the only spinner while the action kept running, and the plan
        // underneath then showed nothing until the redirect arrived.
        onCancel={(e) => {
          if (approvingRef.current) e.preventDefault();
        }}
        onClick={(e) => {
          if (!approvingRef.current && e.target === dialogRef.current) setChoosingMode(false);
        }}
        aria-labelledby="automation-mode-title"
        className="w-[min(36rem,calc(100vw-2rem))] rounded-lg border border-border bg-ground p-0 text-ink shadow-lg backdrop:bg-ink/50"
      >
        <form action={onApprove} className="p-4">
          <h2 id="automation-mode-title" className="text-base font-bold text-ink">
            Automation mode
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            Choose how you want this campaign to be handled.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="cursor-pointer rounded-lg border border-border p-4 transition-colors hover:bg-surface-raised has-[:checked]:border-accent has-[:checked]:bg-accent/5">
              <input
                type="radio"
                name="automationMode"
                value="full"
                checked={mode === "full"}
                onChange={() => setMode("full")}
                suppressHydrationWarning
                className="mr-2 accent-accent"
              />
              <span className="text-sm font-medium text-ink">Full automation</span>
              <span className="mt-1 block text-sm text-ink-soft">
                The agent writes the creative and sets the campaign up from the approved
                recommendation.
              </span>
            </label>

            <label
              className={`rounded-lg border border-border p-4 transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent/5 ${
                semiAllowed ? "cursor-pointer hover:bg-surface-raised" : "cursor-not-allowed opacity-60"
              }`}
            >
              <input
                type="radio"
                name="automationMode"
                value="semi"
                checked={mode === "semi"}
                onChange={() => setMode("semi")}
                disabled={!semiAllowed}
                suppressHydrationWarning
                className="mr-2 accent-accent"
              />
              <span className="text-sm font-medium text-ink">Semi automation</span>
              <span className="mt-1 block text-sm text-ink-soft">
                {semiAllowed
                  ? "You supply the creative and the agent builds the campaign around it."
                  : "Not available for this campaign — full automation is required."}
              </span>
            </label>
          </div>

          {/* The creative is supplied HERE and now, before the campaign form.
              The uploader's hidden field — `semiAutomationMedia` for Meta,
              `creativeUrls` for Google — rides this same approve submit. */}
          {creativeStep !== null && mode === "semi" && (
            <div className="mt-4">
              {creativeStep === "meta" ? (
                <MetaSemiMedia onValidityChange={setMediaValid} />
              ) : (
                <GoogleSemiCreatives onValidityChange={setMediaValid} />
              )}
            </div>
          )}

          {/* Both modes go to the same next screen — the campaign details the
              agent asks for. */}
          <p className="mt-4 rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
            Next you&apos;ll complete the campaign details. Nothing launches until then.
          </p>

          <ModeActions
            blockProceed={blockProceed}
            onBack={() => setChoosingMode(false)}
            onPendingChange={(pending) => {
              approvingRef.current = pending;
            }}
          />
        </form>
      </dialog>
    </div>
  );
}

/**
 * The dialog's Back and Proceed. Its own component because `useFormStatus`
 * only answers for the form it sits inside — called in `SuggestionReview`, it
 * would see no form at all. Back is disabled while the approval sends, and the
 * pending flag is passed up so the dialog's Escape and backdrop close are held
 * too.
 */
function ModeActions({
  blockProceed,
  onBack,
  onPendingChange,
}: {
  blockProceed: boolean;
  onBack: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const { pending } = useFormStatus();

  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);

  return (
    <div className="mt-5 flex items-center justify-end gap-3 border-t border-border pt-4">
      <button
        type="button"
        onClick={onBack}
        disabled={pending}
        suppressHydrationWarning
        className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-raised active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transform-none"
      >
        Back
      </button>
      {/* `SubmitButton`, not a bare submit. This posts the approval to
          the agent and the next screen is a server round trip away — it
          showed nothing at all for that whole wait, which on the one
          control that commits a campaign is the worst place in the flow
          to look inert. */}
      <SubmitButton
        pendingLabel="Sending…"
        disabled={blockProceed}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-50 transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
      >
        {blockProceed ? "Upload your creative first" : "Proceed"}
      </SubmitButton>
    </div>
  );
}
