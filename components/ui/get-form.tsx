"use client";

/**
 * A plain GET form — filters and look-ups that live in the URL — whose submit
 * says it is working.
 *
 * The admin filters and look-ups were raw `<form method="get">`: a full page
 * load of a slow whole-table read, and nothing on the page moved until it
 * landed, so "Apply" and "Look up user" read as dead (audit, 2026-09-29). The
 * navigation is still the browser's own; this only marks the button pending
 * from the submit until the next page replaces this one.
 */

import { createContext, useContext, useState } from "react";
import { Spinner } from "@/components/ui/spinner";

const PendingContext = createContext(false);

export function GetForm({
  action,
  className,
  children,
}: {
  action: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [pending, setPending] = useState(false);
  return (
    <form method="get" action={action} className={className} onSubmit={() => setPending(true)}>
      <PendingContext value={pending}>{children}</PendingContext>
    </form>
  );
}

export function GetFormSubmit({
  children,
  pendingLabel,
  className = "",
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  /** Shown while the next page loads. Omit for an icon-only button. */
  pendingLabel?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const pending = useContext(PendingContext);
  return (
    <button
      type="submit"
      aria-busy={pending}
      aria-label={ariaLabel}
      suppressHydrationWarning
      className={`inline-flex items-center justify-center gap-2 ${pending ? "opacity-70" : ""} ${className}`}
    >
      {pending && <Spinner />}
      {pending && pendingLabel ? pendingLabel : pending && !pendingLabel ? null : children}
    </button>
  );
}
