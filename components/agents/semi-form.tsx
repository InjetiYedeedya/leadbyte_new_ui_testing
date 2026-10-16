import { FormPendingOverlay } from "@/components/ui/form-pending-overlay";
import type { CreativeField } from "@/lib/data/ads-creatives";
import {
  DIAL_SUFFIX,
  SEMI_FIELD_PREFIX,
  SEMI_AGE_BANDS,
  dateRangeFields,
  isAgeField,
  isLocationField,
  isPhoneField,
  isUrlField,
  type SemiField,
} from "@/lib/data/semi-form";
import { SemiDateRange } from "@/components/agents/semi-date-range";
import { ProblemList } from "@/components/agents/setup-fields";
import { LocationPicker } from "@/components/agents/location-picker";
import { AgeRangeChips } from "@/components/agents/age-range-chips";
import { PICKS_SUFFIX, levelsFromOptions, type LocationPick } from "@/lib/data/location-picks";
import { SelectionModeGate } from "@/components/agents/selection-mode-gate";
import { SubmitButton } from "@/components/ui/submit-button";
import { BackLink } from "@/components/ui/back-link";
import { splitInternational } from "@/lib/data/dial-codes";
import { PhoneCodeSelect } from "@/components/agents/phone-code-select";

/** The country code a phone number starts on (2026-10-09 design). */
const DEFAULT_DIAL_ISO = "IN";

/**
 * The extra fields the semi flow asked for, plus the creative.
 *
 * A Server Component: the field list is decided by the agent and arrives as a
 * prop, and a `<form action={serverAction}>` posts it back. Nothing here needs
 * client state.
 *
 * Every field is rendered from the schema rather than hand-written, because the
 * schema is the agent's to change — one campaign goal asks for eleven fields,
 * the app-promotion goal asks for App Store, App URL and App ID instead. A
 * hand-written form would silently stop matching the first time that happened.
 *
 * Inputs are named `field:<label>` so a label containing brackets or a slash
 * cannot collide with our own inputs; `readSemiAnswers` strips the prefix.
 */

const INPUT = "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink";

function Required() {
  return <span className="text-crit"> *</span>;
}

/**
 * The bands an age question starts on: its earlier answer where that names
 * bands, else "All" — as Meta's does. A typed value the agent pre-filled
 * ("20 to 45") names none, and would otherwise start with nothing ticked.
 */
function ageDefaults(value: string): string[] {
  const bands = value
    .split(",")
    .map((band) => band.trim())
    .filter((band) => (SEMI_AGE_BANDS as readonly string[]).includes(band));
  return bands.length > 0 ? bands : ["All"];
}

