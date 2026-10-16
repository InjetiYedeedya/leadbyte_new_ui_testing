import { LockSimple, Target } from "@phosphor-icons/react/ssr";
import { PendingLink } from "@/components/ui/pending-link";
import { UNLOCK_MESSAGE } from "@/lib/entitlements/messages";
import { countOf } from "@/lib/format";

/**
 * "Connect with Lead Qualification" — hands these leads to that agent.
 *
 * Whether the account bought it is decided on the SERVER, with the signed
 * email, before this renders (`canRunAgent`). The legacy card checked in the
 * browser on click; a check the browser makes is one the browser can skip,
 * and the page would then offer a button the agent's own action refuses.
 *
 * Bought → the existing lead picker, which reads the leads itself on the
 * server. Rows never travel through the URL or navigation state: hundreds of
 * leads do not fit in a URL, and a picker that trusted rows handed to it could
 * be handed anyone's. It returns to the Configure popup, which is where the
 * picked leads are sent from.
 *
 * Normal ink on the surface, not the legacy card's light-on-light text, which
 * the guide flags as unreadable.
 */

const PRIMARY_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 " +
  "text-sm font-medium text-surface transition hover:bg-accent-ink " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-accent active:scale-[0.98] motion-reduce:transform-none";

export const LEAD_PICKER_HREF = `/agents/lead-qualification/leads?from=${encodeURIComponent(
  "/agents?configure=lead-qualification",
)}`;

export function LeadQualificationCard({ count, purchased }: { count: number; purchased: boolean }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent-ink"
        >
          <Target size={18} weight="bold" />
        </span>
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-ink">Connect with Lead Qualification</h4>
          <p className="mt-0.5 text-sm text-ink-soft">
            Send your {countOf(count, "lead")} directly to the Lead Qualification Agent for
            automated scoring and outreach.
          </p>
        </div>
      </div>

      {purchased ? (
        <div>
          <PendingLink href={LEAD_PICKER_HREF} className={PRIMARY_BUTTON}>
            Choose leads to send
          </PendingLink>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <LockSimple size={16} weight="bold" aria-hidden="true" className="mt-0.5 shrink-0 text-ink-soft" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Purchase required</p>
              <p className="mt-0.5 text-sm text-ink-soft">{UNLOCK_MESSAGE}</p>
            </div>
          </div>
          <PendingLink href="/pricing" className={`${PRIMARY_BUTTON} shrink-0`}>
            View pricing
          </PendingLink>
        </div>
      )}
    </section>
  );
}
