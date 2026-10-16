"use client";

/**
 * Full or Semi, asked LAST for Google and Meta — after the campaign details
 * (product owner, 2026-10-06).
 *
 * ## Why this earns `"use client"`
 *
 * Choosing Semi reveals the platform's uploader, and the submit changes with
 * the choice: Semi waits for the creative to finish uploading; Full opens the
 * "check with me first / go ahead" question (`SelectionModeGate`) before it
 * submits. Both are state a form post cannot express. The choice itself is a
 * plain form field read by `chooseAutomationMode`, which re-checks everything.
 *
 * The cards and the uploaders are the ones the plan's dialog used, moved here
 * rather than rewritten, so the two flows look and behave the same.
 */

import { useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormPendingOverlay } from "@/components/ui/form-pending-overlay";
import { BackLink } from "@/components/ui/back-link";
import { SelectionModeGate } from "@/components/agents/selection-mode-gate";
import { MetaSemiMedia } from "@/components/agents/meta-semi-media";
import { GoogleSemiCreatives } from "@/components/agents/google-semi-creatives";
import { LinkedInSemiMediaUploader } from "@/components/agents/linkedin-semi-media";

const CARD =
  "rounded-lg border border-border bg-surface p-4 transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent/5";

export function AutomationModeForm({
  action,
  creativeStep,
  semiAllowed,
  backHref,
}: {
  action: (formData: FormData) => Promise<void>;
  creativeStep: "meta" | "google" | "linkedin";
  /** False when the agent said this campaign needs full automation. */
  semiAllowed: boolean;
  backHref: string;
}) {
  const [mode, setMode] = useState<"full" | "semi">("full");
  const [mediaValid, setMediaValid] = useState(false);
  const blocked = mode === "semi" && !mediaValid;

  return (
    <form action={action} className="relative">
      <FormPendingOverlay
        title={mode === "semi" ? "Creating your campaign…" : "Writing creative ideas…"}
        detail={
          mode === "semi"
            ? "This usually takes 10–20 seconds. Please keep this page open."
            : "The agent is writing three creative ideas for you to choose from. Please keep this page open."
        }
      />
      <fieldset>
        <legend className="sr-only">Automation mode</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`${CARD} cursor-pointer hover:bg-surface-raised`}>
            <input
              type="radio"
              name="automationMode"
              value="full"
              checked={mode === "full"}
              onChange={() => setMode("full")}
              className="mr-2 accent-accent"
            />
            <span className="text-sm font-medium text-ink">Full automation</span>
            <span className="mt-1 block text-sm text-ink-soft">
              The agent writes the creative and sets the campaign up from the approved plan. You
              pick one of its creative ideas next.
            </span>
          </label>

          <label
            className={`${CARD} ${
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
      </fieldset>

      {/* Unmounted, not hidden, under Full: a hidden uploader would still
          post its media field. */}
      {mode === "semi" && (
        <div className="mt-4">
          {creativeStep === "linkedin" ? (
            <LinkedInSemiMediaUploader onValidityChange={setMediaValid} />
          ) : creativeStep === "meta" ? (
            <MetaSemiMedia onValidityChange={setMediaValid} />
          ) : (
            <GoogleSemiCreatives onValidityChange={setMediaValid} />
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <BackLink fallbackHref={backHref} />
        {mode === "full" ? (
          // Asks "check with me first, or go ahead?" in a dialog, then submits.
          <SelectionModeGate label="Continue" />
        ) : (
          <SubmitButton
            pendingLabel="Creating…"
            disabled={blocked}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink disabled:opacity-50"
          >
            {blocked ? "Upload your creative first" : "Create campaign"}
          </SubmitButton>
        )}
      </div>
    </form>
  );
}
