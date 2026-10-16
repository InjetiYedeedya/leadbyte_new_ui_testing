import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { CheckCircle, Warning } from "@phosphor-icons/react/ssr";
import { BrandHeader } from "@/components/brand-header";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { SubmitButton } from "@/components/ui/submit-button";
import { SupportCard } from "@/components/creative/support-card";
import { readCreativeReview, type CreativeAsset } from "@/lib/data/creative-review";
import { approveCreative } from "./actions";

export const metadata: Metadata = { title: "Review your creative · LeadByte" };

/**
 * `/creative/approve` — the review email's "Approve" link.
 *
 * Public on purpose: it sits outside `app/(app)/`, so there is no sign-in
 * redirect. The person reading the email is often not signed in, and the
 * legacy app served this same URL the same way. The link carries the whole
 * creative (see `lib/data/creative-review.ts` for the shape).
 *
 * Nothing is approved by visiting it — only by the Confirm button's POST (see
 * `approveCreative` for why). A Server Component with a form: showing a
 * preview and submitting one decision is exactly what a form is.
 *
 * States: the review; `?error=1` (the same review, with the failure above the
 * button so they can retry); `?approved=1` (done); and a link we cannot read.
 */
export default async function CreativeApprovePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = toSearchParams(await searchParams);

  if (params.get("approved") === "1") {
    return (
      <Shell>
        <Result
          icon={<CheckCircle weight="fill" aria-hidden="true" className="size-10 text-good" />}
          title="Creative approved"
          body="Thanks. We'll publish it shortly. You can close this tab."
        />
      </Shell>
    );
  }

  const review = readCreativeReview(params);

  if (!review) {
    return (
      <Shell>
        <Result
          icon={<Warning weight="fill" aria-hidden="true" className="size-10 text-warn" />}
          title="This review link is incomplete"
          body="We couldn't find the creative in this link. Open it again from the email, or contact us and we'll sort it out."
        />
        <SupportCard />
      </Shell>
    );
  }

  const isGoogle = review.platform === "google_ads";
  const total = review.images.length + review.videos.length;
  const query = new URLSearchParams(review.passThrough).toString();

  return (
    <Shell>
      <PageHeader
        title="Review your creative"
        description={
          <>
            {total === 1 ? "Here is the " : `Here are the ${total} `}
            {isGoogle ? "Google Ads" : "Meta"} {total === 1 ? "creative" : "creatives"} we made
            {review.locationKey && (
              <>
                {" "}
                for <strong className="font-semibold text-ink">{review.locationKey}</strong>
              </>
            )}
            . Approve to publish {total === 1 ? "it" : "them"}.
          </>
        }
      />

      {review.images.length > 0 && (
        <AssetSection title="Images" count={review.images.length} showTitle={isGoogle || review.videos.length > 0}>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {review.images.map((asset, index) => (
              <li key={`${asset.url}-${index}`}>
                <AssetFrame asset={asset}>
                  {/* Hosted on S3/CDN hosts `next/image` is not configured for,
                      and shown once; the CSP allows `img-src https:`. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.url}
                    alt={`Creative image ${index + 1}${asset.label ? `, ${asset.label}` : ""}`}
                    loading={index < 3 ? "eager" : "lazy"}
                    className="max-h-96 w-full object-contain"
                  />
                </AssetFrame>
              </li>
            ))}
          </ul>
        </AssetSection>
      )}

      {review.videos.length > 0 && (
        <AssetSection title="Videos" count={review.videos.length} showTitle>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {review.videos.map((asset, index) => (
              <li key={`${asset.url}-${index}`}>
                <AssetFrame asset={asset}>
                  <video
                    src={asset.url}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={`Creative video ${index + 1}`}
                    className="max-h-[32rem] w-full bg-ink"
                  />
                </AssetFrame>
              </li>
            ))}
          </ul>
        </AssetSection>
      )}

      <form
        action={approveCreative}
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <input type="hidden" name="query" value={query} />
        <div className="min-w-0">
          {params.get("error") === "1" ? (
            <p role="alert" className="text-sm font-medium text-crit">
              We couldn&apos;t confirm the approval just now. Please try again, or contact us if it keeps happening.
            </p>
          ) : (
            <p className="text-sm text-ink-soft">Once you approve, we publish {total === 1 ? "it" : "them"} to your ad account.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/creative/edit?${query}`}
            className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
          >
            Request changes
          </Link>
          <SubmitButton
            pendingLabel="Approving…"
            className="min-h-11 justify-center rounded-md bg-accent px-5 text-sm font-semibold text-surface hover:bg-accent-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Confirm and publish
          </SubmitButton>
        </div>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <BrandHeader />
      <PageContainer width="reading">{children}</PageContainer>
    </div>
  );
}

function Result({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-12 text-center">
      {icon}
      <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
      <p className="max-w-sm text-sm text-ink-soft">{body}</p>
    </div>
  );
}

function AssetSection({
  title,
  count,
  showTitle,
  children,
}: {
  title: string;
  count: number;
  showTitle: boolean;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      {showTitle && (
        <h2 className="text-base font-semibold text-ink">
          {title} <span className="font-normal tabular-nums text-ink-soft">({count})</span>
        </h2>
      )}
      {children}
    </section>
  );
}

function AssetFrame({ asset, children }: { asset: CreativeAsset; children: React.ReactNode }) {
  return (
    <figure className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex flex-1 items-center justify-center bg-surface-raised">{children}</div>
      {asset.label && (
        <figcaption className="border-t border-border px-3 py-2 text-xs font-medium text-ink-soft">
          {asset.label}
        </figcaption>
      )}
    </figure>
  );
}

/** Next's searchParams object → URLSearchParams, keeping repeated keys. */
function toSearchParams(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.append(key, value);
  }
  return params;
}
