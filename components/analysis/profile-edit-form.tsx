import Link from "@/components/ui/app-link";
import { SubmitButton } from "@/components/ui/submit-button";
import { ProblemList, Section, TextAreaField, TextField } from "@/components/agents/setup-fields";
import { DESCRIPTION_MAX, NAME_MAX } from "@/lib/data/profile-edit";
import {
  SECTION_TITLES,
  appStatsToLines,
  colorsToLines,
  competitorsToLines,
  fontsToLines,
  listToLines,
  socialLinksToLines,
  type ProfileSection,
} from "@/lib/data/profile-sections";
import type { BusinessProfile } from "@/lib/data/types";

/**
 * Correcting what the crawler understood.
 *
 * A Server Component with a plain `<form action={serverAction}>` — filling in
 * three fields and submitting is exactly what a form is, so this earns no
 * `"use client"`. It is reached at `?edit=1` rather than through a toggle for
 * the same reason: a query parameter is a URL someone can return to, and a
 * toggle is state that would need an island to hold.
 *
 * ## The warning is the important part
 *
 * A new analysis overwrites these fields — `mapProfile` reads the row the
 * crawler writes, and nothing marks a value as human-entered. So a correction
 * saved today can vanish the next time someone presses "Analyse", with no
 * error and no trace. That is worse than not offering the edit at all, and it
 * is said on the form rather than discovered.
 *
 * Preserving edits across a re-run needs a per-field "edited by hand" flag on
 * the row, which is a backend change. Until then the honest thing is to say so.
 */
export function ProfileEditForm({
  profile,
  section,
  problems,
  action,
}: {
  profile: BusinessProfile;
  /** Which card's Edit was pressed. One card, one form. */
  section: ProfileSection;
  problems: string[];
  action: (formData: FormData) => Promise<void>;
}) {
  const brand = profile.brand;

  return (
    <form action={action} className="max-w-2xl">
      <ProblemList problems={problems} heading="These details couldn't be saved:" />
      <input type="hidden" name="section" value={section} />

      {section === "business" && (
      <Section title={SECTION_TITLES.business}>
        <TextField
          name="businessName"
          label="Business name"
          defaultValue={profile.businessName}
          required
        />
        <TextField
          name="businessType"
          label="Business type"
          defaultValue={profile.businessType}
          hint="(free text — whatever describes it)"
        />
        <TextAreaField
          name="description"
          label="What the business does"
          defaultValue={profile.description}
          placeholder="A sentence or two. The strategy agent and every advert the agents write start from this."
          required
        />
        <p className="text-xs text-ink-soft">
          Up to {DESCRIPTION_MAX} characters. Names up to {NAME_MAX}.
        </p>
      </Section>
      )}

      {section === "keywords" && (
        <Section title={SECTION_TITLES.keywords}>
          <TextAreaField name="keywords" label="Keywords, one per line"
            defaultValue={listToLines(brand?.keywords)} />
        </Section>
      )}

      {section === "cta" && (
        <Section title={SECTION_TITLES.cta}>
          <TextAreaField name="callsToAction" label="Buttons and links, one per line"
            defaultValue={listToLines(brand?.callsToAction)} />
        </Section>
      )}

      {section === "images" && (
        <Section title={SECTION_TITLES.images}>
          <TextAreaField name="images" label="Image URLs, one per line"
            defaultValue={listToLines(brand?.images)} />
        </Section>
      )}

      {section === "contact" && (
        <Section title={SECTION_TITLES.contact}>
          <TextAreaField name="emails" label="Email addresses, one per line"
            defaultValue={listToLines(brand?.emails)} />
          <TextAreaField name="phones" label="Phone numbers, one per line"
            defaultValue={listToLines(brand?.phones)} />
          <TextAreaField name="socialLinks" label="Social links — platform | url, one per line"
            defaultValue={socialLinksToLines(brand)} />
        </Section>
      )}

      {section === "apps" && (
        <Section title={SECTION_TITLES.apps}>
          <TextAreaField name="appStats"
            label="store | downloads | rating | ratings count | url — one per line"
            defaultValue={appStatsToLines(brand)} />
        </Section>
      )}

      {section === "competitors" && (
        <Section title={SECTION_TITLES.competitors}>
          <TextAreaField name="competitors" label="name | url | why they compete — one per line"
            defaultValue={competitorsToLines(brand)} />
        </Section>
      )}

      {section === "brand" && (
        <Section title={SECTION_TITLES.brand}>
          <TextField name="toneOfVoice" label="Brand voice" defaultValue={brand?.toneOfVoice} />
          <TextAreaField name="brandValues" label="Brand tone — one word or phrase per line"
            defaultValue={listToLines(brand?.brandValues)} />
          <TextAreaField name="colors" label="Colours — #hex | label, one per line"
            defaultValue={colorsToLines(brand)} />
          <TextAreaField name="fonts" label="Typography — font name | where it is used, one per line"
            defaultValue={fontsToLines(brand)} />
          <TextAreaField name="brandAesthetic" label="Visual style"
            defaultValue={brand?.brandAesthetic} />
        </Section>
      )}

      <p className="mb-4 max-w-2xl rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
        <span className="font-medium">Running the analysis again replaces these.</span> The crawler
        writes the same fields, and nothing yet marks a value as one you typed.
      </p>

      <div className="flex items-center gap-3">
        <SubmitButton
          pendingLabel="Saving…"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
        >
          Save changes
        </SubmitButton>
        <Link
          href="/overview/business-profile"
          className="rounded-md px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-raised hover:text-ink"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
