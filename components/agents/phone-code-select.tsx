"use client";

import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { DIAL_COUNTRIES, dialCountry } from "@/lib/data/dial-codes";

/**
 * The country-code box beside a phone number, drawn compact ("IN +91") as the
 * design asks, while the list it opens still names every country in full.
 *
 * A native `<select>` cannot show one text closed and another open, so the
 * real select sits invisibly over a small label that mirrors its choice. That
 * mirror is the one piece of state here, and why this is a client component:
 * the select itself, its keyboard handling, its accessible name and the value
 * it posts are all still the browser's own.
 */
export function PhoneCodeSelect({
  name,
  defaultIso,
  label,
  required,
}: {
  name: string;
  /** ISO country to start on. */
  defaultIso: string;
  /** The phone field's label, for the select's accessible name. */
  label: string;
  required: boolean;
}) {
  const [iso, setIso] = useState(defaultIso);
  const chosen = dialCountry(iso);

  return (
    <div className="relative w-28 shrink-0 rounded-md border border-border bg-surface focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
      <span className="pointer-events-none flex h-full items-center justify-between gap-2 px-3 py-2 text-sm text-ink" aria-hidden="true">
        <span className={chosen ? "tabular-nums" : "text-ink-soft"}>
          {chosen ? `${chosen.iso} +${chosen.code}` : "Code"}
        </span>
        <CaretDown size={12} weight="fill" className="shrink-0 text-ink-soft" />
      </span>
      <select
        name={name}
        value={iso}
        onChange={(event) => setIso(event.target.value)}
        required={required}
        aria-label={`Country code for ${label}`}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      >
        <option value="">Country code</option>
        {DIAL_COUNTRIES.map((country) => (
          <option key={country.iso} value={country.iso}>
            {country.name} (+{country.code})
          </option>
        ))}
      </select>
    </div>
  );
}
