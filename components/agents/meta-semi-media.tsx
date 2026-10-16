"use client";

/**
 * Meta Ads semi-automation: the customer's own creative.
 *
 * ## Why it earns `"use client"`
 *
 * Three things a `<form action>` cannot express: a media-type toggle that
 * reshapes the picker, reading each file's dimensions to enforce an aspect
 * ratio, and uploading the bytes straight to S3 before the form is submitted.
 * The campaign request must carry URLs, never bytes — so the upload happens
 * here, and only the resulting `semiAutomationMedia` object rides the form via a
 * hidden field.
 *
 * ## The upload path
 *
 * The browser cannot call the backend's signer (no JWT, blocked Origin), so it
 * asks our `/api/ads-media/upload-url` for a presigned PUT, then PUTs the file
 * to S3 itself with no app credentials. Google's five creative slots ride the
 * same route and the same pattern — see `GoogleSemiCreatives`. Server-side validation in
 * `submitSemiForm` is the real gate; the checks here are the fast, friendly one.
 *
 * Switching type clears the picked files — a square image is not a vertical
 * video, and carrying one over would submit a mismatch.
 */

import Link from "@/components/ui/app-link";
import { directUpload } from "@/lib/data/direct-upload";
import { useEffect, useRef, useState } from "react";
import { readDimensions } from "@/lib/media-dimensions";
import { Spinner } from "@/components/ui/spinner";
import { SIGN_IN_AGAIN } from "@/lib/data/upload-messages";
import {
  SEMI_MEDIA_SPECS,
  SEMI_MEDIA_TYPES,
  acceptsFileType,
  buildSemiAutomationMedia,
  semiRatioMatches,
  type SemiMediaType,
} from "@/lib/data/meta-semi-media";

interface Picked {
  name: string;
  status: "uploading" | "done" | "error";
  url?: string;
  error?: string;
  /** Set when the fix is signing in again (`/api/ads-media/upload-url` 401). */
  signIn?: string;
}

