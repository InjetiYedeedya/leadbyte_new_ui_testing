/**
 * Form primitives for the agent setup forms.
 *
 * Server Components, no state, no `"use client"` — a `<form action={…}>` posts
 * once and needs none of it. They exist because three ad wizards ask the same
 * kinds of question (a text field, a chip group, a select) and the alternative
 * was the same 250 lines of Tailwind three times, where the third copy is where
 * the typo lives.
 *
 * `google-ads-setup.tsx` predates these and still spells its fields out. That
 * is duplication worth removing, and it is deliberately not being removed in
 * the same change that adds two new forms — the working one stays untouched
 * until the new ones are verified.
 */

import { BackLink } from "@/components/ui/back-link";
import { FlashNotice } from "@/components/ui/flash-notice";
import { SubmitButton } from "@/components/ui/submit-button";

const INPUT =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink";
const CHIP =
  "cursor-pointer rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink hover:bg-surface-raised";

/**
 * The problems a form is reporting, under a heading that says which form.
 *
 * `heading` is a prop because this component is shared by six forms and only
 * three of them are campaigns. It hardcoded "This campaign isn't ready to
 * launch" — so validating an API KEY and saving a business PROFILE both
 * announced a campaign problem, naming a step the customer was not on and a
 * failure that had not happened. The default stays the campaign wording, since
 * that is what most callers are.
 */
export function ProblemList({
  problems,
  heading = "This campaign isn't ready to launch:",
}: {
  problems: string[];
  heading?: string;
}) {
  if (problems.length === 0) return null;

  return (
    <FlashNotice role="alert" clear={["problems", "problem"]} className="mb-6 rounded-lg bg-crit-soft px-4 py-3 text-sm text-crit">
      <p className="font-medium">{heading}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </FlashNotice>
  );
}

/**
 * A group of fields, as a card.
 *
 * It was a bare `fieldset` with a small `legend`, so six groups ran together
 * as one undifferentiated column of inputs — which is what made a long setup
 * feel longer than it is. Giving each group an edge lets the eye find the
 * group it wants instead of reading every label on the way down.
 *
 * Still a real `fieldset`/`legend`: the grouping is semantic and a screen
 * reader announces which group a field belongs to. The card is how it looks,
 * not what it is.
 */
export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="mb-5 rounded-lg border border-border bg-surface p-4">
      {/* Floated so it sits INSIDE the card. A plain <legend> is drawn on the
          fieldset's border line, so half the title hung outside the white
          card over the page's background photo and could not be read
          (reported 2026-09-27). `float` takes it off the border; `clear` on
          the body keeps the fields below it. Still a real legend, so screen
          readers announce each group by its title. */}
      <legend className="float-left mb-3 w-full p-0 text-base font-semibold text-ink">
        {title}
      </legend>
      <div className="clear-left space-y-3">{children}</div>
    </fieldset>
  );
}

export function TextField({
  name,
  label,
  defaultValue,
  placeholder,
  required,
  hint,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm text-ink">
        {label}
        {hint && <span className="text-ink-soft"> {hint}</span>}
      </span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        suppressHydrationWarning
        className={INPUT}
      />
    </label>
  );
}

/**
 * A calendar date.
 *
 * Its own primitive rather than a `type` prop on `TextField`, because a date
 * input is not a text input wearing a different hat: it needs `min`/`max` to
 * be dates, it submits `YYYY-MM-DD` regardless of how the browser displays it,
 * and giving `TextField` a `type` would invite `type="number"` beside the
 * `NumberField` that already exists.
 *
 * The submitted format is what `readOpenAiAdsForm` compares as strings — exact
 * for `YYYY-MM-DD`, and no timezone to get wrong.
 */
export function DateField({
  name,
  label,
  defaultValue,
  min,
  required,
  hint,
}: {
  name: string;
  label: string;
  /** `YYYY-MM-DD`. */
  defaultValue?: string;
  /** `YYYY-MM-DD`. Stops a campaign being scheduled into the past. */
  min?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm text-ink">
        {label}
        {hint && <span className="text-ink-soft"> {hint}</span>}
      </span>
      <input
        type="date"
        name={name}
        defaultValue={defaultValue}
        min={min}
        required={required}
        suppressHydrationWarning
        className={INPUT}
      />
    </label>
  );
}

