/**
 * The app's secondary "← Back" button: outlined, control radius, a raised fill
 * on hover — so it reads as something to press, not as a line of text.
 *
 * A plain module so a Server Component (`CampaignFrame`) and the client
 * `BackLink` share it: a constant exported from a `"use client"` file reaches
 * a server importer as a client reference, not as the string.
 */
export const BACK_BUTTON_CLASSES =
  "inline-flex min-h-11 w-fit items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium text-ink shadow-sm transition-colors duration-150 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none";
