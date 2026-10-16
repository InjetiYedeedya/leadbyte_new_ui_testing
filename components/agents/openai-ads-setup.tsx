import { EmailGateNotice } from "@/components/agents/email-gate-notice";
import { SetupWizard } from "@/components/agents/setup-wizard";
import { AdsDestinationFields } from "@/components/agents/ads-destination-fields";
import { ConversionEventsPicker } from "@/components/agents/conversion-events-picker";
import { OpenAiBiddingStep } from "@/components/agents/openai-bidding-step";
import type { ConversionEvent } from "@/lib/data/ads-types";
import { LocationPicker } from "@/components/agents/location-picker";
import { OpenAiBudgetFields } from "@/components/agents/openai-budget-fields";
import { CheckAllChips } from "@/components/agents/check-all-chips";
import {
  ADS_PLATFORMS,
  DESCRIPTION_MIN,
  LOCATION_PICKS_INPUT,
} from "@/lib/data/chatgpt-ads-setup";
import {
  budgetMinimum,
  formatBudget,
  normaliseCurrency,
} from "@/lib/data/openai-currency";
import {
  DateField,
  ProblemList,
  Section,
  TextAreaField,
  TextField,
} from "@/components/agents/setup-fields";

/**
 * The OpenAI Ads agent's setup form.
 *
 * A Server Component, one page of sections — the same shape as Google's and
 * Meta's, so the four ad agents read as one flow rather than four products.
 * The only client island inside it is the location control, which needs state
 * because each level of the cascade depends on the choice above it.
 *
 * ## What it asks that the others do not
 *
 * Eligible platforms, and a real date range. The other two derive the campaign
 * window from "run for N days"; this one takes the two dates, because that is
 * what the customer is choosing and turning it into a duration and back loses
 * a day at every rounding.
 *
 * ## What it does NOT ask
 *
 * No offer, age, gender or interest targeting. Those are Meta's and Google's
 * product vocabulary; this platform targets on TOPICS and nothing else, and
 * those are written by `generate` on the next screen rather than typed here.
 *
 * ## The three prefilled fields
 *
 * `brand_name`, `business_description` and `destination_url` are required by
 * the service and are filled in from the business profile and the website
 * analysis the app already holds. Prefilled, not hidden: they are handed to a
 * model that writes the advert, and a description the customer never saw
 * produces a campaign about a business they do not recognise.
 *
 * The bid is gone from this page. Whether one is wanted at all depends on the
 * bidding strategy, which is not known until `advise` answers — so it is asked
 * on the Review step, where the answer exists.
 */
export function OpenAiAdsSetupForm({
  action,
  problems,
  countries,
  today,
  brandName = "",
  businessDescription = "",
  destinationUrl = "",
  conversionEvents = null,
  conversionGoals = true,
  currency,
  emailConnected = true,
}: {
  action: (formData: FormData) => Promise<void>;
  problems: string[];
  /** From the business profile. Editable — see the note above. */
  brandName?: string;
  businessDescription?: string;
  destinationUrl?: string;
  /**
   * Read on the server. `null` means the read failed — NOT that the account
   * has none, which is a different sentence on screen.
   */
  conversionEvents?: ConversionEvent[] | null;
  /** Whether Leads and App installs are offered — only with a conversion event. */
  conversionGoals?: boolean;
  /** Country names, fetched on the server. Empty falls back to a text box. */
  countries: string[];
  /** `YYYY-MM-DD`, from the server — the earliest date a campaign may start. */
  today: string;
  /**
   * The ad account's currency, from `verify`. The budget is typed in it, so the
   * field names it and the floors ($25 daily / $100 lifetime on USD) are shown.
   * Defaults to USD when the account did not report one.
   */
  currency?: string;
  /** False with no connected mailbox — see `GoogleAdsSetup` for why. */
  emailConnected?: boolean;
}) {
  const money = normaliseCurrency(currency);
  const dailyMin = budgetMinimum(money, "daily");
  const lifetimeMin = budgetMinimum(money, "lifetime");
  // Only stated when the platform actually publishes a floor for this currency
  // — a guessed "minimum" would be worse than none.
  const minimums = {
    daily: dailyMin > 0 ? { amount: dailyMin, label: formatBudget(dailyMin, money) } : null,
    lifetime: lifetimeMin > 0 ? { amount: lifetimeMin, label: formatBudget(lifetimeMin, money) } : null,
  };

  if (!emailConnected) {
    return (
      <div>
        <EmailGateNotice agentName="OpenAI Ads" />
      </div>
    );
  }

  return (
    <form action={action}>
      <ProblemList problems={problems} />

      {/* One question at a time. The goal and its bidding first, then WHERE it
          runs, and only then what is being advertised — because "where the ads
          send people" has a different number of answers depending on the
          platforms, and asking it first meant asking for one URL and
          discovering a screen later that two more were needed. Every field
          stays mounted — see `SetupWizard` — so the form still posts as one
          submit and the server still reports every problem at once. */}
      <SetupWizard
        labels={["Goal and bidding", "Where it runs, and for how much", "What you're advertising"]}
        submitLabel="Launch this agent"
      >
        <Section title="What the campaign is for">
          {/* Goal, the objective it implies, the bid strategy and (only where
              the strategy needs one) the amount. One island, because each of
              those four depends on the one above it. */}
          <OpenAiBiddingStep conversionGoals={conversionGoals} />
        </Section>

        <div>
          <Section title="Where it should run">
            <CheckAllChips
              name="platforms"
              label="Eligible platforms"
              // Checkboxes, not radios: one campaign can be eligible on iOS and
              // Android at once, and forcing a single choice would mean running
              // two campaigns for one intention. "All" ticks the three at once.
              options={ADS_PLATFORMS.map((platform) => ({
                value: platform.id,
                label: platform.label,
              }))}
              // `web`, not `website` — the service's own value. Renaming the id
              // at the source rather than mapping it on the way out means there
              // is no second place for the two spellings to drift apart.
              defaultChecked={ADS_PLATFORMS.map((platform) => platform.id)}
            />
            {/* The same picker as Google and Meta: any mix of countries,
                states, cities and postcodes in one list. */}
            <LocationPicker name={LOCATION_PICKS_INPUT} countries={countries} />
          </Section>

          <Section title="Budget and schedule">
            <OpenAiBudgetFields currency={money} minimums={minimums} />

            <div className="grid gap-3 sm:grid-cols-2">
              {/* `min={today}` on both: the browser stops the obvious mistake,
                  and `validateAdsSetup` re-checks the ordering on the server,
                  because a date input is a suggestion and a form POST is not. */}
              <DateField name="startDate" label="Start date" min={today} required />
              <DateField name="endDate" label="End date" min={today} required />
            </div>
          </Section>
        </div>
        <Section title="What you're advertising">
          <TextField
            name="brandName"
            label="Business name"
            defaultValue={brandName}
            required
          />
          <TextAreaField
            name="businessDescription"
            label={`What the business does (at least ${DESCRIPTION_MIN} characters)`}
            defaultValue={businessDescription}
            placeholder="A sentence or two of prose. Keywords alone produce weak topics and weak copy."
            required
          />
          {/* One input per surface, decided by the platforms ticked on the
              step before this one. */}
          <AdsDestinationFields websiteUrl={destinationUrl} />
          {/* Beside the destinations rather than beside the goal: both answer
              "what happens after the click", and the conversions this account
              already has are a fact about the account, not about the
              objective. Offered on every goal. */}
          <ConversionEventsPicker events={conversionEvents} />
        </Section>

      </SetupWizard>
    </form>
  );
}
