import { EnvelopeSimple, Phone } from "@phosphor-icons/react/ssr";
import { SUPPORT_CONTACT, telHref } from "@/lib/support-contact";

/**
 * How to reach our team, as real links: `mailto:` opens the mail app and
 * `tel:` dials on a phone. The values live in `lib/support-contact.ts`.
 */
export function SupportCard({
  title = "Contact our support team",
  description = "We're here to help. Reach out any time and our team will be glad to assist you.",
  headingLevel = 2,
}: {
  title?: string;
  description?: string;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const rows = [
    ...SUPPORT_CONTACT.emails.map((e) => ({ ...e, href: `mailto:${e.value}`, Icon: EnvelopeSimple })),
    ...SUPPORT_CONTACT.phones.map((p) => ({ ...p, href: telHref(p.value), Icon: Phone })),
  ];

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
      <div>
        <Heading className={headingLevel === 1 ? "text-2xl font-bold tracking-tight text-ink" : "text-lg font-semibold text-ink"}>
          {title}
        </Heading>
        <p className="mt-1 max-w-prose text-sm text-ink-soft">{description}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map(({ label, value, href, Icon }) => (
          <li key={value}>
            <a
              href={href}
              className="flex min-h-14 items-center gap-3 rounded-md border border-border px-3 py-2 transition hover:border-accent hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-xs text-ink-soft">{label}</span>
                <span className="truncate text-sm font-medium text-ink">{value}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
