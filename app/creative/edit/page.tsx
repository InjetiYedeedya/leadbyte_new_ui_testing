import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { BrandHeader } from "@/components/brand-header";
import { PageContainer } from "@/components/ui/page-container";
import { SupportCard } from "@/components/creative/support-card";
import { readCreativeReview } from "@/lib/data/creative-review";

export const metadata: Metadata = { title: "Request changes · LeadByte" };

/**
 * `/creative/edit` — the review email's "Edit" link.
 *
 * Not an edit form. Asking our team IS the edit flow, a product decision
 * carried over from the legacy app, so this is a support card. It ignores
 * `platform`: Meta and Google get the same page. Public, like
 * `/creative/approve`, because the reader is usually not signed in.
 *
 * When it was opened with a readable review (from the approve page's
 * "Request changes", or an email that carries the creative), it offers the
 * way back to approving.
 */
export default async function CreativeEditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") params.append(key, value);
  }
  const review = readCreativeReview(params);

  return (
    <div className="flex min-h-dvh flex-col">
      <BrandHeader />
      <PageContainer width="reading" className="flex flex-1 items-start justify-center sm:items-center">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
          <SupportCard
            headingLevel={1}
            title="Want changes to your creative?"
            description="Tell our team what you'd like changed and we'll update it for you."
          />
          {review && (
            <Link
              href={`/creative/approve?${new URLSearchParams(review.passThrough).toString()}`}
              className="self-center text-sm font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
            >
              Back to review
            </Link>
          )}
        </div>
      </PageContainer>
    </div>
  );
}
