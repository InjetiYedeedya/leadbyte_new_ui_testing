import { parseByteRange } from "@/lib/byte-range";

/**
 * The background video's reply for one request: the whole file, the asked-for
 * byte range (`206`), or `416` for a range past the end.
 *
 * Shared by `worker.ts`, which answers `/background-video` on Cloudflare
 * BEFORE Next starts, and `app/background-video/route.ts`, which answers it in
 * `next dev`. One rule for both, so the two cannot drift.
 *
 * Plain Web APIs only — no Next, no Node — because the Worker entry runs it
 * outside the Next bundle.
 */

export const VIDEO_FILE = "/animated-bg_2.mp4";

const COMMON = {
  "Content-Type": "video/mp4",
  "Accept-Ranges": "bytes",
  // A day: the file behind this path is replaced only by a deploy.
  "Cache-Control": "public, max-age=86400",
};

export function videoResponse(request: Request, data: ArrayBuffer, withBody: boolean): Response {
  const size = data.byteLength;
  const range = parseByteRange(request.headers.get("range"), size);

  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...COMMON, "Content-Range": `bytes */${size}` } });
  }
  if (range === null) {
    return new Response(withBody ? data : null, {
      status: 200,
      headers: { ...COMMON, "Content-Length": String(size) },
    });
  }
  const length = range.end - range.start + 1;
  return new Response(withBody ? data.slice(range.start, range.end + 1) : null, {
    status: 206,
    headers: {
      ...COMMON,
      "Content-Length": String(length),
      "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
    },
  });
}
