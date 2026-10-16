import { readSignedText } from "@/lib/signed-text";
import { webHref } from "@/lib/data/profile-display";
import type { Metadata } from "next";
import { PendingLink } from "@/components/ui/pending-link";
import { redirect } from "next/navigation";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import { CampaignFrame } from "@/components/agents/campaign-frame";
import { SubmitButton } from "@/components/ui/submit-button";
import { getAdsDraft } from "@/lib/data/ads-draft";
import { createAdCampaign, generateAdImage, uploadAdImage } from "../actions";
import { humaniseKey } from "@/lib/data/labels";

export const metadata: Metadata = { title: "Review your campaign · LeadByte" };

const PLAN = "/agents/openai-ads/plan";

/**
 * The last step: the picture, then the campaign.
 *
 * ## Why this page exists at all
 *
 * The Plan step redirected to itself after saving, so the flow simply stopped
 * there — a step bar promising Copy and Review with nothing behind either.
 * This is the road out.
 *
 * ## Why the picture is here and not on Plan
 *
 * Plan is free: everything on it runs on our own key and can be redrafted as
 * often as anyone likes. The picture is the first thing that costs — a render
 * is minutes of someone else's compute — and creating the campaign is the
 * first thing that spends the customer's own budget. Putting both behind one
 * more click keeps "write an advert" and "spend money" apart.
 */
