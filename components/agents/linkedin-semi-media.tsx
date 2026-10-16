"use client";

/**
 * LinkedIn's semi-automation creative, on the automation step (2026-10-08).
 *
 * ## Why this earns `"use client"`
 *
 * Each file goes straight from the browser to S3 through an address our
 * server signs (`/api/ads-media/upload-url`, `platform: "linkedin"`); the
 * bytes never ride the form. Tracking each upload and refusing a mix the ad
 * cannot carry is state.
 *
 * The rules are the live app's (`lib/data/linkedin-semi-media.ts`): optional,
 * up to 10 JPG/PNG images (5 MB each) OR one MP4/MOV video (100 MB). Only the
 * uploaded URLs are posted, as JSON under `LINKEDIN_SEMI_INPUT`, and the
 * server checks them again. Built from `SocialMediaUploader`, which carries
 * the same images-or-a-video rule.
 */

import Link from "@/components/ui/app-link";
import { directUpload } from "@/lib/data/direct-upload";
import { useEffect, useId, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { SIGN_IN_AGAIN } from "@/lib/data/upload-messages";
import {
  LINKEDIN_IMAGE_TYPES,
  LINKEDIN_SEMI_INPUT,
  LINKEDIN_VIDEO_TYPES,
  linkedInFileProblem,
  linkedInMediaKind,
  linkedInMixProblem,
  type LinkedInMediaKind,
  type LinkedInSemiMedia,
} from "@/lib/data/linkedin-semi-media";

const ACCEPT = [...LINKEDIN_IMAGE_TYPES, ...LINKEDIN_VIDEO_TYPES].join(",");

interface Item {
  key: string;
  name: string;
  kind: LinkedInMediaKind;
  status: "uploading" | "done" | "error";
  url?: string;
  error?: string;
}

export function LinkedInSemiMediaUploader({
  onValidityChange,
}: {
  /** False while an upload is still running — nothing is required. */
  onValidityChange: (valid: boolean) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [signIn, setSignIn] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const done = items.filter((item) => item.status === "done" && item.url);
  const busy = items.some((item) => item.status === "uploading");
  const media: LinkedInSemiMedia = {
    images: done.filter((item) => item.kind === "image").map((item) => item.url!),
    video: done.find((item) => item.kind === "video")?.url ?? null,
  };

  useEffect(() => {
    onValidityChange(!busy);
  }, [busy, onValidityChange]);

  async function upload(file: File, key: string, kind: LinkedInMediaKind): Promise<Item> {
    const base: Item = { key, name: file.name, kind, status: "error" };
    const result = await directUpload(
      { platform: "linkedin", fileName: file.name, contentType: file.type },
      file,
      file.type,
    );
    if (!result.ok) {
      if (result.signIn) setSignIn(result.signIn);
      return { ...base, error: result.signIn ? "Not uploaded" : result.error };
    }
    return { ...base, status: "done", url: result.url };
  }

  async function onFiles(list: FileList | null) {
    setNote(null);
    setSignIn(null);
    const files = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;

    for (const file of files) {
      const problem = linkedInFileProblem(file);
      if (problem) {
        setNote(problem);
        return;
      }
    }
    const kinds = files.map((file) => linkedInMediaKind(file.type) ?? "image");
    const kept = items.filter((item) => item.status !== "error").map((item) => item.kind);
    const problem = linkedInMixProblem(kept, kinds);
    if (problem) {
      setNote(problem);
      return;
    }

    const started = files.map((file, index) => ({
      file,
      kind: kinds[index] ?? "image",
      key: `${Date.now()}-${index}-${file.name}`,
    }));
    setItems((current) => [
      ...current.filter((item) => item.status !== "error"),
      ...started.map(({ file, kind, key }) => ({ key, name: file.name, kind, status: "uploading" as const })),
    ]);
    const results = await Promise.all(started.map(({ file, key, kind }) => upload(file, key, kind)));
    setItems((current) => current.map((item) => results.find((result) => result.key === item.key) ?? item));
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <label htmlFor={`${id}-files`} className="mb-1 block text-sm font-medium text-ink">
        Upload your ad creative <span className="font-normal text-ink-soft">(optional)</span>
      </label>
      <p id={`${id}-hint`} className="mb-2 text-xs text-ink-soft">
        Up to 10 images (JPG or PNG, 5 MB each), or 1 video (MP4 or MOV, 100 MB). Single image, text and
        spotlight ads use one image; a carousel uses 2–10; an event ad needs no file.
      </p>
      <input
        ref={inputRef}
        id={`${id}-files`}
        type="file"
        accept={ACCEPT}
        multiple
        disabled={busy}
        aria-describedby={`${id}-hint`}
        onChange={(event) => void onFiles(event.target.files)}
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-surface-raised file:px-3 file:py-1 file:text-sm file:text-ink disabled:opacity-60"
      />

      {/* Only the uploaded URLs travel with the form. */}
      <input type="hidden" name={LINKEDIN_SEMI_INPUT} value={JSON.stringify(media)} />

      {items.length > 0 && (
        <ul aria-live="polite" className="mt-3 space-y-1.5">
          {items.map((item) => (
            <li key={item.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-ink">{item.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span
                  className={
                    item.status === "done"
                      ? "text-good"
                      : item.status === "error"
                        ? "text-crit"
                        : "flex items-center gap-1.5 text-ink-soft"
                  }
                >
                  {item.status === "uploading" && <Spinner />}
                  {item.status === "done" ? "Uploaded" : item.status === "error" ? item.error : "Uploading…"}
                </span>
                {item.status !== "uploading" && (
                  <button
                    type="button"
                    onClick={() => setItems((current) => current.filter((other) => other.key !== item.key))}
                    aria-label={`Remove ${item.name}`}
                    className="inline-flex size-11 items-center justify-center rounded-md text-ink-soft hover:bg-surface-raised hover:text-ink"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {media.images.length > 1 && (
        <p className="mt-2 text-xs text-ink-soft">{media.images.length} images selected.</p>
      )}

      {note && (
        <p role="alert" className="mt-2 text-sm text-crit">
          {note}
        </p>
      )}

      {signIn && (
        <p role="alert" className="mt-2 text-sm text-crit">
          {SIGN_IN_AGAIN}{" "}
          <Link href={signIn} className="font-medium underline underline-offset-2">
            Sign in again
          </Link>
        </p>
      )}
    </div>
  );
}
