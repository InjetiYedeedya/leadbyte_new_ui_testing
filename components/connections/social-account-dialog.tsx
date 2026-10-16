"use client";

/**
 * Which page or channel should this workspace post as?
 *
 * ## Why it is asked at all
 *
 * Facebook hands back every page the login administers — five, on the account
 * this was built against, two of them sharing a name. The Social Media agent
 * publishes to exactly one. Picking for them would post a business's content
 * to a side project's audience, and nobody would notice until it had.
 *
 * ## Why a dialog rather than a page
 *
 * The ad and Google pickers are pages because their list is fetched, and a
 * fetch wants somewhere to be slow. This list arrived with the redirect and is
 * already in a cookie — a whole route to render four radio buttons would put a
 * navigation between consent and the click for nothing.
 *
 * ## Why it earns `"use client"`
 *
 * A dialog: open/close, Escape, focus, and a backdrop click. It opens on mount
 * because the page only renders it when `?choose=` is present, which the
 * callback sets — so by the time this exists the question is live.
 *
 * ## Why leaving asks a second question
 *
 * Leaving is not a postponement, and the first version of this treated it as
 * one. Consent without a chosen page connects nothing usable: the agent has
 * nowhere to publish, and a row reading "Connected" with no page under it
 * describes a setup that cannot do the thing it was set up for. So leaving is
 * a decision, it is confirmed, and `abandonSocialAccount` then makes the app
 * agree with what the confirmation said — the platform reads Not connected
 * until someone connects again.
 *
 * Every way out routes through that step, Escape and the backdrop included.
 * A confirmation any key press can walk past is decoration.
 */

import { useEffect, useRef, useState } from "react";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { SubmitButton } from "@/components/ui/submit-button";
import type { SocialAccount } from "@/lib/data/social-accounts";

export function SocialAccountDialog({
  platform,
  label,
  accounts,
  action,
  abandonAction,
}: {
  /** The `OAuthPlatform` id, posted back so the action knows what was chosen. */
  platform: string;
  /** How the platform is named on screen — "Facebook", not "facebook". */
  label: string;
  accounts: readonly SocialAccount[];
  action: (formData: FormData) => void | Promise<void>;
  /** Records that they left without choosing, which is what makes the warning true. */
  abandonAction: (formData: FormData) => void | Promise<void>;
}) {
  // "picking" or "leaving" — never closed. There is no path out of this dialog
  // that does not go through a server action, which is the whole point: the
  // choice and the refusal are both decisions the app has to record.
  const [step, setStep] = useState<"picking" | "leaving">("picking");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useScrollLock(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // ONE `<dialog>`, two views. Two elements in two return branches happen to
  // work — React reuses the DOM node because both branches open with a
  // `<dialog>` — but `showModal()` runs once on mount, so anything that made
  // React recreate the node would leave a modal that never opens. Branching
  // inside removes the question.
  return (
    <dialog
      ref={dialogRef}
      // Escape and the backdrop ask the question rather than closing; from the
      // confirmation they go BACK to the list. That is the least destructive
      // reading of "get me out of here", and the only one that cannot
      // disconnect an account by accident.
      onCancel={(event) => {
        event.preventDefault();
        setStep(step === "leaving" ? "picking" : "leaving");
      }}
      onClick={(event) => {
        if (event.target !== dialogRef.current) return;
        setStep(step === "leaving" ? "picking" : "leaving");
      }}
      aria-labelledby={step === "leaving" ? "social-leave-title" : "social-account-title"}
      className="w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-border bg-ground p-0 text-ink shadow-lg backdrop:bg-ink/50"
    >
      {step === "leaving" ? (
        <div className="p-4">
          <h2 id="social-leave-title" className="text-base font-bold text-ink">
            Leave without connecting?
          </h2>
          <p className="mt-2 text-sm text-ink-soft">
            <span className="font-medium text-ink">No account will be connected.</span> {label}{" "}
            will show as not connected, and the Social Media agent will have nowhere to publish
            until you connect again.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
            {/* The safe choice is the prominent one. Leaving is a decision
                people reach by accident at least as often as on purpose, so it
                does not get the accent button. */}
            <form action={abandonAction}>
              <input type="hidden" name="platform" value={platform} />
              <SubmitButton
                pendingLabel="Leaving…"
                className="rounded-md px-4 py-2 text-sm font-medium text-crit transition-colors hover:bg-crit-soft"
              >
                Leave without connecting
              </SubmitButton>
            </form>
            <button
              type="button"
              onClick={() => setStep("picking")}
              suppressHydrationWarning
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
            >
              Choose an account
            </button>
          </div>
        </div>
      ) : (
        <form action={action} className="p-4">
          <input type="hidden" name="platform" value={platform} />

          <h2 id="social-account-title" className="text-base font-bold text-ink">
            Choose a {label} account
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            This is where the Social Media agent will publish. You can change it by connecting
            again.
          </p>

          <fieldset className="mt-4">
            <legend className="sr-only">{label} account</legend>

            {/* Scrolls rather than growing: a login with twenty pages would push
                the confirm button off a laptop screen, and a dialog whose action
                is below the fold reads as having none. */}
            <div className="max-h-[min(20rem,50vh)] divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface">
              {accounts.map((account, i) => (
                <label
                  key={account.id}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-raised"
                >
                  <input
                    type="radio"
                    name="accountId"
                    value={account.id}
                    defaultChecked={i === 0}
                    required
                    suppressHydrationWarning
                    className="h-4 w-4 shrink-0 accent-accent"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{account.name}</span>
                    {/* The id, because two pages genuinely share a name on the
                        account this was built against — "Ntimes AI" twice. With
                        only the name there is no way to tell which is which, and
                        the picker becomes a coin toss. */}
                    <span className="block truncate font-mono text-xs text-ink-soft">
                      {account.id}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-5 flex items-center justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setStep("leaving")}
              suppressHydrationWarning
              className="rounded-md px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-raised hover:text-ink"
            >
              Later
            </button>
            <SubmitButton
              pendingLabel="Saving…"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
            >
              Use this account
            </SubmitButton>
          </div>
        </form>
      )}
    </dialog>
  );
}
