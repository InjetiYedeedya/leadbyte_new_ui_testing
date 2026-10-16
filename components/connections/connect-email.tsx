"use client";

/**
 * "Connect Email" — the button and its multi-step chooser.
 *
 * A client island: the flow is open/closed state, a step machine, and a
 * credentials form — none of which a `<form action={serverAction}>` alone can
 * express. It holds no application data; the provider catalogue arrives from
 * `lib/data/email-providers` and the actual connect is the `connectEmail`
 * Server Action.
 *
 * Two paths, mirroring the backend:
 *   Gmail          → a plain <a> to `/api/email/gmail`. Consent is a redirect
 *                    chain the browser walks; no password is ever typed here.
 *   SMTP & others  → IONOS / Yahoo / custom. The form collects a mailbox
 *                    password and hands it to `connectEmail`, which is the only
 *                    place it reaches the backend. It never lives in this
 *                    component's state longer than the keystrokes and the one
 *                    submit.
 *
 * The `<dialog>` + `showModal()` approach is the same one `connect-google.tsx`
 * uses — it buys focus trapping, Escape-to-close and the backdrop for free.
 */

import { useScrollLock } from "@/lib/use-scroll-lock";
import { Badge } from "@/components/ui/badge";
import { useEffect, useRef, useState } from "react";
import {
  MANUAL_PROVIDERS,
  findManualProvider,
  type ManualProvider,
  type EmailConnectResult,
} from "@/lib/data/email-providers";
import { connectEmail } from "@/app/(app)/intelligence/connections/actions";
import { Spinner } from "@/components/ui/spinner";
import { ConnectLink } from "@/components/ui/connect-link";

type Step = "provider" | "smtp-list" | "form";

