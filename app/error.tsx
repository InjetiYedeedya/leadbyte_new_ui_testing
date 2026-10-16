"use client";

/**
 * The last line of defence for a thrown render.
 *
 * ## Why this exists
 *
 * There was no error boundary anywhere in the app. `lib/api/read-cascade.ts`
 * documents "never throws" and covers the six HTTP repos, but nothing covered
 * a mock-repo throw, a `cookies()` failure or a bad `JSON.parse` in a mapper —
 * and `/analytics`, `/reports` and `/settings` all call repos directly. Any
 * one of those taking an unexpected shape replaced the whole screen with
 * Next's default crash page, which in production reads "Application error: a
 * client-side exception has occurred" and tells the customer nothing.
 *
 * `ErrorState` was already written for this and had zero callers. This renders
 * it, so the failure looks like part of the app and offers a way out.
 *
 * ## Why an error boundary must be a Client Component
 *
 * React catches render errors on the client and hands them to the nearest
 * boundary, so the boundary itself has to be one. That is a framework
 * requirement, not a choice — it is the documented exception to "every page is
 * a Server Component".
 *
 * The route group has its own `app/(app)/error.tsx` so an authenticated
 * failure keeps the header and tabs. This one catches anything outside it —
 * `/`, `/login`, `/signup`, `/analysing`.
 */

import { useEffect } from "react";
import Link from "@/components/ui/app-link";
import { RetryButton } from "@/components/ui/retry-button";
import { ErrorState } from "@/components/ui/states";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on a production error — the message is
    // stripped before it reaches the browser. Logged so a report from a
    // customer can be matched to a server log line.
    console.error("[error] unhandled render error:", error.digest ?? "", error);
  }, [error]);

  return (
    <main className="p-4">
      <div className="mx-auto w-full max-w-2xl pt-16">
        <ErrorState
          title="Something went wrong"
          description="This page couldn't load. Trying again often works — the problem is usually momentary."
          action={
            <div className="flex flex-wrap items-center gap-2">
              {/* `reset` re-renders the boundary's subtree, which is the cheap
                  fix for a transient read. Offered first for that reason. */}
              <RetryButton
                reset={reset}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
              />
              <Link
                href="/overview"
                className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-raised"
              >
                Go to Overview
              </Link>
            </div>
          }
        />
      </div>
    </main>
  );
}
