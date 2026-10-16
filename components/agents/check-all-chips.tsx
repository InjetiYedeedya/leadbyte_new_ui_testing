"use client";

/**
 * A row of checkbox chips with "All" in front, kept in step with the rest:
 * ticking All ticks every option, unticking one unticks All, and ticking the
 * last one ticks All again. Used for the OpenAI form's eligible platforms.
 *
 * ## Why this earns `"use client"`
 *
 * Keeping the boxes in step is an event handler a form post cannot express —
 * the same reason as `AgeRangeChips`.
 *
 * The boxes stay UNCONTROLLED and the handler sets `checked` on its siblings,
 * so `form-draft.tsx` can restore saved answers by setting `checked` itself
 * without React state disagreeing. The All box has NO `name`, so it is never
 * posted: the server only ever sees the real options, and needs no rule for
 * what "All" means.
 */

import { useRef } from "react";

const CHIP =
  "cursor-pointer rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink hover:bg-surface-raised";

export function CheckAllChips({
  name,
  label,
  options,
  defaultChecked,
  allLabel = "All",
}: {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  defaultChecked: readonly string[];
  allLabel?: string;
}) {
  const group = useRef<HTMLDivElement>(null);
  const allBox = useRef<HTMLInputElement>(null);
  const startsAll = options.length > 0 && options.every((o) => defaultChecked.includes(o.value));

  function boxes(): HTMLInputElement[] {
    return Array.from(group.current?.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`) ?? []);
  }

  function onChange(event: React.ChangeEvent<HTMLDivElement>) {
    const changed = event.target as unknown as HTMLInputElement;
    if (changed === allBox.current) {
      for (const box of boxes()) box.checked = changed.checked;
      return;
    }
    if (changed.name !== name || !allBox.current) return;
    const all = boxes();
    allBox.current.checked = all.length > 0 && all.every((box) => box.checked);
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
        <label className={CHIP}>
          <input
            ref={allBox}
            type="checkbox"
            defaultChecked={startsAll}
            suppressHydrationWarning
            className="mr-2 accent-accent"
          />
          {allLabel}
        </label>
        {options.map((option) => (
          <label key={option.value} className={CHIP}>
            <input
              type="checkbox"
              name={name}
              value={option.value}
              defaultChecked={defaultChecked.includes(option.value)}
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