export function ConnectEmail({
  connected = false,
}: {
  /**
   * A mailbox is already connected: the trigger becomes the quiet
   * "Reconnect", like every other connected card, rather than the filled
   * "Connect Email" — which read as "not connected" beside a Connected badge
   * (2026-10-12). Same dialog; connecting again replaces the mailbox.
   */
  connected?: boolean;
} = {}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("provider");
  const [providerId, setProviderId] = useState<string | null>(null);

  // The page behind a modal must not scroll; see the hook for what
  // `showModal()` does and does not give us.
  useScrollLock(open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Every open starts clean — a half-filled form from a previous session should
  // never be waiting behind the button.
  function openDialog() {
    setStep("provider");
    setProviderId(null);
    setOpen(true);
  }

  const provider = providerId ? findManualProvider(providerId) : undefined;

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        suppressHydrationWarning
        className={`shrink-0 rounded-md px-3.5 py-1.5 text-sm font-medium transition active:scale-[0.98] motion-reduce:transform-none ${
          connected
            ? "border border-border text-ink hover:bg-surface-raised"
            : "bg-accent text-surface hover:bg-accent-ink"
        }`}
      >
        {connected ? "Reconnect" : "Connect Email"}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
        aria-labelledby="connect-email-title"
        className="w-[min(34rem,calc(100vw-2rem))] rounded-lg border border-border bg-ground p-0 text-ink shadow-lg backdrop:bg-ink/50"
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            <h2 id="connect-email-title" className="text-base font-bold text-ink">
              Choose Email Provider
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              suppressHydrationWarning
              className="-mr-2 -mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-soft transition hover:bg-surface-raised hover:text-ink"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="mt-5">
            {step === "provider" && (
              <ProviderStep onSmtp={() => setStep("smtp-list")} />
            )}

            {step === "smtp-list" && (
              <SmtpListStep
                onBack={() => setStep("provider")}
                onPick={(id) => {
                  setProviderId(id);
                  setStep("form");
                }}
              />
            )}

            {step === "form" && provider && (
              <CredentialsStep
                provider={provider}
                onBack={() => setStep("smtp-list")}
                onCancel={() => setOpen(false)}
              />
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}

/* ── Step 1: pick a provider ──────────────────────────────────────────── */

function ProviderStep({ onSmtp }: { onSmtp: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Gmail — a real navigation, not a fetch: OAuth is a redirect chain.
          `ConnectLink` keeps it an `<a>` and adds the ring, because this sits
          in a dialog that stays open and unchanged while the browser leaves. */}
      <ConnectLink
        href="/api/email/gmail"
        className="flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-raised"
      >
        <GmailIcon />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink">Gmail</span>
          <span className="block text-xs text-ink-soft">Connect using your Google account</span>
        </span>
      </ConnectLink>

      {/* Outlook — dark, like the live app. Not a button: nothing to click. */}
      <div
        aria-disabled="true"
        className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 opacity-70"
      >
        <OutlookIcon />
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">Outlook</span>
            {/* Was a hand-copied duplicate of Badge's own class string,
                differing only in px-1.5 vs px-2 — the "add a variant rather
                than styling a one-off span" case CLAUDE.md names. */}
            <Badge variant="coming-soon">Coming soon</Badge>
          </span>
          <span className="block text-xs text-ink-soft">Connect using your Microsoft account</span>
        </span>
      </div>

      <button
        type="button"
        onClick={onSmtp}
        suppressHydrationWarning
        className="flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-left transition hover:bg-surface-raised"
      >
        <ServerIcon />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">SMTP &amp; others</span>
          <span className="block text-xs text-ink-soft">
            Connect IONOS, Yahoo or a custom IMAP/SMTP mailbox
          </span>
        </span>
        <ChevronRight />
      </button>
    </div>
  );
}

/* ── Step 2: pick an SMTP provider ────────────────────────────────────── */

function SmtpListStep({
  onBack,
  onPick,
}: {
  onBack: () => void;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <BackLink onClick={onBack} />
      {MANUAL_PROVIDERS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onPick(p.id)}
          suppressHydrationWarning
          className="flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-left transition hover:bg-surface-raised"
        >
          <ServerIcon />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">{p.label}</span>
            <span className="block text-xs text-ink-soft">{p.subtitle}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/* ── Step 3: credentials form + result ────────────────────────────────── */

function CredentialsStep({
  provider,
  onBack,
  onCancel,
}: {
  provider: ManualProvider;
  onBack: () => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<EmailConnectResult | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult(null);
    try {
      const outcome = await connectEmail({
        provider: provider.id,
        loginEmail: email,
        password,
        host,
        port,
      });
      setResult(outcome);
      // A verified mailbox needs no more of this form — clear the password so
      // it doesn't linger in the field.
      if (outcome.connected === true) setPassword("");
    } catch {
      // A thrown action used to stop the spinner and say nothing at all.
      setResult({
        connected: false,
        message: "We couldn't reach the server just now. Please try again in a moment.",
      });
    } finally {
      setPending(false);
    }
  }

  // Verified: show the success state instead of the form.
  if (result?.connected === true) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink onClick={onBack} />
        <div className="rounded-lg bg-good-soft px-4 py-3 text-sm text-good" role="status">
          <span className="font-medium">{result.loginEmail ?? "Mailbox"} connected.</span>{" "}
          {result.message}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            suppressHydrationWarning
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <BackLink onClick={onBack} />

      <div className="flex items-start gap-2.5 rounded-lg bg-info-soft px-3 py-2.5 text-sm text-info">
        <InfoIcon />
        <div className="min-w-0">
          <p>{provider.hint}</p>
          <a
            href={provider.guideUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block font-medium underline"
          >
            Setup guide
          </a>
        </div>
      </div>

      <div>
        <label htmlFor="email-connect-email" className="mb-1.5 block text-xs font-medium text-ink-soft">
          Email <span className="text-crit">*</span>
        </label>
        <input
          id="email-connect-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
          placeholder="Enter your email"
          suppressHydrationWarning
          className="w-full rounded-md border border-border bg-surface px-4 py-3 text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent disabled:opacity-50"
        />
      </div>

      <div>
        <label htmlFor="email-connect-password" className="mb-1.5 block text-xs font-medium text-ink-soft">
          Password <span className="text-crit">*</span>
        </label>
        <input
          id="email-connect-password"
          type="password"
          autoComplete="off"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
          placeholder="••••••••••"
          suppressHydrationWarning
          className="w-full rounded-md border border-border bg-surface px-4 py-3 text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent disabled:opacity-50"
        />
      </div>

      {provider.extraFields.length > 0 && (
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <label htmlFor="email-connect-host" className="mb-1.5 block text-xs font-medium text-ink-soft">
              SMTP host <span className="text-crit">*</span>
            </label>
            <input
              id="email-connect-host"
              type="text"
              required
              value={host}
              onChange={(e) => setHost(e.target.value)}
              disabled={pending}
              placeholder="smtp.company.com"
              suppressHydrationWarning
              className="w-full rounded-md border border-border bg-surface px-4 py-3 text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent disabled:opacity-50"
            />
          </div>
          <div className="w-24">
            <label htmlFor="email-connect-port" className="mb-1.5 block text-xs font-medium text-ink-soft">
              Port <span className="text-crit">*</span>
            </label>
            <input
              id="email-connect-port"
              type="text"
              inputMode="numeric"
              required
              value={port}
              onChange={(e) => setPort(e.target.value)}
              disabled={pending}
              placeholder="587"
              suppressHydrationWarning
              className="w-full rounded-md border border-border bg-surface px-4 py-3 text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent disabled:opacity-50"
            />
          </div>
        </div>
      )}

      {/* A failed or still-verifying attempt keeps the form up so it can be
          retried or corrected. The verified case returns early above, so here
          `connected` is only ever false or null — and null is not a failure. */}
      {result && (
        <p
          role={result.connected === false ? "alert" : "status"}
          className={`rounded-lg px-3 py-2 text-sm ${
            result.connected === false ? "bg-crit-soft text-crit" : "bg-info-soft text-info"
          }`}
        >
          {result.message}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          suppressHydrationWarning
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-raised disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          suppressHydrationWarning
          aria-busy={pending}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition disabled:opacity-50 hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
        >
          {pending && <Spinner />}
          {pending ? "Connecting…" : "Connect"}
        </button>
      </div>
    </form>
  );
}

/* ── Small shared bits ────────────────────────────────────────────────── */

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      suppressHydrationWarning
      className="flex items-center gap-1.5 self-start text-sm text-ink-soft transition hover:text-ink"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M10 3l-5 5 5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back
    </button>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true">
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" fill="currentColor">
      <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3a1 1 0 110 2 1 1 0 010-2zM7 7h2v5H7V7z" />
    </svg>
  );
}

function GmailIcon() {
  // Google's brand mark — a third party's colours, correctly raw hex (same
  // exception CLAUDE.md makes for connect-google.tsx).
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center">
      <svg viewBox="0 0 18 18" className="h-5 w-5" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
        <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
      </svg>
    </span>
  );
}

function OutlookIcon() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center">
      <svg viewBox="0 0 18 18" className="h-5 w-5" aria-hidden="true">
        <rect x="1" y="1" width="7.5" height="7.5" fill="#F35325" />
        <rect x="9.5" y="1" width="7.5" height="7.5" fill="#81BC06" />
        <rect x="1" y="9.5" width="7.5" height="7.5" fill="#05A6F0" />
        <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#FFBA08" />
      </svg>
    </span>
  );
}

function ServerIcon() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center text-ink-soft">
      <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true" fill="none">
        <rect x="3" y="4" width="14" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <rect x="3" y="11" width="14" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="6" cy="6.5" r="0.9" fill="currentColor" />
        <circle cx="6" cy="13.5" r="0.9" fill="currentColor" />
      </svg>
    </span>
  );
}
