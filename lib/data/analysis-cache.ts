import { revalidateTag } from "next/cache";

/**
 * Pieces of the one backend read the three analysis screens share,
 * `/api/website-analyze/latest`: reading its envelope, and telling Next it
 * changed.
 *
 * ## The cross-request cache that lived here is gone (2026-10-05)
 *
 * This file wrapped the read in `unstable_cache` for 60 seconds per account.
 * In production that did nothing but cost memory: the app runs on Cloudflare
 * Workers through OpenNext, and `open-next.config.ts` configures no shared
 * cache, so every read missed — while Next still turned the whole reply into
 * a string twice per read on its way into a cache that stored nothing. This
 * reply is one of the two biggest the app handles, and the extra copies helped
 * push requests past the Worker's 128 MB limit ("Error 1102").
 *
 * React `cache()` in `website-analysis.ts` still dedupes it within one
 * render, which is where the repeat reads were. If a real shared cache is
 * ever configured in `open-next.config.ts`, a cached read can come back —
 * with `businessId` in the key, because every account hits the SAME url and
 * the key must never be left to the framework.
 */

const tagFor = (businessId: string) => `analysis:${businessId}`;

export interface AnalysisEnvelope {
  data: unknown;
  jobId: string | null;
}

/** Thrown for a 200 that says `success: false`, so it is never cached. */
export class AnalysisRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisRefusedError";
  }
}

/**
 * The analysis inside a `/latest` reply, from any shape it arrives in.
 *
 * `data ?? raw` made the WHOLE envelope the analysis whenever `data` was
 * null or missing — `{ success: false }` included — so the screens mapped an
 * object with no `seo` or `geo`, showed "never analysed", and the cache kept
 * that for a minute. A `data` sent as a JSON string read the same way
 * (audit, 2026-09-29).
 */
export function readAnalysisEnvelope(raw: unknown): AnalysisEnvelope {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  if (body.success === false) {
    throw new AnalysisRefusedError(
      typeof body.error === "string" && body.error !== "" ? body.error : "The analysis read was refused.",
    );
  }
  const jobId = typeof body.job_id === "string" ? body.job_id : null;
  let data: unknown = body.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }
  if (data && typeof data === "object") return { data, jobId };
  // A bare analysis, with no envelope around it.
  if ("brand_profile" in body || "seo" in body || "geo" in body) return { data: body, jobId };
  return { data: null, jobId };
}

/**
 * Tell Next this account's analysis changed.
 *
 * There is no cross-request copy to drop any more (see the note at the top),
 * but `revalidateTag` also marks the browser's router cache stale, so the
 * screen a customer just acted on is re-read. Kept for that, and so the
 * actions that call it need no change.
 */
export async function dropAnalysisCache(businessId: string): Promise<void> {
  revalidateTag(tagFor(businessId));
}
