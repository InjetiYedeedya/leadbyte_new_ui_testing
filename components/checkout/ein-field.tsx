"use client";

/**
 * The one field on this form that earns `"use client"`.
 *
 * Every other field on `/checkout` is a plain `TextField` — a Server
 * Component, per this repo's own rule that a form field needs no JavaScript
 * to submit. This one needs it anyway: an EIN is typed as nine digits and
 * shown as `XX-XXXXXXX`, and inserting the dash while someone is still
 * typing is the one thing a Server Component genuinely cannot do.
 *
 * `formatEin` is the same pure function `checkout-form.test.ts` covers —
 * this component only wires it to an `onChange`.
 */

import { useState } from "react";
import { formatEin } from "@/lib/data/checkout-form";

const CONTROL =
  "w-full rounded-md border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent disabled:opacity-50";

export function EinField({ defaultValue = "" }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="ein" className="text-xs font-medium text-ink-soft">
        EIN
        <span className="ml-0.5 text-crit" aria-hidden="true">
          *
        </span>
      </label>
      <input
        id="ein"
        name="ein"
        required
        value={value}
        onChange={(event) => setValue(formatEin(event.target.value))}
        placeholder="12-3456789"
        inputMode="numeric"
        // Password/form-filler extensions stamp `fdprocessedid` onto inputs
        // before React hydrates — the same fix `TextField` already needed.
        suppressHydrationWarning
        className={`${CONTROL} border-border`}
      />
      <p className="text-xs text-ink-soft">
        US employer identification number, formatted XX-XXXXXXX.
      </p>
    </div>
  );
}
