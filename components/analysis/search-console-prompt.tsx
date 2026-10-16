import { hasSearchConsoleRows } from "@/lib/data/search-console";
import { analysisState } from "@/lib/data/analysis-job";
import { getWebsiteAuditRepo } from "@/lib/data/website-audit-repo";
import { checkGoogleProduct } from "@/lib/api/oauth-status";
import { googlePromptDismissed } from "@/lib/data/google-prompt";
import { ConnectGoogle } from "@/components/analysis/connect-google";
import { CONTAINER_CLASSES } from "@/components/ui/page-container";

/**
 * Asks the customer to connect Google Search Console, on every page.
 *
 * ## When it appears
 *
 * Only once the website analysis has actually produced something. Asking for a
 * second connection while the first job is still running buries the thing the
 * person is waiting for, so this stays quiet until there is an audit to stand
 * beside. It then disappears the moment any Search Console data exists.
 *
 * It also stays away once the customer has answered it. Declining is an answer,
 * and the banner used to ignore its own "Move to strategy" option and greet
 * them again on the page that choice navigated to.
 *
 * Rendered from `PageShell`, so it follows the customer across the app rather
 * than hiding on one tab.
 *
 * ## Why it is safe to render everywhere
 *
 * Every read is `cache()`d, so mounting it costs at most one round trip each
 * per request. And it asks the cheap questions first (a cookie, then one
 * status row) and stops at the first "stay hidden", so for most accounts the
 * expensive reads never happen at all.
 */
export async function SearchConsolePrompt({ businessId }: { businessId: string }) {
  // The cheap answers first, and stop at the first one that says "stay
  // hidden". This used to fire all five reads at once — including
  // `/api/connected-data/all`, the heaviest call the backend has (~3s) — on
  // every page and every prefetch, for accounts that were already connected
  // or had dismissed the banner and so could never see it. Now an answered
  // banner costs one cookie read, and a connected account one table read.
  //
  // They chose "Move to strategy" in this banner's own dialog. Without this the
  // banner was waiting on the page that choice sent them to, asking the same
  // question — which reads as the app not listening. Temporary on purpose; see
  // `lib/data/google-prompt.ts`.
  if (await googlePromptDismissed()) return null;

  // Connected already — checked by status, not just by whether data has
  // arrived. A freshly connected account has no rows yet, and nagging someone
  // who has just approved us is the worst moment to ask again.
  //
  // Search Console's OWN grant. It shares `Google_website_Frontend_check`
  // with Analytics but is a separate Google permission, so a connected
  // Analytics no longer hides this prompt (`lib/data/google-products.ts`).
  const searchConsole = await checkGoogleProduct("search_console", businessId);
  if (searchConsole.status === "valid") return null;

  // One small table, not the whole connected-data bundle — see
  // `hasSearchConsoleRows` for the Cloudflare limit that bundle hit.
  const [hasData, audit, phase] = await Promise.all([
    hasSearchConsoleRows(businessId),
    getWebsiteAuditRepo().get(businessId),
    analysisState(),
  ]);

  if (hasData || audit === null || phase.phase === "running") return null;

  return (
    // Frosted like the page panel (`FROSTED_PANEL`, same `::before` trick so
    // `backdrop-filter` does not become a containing block): at `bg-accent/5`
    // the sentence sat straight on the moving footage and parts of it vanished
    // behind the window frames.
    <div className="relative isolate border-b border-border before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-surface/85 before:backdrop-blur-md print:before:hidden">
      {/* One row on a phone: the headline beside the button, the explanation
          dropped. Wrapped, it took a quarter of a 390px screen before any of
          the page showed (2026-10-13). */}
      <div className={`${CONTAINER_CLASSES} flex items-center justify-between gap-x-4 gap-y-2 py-2 sm:flex-wrap sm:gap-x-6 sm:py-2.5`}>
        <p className="min-w-0 text-sm text-ink">
          <span className="font-medium">See the keywords you already rank for.</span>{" "}
          <span className="text-ink-soft max-sm:hidden">
            Connect your Google services and we&apos;ll show your top queries, clicks and
            average position.
          </span>
        </p>
        {/* Every option goes through our own /api/google/connect, which maps
            the chosen flow to the backend's OAuth start and derives `email`
            from the session. */}
        <ConnectGoogle label="Connect Google" />
      </div>
    </div>
  );
}
