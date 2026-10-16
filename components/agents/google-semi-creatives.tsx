"use client";

/**
 * Google Ads semi-automation: the customer's own creative.
 *
 * ## Why it earns `"use client"`
 *
 * The same three reasons as `MetaSemiMedia`: per-slot upload state, reading a
 * file's dimensions to enforce its size, and PUTting the bytes to S3 before the
 * form is submitted. The campaign request must carry URLs, never bytes — so the
 * upload happens here and only the results ride the approve submit, in hidden
 * fields.
 *
 * ## Why it is not `MetaSemiMedia`
 *
 * Meta buys ONE asset in one of three shapes, so its picker is a type toggle
 * over a single input. Performance Max composes the ad itself and wants five
 * differently-sized images AT ONCE — three required, two optional — plus an
 * optional video, so this is six independent inputs, each with its own rule, its
 * own state and its own error. What the two genuinely share — the dimension
 * reader, the presign route, the hidden-field handoff — is shared.
 *
 * ## The rules (legacy Google Display spec, 2026-10-02)
 *
 * Images must be EXACTLY their slot's pixel size, and an image whose size the
 * browser cannot read is refused — the size is the requirement, so "couldn't
 * check" cannot pass as "fine". The video is 16:9 within 0.01; a video whose
 * metadata will not load is let through, as Meta's is, because browsers decode
 * fewer video codecs than the ad platforms accept. It can be a YouTube link
 * instead, checked as typed.
 *
 * ## Where it sits
 *
 * In the automation-mode dialog, revealed the moment Semi is chosen, so the
 * creative is in S3 before the agent is asked for the details form.
 */

import Link from "@/components/ui/app-link";
import { directUpload } from "@/lib/data/direct-upload";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  GOOGLE_VIDEO_FIELD,
  GOOGLE_VIDEO_URL_FIELD,
  GOOGLE_YOUTUBE_URL_FIELD,
  YOUTUBE_LINK_PROBLEM,
  acceptsType,
  creativesFor,
  googleMissingMessage,
  imageSizeProblem,
  isYoutubeUrl,
  serialiseCreativeUrls,
  videoRatioMatches,
  type CreativeUrls,
} from "@/lib/data/ads-creatives";
import { readDimensions } from "@/lib/media-dimensions";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

interface SlotState {
  fileName: string;
  status: "uploading" | "done" | "error";
  url?: string;
  error?: string;
  /** Set when the fix is signing in again (`/api/ads-media/upload-url` 401). */
  signIn?: string;
}

/** What `uploadOne` needs to know about a slot, image or video. */
interface UploadTarget {
  name: string;
  accept: string;
  maxBytes: number;
  kind: "image" | "video";
}

const FILE_INPUT =
  "mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-surface-raised file:px-3 file:py-1 file:text-sm file:text-ink disabled:opacity-50";

