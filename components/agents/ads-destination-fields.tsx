"use client";

/**
 * "Where the ads send people" — one input per platform the campaign runs on.
 *
 * This replaced a single "Where the ads send people" box that was asked BEFORE
 * the platforms were. One URL is the right question only for a one-surface
 * campaign; tick Web and iOS and it is two, and the second was discovered a
 * screen later when `generate` came back asking for the App Store link. The
 * platforms are now chosen one step earlier, so the right question is knowable
 * at the moment it is asked.
 *
 * ## Why this is a client island
 *
 * Which inputs exist depends on checkboxes ticked a moment ago, in a different
 * step of the same form. No server render can anticipate that, and a form POST
 * cannot express it either — the fields have to appear and disappear as the
 * ticks change.
 *
 * ## Why it reads the DOM rather than owning the checkboxes
 *
 * `SetupWizard` keeps every step MOUNTED (hidden, not unmounted) so the whole
 * form still posts as one submit. So the platform checkboxes are always in the
 * DOM, in the same form, and reading them there is what keeps the chip group a
 * plain server-rendered control. Lifting them into React state to share it
 * would turn one shared component into a second, platform-specific copy — and
 * the two would drift.
 *
 * The listener is on the FORM, not on the individual boxes: the chip group can
 * re-render and the subscription survives it.
 */

import { useEffect, useRef, useState } from "react";
import {
  DESTINATION_FIELDS,
  destinationFieldsFor,
  destinationPrompt,
  type DestinationField,
} from "@/lib/data/ads-destination";
import type { AdsPlatform } from "@/lib/data/ads-types";

/** The platforms currently ticked, read straight out of the form. */
function checkedPlatforms(form: HTMLFormElement): AdsPlatform[] {
  return Array.from(
    form.querySelectorAll<HTMLInputElement>('input[name="platforms"]:checked'),
  ).map((input) => input.value as AdsPlatform);
}

export function AdsDestinationFields({ websiteUrl = "" }: { websiteUrl?: string }) {
  const anchor = useRef<HTMLDivElement>(null);
  // Every field, until the first read. The form is server-rendered and this
  // effect runs after hydration, so starting from "none" would flash an empty
  // section on every load — and starting from ALL of them means a reader with
  // no JavaScript still sees the three inputs rather than none at all.
  const [fields, setFields] = useState<DestinationField[]>([...DESTINATION_FIELDS]);

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const read = () => setFields(destinationFieldsFor(checkedPlatforms(form)));
    read();
    form.addEventListener("change", read);
    return () => form.removeEventListener("change", read);
  }, []);

  return (
    <div ref={anchor}>
      {fields.length === 0 ? (
        <p className="mb-5 text-sm text-ink-soft">
          Choose at least one platform on the previous step and we&rsquo;ll ask where it should send
          people.
        </p>
      ) : (
        <>
          {fields.length > 1 && (
            <p className="mb-3 text-sm text-ink-soft">
              This campaign runs on more than one surface, so each needs its own destination. We
              build a single link from them that sends every visitor to the right one.
            </p>
          )}
          {fields.map((field) => {
            const prompt = destinationPrompt(field);
            return (
              <label key={field} className="mb-5 block">
                <span className="block text-sm font-medium text-ink">{prompt.label}</span>
                <span className="mt-0.5 block text-sm text-ink-soft">{prompt.hint}</span>
                <input
                  type="url"
                  name={field}
                  // Only the website is prefilled — it is the one destination
                  // the app already knows. A store listing we do not have is a
                  // blank the customer fills in, never a guess.
                  defaultValue={field === "destination_url" ? websiteUrl : undefined}
                  placeholder={prompt.placeholder}
                  required
                  suppressHydrationWarning
                  className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-ink"
                />
              </label>
            );
          })}
        </>
      )}
    </div>
  );
}
