import { EmailGateNotice } from "@/components/agents/email-gate-notice";
import { AgeRangeChips } from "@/components/agents/age-range-chips";
import { FormDraft } from "@/components/agents/form-draft";
import type { AdsPrefill } from "@/lib/data/ads-prefill";
import { MetaGoalFields } from "@/components/agents/meta-goal-fields";
import { AudienceChoice } from "@/components/agents/ads-list-picker";
import { MetaScheduleFields } from "@/components/agents/meta-schedule-fields";
import {
  AGE_RANGES,
  GENDERS,
  INTERESTS,
  META_GOALS,
  META_OFFER_PRESETS,
} from "@/lib/data/meta-ads-setup";
import { budgetCurrencyNote } from "@/lib/data/google-ads-setup";
import {
  ChipGroup,
  LaunchButton,
  NumberField,
  ProblemList,
  Section,
  TextAreaField,
  TextField,
} from "@/components/agents/setup-fields";

const OFFER_CHIP =
  "inline-flex min-h-11 cursor-pointer items-center rounded-md border border-border bg-surface px-3 text-sm text-ink hover:bg-surface-raised has-[:checked]:border-accent has-[:checked]:bg-accent/5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent";

/**
 * The Meta Ads agent's setup form.
 *
 * A Server Component: one page of sections where the live app has a nine-step
 * wizard, for the same reason as Google's — a wizard needs client state to hold
 * nine steps of answers and a single form needs none.
 *
 * Its client islands: the goal and what follows from it (`MetaGoalFields`),
 * who to reach (`AudienceChoice`), and the dates, hours and budget type
 * (`MetaScheduleFields`), whose limits move with each other.
 *
 * Two show-and-hide rules need no JavaScript and are plain CSS on `:checked`:
 * the offer description appears under "Custom offer", and the new-audience
 * questions (age, gender, interests) step aside for retargeting — a saved
 * audience is people already found, and `metaAdsPayload` sends none of them.
 *
 * The goal is asked FIRST and decides what follows (`MetaGoalFields`): the
 * Offer question only appears for goals a discount means something for.
 * `readMetaAdsForm` re-checks both that and the sub-goal pairing, because
 * nothing the browser sends is trusted to follow the UI's rules.
 */
export function MetaAdsSetup({
  action,
  businessName,
  prefill = {},
  problems,
  emailConnected = true,
  draftKey,
  currency = "",
}: {
  action: (formData: FormData) => Promise<void>;
  /** The chosen ad account's currency code, e.g. "INR". Empty when unknown. */
  currency?: string;
  /** Defaults from `ads-website_details`. Editable — see `AdsPrefill`. */
  prefill?: AdsPrefill;
  businessName: string;
  problems: string[];
  /** Country names, fetched on the server. Empty falls back to a text box. */
  /** False with no connected mailbox — see `GoogleAdsSetup` for why. */
  emailConnected?: boolean;
  /** Where this browser keeps the unsent answers (`draftKeyFor`). None: no draft. */
  draftKey?: string;
}) {
  if (!emailConnected) {
    return (
      <div>
        <EmailGateNotice agentName="Meta Ads" />
      </div>
    );
  }

  return (
    <form action={action}>
      {draftKey && <FormDraft draftKey={draftKey} />}
      <ProblemList problems={problems} />

      {/* Goal first — it decides which questions follow
          (`meta-goal-fields.tsx`). */}
      <MetaGoalFields
        goals={META_GOALS}
        defaultGoal=""
        advertising={
          <Section title="What you're advertising">
            <TextField
              name="businessName"
              label="Business name"
              defaultValue={prefill.businessName ?? businessName}
              required
            />
            <TextAreaField
              name="service"
              label="Service or product"
              placeholder="What are you selling, and to whom?"
              defaultValue={prefill.service}
              required
            />
          </Section>
        }
        offer={
          <Section title="Offer">
            {/* `group/offer`: the description shows only while "Custom offer"
                is checked. Hidden still submits, and the server reads it only
                for `custom`. */}
            <div className="group/offer">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["custom", "Custom offer"],
                    ["none", "No offer"],
                  ] as const
                ).map(([value, text]) => (
                  <label key={value} className={OFFER_CHIP}>
                    <input
                      type="radio"
                      name="offer"
                      value={value}
                      defaultChecked={value === "none"}
                      suppressHydrationWarning
                      className="mr-2 accent-accent"
                    />
                    {text}
                  </label>
                ))}
              </div>
              <label className="mt-3 hidden group-has-[input[value=custom]:checked]/offer:block">
                <span className="mb-1 block text-sm text-ink">
                  Describe your offer <span className="text-ink-soft">(pick a suggestion or write your own)</span>
                </span>
                <input
                  name="customOffer"
                  list="meta-offer-presets"
                  maxLength={200}
                  placeholder="e.g. First flight booking $20 off"
                  suppressHydrationWarning
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
                />
                <datalist id="meta-offer-presets">
                  {META_OFFER_PRESETS.map((preset) => (
                    <option key={preset} value={preset} />
                  ))}
                </datalist>
              </label>
            </div>
          </Section>
        }
      />

      <Section title="Who should see it">
        {/* `group/audience`: the new-audience questions step aside while
            Retargeting is chosen in `AudienceChoice`. */}
        <div className="group/audience">
          {/* New audience, or retargeting the account's saved audiences. */}
          <AudienceChoice platform="meta" />
          <div className="group-has-[input[name=audienceType][value=retargeting]:checked]/audience:hidden">
            <AgeRangeChips ages={AGE_RANGES} defaultChecked={prefill.ages ?? ["All"]} />
            <ChipGroup
              name="gender"
              label="Gender"
              defaultValue={prefill.gender ?? "all"}
              options={GENDERS.map((gender) => ({ value: gender, label: gender }))}
            />
            <ChipGroup
              name="interests"
              label="Interests (choose at least one)"
              multiple
              defaultChecked={prefill.interests ?? []}
              options={INTERESTS.map((interest) => ({ value: interest, label: interest }))}
            />
            {/* Only read when the Other chip is ticked — otherwise it would send a
                free-text interest nobody asked for. */}
            <TextField
              name="customInterest"
              label="If you picked Other, what is it?"
              defaultValue={prefill.customInterest}
              placeholder="e.g. corporate travel desks"
            />
          </div>
        </div>
      </Section>

      <Section title="Schedule and budget">
        {/* Dates, hours and budget type move together, so they live in one
            island; custom timing forces a lifetime budget there and on the
            server (Meta schedules delivery only under one). */}
        <MetaScheduleFields
          budgetAmount={
            <NumberField name="budgetAmount" label="Budget" hint={budgetCurrencyNote(currency)} min={1} required />
          }
        />
      </Section>

      {/* "What should the ad be?" was here for a few minutes and is gone.
          Same reason as the location block: the campaign-details form the
          agent returns is where the creative is described, so asking at setup
          — before the agent has planned anything — asks twice and the first
          answer is the less informed one. `startCreativePrompts` reads the
          format from that form's own schema instead. */}

      {/* "How much should it decide?" was here and is gone (2026-09-08).
          The same question is asked again on the suggestion page, AFTER the
          agent has drafted a plan — which is the only point where the answer
          means anything, because that is when the creative either gets written
          or gets uploaded. Asking before the plan exists made the customer
          choose twice and the first answer was discarded.

          `automationMode` is therefore not posted by this form.
          `readMetaAdsForm` already defaults it to "full" for exactly that
          case, so nothing downstream has to change. */}

      <LaunchButton />
    </form>
  );
}
