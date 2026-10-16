"use client";

/**
 * A download button that shows it is working, and says so when it fails.
 *
 * ## Why this is not `<a href download>`
 *
 * The AEO files come through a Route Handler that waits for the upstream
 * service before it sends a single header. With the `download` attribute the
 * page never navigates, so nothing on screen changed until the browser's own
 * download bar appeared — seconds later — and a second press started a second
 * download. A failure was worse: the browser saved the 502 body as the file,
 * or showed nothing at all.
 *
 * ## Why this earns `"use client"`
 *
 * Knowing when the file has ARRIVED needs the fetch in our hands: the button
 * is disabled with a ring from the press until the blob is complete, then a
 * temporary `<a download>` hands it to the browser. Neither a timeout nor
 * window focus says when a download actually started, so neither is used.
 * The route still owns the file; this only owns the wait.
 */

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";

/** A caller that sets its own display wins — the `SubmitButton` rule. */
const DISPLAY_UTILITIES = new Set(["flex", "inline-flex", "grid", "inline-grid", "block", "inline-block", "contents"]);

const FALLBACK_ERROR = "We couldn't prepare that file. Please try again.";

/** `filename*=UTF-8''…` wins over a plain `filename="…"`, as the RFC says. */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)?''([^;]+)/.exec(header);
  if (extended?.[1]) {
    try {
      return decodeURIComponent(extended[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // Malformed encoding: fall through to the plain form.
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/.exec(header);
  const name = (plain?.[2] ?? plain?.[1])?.trim();
  return name ? name : null;
}

/**
 * The route's own sentence when it sent one: JSON `{ error | message }`, or a
 * short plain-text body. An HTML error page or an empty body becomes our own
 * sentence rather than markup on screen.
 */
export async function errorFromResponse(res: Response): Promise<string> {
  let body = "";
  try {
    body = (await res.text()).trim();
  } catch {
    return FALLBACK_ERROR;
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      const { error, message } = parsed as { error?: unknown; message?: unknown };
      if (typeof error === "string" && error.trim()) return error.trim();
      if (typeof message === "string" && message.trim()) return message.trim();
    }
    return FALLBACK_ERROR;
  } catch {
    // Not JSON — maybe a plain sentence.
  }
  if (body && body.length <= 200 && !body.includes("<")) return body;
  return FALLBACK_ERROR;
}

export function PendingDownload({
  href,
  filename,
  children,
  pendingLabel = "Preparing…",
  className = "",
}: {
  href: string;
  /** Used when the response names no file of its own. */
  filename: string;
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const layout = className.split(/\s+/).some((name) => DISPLAY_UTILITIES.has(name))
    ? "items-center gap-2"
    : "inline-flex items-center gap-2";

  async function download() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(href);
      if (!res.ok) {
        setError(await errorFromResponse(res));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFromDisposition(res.headers.get("Content-Disposition")) ?? filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoked on the next tick: some engines read the URL after `click()`
      // returns, and revoking synchronously cancels the save.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setError(FALLBACK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        aria-busy={busy}
        suppressHydrationWarning
        className={`${layout} transition active:scale-[0.98] disabled:opacity-70 motion-reduce:transform-none ${className}`}
      >
        {busy && <Spinner />}
        {busy ? pendingLabel : children}
      </button>
      {error && (
        <span role="alert" className="text-sm text-crit">
          {error}
        </span>
      )}
    </span>
  );
}
