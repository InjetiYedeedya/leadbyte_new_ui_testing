import { isProbePath } from "./probe-paths";
import { VIDEO_FILE, videoResponse } from "./video-response";

/**
 * Requests the Cloudflare Worker answers BEFORE Next.js starts.
 *
 * ## Why this exists
 *
 * The app runs on the Workers Free plan, which allows 10ms of CPU per
 * request. Starting Next for a request costs more than that on its own, and
 * Cloudflare answers with "Error 1102" once too many requests run over. The
 * 2026-10-10 log had 33 such kills, and most of them were requests that never
 * needed Next at all: pieces of the background video (19 of the 33) and bots
 * probing for `/.env`. Those are answered here in about a millisecond.
 *
 * Returns `null` for everything else, which `worker.ts` hands to Next.
 *
 * Plain Web APIs only — this runs outside the Next bundle.
 */

export interface AssetsBinding {
  fetch: (input: string) => Promise<Response>;
}

let videoBytes: Promise<ArrayBuffer> | null = null;

/** The video, read from the asset binding once per Worker instance and kept. */
function readVideo(assets: AssetsBinding): Promise<ArrayBuffer> {
  if (!videoBytes) {
    videoBytes = assets
      .fetch(`https://assets.local${VIDEO_FILE}`)
      .then((response) => {
        if (!response.ok) throw new Error(`background video: ${response.status}`);
        return response.arrayBuffer();
      })
      .catch((error: unknown) => {
        // Not remembered: the next request tries again.
        videoBytes = null;
        throw error;
      });
  }
  return videoBytes;
}

export async function frontDoor(request: Request, assets: AssetsBinding | undefined): Promise<Response | null> {
  const { pathname } = new URL(request.url);

  if (pathname === "/background-video" && assets && (request.method === "GET" || request.method === "HEAD")) {
    try {
      const data = await readVideo(assets);
      return videoResponse(request, data, request.method === "GET");
    } catch (error) {
      // Let Next's route try instead — it has its own fallback.
      console.error("[front-door] could not read the background video:", error);
      return null;
    }
  }

  if (isProbePath(pathname)) {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
    });
  }

  return null;
}

/** For tests: forget the kept video. */
export function resetFrontDoorForTests(): void {
  videoBytes = null;
}
