/**
 * The three-model creative prompt pick.
 *
 * ## The contract (FRONTEND_BACKEND_API_CALLS.md §5)
 *
 *   POST /api/creative/generate-prompts  -> { job_id, selection_token, ready, media_type, … }
 *   POST /api/creative/get-prompts       -> { ready, prompts: [{ index, model, prompt, … }] }
 *   POST /api/creative/select-prompt     -> { status: "accepted", chosen }
 *
 * Three models each write a prompt; the customer picks one; the pick then rides
 * on the launch body as `selected_prompt`, `selected_prompt_index` and
 * `selected_prompt_model`. Those three fields were documented in
 * `ads-launch-payload.ts` as "cannot fill in yet" — this is what fills them.
 *
 * ## Why it is asked for, not assumed
 *
 * `selectionMode: "ask"` is a constant in every observed launch. The pipeline
 * writes three candidates BECAUSE somebody is meant to choose; picking for
 * them — first, longest, or whichever model we like this month — spends the
 * customer's ad budget on a creative direction they never saw.
 *
 * ## Why `index` is preserved and never recomputed
 *
 * `select-prompt` sends the index back as `chosen`. An unreadable candidate is
 * dropped from the list, so array position and `index` diverge — and a pick
 * sent by position would select a different prompt than the one on screen.
 *
 * Pure. The transport is in `creative-prompts-api.ts`.
 */

export interface PromptJob {
  jobId: string;
  /** `selection_token`, also sent as `token`. Needed for every later call. */
  token: string;
  mediaType?: string;
  aspectRatio?: string;
}

export interface PromptChoice {
  /** The BACKEND's index. Sent back as `chosen`. Never the array position. */
  index: number;
  model: string;
  prompt: string;
  warnings: string[];
}

export interface PromptRequest {
  jobId: string;
  userId: string;
  productDescription: string;
  offerDetails: string;
  /** `image` or `video`. */
  adFormat: string;
  /** `meta`, `google`, `linkedin`. */
  whichAds: string;
}

export function promptRequest(input: PromptRequest): Record<string, unknown> {
  return {
    job_id: input.jobId,
    user_id: input.userId,
    product_description: input.productDescription,
    offer_details: input.offerDetails,
    ad_format: input.adFormat,
    which_ads: input.whichAds,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The started job, or null when we did not get a usable handle on one. */
export function readPromptJob(payload: unknown): PromptJob | null {
  const body = record(payload);
  if (body === null) return null;

  const jobId = str(body.job_id ?? body.jobId);
  const token = str(body.selection_token ?? body.token);
  // Both, or nothing: polling needs the pair, and half a handle would send a
  // request that can never match.
  if (jobId === "" || token === "") return null;

  const mediaType = str(body.media_type ?? body.mediaType);
  const aspectRatio = str(body.aspect_ratio ?? body.aspectRatio);

  return {
    jobId,
    token,
    ...(mediaType === "" ? {} : { mediaType }),
    ...(aspectRatio === "" ? {} : { aspectRatio }),
  };
}

/**
 * The candidates, and whether they are ready.
 *
 * Done, by the legacy spec's rule: the job says `complete: true`, or its
 * status is `selected`, or three or more prompts have arrived — AND at least
 * one of them has text. The backend's own `ready` is not what decides it; the
 * spec's rule is, so the picker opens once and on the full set rather than on
 * whichever models happened to finish first.
 *
 * The text half matters as much: a `ready: true` beside an empty list would
 * open a picker with no options in it, which reads as a broken screen rather
 * than a wait.
 */
export function readPrompts(payload: unknown): { ready: boolean; prompts: PromptChoice[] } {
  const body = record(payload);
  const raw = Array.isArray(body?.prompts) ? body.prompts : [];

  const prompts = raw.flatMap((entry, position): PromptChoice[] => {
    const item = record(entry);
    const prompt = str(item?.prompt);
    if (prompt === "") return [];

    const index = typeof item?.index === "number" ? item.index : position;
    return [
      {
        index,
        model: str(item?.model) || "unknown",
        prompt,
        warnings: Array.isArray(item?.warnings) ? item.warnings.filter((w) => str(w) !== "") : [],
      },
    ];
  });

  const finished = body?.complete === true || str(body?.status) === "selected" || raw.length >= 3;
  return { ready: finished && prompts.length > 0, prompts };
}
