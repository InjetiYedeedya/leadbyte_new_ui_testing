import { Info, InstagramLogo } from "@phosphor-icons/react/ssr";
import type { BlockingErrorCard } from "@/lib/data/ads-blocking-error";

/**
 * An ad workflow's refusal, as a card the customer can act on
 * (META_ADS_AGENT_SPEC MA-BLK-04..06).
 *
 * It was a single sentence in the generic problems list — the fix and the
 * place to make it ran together in one line, with a URL nobody could click.
 * The card keeps them apart: what is wrong, what to do, and a link straight
 * to the setting. It arrives as a SIGNED url param (`decodeBlockingCard`), so
 * a hand-made link cannot put words or a destination on this page.
 *
 * Not a FlashNotice: those fade after a few seconds, and this one holds the
 * instructions someone is following in another tab.
 *
 * There is no "Try again" button: the form or decision this card sits above
 * is the retry, with the customer's answers still in it.
 */
export function BlockingErrorCardView({ card }: { card: BlockingErrorCard }) {
  const Icon = card.code === "INSTAGRAM_NOT_CONNECTED" ? InstagramLogo : Info;
  return (
    <div role="alert" className="mb-4 flex gap-3 rounded-lg border border-crit/30 bg-crit-soft px-4 py-3">
      <Icon size={22} className="mt-0.5 shrink-0 text-crit" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-crit">{card.title}</p>
        <p className="mt-1 text-sm text-ink">{card.message}</p>
        {card.hint && <p className="mt-1 text-sm font-semibold text-ink">{card.hint}</p>}
        {card.link && (
          // Leaves the site, so a raw anchor (CLAUDE.md).
          <a
            href={card.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm font-medium text-ink underline underline-offset-2 hover:text-accent-ink"
          >
            Open Meta Business Settings
          </a>
        )}
      </div>
    </div>
  );
}
