import { PendingLink } from "@/components/ui/pending-link";
import { EMAIL_GATE_MESSAGE } from "@/lib/data/agent-email-gate";

/**
 * "Connect your email first" — shown in place of an agent's setup controls.
 *
 * ## Why it replaces the form rather than sitting above it
 *
 * The five gated agents cannot run without a mailbox, and the Server Action
 * refuses them. Leaving the form usable beside a warning invites someone to
 * fill in fifteen fields, upload a leads file, and then be told no. The block
 * belongs where the work would start.
 *
 * ## Why it says which agent
 *
 * These live in popups reached from a list of nine agents. "Connect your email"
 * with no subject leaves the reader unsure whether they are being told about
 * the thing they just clicked or something global.
 *
 * Props only, no state, so the client islands can render it directly.
 */
export function EmailGateNotice({ agentName }: { agentName: string }) {
  return (
    <div className="rounded-lg border border-warn/30 bg-warn-soft p-4">
      <p className="text-sm font-medium text-warn">
        {agentName} needs a connected mailbox
      </p>
      <p className="mt-1 text-sm text-ink">{EMAIL_GATE_MESSAGE}</p>
      <PendingLink
        href="/intelligence/connections"
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-surface transition hover:bg-accent-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98] motion-reduce:transform-none"
      >
        Connect email
      </PendingLink>
    </div>
  );
}
