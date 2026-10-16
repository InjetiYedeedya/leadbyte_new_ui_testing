"use client";

/**
 * LinkedIn's targeting step (LINKEDIN_ADS_AGENT_SPEC §5.5): pick the criteria
 * as cards, then one block per chosen criterion with its quick picks and, where
 * the list is open, a box to add your own.
 *
 * ## Why this earns `"use client"`
 *
 * Which blocks show depends on the cards picked a moment ago, in the ORDER they
 * were picked (Member interests always last), and typing a value turns it into
 * a chip — state and handlers a form post cannot express.
 *
 * Still plain form fields: `criteria` posts from hidden inputs in the order
 * the cards were PICKED (the checkboxes themselves post nothing — they would
 * post in the cards' fixed order, and the order is what decides the blocks'),
 * and every ticked chip posts under `targeting_<criterion>`. A criterion's
 * block is unmounted when its card is turned off, so its chips never post —
 * but its values are held HERE, so turning the card back on brings back what
 * was typed and ticked (2026-10-08). "None" clears them, being a reset. `readLinkedInAdsForm` re-checks it
 * all — Member interests forced on, fixed lists held to their own options.
 *
 * "None" is a reset, not a choice, as in the live app: it clears every
 * criterion except Member interests, which cannot be turned off.
 */

import { useState } from "react";
import {
  Factory,
  GraduationCap,
  IdentificationBadge,
  Minus,
  Star,
  UsersThree,
  Wrench,
  type Icon,
} from "@phosphor-icons/react";
import {
  ALWAYS_ON_CRITERION,
  CRITERIA,
  MAX_TARGETING_VALUE_LENGTH,
  MAX_TARGETING_VALUES,
  targetingField,
  type CriterionId,
} from "@/lib/data/linkedin-ads-setup";

const ICONS: Record<CriterionId, Icon> = {
  industries: Factory,
  size: UsersThree,
  titles: IdentificationBadge,
  skills: Wrench,
  education: GraduationCap,
  interests: Star,
};

const CARD =
  "flex min-h-24 flex-col items-start gap-2 rounded-lg border p-4 text-left text-sm font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent";
const CARD_OFF = "cursor-pointer border-border bg-surface text-ink hover:border-accent/40 hover:bg-surface-raised";
const CARD_ON = "border-accent bg-accent-soft/60 text-accent-ink";

const CHIP =
  "cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent border-border bg-surface text-ink-soft hover:bg-surface-raised has-[:checked]:border-accent has-[:checked]:bg-accent-soft/60 has-[:checked]:font-medium has-[:checked]:text-accent-ink";