function limitLabel(bytes: number): string {
  const mb = Math.round(bytes / (1024 * 1024));
  return mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`;
}

export function GoogleSemiCreatives({
  disabled = false,
  onValidityChange,
}: {
  disabled?: boolean;
  /**
   * Reports whether every REQUIRED slot has landed (and the optional video, if
   * started, is usable), so the parent can block "Proceed" until the set is
   * complete — the client half of the gate `readGoogleSemiMedia` enforces.
   */
  onValidityChange?: (valid: boolean) => void;
}) {
  const fields = useMemo(() => creativesFor("google-ads"), []);
  const [slots, setSlots] = useState<Record<string, SlotState>>({});
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const urls: CreativeUrls = {};
  for (const field of fields) {
    const state = slots[field.name];
    if (state?.status === "done" && state.url) urls[field.name] = state.url;
  }
  const video = slots[GOOGLE_VIDEO_FIELD.name];
  const videoUrl = video?.status === "done" && video.url ? video.url : "";

  const youtubeTrimmed = youtubeUrl.trim();
  const youtubeProblem =
    youtubeTrimmed !== "" && !isYoutubeUrl(youtubeTrimmed) ? YOUTUBE_LINK_PROBLEM : null;

  const busy = Object.values(slots).some((s) => s.status === "uploading");
  const missingMessage = googleMissingMessage(urls);
  // Every required slot uploaded, nothing still in flight, and no bad YouTube
  // link. An optional slot mid-upload blocks too: submitting then would drop the
  // file the customer is clearly waiting on.
  const valid = !busy && missingMessage === null && youtubeProblem === null;

  useEffect(() => {
    onValidityChange?.(valid);
  }, [valid, onValidityChange]);

  const hiddenValue = Object.keys(urls).length > 0 ? serialiseCreativeUrls(urls) : "";

  async function uploadOne(target: UploadTarget, check: (file: File) => Promise<string | null>, file: File): Promise<SlotState> {
    const base: SlotState = { fileName: file.name, status: "error" };

    if (file.size > target.maxBytes) {
      return { ...base, error: `Too large — the limit is ${limitLabel(target.maxBytes)}.` };
    }
    const contentType = file.type;
    if (contentType === "") {
      return { ...base, error: "We couldn't read that file's type. Re-pick it." };
    }
    // The picker's `accept` is a suggestion — "All files" is one click away.
    if (!acceptsType(target.accept, contentType)) {
      return {
        ...base,
        error: target.kind === "video" ? "Use an MP4, MOV or WebM video." : "Use a PNG, JPG or WebP image.",
      };
    }
    const problem = await check(file);
    if (problem) return { ...base, error: problem };

    const result = await directUpload(
      { platform: "google", slot: target.name, fileName: file.name, contentType },
      file,
      contentType,
    );
    if (!result.ok) return { ...base, error: result.error, ...(result.signIn ? { signIn: result.signIn } : {}) };
    return { fileName: file.name, status: "done", url: result.url };
  }

  async function onFile(
    target: UploadTarget,
    check: (file: File) => Promise<string | null>,
    file: File | undefined,
  ) {
    if (!file) return;
    setSlots((prev) => ({ ...prev, [target.name]: { fileName: file.name, status: "uploading" } }));
    const result = await uploadOne(target, check, file);
    setSlots((prev) => ({ ...prev, [target.name]: result }));
    // A rejected file must not stay in the input: re-picking the SAME file
    // after fixing nothing would fire no change event, and the customer would
    // be clicking a control that appears dead.
    if (result.status === "error") {
      const input = inputRefs.current[target.name];
      if (input) input.value = "";
    }
  }

  function statusLine(state: SlotState | undefined) {
    if (!state) return null;
    return (
      <p
        role={state.status === "error" ? "alert" : undefined}
        className={`mt-1 flex items-center gap-1.5 text-xs ${state.status === "error" ? "flex-wrap" : "truncate"} ${
          state.status === "done" ? "text-good" : state.status === "error" ? "text-crit" : "text-ink-soft"
        }`}
      >
        {state.status === "uploading" && <Spinner />}
        {state.status === "done"
          ? `Uploaded — ${state.fileName}`
          : state.status === "error"
            ? state.error
            : "Uploading…"}
        {state.status === "error" && state.signIn && (
          <Link href={state.signIn} className="font-medium underline underline-offset-2">
            Sign in again
          </Link>
        )}
      </p>
    );
  }

  function requirement(required: boolean) {
    return (
      <Badge variant={required ? "agent-needs-setup" : "neutral"}>
        {required ? "Required" : "Optional"}
      </Badge>
    );
  }

  const videoTarget: UploadTarget = {
    name: GOOGLE_VIDEO_FIELD.name,
    accept: GOOGLE_VIDEO_FIELD.accept,
    maxBytes: GOOGLE_VIDEO_FIELD.maxBytes,
    kind: "video",
  };

  return (
    <section className="rounded-lg border border-border bg-surface-raised p-4">
      <h3 className="text-sm font-bold text-ink">Google Display image assets</h3>
      <p className="mt-0.5 text-xs text-ink-soft">
        Upload the exact asset sizes needed for Google Display Network placements. Required slots
        must be uploaded before proceeding.
      </p>
      <p className="mt-2 rounded-md bg-info-soft px-3 py-2 text-xs text-info">
        Boost your Ad Strength: upload images in all sizes below (landscape, square &amp; portrait).
        Ads with 3 or more images rate &ldquo;Good&rdquo; or &ldquo;Excellent&rdquo; on Google and
        reach more people.
      </p>

      <div className="mt-3 space-y-3">
        {fields.map((field) => {
          const state = slots[field.name];
          const inputId = `google-creative-${field.name}`;
          const target: UploadTarget = {
            name: field.name,
            accept: field.accept,
            maxBytes: field.maxBytes,
            kind: "image",
          };
          return (
            <div key={field.name}>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={inputId} className="text-sm text-ink">
                  {field.label}
                </label>
                {requirement(field.required)}
              </div>
              <span className="mt-0.5 block text-xs text-ink-soft">{field.hint}</span>
              <input
                id={inputId}
                ref={(el) => {
                  inputRefs.current[field.name] = el;
                }}
                type="file"
                accept={field.accept}
                aria-required={field.required}
                disabled={disabled || state?.status === "uploading"}
                onChange={(e) =>
                  onFile(
                    target,
                    async (file) => imageSizeProblem(field, await readDimensions(file, false)),
                    e.target.files?.[0],
                  )
                }
                suppressHydrationWarning
                className={FILE_INPUT}
              />
              {statusLine(state)}
            </div>
          );
        })}

        <div className="border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="google-creative-video" className="text-sm text-ink">
              {GOOGLE_VIDEO_FIELD.label}
            </label>
            {requirement(false)}
          </div>
          <span className="mt-0.5 block text-xs text-ink-soft">{GOOGLE_VIDEO_FIELD.hint}</span>
          <input
            id="google-creative-video"
            ref={(el) => {
              inputRefs.current[GOOGLE_VIDEO_FIELD.name] = el;
            }}
            type="file"
            accept={GOOGLE_VIDEO_FIELD.accept}
            disabled={disabled || video?.status === "uploading"}
            onChange={(e) =>
              onFile(
                videoTarget,
                async (file) => {
                  const dim = await readDimensions(file, true);
                  return dim && !videoRatioMatches(dim)
                    ? `Video must be 16:9. Your video is ${dim.w}x${dim.h}px.`
                    : null;
                },
                e.target.files?.[0],
              )
            }
            suppressHydrationWarning
            className={FILE_INPUT}
          />
          {statusLine(video)}

          <label htmlFor="google-creative-youtube" className="mt-3 block text-sm text-ink">
            YouTube link
          </label>
          <input
            id="google-creative-youtube"
            type="url"
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=…"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            disabled={disabled}
            aria-invalid={youtubeProblem !== null}
            aria-describedby={youtubeProblem ? "google-creative-youtube-error" : undefined}
            suppressHydrationWarning
            className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink disabled:opacity-50"
          />
          {youtubeProblem && (
            <p id="google-creative-youtube-error" role="alert" className="mt-1 text-xs text-crit">
              {youtubeProblem}
            </p>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs text-ink-soft">
        Video is optional and is mainly used for Performance Max campaigns.
      </p>

      {missingMessage && !busy && (
        <p role="status" className="mt-2 text-xs text-warn">
          {missingMessage}
        </p>
      )}

      {/* Carry the uploads into the approve submit. `readGoogleSemiMedia` reads
          all three on the server. */}
      <input type="hidden" name="creativeUrls" value={hiddenValue} readOnly />
      <input type="hidden" name={GOOGLE_VIDEO_URL_FIELD} value={videoUrl} readOnly />
      <input type="hidden" name={GOOGLE_YOUTUBE_URL_FIELD} value={youtubeTrimmed} readOnly />
    </section>
  );
}
