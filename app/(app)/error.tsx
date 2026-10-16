"use client";

/**
 * A thrown render inside the authenticated app.
 *
 * ## What this does NOT do, despite the obvious expectation
 *
 * It does not keep the header and tabs. Measured 2026-09-10: with a throw in
 * a page body, this boundary renders and the chrome is gone.
 *
 * The reason is structural. `app/(app)/layout.tsx` is only
 * `<div className="min-h-screen">{children}</div>` — the identity band and the
 * tab strip come from `PageShell`, which every page renders *itself*. So the
 * chrome is part of the page's own output, and a boundary that replaces the
 * page necessarily replaces the chrome with it. A Client Component cannot
 * render `PageShell` back, because `PageShell` is async and resolves the
 * session.
 *
 * Moving `PageShell` into the layout would fix that and is a real
 * architectural change, not a tweak — it is recorded in the design audit as a
 * decision to take rather than something to do quietly here.
 *
 * So what this buys over the root boundary is only its wording: "this screen"
 * rather than "this page", and a way back into the app instead of a reload.
 * That is worth having, and it is all it is.
 *
 * See `app/error.tsx` for why a boundary must be a Client Component and why
 * the digest is logged.
 */

import { useEffect } from "react";
import Link from "@/components/ui/app-link";
import { RetryButton } from "@/components/ui/retry-button";
import { ErrorState } from "@/components/ui/states";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error] unhandled render error in (app):", error.digest ?? "", error);
  }, [error]);

  return (
    <main className="p-4">
      <ErrorState
        title="This screen couldn't load"
        description="Something went wrong reading your data. The rest of the app is unaffected."
        action={
          <div className="flex flex-wrap items-center gap-2">
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
    </main>
  );
}
