"use client";

/**
 * "Connect WordPress" — the button and its form, used on the Connections page
 * and on the Blog Posting agent.
 *
 * A client island: a dialog is open or closed, the form shows a pending state
 * while the backend logs in to the customer's site (it can take ~10 seconds),
 * and a refusal is shown in place so the customer can fix one field rather
 * than retype three. It holds no application data.
 *
 * The Application Password lives in this component's state only between the
 * keystrokes and the one submit, goes to `saveWordpressAction` and on to the
 * backend, and is cleared on success and whenever the dialog closes. It is
 * never in a URL, a cookie or a log.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { Spinner } from "@/components/ui/spinner";
import { saveWordpressAction } from "@/app/(app)/intelligence/connections/actions";

const INPUT =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60";

export function ConnectWordpress({
  connected = null,
  variant = "accent",
  compact = false,
}: {
  /** The saved site, when there is one: the form opens on it, to update. */
  connected?: { wpUrl: string; userName: string } | null;
  /** `accent` where connecting is the next step; `quiet` beside other controls. */
  variant?: "accent" | "quiet";
  /** A size down, for the WordPress line inside the GitHub card. */
  compact?: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [wpUrl, setWpUrl] = useState(connected?.wpUrl ?? "");
  const [userName, setUserName] = useState(connected?.userName ?? "");
  const [appPassword, setAppPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useScrollLock(open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function openDialog() {
    setWpUrl(connected?.wpUrl ?? "");
    setUserName(connected?.userName ?? "");
    setAppPassword("");
    setError(null);
    setOpen(true);
  }

  function close() {
    if (pending) return;
    setAppPassword("");
    setOpen(false);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await saveWordpressAction({ wpUrl, userName, appPassword });
      if (result.ok) {
        setAppPassword("");
        setOpen(false);
        router.refresh();
      } else {
        setError(result.message);
      }
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        suppressHydrationWarning
        className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md ${compact ? "px-3 py-1.5" : "px-4 py-2"} text-sm font-medium transition-colors ${
          variant === "accent"
            ? "bg-accent text-surface hover:bg-accent-ink"
            : "border border-border bg-surface text-ink hover:bg-surface-raised"
        }`}
      >
        {connected ? "Update" : "Connect WordPress"}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => {
          setAppPassword("");
          setOpen(false);
        }}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
        aria-labelledby="connect-wordpress-title"
        className="w-[min(36rem,calc(100vw-2rem))] rounded-lg border border-border bg-ground p-0 text-ink shadow-lg backdrop:bg-ink/50"
      >
        <form onSubmit={onSubmit} className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="connect-wordpress-title" className="text-base font-bold text-ink">
                {connected ? "Update WordPress" : "Connect WordPress"}
              </h2>
              <p className="mt-0.5 text-sm text-ink-soft">
                So the Blog Posting agent can publish posts to your WordPress site.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              disabled={pending}
              className="-mr-2 -mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-soft transition hover:bg-surface-raised hover:text-ink disabled:opacity-50"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Where the password comes from, before the fields that ask for it:
              the commonest mistake is pasting the normal login password. */}
          <div className="mt-4 rounded-md border border-info/20 bg-info-soft/60 px-4 py-3 text-sm text-ink">
            <p className="font-semibold">Use an Application Password, not your login password</p>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-ink-soft">
              <li>In WordPress, go to Users → Profile.</li>
              <li>Under Application Passwords, type a name such as &ldquo;LeadByte&rdquo;.</li>
              <li>Press Add New Application Password and copy what it shows.</li>
            </ol>
            <p className="mt-1.5 text-xs text-ink-soft">
              You can revoke it there at any time without changing your real password. The account needs
              the Author, Editor or Administrator role to publish.
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink">WordPress site address</span>
              <input
                type="text"
                inputMode="url"
                autoComplete="url"
                required
                value={wpUrl}
                onChange={(e) => setWpUrl(e.target.value)}
                disabled={pending}
                placeholder="https://example.com"
                className={INPUT}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink">WordPress username</span>
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                disabled={pending}
                placeholder="Your WordPress login name"
                className={INPUT}
              />
            </label>
            <div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink">Application Password</span>
                <input
                  type="password"
                  // Not "current-password": the browser would offer the saved
                  // WordPress LOGIN password, which is exactly the wrong one.
                  autoComplete="new-password"
                  spellCheck={false}
                  required
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                  disabled={pending}
                  placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                  aria-describedby="wp-app-password-hint"
                  className={`${INPUT} font-mono`}
                />
              </label>
              <p id="wp-app-password-hint" className="mt-1 text-xs text-ink-soft">
                {connected ? "Paste a new one to update; the saved one is never shown. " : ""}Spaces are fine.
              </p>
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-md bg-crit-soft px-3 py-2 text-sm text-crit">
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={pending}
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-raised disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-accent-ink disabled:opacity-70"
            >
              {pending && <Spinner />}
              {pending ? "Checking with your site…" : "Test and connect"}
            </button>
          </div>
          <p className="mt-2 text-right text-xs text-ink-soft">
            We log in to your site to check it works before saving anything.
          </p>
        </form>
      </dialog>
    </>
  );
}
