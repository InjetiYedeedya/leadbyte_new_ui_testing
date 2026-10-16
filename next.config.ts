import type { NextConfig } from "next";
import { execSync } from "node:child_process";

/**
 * The commit this build was made from, sent on every response as `X-Build`.
 * There was no way to tell whether a push had reached app.leadbyte.ai, so a
 * fix that was not live yet looked exactly like a fix that did not work
 * (2026-10-12). Cloudflare's builder names the commit in
 * `WORKERS_CI_COMMIT_SHA`; elsewhere git is asked. Seven characters, the
 * same as GitHub shows.
 */
function buildCommit(): string {
  const fromCi = process.env.WORKERS_CI_COMMIT_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

/** See the `headers()` note: a week in the browser, a month of background refresh. */
const LONG_CACHE = [
  { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" },
];

/**
 * The browser-side security policy, sent on every response (audit,
 * 2026-09-25 — until then only the COOP header below was set).
 *
 * - `frame-ancestors 'none'` + `X-Frame-Options: DENY`: no other site may put
 *   these pages in a frame, which is what made the admin panel clickjackable.
 * - Scripts only from here and Google (Firebase sign-in loads
 *   `apis.google.com`). `'unsafe-inline'` stays because Next's streamed pages
 *   carry inline bootstrap scripts; `'unsafe-eval'` only in development, where
 *   React needs it.
 * - `connect-src https:` rather than a host list: the browser PUTs uploads
 *   straight to a presigned S3 URL and talks to Firebase, and a list that
 *   drifts from those breaks uploads or sign-in silently.
 * - `form-action` includes Stripe for when billing is switched on.
 * - Razorpay (INR payments): its checkout script, and its payment window and
 *   bank pages, which open in frames and post forms back to Razorpay.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"} https://apis.google.com https://www.gstatic.com https://*.firebaseapp.com https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://*.google.com https://api.razorpay.com https://checkout.razorpay.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com https://api.razorpay.com",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /** Do not advertise the framework and version on every response. */
  poweredByHeader: false,

  /**
   * Next's dev-mode badge, off.
   *
   * It renders a spinning "N" disc in the bottom corner of every page in dev
   * and nowhere in production — which reads as a page that never finishes
   * loading, on screens whose whole job is to show real progress. Nothing of
   * ours was ever loading there.
   */
  devIndicators: false,

  /**
   * Server Actions cap a request body at 1MB by default, and the Lead
   * Qualification agent is handed a spreadsheet of leads — a few thousand rows
   * clears that easily. The upload goes THROUGH the action (the presigned URL
   * is minted with the customer's JWT and must not reach the browser), so the
   * file counts against this limit.
   *
   * 10MB matches the cap the legacy app puts on its own document uploads.
   */
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },

    /**
     * How long the browser may reuse a page it has already loaded.
     *
     * Next 15 ships `dynamic: 0`, which means the client router cache is OFF
     * for every page here (they are all dynamic — each one reads cookies). So
     * Overview → Analytics → back to Overview rebuilt Overview on the server
     * from scratch, a 1-3.5s round trip for a screen the browser had rendered
     * seconds earlier. That back-and-forth is the most common movement in the
     * app and it was the most expensive.
     *
     * 30s is deliberately shorter than the 60s the Zippygo admin app uses for
     * the same job, because more of this app's data is written from inside it.
     * It is only a FLOOR on staleness for plain navigation: a Server Action
     * that calls `revalidatePath`/`revalidateTag` clears this cache
     * immediately, and all 43 of ours do, so anything the customer changes is
     * still seen at once. The window only applies to changes made elsewhere —
     * another tab, n8n finishing a job — and those were never live anyway.
     *
     * `static` is ALSO 30s, not Next's default 5 minutes. Nothing here is
     * static, but a FULL prefetch (`prefetch={true}`, the Overview sub-tabs
     * and hover-prefetched primary tabs) is kept for the `static` time, so the
     * default let a prefetched tab show data five minutes old.
     */
    staleTimes: { dynamic: 30, static: 30 },

    /**
     * Import only the parts of these packages a file uses. Neither is on
     * Next's built-in list, and `framer-motion` ships on most main screens.
     */
    optimizePackageImports: ["framer-motion", "@phosphor-icons/react"],
  },

  /**
   * Images: AVIF where the browser takes it (30-50% smaller than WebP), and
   * the optimised copies kept for a month rather than Next's default 60
   * seconds. With the default, the login photo — the largest image in the
   * app — was re-checked with the server about once a minute, and a cold
   * width had the server decode the full 1.5 MB original again.
   */
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 31,
  },

  /**
   * The three analysis screens moved out of /intelligence into /overview on
   * 2026-09-02. Permanent redirects keep old links and bookmarks working —
   * `/intelligence/connections` is deliberately NOT redirected: that route
   * still exists, it is only hidden from the nav.
   */
  async redirects() {
    return [
      {
        source: "/intelligence/business-profile",
        destination: "/overview/business-profile",
        permanent: true,
      },
      {
        source: "/intelligence/website-audit",
        destination: "/overview/website-audit",
        permanent: true,
      },
      {
        source: "/intelligence/geo-analysis",
        destination: "/overview/geo-analysis",
        permanent: true,
      },
    ];
  },

  async headers() {
    return [
      {
        /**
         * The big files in `public/`, kept by the browser for a week.
         *
         * Next serves `public/` with `max-age=0`, so the 3 MB background video
         * behind every signed-in page, its poster and the login photo were
         * downloaded AGAIN on every full page load — measured 2026-09-24: the
         * same 2,910 KB on eight loads in a row. A week, not "immutable",
         * because the names carry no version: replacing a file under the same
         * name is visible within the week, and a renamed file at once.
         */
        source: "/animated-bg_2.mp4",
        headers: LONG_CACHE,
      },
      ...[
        "/animated-bg_1-poster.webp",
        "/login-img.jpg",
        "/leadbyte-logo.png",
        "/google-ads.jpg",
        "/meta.avif",
      ].map((source) => ({ source, headers: LONG_CACHE })),
      {
        source: "/:path*",
        headers: [
          {
            /**
             * Firebase's signInWithPopup opens Google's consent screen in a
             * popup and then polls `popup.closed` to know when the user is
             * done. Under the default Cross-Origin-Opener-Policy the browser
             * severs the opener relationship, that read is blocked, and the
             * sign-in never resolves — the console shows
             * "Cross-Origin-Opener-Policy policy would block the window.closed
             * call" and the popup hangs.
             *
             * `same-origin-allow-popups` keeps the isolation for this page
             * while still permitting popups we opened to be observed, which is
             * exactly what the Google flow needs.
             */
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          ...SECURITY_HEADERS,
          { key: "X-Build", value: buildCommit() },
        ],
      },
    ];
  },
};

export default nextConfig;
