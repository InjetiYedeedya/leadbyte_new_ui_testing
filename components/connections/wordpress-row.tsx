import { ConnectionLogo, ConnectionRow } from "@/components/connections/connection-list";
import { AGENT_FOR_CONNECTION, RunAgentLink } from "@/components/connections/run-agent-link";
import { ConnectWordpress } from "@/components/connections/connect-wordpress";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { wordpressLabel, type WordpressStatus } from "@/lib/data/wordpress-connection";

/**
 * WordPress on the Connections page: a card of its own in the Email &
 * Publishing panel, beside GitHub and the mailbox, and the same size and
 * format as every other card (2026-10-13). It was a half of the GitHub card
 * (2026-10-12), which made that one card unlike all the others. A Server
 * Component: the state is the status read on the server; only the Connect
 * form is a client island.
 *
 * Nothing at all while WordPress is switched off ("unavailable"): a card
 * saying "coming soon" is noise.
 */
// The official mark (`public/wordpress-logo.png`, cut to 96px as
// `public/logos/wordpress.png` — 11 KB rather than 415). A notch LARGER than
// the other marks: its thin outer ring and open centre made it read small
// beside them at their size (2026-10-12).
const WORDPRESS_LOGO = <ConnectionLogo src="/logos/wordpress.png" className="size-8" />;

const PURPOSE = "Publish blog posts straight to your WordPress site.";

export function WordpressRow({
  status,
  disconnect,
}: {
  status: WordpressStatus;
  /** Forgets the saved login (`disconnectWordpressAction`). */
  disconnect: () => Promise<void>;
}) {
  if (status.kind === "unavailable") return null;

  if (status.kind === "connected") {
    const site = wordpressLabel(status.wpUrl);
    return (
      <ConnectionRow
        logo={WORDPRESS_LOGO}
        label="WordPress"
        purpose={PURPOSE}
        status="connection-connected"
        statusLabel="Connected"
        detail={
          <p className="mt-1 truncate text-sm text-ink" title={status.userName ? `${site} · as ${status.userName}` : site}>
            <span className="text-ink-soft">Site: </span>
            {/* Leaves the app, so a raw anchor. Built from the saved https
                address, which the backend only stores after logging in. */}
            <a href={status.wpUrl} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
              {site}
            </a>
            {status.userName && <span className="text-ink-soft"> · as {status.userName}</span>}
          </p>
        }
        action={
          <>
            <RunAgentLink {...AGENT_FOR_CONNECTION.publishing} />
            <ConnectWordpress connected={{ wpUrl: status.wpUrl, userName: status.userName }} variant="quiet" compact />
            <form action={disconnect}>
              <ConfirmSubmit
                title="Disconnect WordPress?"
                body={`LeadByte will forget the login for ${site}. The Blog Posting agent can't publish there until you connect it again. To cut access completely, also revoke the Application Password in WordPress under Users → Profile.`}
                confirmLabel="Disconnect"
                pendingLabel="Disconnecting…"
                className="shrink-0 whitespace-nowrap rounded-md border border-crit/40 px-3 py-1.5 text-sm font-medium text-crit hover:bg-crit-soft"
              >
                Disconnect
              </ConfirmSubmit>
            </form>
          </>
        }
      />
    );
  }

  // Not connected, or the check could not be made. "Unknown" is not "Not
  // connected": saying the login is missing would send someone to redo it.
  return (
    <ConnectionRow
      logo={WORDPRESS_LOGO}
      label="WordPress"
      purpose={PURPOSE}
      status={status.kind === "unknown" ? "connection-analysing" : "connection-not-connected"}
      statusLabel={status.kind === "unknown" ? "Unknown" : "Not connected"}
      note={status.kind === "unknown" ? "We couldn't check WordPress just now. Reload to try again." : undefined}
      action={<ConnectWordpress />}
    />
  );
}
