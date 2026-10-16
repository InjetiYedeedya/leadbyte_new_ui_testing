import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { aeoDownload } from "@/lib/api/aeo-client";
import { readAeoRun } from "@/lib/data/aeo-run";

/**
 * The AEO service's two downloads, handed on from our own origin.
 *
 *   /api/aeo/{jobId}/report.html   the full report
 *   /api/aeo/{jobId}/plugin.zip    the WordPress plugin, built for this site
 *
 * A Route Handler because the service's address is a server variable and a
 * file is not something a Server Action can return. A fixed menu of two, never
 * a passthrough of any path — that would be an open proxy onto the service.
 *
 * The job must be in this account's own (signed) run cookie, the same check
 * every AEO action makes: without it, any audit id in the URL would download
 * another customer's report.
 */

const FILES = {
  "report.html": { type: "text/html; charset=utf-8", name: "aeo-report.html" },
  "plugin.zip": { type: "application/zip", name: "leadbyte-aeo-plugin.zip" },
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string; file: string }> },
) {
  const { jobId, file } = await params;
  const spec = FILES[file as keyof typeof FILES];
  if (!spec) return new NextResponse("Not found", { status: 404 });

  if (!(await getSession())) return new NextResponse("Sign in first", { status: 401 });
  const run = await readAeoRun();
  if (!run?.sites.some((site) => site.id === jobId)) {
    return new NextResponse("That audit isn't part of your run any more.", { status: 404 });
  }

  try {
    const upstream = await aeoDownload(`/api/audits/${encodeURIComponent(jobId)}/${file}`);
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": spec.type,
        // A download, never rendered on our origin: the report is HTML we
        // did not write.
        "Content-Disposition": `attachment; filename="${spec.name}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(`[aeo] download ${file} failed`, error);
    return new NextResponse("We couldn't prepare that download just now. Please try again.", {
      status: 502,
    });
  }
}