export function SemiForm({
  action,
  fields,
  creatives,
  countries,
  askSelectionMode,
  initialPicks = [],
  backHref,
}: {
  /** The step before this one, for Back when there is no history to use. */
  backHref: string;
  action: (formData: FormData) => Promise<void>;
  /**
   * Full automation only. In semi the customer supplies the creative and
   * budget themselves, so "may the agent pick them for you?" has nothing to
   * decide; the submit goes straight through and `readSelectionMode` reads the
   * missing answer as "ask".
   */
  askSelectionMode: boolean;
  /**
   * Where the location picker starts: what was submitted last time when the
   * form came back with problems, else the setup form's picks (Google), else
   * nothing. Other fields restore through their `defaultValue`.
   */
  initialPicks?: LocationPick[];
  fields: SemiField[];
  creatives: CreativeField[];
  /** Country names for the location field; empty falls back to a text box. */
  countries: string[];
}) {
  // The start and end dates render as one pair where the end cannot come
  // before the start (`semi-date-range.tsx`); the pair sits where the start
  // date is, and the end date's own slot is skipped.
  const { start, end } = dateRangeFields(fields);
  const paired = start !== null && end !== null;

  return (
    <form action={action} className="relative max-w-2xl rounded-lg border border-border bg-surface p-4">
      {/* The wait shows on this card, not as a frozen page (2026-10-06). */}
      <FormPendingOverlay
        title="Saving your campaign details…"
        detail="This can take a few seconds. Please keep this page open."
      />
      <h2 className="text-base font-bold text-ink">Complete campaign details</h2>
      <p className="mt-0.5 text-sm text-ink-soft">
        Please fill in the following information to finalise your campaign setup.
      </p>

      <div className="mt-5">
        {/* Problems are reported by `CampaignFrame`, above the step
            title — every one at once, before the fields, rather than
            halfway down a long form. */}
      </div>

      {fields.map((field, index) => {
        const name = `${SEMI_FIELD_PREFIX}${field.label}`;
        if (paired && field === end) return null;
        if (paired && field === start) {
          return (
            <SemiDateRange
              key={field.label}
              start={start}
              end={end}
              startName={name}
              endName={`${SEMI_FIELD_PREFIX}${end.label}`}
            />
          );
        }
        if (isAgeField(field)) {
          // The same age ticks as Meta's setup form, not a typed box
          // (2026-10-08). Each tick posts under the field's name and
          // `readSemiAnswers` reads them back as one line. Starts on "All",
          // as Meta's does, unless an earlier answer says otherwise.
          return (
            <div key={field.label} className="mb-5">
              <AgeRangeChips
                name={name}
                label={field.label}
                ages={SEMI_AGE_BANDS}
                defaultChecked={ageDefaults(field.defaultValue)}
              />
            </div>
          );
        }
        if (isLocationField(field)) {
          // Every place the campaign runs, at any mix of the levels the agent
          // offers (2026-10-01). Posted as one list under `<label>_picks`.
          return (
            <div key={field.label} className="mb-5">
              <LocationPicker
                name={`${name}${PICKS_SUFFIX}`}
                countries={countries}
                levels={levelsFromOptions(field.options)}
                initialPicks={initialPicks}
                required={field.required}
              />
            </div>
          );
        }

        // A phone number: the country code first, then the number. Two
        // controls, so not one <label> around both — the heading names the
        // number box, and the picker carries its own accessible name.
        if (isPhoneField(field)) {
          const { iso, national } = splitInternational(field.defaultValue);
          const inputId = `phone-${index}`;
          return (
            <div key={field.label} className="mb-5">
              <label htmlFor={inputId} className="mb-1 block text-sm text-ink">
                {field.label}
                {field.required && <Required />}
              </label>
              <div className="flex gap-2">
                {/* Starts on India, as the design shows, unless the number
                    already carries its own code. Still changeable, and still
                    required with the number. */}
                <PhoneCodeSelect
                  name={`${name}${DIAL_SUFFIX}`}
                  defaultIso={iso || DEFAULT_DIAL_ISO}
                  label={field.label}
                  required={field.required}
                />
                <input
                  id={inputId}
                  name={name}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  defaultValue={national}
                  placeholder={field.placeholder || "Enter phone number"}
                  required={field.required}
                  suppressHydrationWarning
                  className={`${INPUT} min-w-0 flex-1`}
                />
              </div>
            </div>
          );
        }

        return (
          <label key={field.label} className="mb-5 block">
            <span className="mb-1 block text-sm text-ink">
              {field.label}
              {field.required && <Required />}
            </span>

            {field.type === "dropdown" ? (
              <select
                name={name}
                defaultValue={field.defaultValue}
                required={field.required}
                suppressHydrationWarning
                className={INPUT}
              >
                {/* No blank option when the agent gave a default — it chose one
                    for a reason (Status defaults to PAUSED, so a campaign
                    spends nothing until someone looks at it). */}
                {field.defaultValue === "" && (
                  <option value="">{field.placeholder || "Select an option"}</option>
                )}
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : field.type === "textarea" ? (
              <textarea
                name={name}
                rows={4}
                defaultValue={field.defaultValue}
                placeholder={field.placeholder}
                required={field.required}
                suppressHydrationWarning
                className={INPUT}
              />
            ) : (
              <input
                name={name}
                // A website field stays `type="text"`: the browser's own url
                // check refuses `example.com`, which `readSemiAnswers` turns
                // into `https://example.com` anyway. The keyboard is still the
                // url one.
                type={
                  field.type === "number"
                    ? "number"
                    : field.type === "date"
                      ? "date"
                      : isPhoneField(field)
                        ? "tel"
                        : "text"
                }
                inputMode={isUrlField(field) ? "url" : isPhoneField(field) ? "tel" : undefined}
                autoComplete={isUrlField(field) ? "url" : isPhoneField(field) ? "tel" : undefined}
                defaultValue={field.defaultValue}
                placeholder={field.placeholder}
                required={field.required}
                suppressHydrationWarning
                className={INPUT}
              />
            )}
          </label>
        );
      })}

      {creatives.length > 0 && (
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="mb-3 text-sm font-bold text-ink">Your creative</h3>
          {creatives.map((field) => (
            <label key={field.name} className="mb-4 block">
              <span className="mb-1 block text-sm text-ink">
                {field.label}
                {field.required && <Required />}
                <span className="block text-xs text-ink-soft">{field.hint}</span>
              </span>
              <input
                type="file"
                name={field.name}
                accept={field.accept}
                required={field.required}
                suppressHydrationWarning
                className={`${INPUT} file:mr-3 file:rounded file:border-0 file:bg-surface-raised file:px-3 file:py-1 file:text-sm file:text-ink`}
              />
            </label>
          ))}
        </div>
      )}

      {/* Back on the left, the submit on the right (2026-10-01): the only way
          back was the small link above the step rail, a long scroll up. */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <BackLink fallbackHref={backHref} />
        {/* Full automation: the last question, on the last form: every detail of the campaign
            is filled in by this point, so this is where "how much may the
            agent decide for itself" is finally asked — immediately before the
            campaign is built, not three screens earlier when there was still
            nothing to decide about. */}
        {askSelectionMode ? (
          <SelectionModeGate label="Submit campaign details" />
        ) : (
          <SubmitButton
            // Neutral: for Google and Meta this goes on to the automation
            // step, and only semi on the other platforms launches from here.
            pendingLabel="Submitting…"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink disabled:opacity-50"
          >
            Submit campaign details
          </SubmitButton>
        )}
      </div>
    </form>
  );
}
