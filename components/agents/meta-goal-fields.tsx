"use client";

/**
 * The opening of the Meta Ads setup form: the goal first, then what follows
 * from it.
 *
 * ## Why this earns `"use client"`
 *
 * Product notes (2026-09-30): "based on the user's goal, the flow should
 * determine what happens next". So the goal is the first question, and the
 * Offer question appears only for goals where a discount means something
 * (`META_OFFER_GOALS`). Showing or hiding a question on a choice made a moment
 * ago is state; a form POST cannot do it. The sections themselves are
 * server-rendered and handed in as props — this owns which ones show, not what
 * is in them. `readMetaAdsForm` applies the same rule on the server.
 */

import { useState, type ReactNode } from "react";
import { GoalPicker, type GoalOption } from "@/components/agents/goal-picker";
import { Section, TextField } from "@/components/agents/setup-fields";
import { AdsListPicker } from "@/components/agents/ads-list-picker";
import { INSTANT_FORM_SUBGOAL, META_CUSTOM_FORM, goalTakesOffer } from "@/lib/data/meta-ads-setup";

/** Offered after the account's own forms (legacy §6.4): the agent builds one. */
const CUSTOM_FORM = {
  label: "+ Create custom form",
  detail: "We'll create a custom instant form for your leads",
  pick: { ...META_CUSTOM_FORM, detail: "", profileId: "", assetSet: "" },
};

export function MetaGoalFields({
  goals,
  defaultGoal,
  advertising,
  offer,
}: {
  goals: readonly GoalOption[];
  defaultGoal: string;
  /** "What you're advertising" — asked for every goal. */
  advertising: ReactNode;
  /** The Offer section, shown only when the goal takes one. */
  offer: ReactNode;
}) {
  const [goal, setGoal] = useState(defaultGoal);
  // Starts unanswered: the customer picks the goal (`startEmpty` below).
  const [subGoal, setSubGoal] = useState<string>("");

  return (
    <>
      <Section title="Goal">
        {/* Linked pair: the detail question follows the goal, so the
            defaults are always valid (`goal-picker.tsx`). */}
        <GoalPicker
          goals={goals}
          defaultGoal={defaultGoal}
          startEmpty
          onChange={(nextGoal, nextSub) => {
            setGoal(nextGoal);
            setSubGoal(nextSub);
          }}
        />
        {/* Leads → Instant forms: one of the account's own forms, or one the agent creates. */}
        {goal === "leads" && subGoal === INSTANT_FORM_SUBGOAL && (
          <AdsListPicker
            platform="meta"
            kind="lead-forms"
            name="leadForm"
            label="Which instant form should the ads use?"
            multiple={false}
            what="your instant forms"
            empty="This Page has no instant forms yet. We can create one for you below, or choose another way to collect leads."
            extraOption={CUSTOM_FORM}
          />
        )}
        {/* Engagement promotes a post that is already published, so the post
            is the ad: no automation choice and no creative steps follow
            (LBS-1253). Unmounted for other goals so it never rides along. */}
        {goal === "engagement" && (
          <div className="mt-3">
            <TextField
              name="engagementPost"
              label="Which post should we promote?"
              hint="(the post's ID or its link)"
              placeholder="https://www.instagram.com/p/… or 1234567890_9876543210"
              required
            />
            <p className="-mt-1 text-xs leading-5 text-ink-soft">
              Open the post on Facebook or Instagram and copy its link from the address bar or the
              share menu. We promote the post as it is — likes, comments and shares on it all count.
            </p>
          </div>
        )}
      </Section>
      {advertising}
      {/* Unmounted, not hidden: a hidden field still submits, and an offer
          chosen under Leads must not ride along after switching to Awareness. */}
      {goalTakesOffer(goal) && offer}
    </>
  );
}
