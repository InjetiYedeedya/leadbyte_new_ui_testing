import Link from "@/components/ui/app-link";
import { BackLink } from "@/components/ui/back-link";
import { SubmitButton } from "@/components/ui/submit-button";
import { Section } from "@/components/agents/setup-fields";
import { SocialModeFields } from "@/components/agents/social-mode-fields";
import { SocialSchedule } from "@/components/agents/social-schedule";
import { SocialMediaUploader } from "@/components/agents/social-media-uploader";
import {
  MAX_POST_INFO,
  SOCIAL_INPUT,
  SOCIAL_MEDIA_TYPES,
  SOCIAL_PLATFORM_LABEL,
  SOCIAL_POST_PLATFORMS,
  type SocialSetup,
  type SocialPostPlatform,
} from "@/lib/data/social-media-setup";

/**
 * The Social Media agent's posting form (2026-10-01), ported from the legacy
 * `SocialMedia.jsx` — the step this app had dropped, so a customer with every
 * account connected could only press "Activate" and nothing was posted.
 *
 * A Server Component and a plain `<form action>`; the islands inside it each
 * own one thing a form cannot: which mode's questions show, the list of
 * posting dates, and the uploads. `runSocialMedia` reads, checks and sends.
 *
 * Order follows what the customer decides: whose posts these are, how much
 * the agent does, then the details of that mode, where to post, and any
 * ideas — then Back or Run.
 */

const MEDIA_LABEL: Record<(typeof SOCIAL_MEDIA_TYPES)[number], string> = {
  image: "Image",
  video: "Video",
  carousel: "Carousel",
};

export interface SocialPlatformOption {
  platform: SocialPostPlatform;
  connected: boolean;
  /** The page or channel name, when known. */
  account: string | null;
}

export function SocialMediaSetup({
  action,
  business,
  platforms,
  defaults,
}: {
  action: (formData: FormData) => Promise<void>;
  /** From the business profile; null fields are missing. */
  business: { name: string | null; website: string | null };
  platforms: SocialPlatformOption[];
  /** The last run's choices, so "run again" starts where it left off. */
  defaults: Partial<SocialSetup>;
}) {
  const missingBusiness = !business.name || !business.website;
  const chosen = defaults.platforms;

  return (
    <form action={action} className="max-w-3xl">
      <Section title="Your business">
        {missingBusiness ? (
          <div className="rounded-md border border-warn/30 bg-warn-soft px-4 py-3 text-sm">
            <p className="font-semibold text-warn">Business details required</p>
            <p className="mt-0.5 text-ink">
              The agent writes posts for your business, so it needs its name and website first.{" "}
              <Link href="/settings" className="font-medium underline underline-offset-2">
                Add them in Settings
              </Link>
            </p>
          </div>
        ) : (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-soft">Business</dt>
              <dd className="font-medium text-ink">{business.name}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-ink-soft">Website</dt>
              <dd className="truncate font-medium text-ink">{business.website}</dd>
            </div>
          </dl>
        )}
      </Section>

      <Section title="Automation">
        <SocialModeFields
          defaultMode={defaults.mode ?? "full"}
          full={
            <div className="space-y-4">
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-ink">
                  Preferred media type <span className="font-normal text-ink-soft">(optional)</span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {SOCIAL_MEDIA_TYPES.map((type) => (
                    <label
                      key={type}
                      className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm text-ink has-[:checked]:border-accent has-[:checked]:bg-accent/5"
                    >
                      <input
                        type="radio"
                        name={SOCIAL_INPUT.mediaType}
                        value={type}
                        defaultChecked={(defaults.mediaType ?? "image") === type}
                        className="accent-accent"
                      />
                      {MEDIA_LABEL[type]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <SocialSchedule defaultSchedule={defaults.schedule ?? { kind: "everyday" }} />
            </div>
          }
          semi={<SocialMediaUploader />}
        />
      </Section>

      <Section title="Where to post">
        <ul className="divide-y divide-border rounded-md border border-border">
          {SOCIAL_POST_PLATFORMS.map((platform) => {
            const option = platforms.find((p) => p.platform === platform);
            const label = SOCIAL_PLATFORM_LABEL[platform];
            return option?.connected ? (
              <li key={platform}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    name={SOCIAL_INPUT.platforms}
                    value={platform}
                    // Every connected platform by default; the last run's
                    // choice when there was one.
                    defaultChecked={chosen ? chosen.includes(platform) : true}
                    className="size-4 accent-accent"
                  />
                  <span className="font-medium">{label}</span>
                  {option.account && <span className="min-w-0 truncate text-ink-soft">{option.account}</span>}
                </label>
              </li>
            ) : (
              <li key={platform} className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="text-ink-soft">
                  <span className="font-medium text-ink">{label}</span> · Not connected
                </span>
                <Link
                  href="/intelligence/connections"
                  className="font-medium text-accent-ink underline underline-offset-2 hover:text-ink"
                >
                  Connect {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Post ideas (optional)">
        <label className="block">
          <span className="mb-1 block text-sm text-ink-soft">
            Anything in mind for the posts? Share ideas, themes or specific instructions.
          </span>
          <textarea
            name={SOCIAL_INPUT.postInfo}
            rows={4}
            maxLength={MAX_POST_INFO}
            placeholder="e.g. Our autumn offer: 20% off annual plans until 31 October"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>
      </Section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink fallbackHref="/agents" />
        <SubmitButton
          pendingLabel="Sending…"
          disabled={missingBusiness}
          className="min-h-11 rounded-md bg-accent px-5 py-2 text-sm font-semibold text-surface transition hover:bg-accent-ink disabled:opacity-60"
        >
          Run agent
        </SubmitButton>
      </div>
    </form>
  );
}