async function ReviewBody({
  searchParams,
}: {
  searchParams: Promise<{ problem?: string }>;
}) {
  const { problem: rawProblem } = await searchParams;
  // Signed by the action that redirected here; a link carrying any other text
  // shows nothing rather than words someone else chose (audit, 2026-09-29).
  const problem = readSignedText(rawProblem) ?? undefined;
  const businessId = await currentBusinessId();
  const draft = await getAdsDraft(businessId);

  // No draft, or an advert never written: the step before this is where that
  // happens, and a redirect says so better than an empty screen.
  if (!draft) redirect("/agents/openai-ads");
  if (!draft.copy || !draft.adType) redirect(PLAN);

  const semi = draft.adType === "semi";
  const created = draft.created;
  // Semi has its picture the moment it is uploaded. Full has one only once the
  // render finishes, so until then the screen says it is still working.
  const hasPicture = Boolean(draft.imageUrl);
  const rendering = !semi && Boolean(draft.image?.outputKey) && !hasPicture;

  return (
    <CampaignFrame
      step="review"
      title={created ? "Your campaign is created" : "Review, then create"}
      back={created ? undefined : { href: PLAN, label: "the advert" }}
      problems={problem ? [problem] : undefined}
      intro={
        created
          ? "It was created paused, so nothing is spending yet. Turn it on when you are ready."
          : "Nothing has been created and nothing has been charged. Creating the campaign is the first step that spends your budget."
      }
    >
      {created ? (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">
            What was created
          </h2>
          {/* The names and status, not the ids: an id is a lookup key the
              customer never types, and the platform names every campaign for
              exactly this reason. The ids are still stored on the draft — they
              guard against a second create — just not shown. */}
          <p className="mt-2 text-base font-medium text-ink">
            {created.campaignName?.trim() || "Your campaign"}
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Fact label="Status" value={humaniseKey(created.status)} />
            {created.reviewStatus ? (
              <Fact label="Review" value={humaniseKey(created.reviewStatus)} />
            ) : null}
          </dl>
          {created.targetUrl ? (
            <p className="mt-4 text-sm text-ink-soft">
              Where it sends people:{" "}
              {/* External URL, so a raw anchor, not next/link. */}
              <a
                href={webHref(created.targetUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-accent underline underline-offset-2"
              >
                {created.targetUrl}
              </a>
            </p>
          ) : null}
          {/* The created screen was otherwise a dead end: the draft persists, so
              without a fresh start here the only campaign anyone can reach is this
              one. The setup submit clears the draft, so this link begins a genuinely
              new campaign rather than reopening this one. */}
          <PendingLink
            href="/agents/openai-ads"
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
          >
            Create another campaign
          </PendingLink>
        </section>
      ) : (
        <>
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">
              The advert
            </h2>
            <p className="mt-2 font-medium text-ink">{draft.copy.title}</p>
            <p className="mt-1 text-sm text-ink-soft">{draft.copy.description}</p>
          </section>

          <section className="mt-4 rounded-lg border border-border bg-surface p-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">
              The picture
            </h2>

            {hasPicture ? (
              <div className="mt-3">
                {/* A plain img: the URL is the service's own host, and
                    next/image refuses any host missing from
                    images.remotePatterns. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={draft.imageUrl}
                  alt="The picture this advert will run with"
                  className="max-h-64 w-auto rounded-lg border border-border"
                />
                <p className="mt-2 text-xs text-ink-soft">
                  This link expires in a few hours; the campaign keeps its own copy.
                </p>
                {/* Semi picture is the customer's own, so it must stay swappable
                    right up to create: keep this one and continue, or upload a
                    different one to replace it. Full-automation renders are not
                    re-uploadable — regenerating is the only way to change them. */}
                {semi ? (
                  <UploadForm
                    helper="Happy with this one? Keep it and create the campaign. To use a different picture, upload a new PNG or JPEG to replace it."
                    label="Replace the picture"
                    className="mt-4 border-t border-border pt-4"
                  />
                ) : null}
              </div>
            ) : semi ? (
              <UploadForm
                helper="A PNG or a JPEG. It is used as it is — nothing is generated."
                label="Upload this picture"
                className="mt-3"
              />
            ) : rendering ? (
              <p className="mt-2 text-sm text-ink-soft" role="status">
                The service is rendering it. That takes a few minutes, and there is no
                notification when it lands — reload this page to check.
              </p>
            ) : (
              <form action={generateAdImage} className="mt-3">
                <p className="mb-2 text-sm text-ink-soft">
                  The service renders it from your product description. It takes a few minutes.
                </p>
                <SubmitButton
                  pendingLabel="Starting…"
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
                >
                  Generate the picture
                </SubmitButton>
              </form>
            )}
          </section>

          <form action={createAdCampaign} className="mt-6">
            <SubmitButton
              pendingLabel="Creating…"
              disabled={!hasPicture}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent disabled:active:scale-100"
            >
              Create the campaign
            </SubmitButton>
            <p className="mt-2 text-sm text-ink-soft">
              {hasPicture
                ? "It is created paused, so nothing spends until you turn it on."
                : "The advert needs its picture before the campaign can be created."}
            </p>
          </form>
        </>
      )}
    </CampaignFrame>
  );
}

/**
 * The semi-automation picture form, shown twice: to upload the first picture,
 * and — once one exists — to replace it. One component so the two never drift in
 * their file constraints or field name, which the `uploadAdImage` action reads.
 */
function UploadForm({
  helper,
  label,
  className,
}: {
  helper: string;
  label: string;
  className?: string;
}) {
  return (
    <form action={uploadAdImage} className={className}>
      <p className="mb-2 text-sm text-ink-soft">{helper}</p>
      <input
        type="file"
        name="image"
        accept="image/png,image/jpeg"
        required
        suppressHydrationWarning
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-surface-raised file:px-3 file:py-1 file:text-sm file:text-ink"
      />
      <SubmitButton
        pendingLabel="Uploading…"
        className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
      >
        {label}
      </SubmitButton>
    </form>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      {/* Plain text, not mono: these are words now (paused, approved), not the
          ids this used to render. `humaniseKey` at the call site does the
          casing, so there is no `capitalize` class second-guessing it. */}
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}

export default function ReviewPage(props: Parameters<typeof ReviewBody>[0]) {
  return (
    <PageShell activeTab="/agents" currentStageId="agents">
      <ReviewBody {...props} />
    </PageShell>
  );
}
