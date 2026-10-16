"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  ADS_API_STEPS,
  CAMPAIGN_STEPS,
  adsApiSteps,
  type CampaignStep,
  type CampaignStepId,
} from "@/lib/data/campaign-steps";

/**
 * Where you are in a campaign launch.
 *
 * ## Why this exists
 *
 * Launching an ad campaign is four screens — describe it, read the agent's
 * plan, complete the details it asks for, choose a creative direction — and
 * the last one spends money. Each screen used to arrive with no indication
 * that it was part of a sequence, so there was no way to tell whether the next
 * button was "continue" or "spend my budget". A flow whose final step is
 * irreversible has to say how far along you are.
 *
 * ## Why numbered, when numbers are usually a tell
 *
 * Numbered markers on unordered content are decoration. These four ARE
 * ordered, cannot be done out of order, and the count matters — knowing there
 * are two steps left before anything is charged is the whole point. So the
 * numbers carry information rather than dressing it.
 *
 * ## Why a client island
 *
 * The active indicator slides between steps rather than cutting, which needs
 * `layoutId` — Motion tracks the same element across renders and animates the
 * gap. That is motion answering a real change of place, not an entrance
 * effect. It is also the ONLY animation here: `prefers-reduced-motion` turns
 * it into an instant move rather than removing the indicator, because the
 * indicator is information.
 */

/**
 * Re-exported so the existing importers keep one place to look, even though
 * the data now lives in a module both the server and the client can read.
 */
export { ADS_API_STEPS, CAMPAIGN_STEPS, adsApiSteps };
export type { CampaignStep, CampaignStepId };

export function CampaignSteps({
  current,
  steps = CAMPAIGN_STEPS,
}: {
  current: CampaignStepId;
  /** Defaults to the four the n8n ad agents share, so their calls are unchanged. */
  steps?: readonly CampaignStep[];
}) {
  const reduce = useReducedMotion();
  const currentIndex = steps.findIndex((step) => step.id === current);

  return (
    <nav aria-label="Campaign progress" className="mb-4">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
        {steps.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;

          return (
            <li key={step.id} className="flex items-center gap-2">
              <div className="relative flex items-center gap-2.5 rounded-full px-3 py-1.5">
                {/* The moving highlight. One element, tracked across steps by
                    `layoutId`, so it travels instead of blinking out here and
                    in again there. */}
                {active && (
                  <motion.span
                    layoutId="campaign-step-active"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-accent/10"
                    transition={
                      reduce
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 420, damping: 34 }
                    }
                  />
                )}

                <span
                  aria-hidden="true"
                  className={
                    done
                      ? "relative flex h-5 w-5 items-center justify-center rounded-full bg-good text-[11px] font-medium text-surface"
                      : active
                        ? "relative flex h-5 w-5 items-center justify-center rounded-full bg-accent font-mono text-[10px] text-surface"
                        : "relative flex h-5 w-5 items-center justify-center rounded-full border border-border font-mono text-[10px] text-ink-soft"
                  }
                >
                  {done ? "✓" : String(i + 1).padStart(2, "0")}
                </span>

                <span
                  className={
                    active
                      ? "relative text-sm font-medium text-ink"
                      : done
                        ? "relative text-sm text-ink"
                        : "relative text-sm text-ink-soft"
                  }
                >
                  {step.label}
                </span>

                {/* The state in words. The tick and the fill are colour and
                    shape only, which a screen reader cannot read. */}
                <span className="sr-only">
                  {done ? "(done)" : active ? "(current step)" : "(not started)"}
                </span>
              </div>

              {i < steps.length - 1 && (
                <span aria-hidden="true" className="text-border">
                  —
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
