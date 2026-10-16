"use client";

/**
 * The Google Ads goal, and what that goal needs from the ad account.
 *
 * ## Why this earns `"use client"`
 *
 * Two questions exist only for one goal each (legacy campaign-flow guide §3):
 *
 * - **Leads → Forms** must use one of the account's own Google lead forms, or
 *   "+ Create custom form" (`GOOGLE_CUSTOM_FORM`), which the agent builds.
 * - **Local store and visit** must name the store locations, and only ones
 *   with a Google Business Profile id — a local campaign cannot run without it.
 *
 * Showing a question on a choice made a moment ago is state. The lists
 * themselves load live from the account (`AdsListPicker`) only once the goal
 * asks for them. `readGoogleAdsForm` re-checks both on the server.
 */

import { useState } from "react";
import { AdsListPicker } from "@/components/agents/ads-list-picker";
import { GoalPicker } from "@/components/agents/goal-picker";
import { GOALS, GOOGLE_CUSTOM_FORM, LEAD_FORM_SUBGOAL, LOCAL_GOAL } from "@/lib/data/google-ads-setup";

/** Offered after the account's own lead forms, as Meta's is: the agent builds one. */
const CUSTOM_FORM = {
  label: "+ Create custom form",
  detail: "We'll create a custom lead form for your campaign",
  pick: { ...GOOGLE_CUSTOM_FORM, detail: "", profileId: "", assetSet: "" },
};

export function GoogleGoalFields({ defaultGoal = "leads" }: { defaultGoal?: string }) {
  const first = GOALS.find((goal) => goal.id === defaultGoal)?.subGoals[0] ?? "";
  const [goal, setGoal] = useState(defaultGoal);
  const [subGoal, setSubGoal] = useState<string>(first);

  return (
    <>
      <GoalPicker
        goals={GOALS}
        defaultGoal={defaultGoal}
        onChange={(nextGoal, nextSub) => {
          setGoal(nextGoal);
          setSubGoal(nextSub);
        }}
      />
      {goal === "leads" && subGoal === LEAD_FORM_SUBGOAL && (
        <AdsListPicker
          platform="google"
          kind="lead-forms"
          name="leadForm"
          label="Which lead form should the ads use?"
          multiple={false}
          what="your Google lead forms"
          empty="This account has no Google lead forms yet. Create a custom form below, or choose Calls or Website instead."
          extraOption={CUSTOM_FORM}
        />
      )}
      {/* Why there are no daily hours for this goal is said where the hours
          would be (`meta-schedule-fields.tsx`, google variant). */}
      {goal === LOCAL_GOAL && (
        <AdsListPicker
          platform="google"
          kind="store-locations"
          name="storeLocation"
          label="Which stores should people visit?"
          multiple
          what="your store locations"
          empty="No store locations were found. Add your stores to your Google Business Profile, then try again."
          requireProfile
          count={{ one: "location", many: "locations" }}
        />
      )}
    </>
  );
}