export function NumberField({
  name,
  label,
  defaultValue,
  min,
  max,
  required,
  hint,
  step,
}: {
  name: string;
  label: string;
  defaultValue?: number;
  min?: number;
  max?: number;
  required?: boolean;
  /** Said beside the label, the way `TextField` and `SelectField` do it. */
  hint?: string;
  /**
   * Defaults to whole units, which is right for a budget and wrong for a bid:
   * money under ten is meaningful to two decimals, and a step of 1 silently
   * refuses 0.38. Same reason `formatMoney` keeps decimals below ten.
   */
  step?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-ink">
        {label}
        {hint && <span className="text-ink-soft"> {hint}</span>}
      </span>
      <input
        name={name}
        type="number"
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={step}
        required={required}
        suppressHydrationWarning
        className={INPUT}
      />
    </label>
  );
}

export function TextAreaField({
  name,
  label,
  placeholder,
  required,
  defaultValue,
}: {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  /** Prefilled from what the backend already knows, and editable. */
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-ink">{label}</span>
      <textarea
        name={name}
        rows={3}
        placeholder={placeholder}
        required={required}
        defaultValue={defaultValue}
        suppressHydrationWarning
        className={INPUT}
      />
    </label>
  );
}

export function SelectField({
  name,
  label,
  defaultValue,
  options,
  groups,
  emptyLabel,
  hint,
  capitalize,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options?: readonly { value: string; label: string }[];
  /** Grouped options, when the choice only makes sense under a parent. */
  groups?: readonly { label: string; options: readonly string[] }[];
  emptyLabel?: string;
  hint?: string;
  /**
   * For option lists that are lower-case tokens (`daily`, `male`) rather than
   * written labels. Applied blanket, it turned "Choose a format" into "Choose A
   * Format" and "Lead generation" into "Lead Generation" — CSS title-casing
   * prose that was already correct.
   */
  capitalize?: boolean;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm text-ink">
        {label}
        {hint && <span className="text-ink-soft"> {hint}</span>}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        suppressHydrationWarning
        className={capitalize ? `${INPUT} capitalize` : INPUT}
      >
        {emptyLabel && <option value="">{emptyLabel}</option>}
        {options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {groups?.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={`${group.label}-${option}`} value={option}>
                {option}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

/** One choice from a few — radios styled as chips, so no JS is needed. */
export function ChipGroup({
  name,
  label,
  options,
  defaultValue,
  multiple,
  defaultChecked,
}: {
  name: string;
  label?: string;
  options: readonly { value: string; label: string; disabled?: boolean }[];
  defaultValue?: string;
  /** Checkboxes instead of radios, for "any of these". */
  multiple?: boolean;
  defaultChecked?: readonly string[];
}) {
  return (
    <div className="mb-3">
      {label && <span className="mb-1 block text-sm text-ink">{label}</span>}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.value} className={CHIP}>
            <input
              type={multiple ? "checkbox" : "radio"}
              name={name}
              value={option.value}
              defaultChecked={
                multiple ? defaultChecked?.includes(option.value) : option.value === defaultValue
              }
              disabled={option.disabled}
              suppressHydrationWarning
              className="mr-2 accent-accent"
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * The setup form's last row: Back on the left, the launch on the right
 * (2026-10-01 — the forms had only the page's "← Agents" at the very top, a
 * long scroll away from where the customer finishes). They wrap on a phone.
 */
export function LaunchButton({
  label = "Launch this agent",
  backHref = "/agents",
}: {
  label?: string;
  /** Where Back goes when there is no earlier page of ours in this tab. */
  backHref?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <BackLink fallbackHref={backHref} />
      <SubmitButton
        pendingLabel="Asking the agent…"
        className="min-h-11 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
      >
        {label}
      </SubmitButton>
    </div>
  );
}
