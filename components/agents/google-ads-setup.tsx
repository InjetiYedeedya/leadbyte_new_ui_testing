import { EmailGateNotice } from "@/components/agents/email-gate-notice";
import { AgeRangeChips } from "@/components/agents/age-range-chips";
import { FormDraft } from "@/components/agents/form-draft";
import {
  ChipGroup,
  LaunchButton,
  NumberField,
  ProblemList,
  Section,
  TextField,
} from "@/components/agents/setup-fields";
import { GoogleGoalFields } from "@/components/agents/google-goal-fields";
import { AudienceChoice } from "@/components/agents/ads-list-picker";
// The shared schedule island under its own name: a client module's
// `export { X as Y }` alias does not survive the server/client boundary — the
// page received undefined and crashed (2026-10-02).
import { MetaScheduleFields } from "@/components/agents/meta-schedule-fields";
import type { AdsPrefill } from "@/lib/data/ads-prefill";
import { OFFER_PRESETS } from "@/lib/data/ads-offer";
import { AGE_RANGES, budgetCurrencyNote, GENDERS } from "@/lib/data/google-ads-setup";
import { INTERESTS } from "@/lib/data/meta-ads-setup";

const OFFER_CHIP =
  "inline-flex min-h-11 cursor-pointer items-center rounded-md border border-border bg-surface px-3 text-sm text-ink hover:bg-surface-raised has-[:checked]:border-accent has-[:checked]:bg-accent/5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent";

/**
 * The Google Ads agent's setup form.
 *
 * A Server Component with a plain `<form action={serverAction}>`. The legacy
 * app asks these questions across nine wizard steps; this asks them once, in
 * sections, which is not only shorter — a wizard has to hold nine steps of
 * answers in client state, and this holds none.
 *
 * Its client islands: the goal and what it needs from the account
 * (`GoogleGoalFields`), who to reach (`AudienceChoice`), and the dates, hours
 * and budget type (`MetaScheduleFields`, Google's variant), whose limits move
 * with each other.
 *
 * Three show-and-hide rules need no JavaScript and are plain CSS on `:checked`,
 * the same as Meta's form: the offer description appears under "Custom offer";
 * the new-audience questions (age, gender, interests) step aside for
 * retargeting — a saved audience is people already found, and
 * `googleAdsPayload` sends none of them; and the daily hours give way to an
 * explanation for the goals Google allows none for (`globals.css`).
 * `readGoogleAdsForm` re-checks every one of them on the server.
 */
export function GoogleAdsSetup({
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
  /**
   * Defaults read from `ads-website_details`, which the backend already holds
   * for this site. Every one is editable — prefilled, not pre-decided.
   */
  prefill?: AdsPrefill;
  /** From the business profile, so the commonest field starts answered. */
  businessName: string;
  /** Everything wrong with the last attempt, all at once. */
  problems: string[];
  /**
   * False when this account has no connected mailbox.
   *
   * The Server Action refuses the launch without one, so the form is not shown
   * at all — this is a fifteen-field form, and filling it in before being told
   * no is the version of this gate nobody would forgive.
   */
  emailConnected?: boolean;
  /** Where this browser keeps the unsent answers (`draftKeyFor`). None: no draft. */
  draftKey?: string;
}) {
  if (!emailConnected) {
    return (
      <div>
        <EmailGateNotice agentName="Google Ads" />
      </div>
    );
  }

  return (
    <form action={action}>
      {draftKey && <FormDraft draftKey={draftKey} />}
      <ProblemList problems={problems} />

      <Section title="What you're advertising">
        <TextField
          name="businessName"
          label="Business name"
          defaultValue={prefill.businessName ?? businessName}
          required
        />

        <label className="block">
          <span className="mb-1 block text-sm text-ink">Service or product</span>
          <textarea
            name="service"
            rows={3}
            required
            defaultValue={prefill.service}
            placeholder="What are you selling, and to whom?"
            suppressHydrationWarning
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>
      </Section>

      <Section title="Offer">
        {/* `group/offer`: the description shows only while "Custom offer" is
            checked. Hidden still submits, and the server reads it only for
            `custom` (`ads-offer.ts`, shared with Meta). */}
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
              list="google-offer-presets"
              maxLength={200}
              placeholder="e.g. 10% off your first booking"
              suppressHydrationWarning
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
            />
            <datalist id="google-offer-presets">
              {OFFER_PRESETS.map((preset) => (
                <option key={preset} value={preset} />
              ))}
            </datalist>
          </label>
        </div>
      </Section>

      <Section title="Goal">
        {/* The goal, its detail, and what that goal needs from the account —
            a lead form, or store locations (`google-goal-fields.tsx`). */}
        <GoogleGoalFields defaultGoal="leads" />
      </Section>

      <Section title="Who should see it">
        {/* `group/audience`: the new-audience questions step aside while
            Retargeting is chosen in `AudienceChoice`. */}
        <div className="group/audience">
          {/* New audience, or retargeting the account's saved audiences. */}
          <AudienceChoice platform="google" />
          <div className="group-has-[input[name=audienceType][value=retargeting]:checked]/audience:hidden">
            <AgeRangeChips ages={AGE_RANGES} defaultChecked={prefill.ages ?? ["All"]} />
            <ChipGroup
              name="gender"
              label="Gender"
              defaultValue={prefill.gender ?? "all"}
              options={GENDERS.map((gender) => ({ value: gender, label: gender }))}
            />
            {/* Google's live payload carries "Interests and behaviors" exactly
                as Meta's does, and a new audience needs at least one
                (`validateGoogleAds`). */}
            <ChipGroup
              name="interests"
              label="Interests and behaviours (choose at least one)"
              multiple
              defaultChecked={prefill.interests ?? []}
              options={INTERESTS.map((interest) => ({ value: interest, label: interest }))}
            />
            {/* Only read when the Other chip is ticked — otherwise it would send
                a free-text interest nobody asked for. */}
            <TextField
              name="customInterest"
              label="If you picked Other, what is it?"
              defaultValue={prefill.customInterest}
              placeholder="e.g. frequent flyers, corporate travel desks"
            />
          </div>
        </div>
      </Section>

      <Section title="Schedule and budget">
        {/* Dates, optional daily hours and budget type move together, so they
            live in one island. The unit is named on the budget field itself:
            without it this is a number box asking for money in a currency
            nobody states. We cannot print a symbol (see `formatAmount`), so we
            name the account's currency code when we know it. */}
        <MetaScheduleFields
          variant="google"
          budgetAmount={
            <NumberField name="budgetAmount" label="Budget" hint={budgetCurrencyNote(currency)} min={1} required />
          }
        />
      </Section>

      {/* "How much should it decide?" was here and is gone (2026-09-08).
          The same question is asked on the suggestion page, after the agent
          has drafted a plan — the only point where the answer means anything.
          `readGoogleAdsForm` defaults `automationMode` to "full" when the
          field is absent, which is now always. */}

      <LaunchButton />
    </form>
  );
}