export function MetaSemiMedia({
  disabled = false,
  onValidityChange,
}: {
  disabled?: boolean;
  /**
   * Reports whether the uploaded set satisfies the type's rules, so the parent
   * can block "Proceed" until the creative is ready — the client half of the
   * gate the Server Action also enforces.
   */
  onValidityChange?: (valid: boolean) => void;
}) {
  const [type, setType] = useState<SemiMediaType>("image");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [signIn, setSignIn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const spec = SEMI_MEDIA_SPECS[type];
  const doneUrls = picked.filter((p) => p.status === "done" && p.url).map((p) => p.url!);
  // The value that rides the form. Empty until at least one file has landed;
  // the server validates the counts, so a partial carousel is caught there too.
  const hiddenValue =
    doneUrls.length > 0 ? JSON.stringify(buildSemiAutomationMedia(type, doneUrls)) : "";

  // Valid enough to proceed: a full set for the type, and nothing mid-upload.
  const valid = !busy && (type === "carousel" ? doneUrls.length >= 2 : doneUrls.length >= 1);
  useEffect(() => {
    onValidityChange?.(valid);
  }, [valid, onValidityChange]);

  function switchType(next: SemiMediaType) {
    if (next === type) return;
    setType(next);
    setPicked([]);
    setNote(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function uploadOne(file: File): Promise<Picked> {
    if (file.size > spec.maxBytes) {
      return { name: file.name, status: "error", error: `Too large — the limit is ${Math.round(spec.maxBytes / (1024 * 1024))} MB.` };
    }
    const contentType = file.type;
    if (contentType === "") {
      return { name: file.name, status: "error", error: "We couldn't read that file's type. Re-pick it." };
    }
    // The picker's `accept` is a suggestion — "All files" is one click away.
    if (!acceptsFileType(spec, contentType)) {
      return {
        name: file.name,
        status: "error",
        error: type === "video" ? "Use an MP4, MOV or WebM video." : "Use a JPG or PNG image.",
      };
    }

    // Aspect ratio: 1:1 for an image or carousel, 9:16 for a video (legacy
    // spec, 2026-10-02). A file whose shape cannot be read is let through, as
    // before — the browser failing to decode it is not the customer's error.
    if (spec.ratio) {
      const dim = await readDimensions(file, type === "video");
      if (dim && !semiRatioMatches(dim, spec)) {
        return { name: file.name, status: "error", error: `Must be ${spec.ratio.label} — this is ${dim.w}×${dim.h}.` };
      }
    }

    const result = await directUpload({ platform: "meta", fileName: file.name, contentType, type }, file, contentType);
    if (!result.ok) {
      return { name: file.name, status: "error", error: result.error, ...(result.signIn ? { signIn: result.signIn } : {}) };
    }
    return { name: file.name, status: "done", url: result.url };
  }

  /**
   * A rejected pick must not stay in the input: choosing the SAME file again
   * to retry fires no change event, so the control would look dead — the
   * rule `google-semi-creatives.tsx` already follows. The input carries no
   * `name`; what is submitted is the hidden field built from `picked`.
   */
  function clearInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onFiles(fileList: FileList | null) {
    setNote(null);
    setSignIn(null);
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    if (files.length > spec.maxFiles) {
      setNote(`Choose at most ${spec.maxFiles} ${spec.maxFiles === 1 ? "file" : "files"} for a ${type}.`);
      clearInput();
      return;
    }

    setBusy(true);
    // Show them as uploading first, then replace with the results.
    setPicked(files.map((f) => ({ name: f.name, status: "uploading" as const })));
    const results = await Promise.all(files.map(uploadOne));
    setPicked(results);
    setBusy(false);
    if (results.some((r) => r.status === "error")) clearInput();

    // Each file's own reason is on its row; the note used to repeat the first
    // one word for word underneath it (2026-10-01). It now speaks only for the
    // case a row cannot fix: the sign-in has expired, with where to go.
    setSignIn(results.find((r) => r.signIn)?.signIn ?? null);
  }

  return (
    <section className="rounded-lg border border-border bg-surface-raised p-4">
      <h3 className="mb-1 text-sm font-bold text-ink">Your creative</h3>
      <p className="mb-3 text-xs text-ink-soft">
        You supply the creative and the agent builds the campaign around it.
      </p>

      {/* The three-way media-type toggle. */}
      <div className="mb-3 inline-flex rounded-lg border border-border p-0.5">
        {SEMI_MEDIA_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => switchType(t)}
            disabled={disabled || busy}
            suppressHydrationWarning
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition disabled:opacity-50 ${
              type === t ? "bg-accent text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none" : "text-ink-soft hover:text-ink"
            }`}
          >
            {SEMI_MEDIA_SPECS[t].label}
          </button>
        ))}
      </div>

      <p className="mb-2 text-xs text-ink-soft">{spec.hint}</p>

      <input
        ref={inputRef}
        type="file"
        accept={spec.accept}
        multiple={spec.maxFiles > 1}
        disabled={disabled || busy}
        onChange={(e) => onFiles(e.target.files)}
        suppressHydrationWarning
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-surface-raised file:px-3 file:py-1 file:text-sm file:text-ink disabled:opacity-50"
      />

      {/* Carries the built object into the form submit. */}
      <input type="hidden" name="semiAutomationMedia" value={hiddenValue} readOnly />

      {picked.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-live="polite">
          {picked.map((p, i) => (
            <li key={`${p.name}-${i}`} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-ink">{p.name}</span>
              <span
                className={
                  p.status === "done"
                    ? "shrink-0 text-good"
                    : p.status === "error"
                      ? "shrink-0 text-crit"
                      : "flex shrink-0 items-center gap-1.5 text-ink-soft"
                }
              >
                {p.status === "uploading" && <Spinner />}
                {p.status === "done" ? "Uploaded" : p.status === "error" ? (p.signIn ? "Not uploaded" : p.error) : "Uploading…"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {type === "carousel" && doneUrls.length === 1 && (
        <p className="mt-2 text-xs text-warn">A carousel needs at least 2 images — add one more.</p>
      )}

      {note && (
        <p role="alert" className="mt-2 text-xs text-crit">
          {note}
        </p>
      )}

      {signIn && (
        <p role="alert" className="mt-2 text-xs text-crit">
          {SIGN_IN_AGAIN}{" "}
          <Link href={signIn} className="font-medium underline underline-offset-2">
            Sign in again
          </Link>
        </p>
      )}
    </section>
  );
}
