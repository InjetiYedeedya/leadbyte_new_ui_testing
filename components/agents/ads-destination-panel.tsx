import { SubmitButton } from "@/components/ui/submit-button";
import {
  destinationPrompts,
  needsDestinations,
  smartLink,
  smartLinkError,
  smartLinkFailed,
  unknownMissing,
} from "@/lib/data/ads-destination";
import type { GenerateDestination } from "@/lib/data/ads-types";

/**
 * Where the advert sends people — the one block on the Plan page about the
 * destination rather than the words.
 *
 * ## Why this is NOT a client island
 *
 * It has three states and renders one of them, and the only interaction is a
 * `<form action={serverAction}>` with text inputs in it. That is precisely
 * what a form is for, and `SubmitButton` already owns the pending state. The
 * rule in CLAUDE.md is that a component earns `"use client"` when a form POST
 * genuinely cannot express it; this one is expressed by a form POST.
 *
 * ## The four states
 *
 * - **Nothing to say** — one platform, so the campaign uses the URL the
 *   customer typed on the setup form. Rendering it back at them is noise, so
 *   this returns null.
 * - **Links needed** — the service could not find a store listing. One input
 *   per entry in `missing`, named with the brief's own field spellings.
 * - **Link ready** — a smart link exists, shown read-only. It is not editable
 *   because we did not mint it and cannot mint another: it is stored against
 *   its three destinations, and `create` reuses it so one campaign's reporting
 *   stays in one place.
 * - **Link could not be built** — the service had every destination it asked
 *   for, said it needed a device-aware link, and produced none. This state did
 *   not exist until 2026-09-22: `smartLink` fell back to `url`, so a failed
 *   mint rendered the WEBSITE under "one link for every platform" and read as
 *   a success. A failure that looks like a success is worse than no answer.
 */
export function AdsDestinationPanel({
  destination,
  supply,
}: {
  destination: GenerateDestination | undefined;
  supply: (formData: FormData) => Promise<void>;
}) {
  const prompts = destinationPrompts(destination);
  const unknown = unknownMissing(destination);
  const link = smartLink(destination);
  const failure = smartLinkError(destination);

  if (needsDestinations(destination)) {
    return (
      <section className="mt-4 rounded-lg border border-warn/30 bg-warn-soft p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-warn">
          Where should each platform send people?
        </h2>
        <p className="mt-2 text-sm text-ink">
          This campaign runs on more than one surface, so each needs its own destination. We could
          not find {prompts.length === 1 ? "one of them" : "all of them"} — add{" "}
          {prompts.length === 1 ? "it" : "them"} and the advert will be written again with the right
          link.
        </p>

        {destination?.warnings?.map((warning) => (
          <p key={warning} className="mt-2 text-sm text-ink-soft">
            {warning}
          </p>
        ))}

        <form action={supply} className="mt-4 space-y-4">
          {prompts.map((prompt) => (
            <label key={prompt.field} className="block">
              <span className="block text-sm font-medium text-ink">{prompt.label}</span>
              <span className="mt-0.5 block text-sm text-ink-soft">{prompt.hint}</span>
              <input
                type="url"
                name={prompt.field}
                placeholder={prompt.placeholder}
                required
                suppressHydrationWarning
                className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
              />
            </label>
          ))}

          {/* A name we have no wording for. Reported rather than rendered as an
              input captioned with a raw API field name, which would ask the
              customer to guess at our contract. */}
          {unknown.length > 0 && (
            <p className="text-sm text-ink-soft">
              The service also asked for {unknown.join(", ")}, which this screen cannot collect yet.
            </p>
          )}

          <SubmitButton
            pendingLabel="Building the link…"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface"
          >
            Save and rewrite the advert
          </SubmitButton>
          <p className="text-sm text-ink-soft">
            Nothing is created and nothing is charged — this rewrites the draft.
          </p>
        </form>
      </section>
    );
  }

  // Wanted a link, has none. Said plainly, with the service's own reason when
  // it gave one — the campaign still runs, it just sends everyone to the same
  // place.
  if (link === null) {
    if (!smartLinkFailed(destination)) return null;
    return (
      <section className="mt-4 rounded-lg border border-warn/30 bg-warn-soft p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-warn">
          The device-aware link could not be built
        </h2>
        <p className="mt-2 text-sm text-ink">
          This campaign runs on more than one surface and needs one link that sends each visitor to
          the right place. The service could not make it.
        </p>
        {failure && <p className="mt-2 text-sm text-ink-soft">{failure}</p>}
        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
          <Destination label="iPhone and iPad" value={destination?.ios_url} />
          <Destination label="Android" value={destination?.android_url} />
          <Destination label="Browser" value={destination?.web_url} />
        </dl>
        <p className="mt-3 text-sm text-ink-soft">
          You can still create the campaign — everyone will land on the same destination.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">
        Where the advert sends people
      </h2>
      <p className="mt-2 text-sm text-ink">
        One link for every platform — it sends each visitor to the right place.
      </p>
      <p className="mt-2 break-all font-mono text-sm text-ink">{link}</p>

      <dl className="mt-3 grid gap-2 sm:grid-cols-3">
        <Destination label="iPhone and iPad" value={destination?.ios_url} />
        <Destination label="Android" value={destination?.android_url} />
        <Destination label="Browser" value={destination?.web_url} />
      </dl>

      {destination?.reused && (
        <p className="mt-3 text-sm text-ink-soft">
          This link already existed and was used again, so every campaign pointing at it reports
          together.
        </p>
      )}
    </section>
  );
}

function Destination({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="break-all text-sm text-ink">{value}</dd>
    </div>
  );
}
