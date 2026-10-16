"use client";

/**
 * The customer's own images or video for a Semi-automation social post.
 *
 * ## Why this earns `"use client"`
 *
 * Each file goes straight from the browser to S3 — the bytes never belong in
 * the form post — through a short-lived upload address our server signs
 * (`/api/ads-media/upload-url`, `platform: "social"`). Tracking each file's
 * upload, and refusing a mix the post cannot carry, is state.
 *
 * The rules are the legacy `MediaUploader`'s for social posts: up to 10
 * images (more than one is a carousel) OR one video, never both, 1 GB at
 * most. Only the uploaded URLs are posted, as JSON (`decodeSocialMedia` reads
 * them back); `validateSocial` repeats every rule on the server.
 */

import Link from "@/components/ui/app-link";
import { useEffect, useId, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { SIGN_IN_AGAIN } from "@/lib/data/upload-messages";
import {
  MAX_SOCIAL_IMAGES,
  MAX_SOCIAL_VIDEOS,
  SOCIAL_INPUT,
  type SocialMediaFile,
} from "@/lib/data/social-media-setup";

const MAX_BYTES = 1024 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];
const ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES].join(",");

interface Item {
  key: string;
  name: string;
  kind: "image" | "video";
  status: "uploading" | "done" | "error";
  url?: string;
  error?: string;
}

/** Why a set of new files cannot join what is already there, or null. Pure, so it is tested. */
export function mixProblem(existing: ("image" | "video")[], adding: ("image" | "video")[]): string | null {
  const all = [...existing, ...adding];
  const images = all.filter((kind) => kind === "image").length;
  const videos = all.filter((kind) => kind === "video").length;
  if (images > 0 && videos > 0) {
    if (existing.includes("image")) return "You already added images. Remove them to upload a video instead.";
    if (existing.includes("video")) return "You already added a video. Remove it to upload images instead.";
    return "Upload images or a video — not both in the same post.";
  }
  if (videos > MAX_SOCIAL_VIDEOS) return "You can upload only 1 video.";
  if (images > MAX_SOCIAL_IMAGES) {
    const room = MAX_SOCIAL_IMAGES - existing.length;
    return `You can upload up to ${MAX_SOCIAL_IMAGES} images. You can add ${Math.max(0, room)} more.`;
  }
  return null;
}

export function SocialMediaUploader() {
  const [items, setItems] = useState<Item[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [signIn, setSignIn] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const validityRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const done = items.filter((item) => item.status === "done" && item.url);
  const busy = items.some((item) => item.status === "uploading");
  const media: SocialMediaFile[] = done.map((item) => ({ url: item.url!, kind: item.kind }));
  const images = done.filter((item) => item.kind === "image").length;

  // The browser's own "required" message, because a hidden input cannot be
  // required: nothing uploaded yet, or an upload still running.
  useEffect(() => {
    validityRef.current?.setCustomValidity(
      busy ? "Wait for the upload to finish." : done.length === 0 ? "Upload an image or a video first." : "",
    );
  }, [busy, done.length]);

  async function upload(file: File, key: string, kind: "image" | "video"): Promise<Item> {
    const base: Item = { key, name: file.name, kind, status: "error" };
    try {
      const signRes = await fetch("/api/ads-media/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "social", fileName: file.name, contentType: file.type }),
      });
      const signed = (await signRes.json()) as { uploadUrl?: string; fileUrl?: string; error?: string; signIn?: string };
      if (!signRes.ok || !signed.uploadUrl || !signed.fileUrl) {
        if (signed.signIn) setSignIn(signed.signIn);
        return { ...base, error: signed.signIn ? "Not uploaded" : (signed.error ?? "Couldn't prepare the upload.") };
      }
      // Straight to S3. The Content-Type must match what was signed, and no
      // Authorization header goes with it — the signature is the permission.
      const put = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) return { ...base, error: "The upload was refused. Try again." };
      return { ...base, status: "done", url: signed.fileUrl };
    } catch {
      return { ...base, error: "Upload failed. Check your connection and retry." };
    }
  }

  async function onFiles(list: FileList | null) {
    setNote(null);
    setSignIn(null);
    const files = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;

    const unsupported = files.find((file) => !IMAGE_TYPES.includes(file.type) && !VIDEO_TYPES.includes(file.type));
    if (unsupported) {
      setNote(`${unsupported.name} isn't supported. Use JPG, PNG or WebP images, or an MP4 or MOV video.`);
      return;
    }
    const tooBig = files.find((file) => file.size > MAX_BYTES);
    if (tooBig) {
      setNote(`${tooBig.name} is over the 1 GB limit.`);
      return;
    }
    const kinds = files.map((file) => (VIDEO_TYPES.includes(file.type) ? "video" : "image") as "image" | "video");
    const kept = items.filter((item) => item.status !== "error").map((item) => item.kind);
    const problem = mixProblem(kept, kinds);
    if (problem) {
      setNote(problem);
      return;
    }

    const started = files.map((file, index) => ({
      file,
      kind: kinds[index]!,
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
    <div>
      <label htmlFor={`${id}-files`} className="mb-1 block text-sm font-medium text-ink">
        Upload your media
        <span className="text-crit" aria-hidden="true">
          {" *"}
        </span>
      </label>
      <p id={`${id}-hint`} className="mb-2 text-xs text-ink-soft">
        Up to 10 images, or 1 video (1 GB at most). JPG, PNG or WebP images; MP4 or MOV video. More than one
        image is published as a carousel.
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
      <input type="hidden" name={SOCIAL_INPUT.media} value={JSON.stringify(media)} />
      <input
        ref={validityRef}
        tabIndex={-1}
        aria-hidden="true"
        required
        value={done.length > 0 && !busy ? "ok" : ""}
        onChange={() => {}}
        className="sr-only"
      />

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

      {images > 1 && (
        <p className="mt-2 text-xs text-ink-soft">
          {images} images selected — these will be published as a carousel post.
        </p>
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
