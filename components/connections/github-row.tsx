import { PendingLink } from "@/components/ui/pending-link";
import { AGENT_FOR_CONNECTION, RunAgentLink } from "@/components/connections/run-agent-link";
import { ConnectionLogo, ConnectionRow } from "@/components/connections/connection-list";
import { ConnectGithub } from "@/components/connections/connect-github";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { GITHUB_INSTALLATIONS_URL, type GithubConnection } from "@/lib/data/github-connection";

// The same size as the WordPress mark beside it in this card (`wordpress-row.tsx`),
// so the two halves read as a pair (2026-10-12).
const GITHUB_LOGO = <ConnectionLogo src="/logos/github.svg" className="size-8" />;

// Short: the "Website code" panel beside it already says what this is for,
// and the full sentence here made this the tallest card on the page.
const PURPOSE = "Where blog posts and website fixes are delivered.";

// Lives with the publish rule (GitHub or WordPress); re-exported for the
// existing callers.
export { repoSummary } from "@/lib/data/blog-publish";
import { repoSummary } from "@/lib/data/blog-publish";

/**
 * The GitHub row. A Server Component: every state is decided by the read on
 * the server, and only the Connect button (which has to wait on another tab)
 * is a client island.
 */
export function GithubRow({
  connection,
  check,
  disconnect,
  footer,
}: {
  connection: GithubConnection;
  /** WordPress, shown inside this card (`WordpressLine`). */
  footer?: React.ReactNode;
  check: () => Promise<{ connected: boolean }>;
  /** Forgets the site's GitHub link (`disconnectGithubAction`). None: no button. */
  disconnect?: () => Promise<void>;
}) {
  switch (connection.kind) {
    case "no-site":
      return (
        <ConnectionRow
          footer={footer}
          logo={GITHUB_LOGO}
          label="GitHub"
          purpose={PURPOSE}
          status="connection-not-connected"
          statusLabel="Not connected"
          note="GitHub is connected per website, so add yours first."
          action={
            <PendingLink
              href="/"
              className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-raised"
            >
              Add website
            </PendingLink>
          }
        />
      );

    case "unavailable":
      return (
        <ConnectionRow
          footer={footer}
          logo={GITHUB_LOGO}
          label="GitHub"
          purpose={PURPOSE}
          status="connection-not-connected"
          statusLabel="Not available"
          note="Connecting GitHub isn't switched on yet."
          action={<span className="shrink-0 text-xs text-ink-soft">Coming soon</span>}
        />
      );

    case "unknown":
      // Not "Not connected": we could not reach the check, and saying the
      // connection is missing would send someone to redo it for nothing.
      return (
        <ConnectionRow
          footer={footer}
          logo={GITHUB_LOGO}
          label="GitHub"
          purpose={PURPOSE}
          status="connection-analysing"
          statusLabel="Unknown"
          note={`We couldn't check GitHub for ${connection.domain} just now. Reload to try again.`}
          action={<span className="shrink-0 text-xs text-ink-soft">Try again shortly</span>}
        />
      );

    case "not-connected":
      return (
        <ConnectionRow
          footer={footer}
          logo={GITHUB_LOGO}
          label="GitHub"
          purpose={PURPOSE}
          status="connection-not-connected"
          statusLabel="Not connected"
          note={`For ${connection.domain}. You choose which repositories we may touch.`}
          action={<ConnectGithub installUrl={connection.installUrl} connected={false} check={check} />}
        />
      );

    case "connected": {
      const summary = repoSummary(connection.repos);
      // The account is the owner half of each repository's full name
      // ("NTimes-repo/site") — the only account name the connection carries.
      const owners = [...new Set(connection.repos.map((repo) => repo.split("/")[0] ?? "").filter(Boolean))];
      // Leaves the site, so a raw anchor (CLAUDE.md: every link that leaves
      // is a raw <a>). Disconnect below forgets the link on our side; the app
      // itself is uninstalled where it was granted, on GitHub.
      const manage = (
        <a
          href={GITHUB_INSTALLATIONS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="whitespace-nowrap text-xs text-ink-soft underline hover:text-ink"
        >
          Manage on GitHub
        </a>
      );
      return (
        <ConnectionRow
          footer={footer}
          logo={GITHUB_LOGO}
          label="GitHub"
          purpose={PURPOSE}
          status="connection-connected"
          statusLabel="Connected"
          detail={
            // The repositories, named — "Connected" alone leaves "to what?"
            // unanswered, the same reason the mailbox row names its address.
            // The card holds two lines here, so the site it is for is in the
            // Account line's tooltip, and the quieter second route (manage on
            // GitHub) sits on that line's end.
            <div className="mt-1 min-w-0 shrink-0 space-y-0.5">
              <p className="flex min-w-0 items-baseline gap-2 text-sm text-ink">
                <span
                  className="min-w-0 truncate"
                  title={`${owners.length > 0 ? owners.join(", ") + " · " : ""}for ${connection.domain}`}
                >
                  <span className="text-ink-soft">{owners.length > 0 ? "Account: " : "For: "}</span>
                  <span className="font-medium">{owners.length > 0 ? owners.join(", ") : connection.domain}</span>
                </span>
                {connection.installUrl && <span className="shrink-0">{manage}</span>}
              </p>
              {summary && (
                <p className="truncate text-sm text-ink" title={connection.repos.join(", ")}>
                  <span className="text-ink-soft">Repositories: </span>
                  {summary}
                </p>
              )}
            </div>
          }
          action={
            // Disconnect is a real button beside the main one (2026-10-01). It
            // was a small text link beside "Manage on GitHub" and could not be
            // found. In a row, on the card's bottom edge.
            <div className="flex flex-wrap items-center gap-2">
              <RunAgentLink {...AGENT_FOR_CONNECTION.publishing} />
              {connection.installUrl ? (
                <ConnectGithub installUrl={connection.installUrl} connected check={check} compact />
              ) : (
                manage
              )}
              {disconnect && (
                // Asks first: the Blog Posting agent stops publishing the
                // moment this goes, and the app staying installed on GitHub
                // is the part nobody would guess.
                <form action={disconnect}>
                  <ConfirmSubmit
                    title="Disconnect GitHub?"
                    body={`LeadByte will stop using GitHub for ${connection.domain}. The Blog Posting agent can't publish and the AEO agent can't open pull requests until you connect it again. The LeadByte app stays installed on your GitHub account; to remove it, uninstall it in GitHub's settings.`}
                    confirmLabel="Disconnect"
                    pendingLabel="Disconnecting…"
                    className="shrink-0 whitespace-nowrap rounded-md border border-crit/40 px-3 py-1.5 text-sm font-medium text-crit hover:bg-crit-soft"
                  >
                    Disconnect
                  </ConfirmSubmit>
                </form>
              )}
            </div>
          }
        />
      );
    }
  }
}
