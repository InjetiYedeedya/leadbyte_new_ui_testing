import Link from "@/components/ui/app-link";
import type { ConnectedMailbox } from "@/lib/data/email-callback";

/**
 * The mailbox this account has connected, stated inside a configure dialog.
 *
 * ## Why the wording is a prop
 *
 * Lead Qualification genuinely emails the leads it scores — its payload carries
 * an outreach template — so "Sends from" is a true statement there. The two SEO
 * agents carry no outreach field at all (`seo-setup.ts` sends only
 * `email_address`, which is where the agent reports back), so telling someone
 * their SEO agent sends mail from that address would be inventing a behaviour.
 * They get "Connected mailbox", which is a fact rather than a claim.
 *
 * The `missing` line is the caller's too, for the same reason: not having a
 * mailbox stops Lead Qualification from emailing anyone, and does not stop an
 * SEO agent from doing anything.
 *
 * Takes props only and holds no state, so the client islands that render it
 * can import it directly. The `ConnectedMailbox` import is type-only, which
 * keeps `email-callback.ts` and its cookie reads out of the browser bundle.
 */
export function MailboxNote({
  mailbox,
  label,
  missing,
}: {
  mailbox: ConnectedMailbox | null;
  /** Prefix for the connected case, e.g. "Sends from". */
  label: string;
  /** What not having one means here. Omit to say nothing when none is set. */
  missing?: string;
}) {
  if (!mailbox) {
    if (!missing) return null;
    return (
      <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
        {missing}{" "}
        <Link href="/intelligence/connections" className="font-medium underline transition-colors hover:text-ink">
          Connect email
        </Link>
      </p>
    );
  }

  const who = mailboxLabel(mailbox);
  return (
    <p className="rounded-lg bg-surface-raised px-3 py-2 text-sm text-ink">
      {who === null ? (
        // Connected, but the record does not say which mailbox. Said as that,
        // rather than printing the label beside nothing (or beside itself).
        <>
          A mailbox is connected.{" "}
          <span className="text-ink-soft">We don&apos;t have its address on record.</span>
        </>
      ) : (
        <>
          {label} <span className="font-medium">{who}</span>
        </>
      )}
    </p>
  );
}

/**
 * "Sales (sales@acme.com)", "sales@acme.com" or "Sales" — or null when the
 * record names neither, so the caller can say so instead of printing a blank.
 */
export function mailboxLabel(mailbox: ConnectedMailbox): string | null {
  const name = mailbox.name.trim();
  const address = mailbox.address.trim();
  if (name && address) return `${name} (${address})`;
  return address || name || null;
}