export function LinkedInTargeting({
  initialCriteria = [],
  initialValues = {},
}: {
  /** The answers the form was sent back with, in the order they were picked. */
  initialCriteria?: readonly CriterionId[];
  initialValues?: Partial<Record<CriterionId, readonly string[]>>;
} = {}) {
  // Optional criteria, in the order they were turned on.
  const [chosen, setChosen] = useState<CriterionId[]>(() =>
    initialCriteria.filter((id) => id !== ALWAYS_ON_CRITERION),
  );
  // Every criterion's values, kept while its block is off.
  const [values, setValues] = useState<Partial<Record<CriterionId, CriterionValues>>>(() =>
    seedValues(initialValues),
  );
  const blocks: CriterionId[] = [...chosen, ALWAYS_ON_CRITERION];

  function toggle(id: CriterionId) {
    setChosen((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
    );
  }

  return (
    <div>
      <p className="text-sm text-ink-soft">
        Choose which criteria to use for targeting. Member interests is always included.
      </p>

      <div
        role="group"
        aria-label="Targeting criteria"
        className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
        {CRITERIA.map((criterion) => {
          const Icon = ICONS[criterion.id];
          const locked = criterion.id === ALWAYS_ON_CRITERION;
          const on = locked || chosen.includes(criterion.id);
          return (
            <label key={criterion.id} className={`${CARD} ${on ? CARD_ON : CARD_OFF} ${locked ? "cursor-default" : ""}`}>
              {/* Member interests posts nothing of its own: it cannot be
                  turned off, and the server adds it regardless. */}
              <input
                type="checkbox"
                value={criterion.id}
                checked={on}
                disabled={locked}
                onChange={() => toggle(criterion.id)}
                className="sr-only"
              />
              <Icon size={22} weight={on ? "fill" : "regular"} aria-hidden="true" />
              <span>
                {criterion.label}
                {locked && (
                  <span className="mt-0.5 block text-xs font-normal text-ink-soft">Mandatory</span>
                )}
              </span>
            </label>
          );
        })}

        {/* A reset, so a button — it is never "selected". */}
        <button
          type="button"
          onClick={() => {
            setChosen([]);
            setValues({});
          }}
          className={`${CARD} ${CARD_OFF} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
        >
          <Minus size={22} aria-hidden="true" />
          <span>
            None
            <span className="mt-0.5 block text-xs font-normal text-ink-soft">
              Member interests only
            </span>
          </span>
        </button>
      </div>

      <p className="mt-3 flex items-center gap-2 rounded-md bg-accent-soft/60 px-4 py-3 text-sm font-medium text-accent-ink">
        <Star size={16} weight="fill" aria-hidden="true" />
        Member interests is mandatory for all LinkedIn campaigns.
      </p>

      {/* The picked order — see the note at the top. Member interests is
          added on the server. */}
      {chosen.map((id) => (
        <input key={id} type="hidden" name="criteria" value={id} />
      ))}

      <div className="mt-4 flex flex-col gap-5">
        {blocks.map((id) => (
          <CriterionBlock
            key={id}
            id={id}
            values={values[id] ?? EMPTY_VALUES}
            onChange={(next) => setValues((current) => ({ ...current, [id]: next }))}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * One criterion's values: its quick picks as chips, plus anything typed, which
 * becomes a chip of its own. Typing a quick pick's name ticks that chip rather
 * than adding a second one.
 */
interface CriterionValues {
  /** Typed values that are not quick picks. */
  added: string[];
  ticked: string[];
}

const EMPTY_VALUES: CriterionValues = { added: [], ticked: [] };

/** Posted values back as ticked chips; anything not a quick pick was typed. */
function seedValues(
  initial: Partial<Record<CriterionId, readonly string[]>>,
): Partial<Record<CriterionId, CriterionValues>> {
  const out: Partial<Record<CriterionId, CriterionValues>> = {};
  for (const [id, list] of Object.entries(initial) as [CriterionId, readonly string[]][]) {
    const presets: readonly string[] = CRITERIA.find((c) => c.id === id)?.presets ?? [];
    out[id] = { ticked: [...list], added: list.filter((value) => !presets.includes(value)) };
  }
  return out;
}

function CriterionBlock({
  id,
  values,
  onChange,
}: {
  id: CriterionId;
  values: CriterionValues;
  onChange: (next: CriterionValues) => void;
}) {
  const criterion = CRITERIA.find((c) => c.id === id);
  const presets: readonly string[] = criterion?.presets ?? [];
  const { added, ticked } = values;
  const [draft, setDraft] = useState("");
  if (!criterion) return null;

  const Icon = ICONS[id];
  const options = [...presets, ...added];
  const full = ticked.length >= MAX_TARGETING_VALUES;
  const headingId = `targeting-${id}-heading`;

  function toggle(value: string) {
    const next = ticked.includes(value)
      ? ticked.filter((v) => v !== value)
      : full
        ? ticked
        : [...ticked, value];
    onChange({ added, ticked: next });
  }

  function commit() {
    // Commas separate several at once ("CEO, Founder").
    const typed = draft
      .split(",")
      .map((part) => part.trim().slice(0, MAX_TARGETING_VALUE_LENGTH))
      .filter(Boolean);
    setDraft("");
    if (typed.length === 0) return;

    const nextAdded = [...added];
    const nextTicked = [...ticked];
    for (const value of typed) {
      const existing = [...presets, ...nextAdded].find((o) => o.toLowerCase() === value.toLowerCase());
      const name = existing ?? value;
      if (!existing) nextAdded.push(value);
      if (!nextTicked.includes(name) && nextTicked.length < MAX_TARGETING_VALUES) nextTicked.push(name);
    }
    onChange({ added: nextAdded, ticked: nextTicked });
  }

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Icon size={16} weight="fill" aria-hidden="true" />
        {criterion.label}
        {id === ALWAYS_ON_CRITERION && (
          <span className="text-xs font-normal text-ink-soft">Mandatory</span>
        )}
      </h3>

      {options.length > 0 && (
        <div role="group" aria-labelledby={headingId} className="mt-2 flex flex-wrap gap-2">
          {options.map((value) => (
            <label key={value} className={CHIP}>
              <input
                type="checkbox"
                name={targetingField(id)}
                value={value}
                checked={ticked.includes(value)}
                onChange={() => toggle(value)}
                className="sr-only"
              />
              {value}
            </label>
          ))}
        </div>
      )}

      {criterion.freeText && (
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter adds the value here; it must not submit the whole form.
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commit();
            }
          }}
          // Text typed and left would otherwise be lost on submit.
          onBlur={commit}
          placeholder={criterion.placeholder}
          aria-label={`Add ${criterion.label.toLowerCase()}`}
          disabled={full}
          className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft disabled:opacity-60"
        />
      )}
      {full && (
        <p className="mt-1 text-xs text-ink-soft">
          That&apos;s the most this criterion can take ({MAX_TARGETING_VALUES}).
        </p>
      )}
    </section>
  );
}
