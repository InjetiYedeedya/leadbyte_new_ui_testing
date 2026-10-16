"use client";

/**
 * The ad setup forms' age bands, with "All" that means all.
 *
 * ## Why this earns `"use client"`
 *
 * Ticking "All" left the bands as they were, so the form showed "All" beside
 * three hand-picked bands and read as two answers at once. Keeping the boxes
 * in step — All ticks every band, unticking a band unticks All, ticking the
 * last band ticks All — is an event handler a form post cannot express.
 *
 * The boxes stay UNCONTROLLED (`defaultChecked`), and the handler sets
 * `checked` on its siblings directly. `form-draft.tsx` restores saved answers
 * by setting `checked` itself, which React state would not see; with the DOM
 * as the only source of truth both can touch the boxes without disagreeing.
 *
 * What is posted needs no translation: every reader treats an "All" in the
 * list as all ages (`readMetaAdsForm`, `readGoogleAdsForm`).
 */

import { useRef } from "react";

const ALL = "All";

const CHIP =
  "cursor-pointer rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink hover:bg-surface-raised";

export function AgeRangeChips({
  name = "ages",
  label = "Age",
  ages,
  defaultChecked,
}: {
  name?: string;
  label?: string;
  /** Every band, "All" first. */
  ages: readonly string[];
  /** What starts ticked. "All" in it ticks every band. */
  defaultChecked: readonly string[];
}) {
  const group = useRef<HTMLDivElement>(null);
  const everything = defaultChecked.includes(ALL);

  function boxes(): HTMLInputElement[] {
    return Array.from(group.current?.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`) ?? []);
  }

  function onChange(event: React.ChangeEvent<HTMLDivElement>) {
    const changed = event.target as unknown as HTMLInputElement;
    if (changed.name !== name) return;
    const all = boxes();
    const allBox = all.find((box) => box.value === ALL);
    const bands = all.filter((box) => box.value !== ALL);

    if (changed.value === ALL) {
      for (const box of bands) box.checked = changed.checked;
      return;
    }
    if (allBox) allBox.checked = bands.length > 0 && bands.every((box) => box.checked);
  }

  return (
    <div className="mb-3">
      <span id={`${name}-label`} className="mb-1 block text-sm text-ink">
        {label}
      </span>
      <div
        ref={group}
        role="group"
        aria-labelledby={`${name}-label`}
        onChange={onChange}
        className="flex flex-wrap gap-2"
      >
        {ages.map((age) => (
          <label key={age} className={CHIP}>
            <input
              type="checkbox"
              name={name}
              value={age}
              defaultChecked={everything || defaultChecked.includes(age)}
              suppressHydrationWarning
              className="mr-2 accent-accent"
            />
            {age}
          </label>
        ))}
      </div>
    </div>
  );
}
