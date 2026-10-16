import type { ComponentProps } from "react";
import NextLink from "next/link";

/**
 * `next/link` with background prefetching OFF unless a link asks for it.
 *
 * Next prefetches every link that scrolls into view, and every page here is
 * rendered on the server — so opening Agents quietly rendered six to eight
 * other pages at once, one per card. In the 2026-10-10 Cloudflare log those
 * background requests were 45% of everything the Worker ran, on a plan that
 * allows 10ms of CPU per request; bursts of them are what tipped the app into
 * Error 1102. A click still navigates on the client exactly as before, and the
 * 30s router cache (`staleTimes` in next.config.ts) still makes back/forward
 * free. The primary tabs keep their own hover prefetch (`NavTabLink`).
 *
 * Use this for every link to a page of ours; pass `prefetch` to opt back in.
 * Not a client component: it adds no state, so a Server Component can render
 * it without creating an island.
 */
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
