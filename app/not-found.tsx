/**
 * A URL that does not exist, or a `notFound()` from a page.
 *
 * Four pages call `notFound()` — `agents/[agentId]` and its suggestion, semi
 * and creative steps — and until now none of them had anything to render, so
 * an unknown agent id or a semi step with no endpoint showed Next's stock
 * 404 with no way back into the app.
 *
 * A Server Component: unlike `error.tsx` a not-found boundary catches no
 * exception and needs no reset, so there is nothing here that a form or a link
 * cannot express.
 */

import Link from "@/components/ui/app-link";
import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Not found · LeadByte" };

export default function NotFound() {
  return (
    <main className="p-4">
      <div className="mx-auto w-full max-w-2xl pt-16">
        <EmptyState
          title="We couldn't find that page"
          description="The link may be out of date, or the thing it pointed at may have been removed."
          action={
            <Link
              href="/overview"
              className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
            >
              Go to Overview
            </Link>
          }
        />
      </div>
    </main>
  );
}
