import { getCloudflareContext } from "@opennextjs/cloudflare";
import { APP_URL } from "@/lib/api/config";
import { VIDEO_FILE, videoResponse } from "@/lib/edge/video-response";

/**
 * The signed-in background video, served with byte ranges.
 *
 * ## Why this exists
 *
 * The live site served `/animated-bg_2.mp4` as a static asset that ignores
 * `Range` — every request got the whole file with `200` and no
 * `Accept-Ranges`. Chrome plays that anyway. Safari does not: on a Mac, and in
 * EVERY browser on an iPhone or iPad (they all use Safari's engine), a video
 * whose server will not answer `206 Partial Content` does not play, so the
 * background broke in production (measured 2026-09-29). This answers ranges
 * itself.
 *
 * ## Where the bytes come from
 *
 * The same static file, read once per server instance and kept: from the
 * Workers asset binding on Cloudflare, or from our own origin anywhere else
 * (`next dev`). `APP_URL`, never the request's Host header, which a caller
 * controls.
 *
 * ## On Cloudflare this route is not reached
 *
 * `worker.ts` answers `/background-video` itself, before Next starts. Each
 * page load asks for the video in five or six pieces, and running all of Next
 * for every piece was the single biggest cause of Error 1102 (CPU limit) in
 * the 2026-10-10 log: 19 of 33 killed requests. This route is what serves it
 * in `next dev`; both use `videoResponse`.
 */

let bytes: Promise<ArrayBuffer> | null = null;

async function loadVideo(): Promise<ArrayBuffer> {
  let response: Response;
  try {
    const { env } = getCloudflareContext();
    const assets = (env as { ASSETS?: { fetch: (input: string) => Promise<Response> } }).ASSETS;
    if (!assets) throw new Error("no asset binding");
    response = await assets.fetch(`https://assets.local${VIDEO_FILE}`);
  } catch {
    response = await fetch(`${APP_URL}${VIDEO_FILE}`);
  }
  if (!response.ok) throw new Error(`background video: ${response.status}`);
  return response.arrayBuffer();
}

function video(): Promise<ArrayBuffer> {
  if (!bytes) {
    bytes = loadVideo().catch((error: unknown) => {
      // Not remembered: the next request tries again.
      bytes = null;
      throw error;
    });
  }
  return bytes;
}

async function respond(request: Request, withBody: boolean): Promise<Response> {
  let data: ArrayBuffer;
  try {
    data = await video();
  } catch (error) {
    console.error("[background-video] could not read the file:", error);
    return new Response(null, { status: 502 });
  }
  return videoResponse(request, data, withBody);
}

export function GET(request: Request): Promise<Response> {
  return respond(request, true);
}

export function HEAD(request: Request): Promise<Response> {
  return respond(request, false);
}
