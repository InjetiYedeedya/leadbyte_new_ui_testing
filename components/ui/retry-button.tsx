"use client";

/**
 * "Try again" on an error boundary.
 *
 * `reset` on its own only re-renders the boundary with the SAME server data,
 * so an error that came from the server came straight back and the button
 * looked dead (audit, 2026-09-29). `router.refresh()` asks the server again
 * first; both run in one transition, so the button can say it is working
 * until the fresh answer lands.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";

export function RetryButton({ reset, className = "" }: { reset: () => void; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        startTransition(() => {
          router.refresh();
          reset();
        })
      }
      className={`inline-flex items-center gap-2 disabled:opacity-70 ${className}`}
    >
      {pending && <Spinner />}
      {pending ? "Trying again…" : "Try again"}
    </button>
  );
}
