import { PendingLink } from "@/components/ui/pending-link";

/**
 * "Run agent" on a connected card — the step after connecting (LBS-1254).
 *
 * Connecting an account was a dead end: the card said Connected and offered
 * only Reconnect, and the agent that uses the account was a tab and a list
 * away. This goes straight to that agent's own page, where it is set up and
 * run. Filled, because on a connected card it is the thing to do next;
 * Reconnect beside it stays quiet.
 *
 * Shown only on a CONNECTED card: an agent opened from a card that is not
 * connected would only stop at its own "connect first" gate.
 */
export function RunAgentLink({ agentId, agentName }: { agentId: string; agentName: string }) {
  return (
    <PendingLink
      href={`/agents/${agentId}`}
      aria-label={`Run the ${agentName} agent`}
      className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md bg-accent px-3.5 py-1.5 text-sm font-medium text-surface transition-colors hover:bg-accent-ink"
    >
      Run agent
    </PendingLink>
  );
}

/** Which agent each connection is for. Analytics and Search Console feed reports, not one agent. */
export const AGENT_FOR_CONNECTION = {
  googleAds: { agentId: "google-ads", agentName: "Google Ads" },
  metaAds: { agentId: "meta-ads", agentName: "Meta Ads" },
  linkedInAds: { agentId: "linkedin-ads", agentName: "LinkedIn Ads" },
  facebook: { agentId: "social-media", agentName: "Social Media" },
  instagram: { agentId: "social-media", agentName: "Social Media" },
  youtube: { agentId: "social-media", agentName: "Social Media" },
  email: { agentId: "lead-qualification", agentName: "Lead Qualification" },
  publishing: { agentId: "blog-posting", agentName: "Blog Posting" },
} as const;
