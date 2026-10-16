"use client";

import { useScrollLock } from "@/lib/use-scroll-lock";
import { AGENT_ROW_ACTION } from "@/components/agents/row-action";
import { MailboxNote } from "@/components/agents/mailbox-note";
import type { ConnectedMailbox } from "@/lib/data/email-callback";

/**
 * "Configure" — On-Page SEO's setup and run, in a popup on the agents list.
 *
 * A client island: a two-step flow (a WordPress yes/no, then a single-select
 * "required services") whose result shows in place, so it never navigates away.
 * It hands the answers to `configureOnPageSeo`; the business fields come from
 * the profile.
 *
 * The WordPress answer is kept whichever way it goes — a non-WordPress site
 * simply drops the two Blog Posting bundles from the service list (there is no
 * blog to post to), which `servicesFor` handles. The chosen answer still rides
 * along in the payload for the backend to use downstream.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { SEO_SERVICES, servicesFor } from "@/lib/data/seo-setup";
import {
  configureOnPageSeo,
  type AgentConfigureResult,
} from "@/app/(app)/agents/[agentId]/actions";

type Step = "wordpress" | "services";

export function OnPageSeoConfigure({
  mailbox,
  autoOpen = false,
  label = "Set up",
  className = AGENT_ROW_ACTION,
  icon,
}: {
  mailbox: ConnectedMailbox | null;
  /** True when the page was reached with `?configure=` naming this agent
      (the top menu's Run agent button): opens the popup on arrival. */
  autoOpen?: boolean;
  /** The row's verb, from `agent-row-status.ts`: "Set up" or "Open". */
  label?: string;
  /** The trigger's classes; the row picks one from its state. */
  className?: string;
  /** Rendered before the label on the trigger. */
  icon?: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("wordpress");
  const [isWordPress, setIsWordPress] = useState(true);
  const [serviceId, setServiceId] = useState<string>(SEO_SERVICES[0]!.id);
  const [wpUsername, setWpUsername] = useState("");
  const [wpPassword, setWpPassword] = useState("");
  // Local-SEO targeting. Optional: the API forwards both untouched, so it is
  // n8n that decides whether they matter, and requiring them on a guess would
  // block a customer who has no answer.
  const [city, setCity] = useState("");
  const [zipcode, setZipcode] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AgentConfigureResult | null>(null);

  // The page behind a modal must not scroll; see the hook for what
  // `showModal()` does and does not give us.
  useScrollLock(open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function openDialog() {
    setStep("wordpress");
    setIsWordPress(true);
    setServiceId(SEO_SERVICES[0]!.id);
    setWpUsername("");
    setWpPassword("");
    setResult(null);
    setOpen(true);
  }

  // Opened from the top menu (`?configure=`): open on arrival, then drop the
  // parameter so a refresh does not reopen it. On `autoOpen`, not on mount,
  // so it also opens when the menu is used from the Agents page itself.
  useEffect(() => {
    if (!autoOpen) return;
    openDialog();
    router.replace(window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  // The WordPress answer decides which services are on offer. Answer, keep it,
  // and move on to the service list.
  function answerWordPress(value: boolean) {
    setIsWordPress(value);
    // Keep a valid selection: if the current pick is a Blog bundle and the site
    // isn't WordPress, fall back to the first offered service.
    const offered = servicesFor(value);
    if (!offered.some((s) => s.id === serviceId)) setServiceId(offered[0]!.id);
    setStep("services");
  }

  async function runAgent() {
    setPending(true);
    setResult(null);
    try {
      setResult(
        await configureOnPageSeo({
          isWordPress,
          serviceId,
          wpUsername,
          wpPassword,
          city,
          zipcode,
        }),
      );
    } catch {
      setResult({ ok: false, message: "We couldn't complete that just now. Please try again." });
    } finally {
      setPending(false);
    }
  }

  const services = servicesFor(isWordPress);

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        suppressHydrationWarning
        className={className}
      >
        {icon}
        {label}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        // While a run is in flight the popup holds still: closing it would
        // hide the only sign the run is happening, and its answer would land
        // on a closed dialog that the next open wipes.
        onCancel={(e) => {
          if (pending && e.target === e.currentTarget) e.preventDefault();
        }}
        onClick={(e) => {
          if (!pending && e.target === dialogRef.current) setOpen(false);
        }}
        aria-labelledby="on-page-seo-title"
        className="w-[min(36rem,calc(100vw-2rem))] rounded-lg border border-border bg-ground p-0 text-ink shadow-lg backdrop:bg-ink/50"
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            <h2 id="on-page-seo-title" className="text-base font-bold text-ink">
              Configure On-Page SEO
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              aria-label="Close"
              suppressHydrationWarning
              className="-mr-2 -mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-soft transition hover:bg-surface-raised hover:text-ink disabled:pointer-events-none disabled:opacity-50"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="mt-5">
            {result?.ok ? (
              <div className="flex flex-col gap-4">
                <div className="rounded-lg bg-good-soft px-4 py-3 text-sm text-good" role="status">
                  <span className="font-medium">Agent started.</span> {result.message}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    suppressHydrationWarning
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : step === "wordpress" ? (
              /* No mailbox gate: On-Page is purchase-only (2026-09-25). */
              <div className="flex flex-col gap-4">
                <p className="text-sm font-medium text-ink">
                  Is your website created with WordPress? <span className="text-crit">*</span>
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => answerWordPress(true)}
                    suppressHydrationWarning
                    className="flex-1 rounded-md border border-border bg-surface px-4 py-3 text-sm font-medium text-ink transition hover:border-accent hover:bg-surface-raised"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => answerWordPress(false)}
                    suppressHydrationWarning
                    className="flex-1 rounded-md border border-border bg-surface px-4 py-3 text-sm font-medium text-ink transition hover:border-accent hover:bg-surface-raised"
                  >
                    No
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <button
                  type="button"
                  onClick={() => setStep("wordpress")}
                  disabled={pending}
                  suppressHydrationWarning
                  className="flex items-center gap-1.5 self-start text-sm text-ink-soft transition hover:text-ink disabled:opacity-50"
                >
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                    <path d="M10 3l-5 5 5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Back
                </button>

                {/* A WordPress site publishes through its own admin login, so
                    the agent needs it. Only shown on the Yes path — a
                    non-WordPress site is never asked. The password reaches the
                    backend only through the Server Action, never stored here. */}
                {isWordPress && (
                  <div className="flex flex-col gap-3">
                    <div>
                      <label htmlFor="wp-username" className="mb-1.5 block text-xs font-medium text-ink-soft">
                        WordPress username <span className="text-crit">*</span>
                      </label>
                      <input
                        id="wp-username"
                        type="text"
                        autoComplete="off"
                        value={wpUsername}
                        onChange={(e) => setWpUsername(e.target.value)}
                        disabled={pending}
                        placeholder="admin"
                        suppressHydrationWarning
                        className="w-full rounded-md border border-border bg-surface px-4 py-3 text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label htmlFor="wp-password" className="mb-1.5 block text-xs font-medium text-ink-soft">
                        WordPress password <span className="text-crit">*</span>
                      </label>
                      <input
                        id="wp-password"
                        type="password"
                        autoComplete="off"
                        value={wpPassword}
                        onChange={(e) => setWpPassword(e.target.value)}
                        disabled={pending}
                        placeholder="••••••••"
                        suppressHydrationWarning
                        className="w-full rounded-md border border-border bg-surface px-4 py-3 text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent disabled:opacity-50"
                      />
                    </div>
                  </div>
                )}

                {/* Local SEO: which place the agent should rank this site
                    for. Both optional — the workflow forwards them to n8n and
                    we have not confirmed it requires them, so a customer with
                    no single location is not stopped here. */}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="flex-1">
                    <label htmlFor="seo-city" className="mb-1.5 block text-xs font-medium text-ink-soft">
                      City or area <span className="text-ink-soft">(optional)</span>
                    </label>
                    <input
                      id="seo-city"
                      type="text"
                      autoComplete="address-level2"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      disabled={pending}
                      placeholder="New York"
                      suppressHydrationWarning
                      className="w-full rounded-md border border-border bg-surface px-4 py-3 text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent disabled:opacity-50"
                    />
                  </div>
                  <div className="flex-1">
                    <label htmlFor="seo-zip" className="mb-1.5 block text-xs font-medium text-ink-soft">
                      Postcode <span className="text-ink-soft">(optional)</span>
                    </label>
                    <input
                      id="seo-zip"
                      type="text"
                      autoComplete="postal-code"
                      inputMode="text"
                      value={zipcode}
                      onChange={(e) => setZipcode(e.target.value)}
                      disabled={pending}
                      placeholder="07088"
                      suppressHydrationWarning
                      className="w-full rounded-md border border-border bg-surface px-4 py-3 text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent disabled:opacity-50"
                    />
                  </div>
                </div>
                <p className="-mt-1 text-xs text-ink-soft">
                  Fill these in if you serve one place — the agent targets local searches for it.
                </p>

                <fieldset className="flex flex-col gap-2.5">
                  <legend className="mb-1 text-sm font-medium text-ink">
                    Select your required services <span className="text-crit">*</span>
                  </legend>
                  {services.map((service) => (
                    <label
                      key={service.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border px-4 py-2.5 text-sm transition-colors ${
                        serviceId === service.id
                          ? "border-accent bg-surface-raised text-ink"
                          : "border-border bg-surface text-ink hover:bg-surface-raised"
                      }`}
                    >
                      <input
                        type="radio"
                        name="requiredServices"
                        value={service.id}
                        checked={serviceId === service.id}
                        onChange={() => setServiceId(service.id)}
                        disabled={pending}
                        suppressHydrationWarning
                        className="h-4 w-4 accent-accent"
                      />
                      {service.label}
                    </label>
                  ))}
                </fieldset>

                {/* Stated, not claimed: this agent publishes fixes to the
                    site, it does not email anyone. Its payload carries no
                    outreach field, so there is nothing here to say about
                    sending — and nothing is lost by having no mailbox. */}
                <MailboxNote mailbox={mailbox} label="Connected mailbox:" />

                {result && !result.ok && (
                  <p role="alert" className="rounded-lg bg-crit-soft px-3 py-2 text-sm text-crit">
                    {result.message}
                  </p>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={pending}
                    suppressHydrationWarning
                    className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-raised disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={runAgent}
                    disabled={pending}
                    suppressHydrationWarning
                    className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition disabled:opacity-50 hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
                  >
                    {pending && <Spinner />}
                    {pending ? "Starting…" : "Run On-Page SEO"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
