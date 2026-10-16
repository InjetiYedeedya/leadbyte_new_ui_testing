import {
  GOAL_FORMATS,
  LINKEDIN_BUDGET_TYPES,
  LINKEDIN_GOALS,
  type LinkedInAdsSetup,
} from "@/lib/data/linkedin-ads-setup";
import {
  LaunchButton,
  NumberField,
  ProblemList,
  Section,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/agents/setup-fields";
import { LinkedInGoalFields } from "@/components/agents/linkedin-goal-fields";
import { LinkedInTargeting } from "@/components/agents/linkedin-targeting";

/**
 * The LinkedIn Ads agent's setup form.
 *
 * The least like the other two: no offer, no age, no gender, no location —
 * LinkedIn targets by professional attributes, so the audience is criteria plus
 * each one's own values (`LinkedInTargeting`).
 *
 * The goal starts unanswered and the format list follows it
 * (`LinkedInGoalFields`); `readLinkedInAdsForm` still drops a format the chosen
 * goal does not allow. The pairing is the live app's — see `GOAL_FORMATS`.
 */
export function LinkedInAdsSetup({
  action,
  businessName,
  problems,
  initial = null,
}: {
  action: (formData: FormData) => Promise<void>;
  businessName: string;
  problems: string[];
  /** The last posted answers, when the form was sent back (`linkedin-setup-draft.ts`). */
  initial?: LinkedInAdsSetup | null;
}) {
  return (
    <form action={action}>
      <ProblemList problems={problems} />

      <Section title="Who's advertising">
        <TextField
          name="businessName"
          label="Company or brand name"
          defaultValue={initial?.businessName || businessName}
          required
        />
      </Section>

      <Section title="Goal and format">
        <LinkedInGoalFields
          goals={LINKEDIN_GOALS}
          goalFormats={GOAL_FORMATS}
          initialGoal={initial?.goal ?? ""}
          initialFormat={initial?.adFormat ?? ""}
        />
      </Section>

      <Section title="Targeting criteria">
        <LinkedInTargeting
          initialCriteria={initial?.criteria ?? []}
          initialValues={initial?.targeting ?? {}}
        />
        <TextAreaField
          name="customTargeting"
          defaultValue={initial?.customTargeting ?? ""}
          label="Anything else about who to reach"
          placeholder="Optional — companies to include or exclude, seniority, and so on"
        />
      </Section>

      <Section title="Budget and duration">
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <NumberField
            name="budgetAmount"
            label="Budget"
            min={1}
            required
            defaultValue={initial && initial.budgetAmount > 0 ? initial.budgetAmount : undefined}
          />
          <SelectField
            name="budgetType"
            label="Budget type"
            defaultValue={initial?.budgetType ?? "daily"}
            capitalize
            options={LINKEDIN_BUDGET_TYPES.map((type) => ({ value: type, label: type }))}
          />
          <NumberField
            name="days"
            label="Run for (days)"
            defaultValue={initial && initial.days > 0 ? initial.days : 30}
            min={1}
            max={365}
            required
          />
        </div>
      </Section>

      {/* "How much should it decide?" was here and is gone (2026-10-08), as
          Google's and Meta's went on 2026-09-08: Full or Semi is asked on the
          plan page, after the agent has drafted it — the only point where the
          answer means anything. `readLinkedInAdsForm` defaults
          `automationMode` to "full" when the field is absent, which is now
          always. */}

      <LaunchButton />
    </form>
  );
}
