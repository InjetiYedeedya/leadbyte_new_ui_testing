import { ArrowBendUpLeft, EnvelopeSimple, LinkSimple } from "@phosphor-icons/react/ssr";
import {
  BarRow,
  Panel,
  PanelPair,
  SummaryCard,
  SummaryRow,
} from "@/components/agents/dashboard/parts";
import { formatShare } from "@/lib/data/dashboard/fields";
import {
  backlinkChange,
  formatChange,
  outreachRates,
  type OffPageOutreach,
} from "@/lib/data/dashboard/off-page-outreach";
import { countOf, formatCount } from "@/lib/format";

/**
 * The Off-Page SEO outreach record, drawn (legacy guide §5.1): three summary
 * cards, then the funnel and the backlink profile side by side.
 *
 * Server Components, props only. A missing figure is "—" and a real zero is
 * "0" throughout — an all-zero record is an agent that ran and has won
 * nothing yet, which is worth seeing, not an empty state.
 */

const count = (value: number | null) => (value === null ? null : formatCount(value));

export function OutreachSummary({ outreach }: { outreach: OffPageOutreach }) {
  const rates = outreachRates(outreach);
  return (
    <SummaryRow columns={3}>
      <SummaryCard
        label="Emails sent"
        value={count(outreach.sent)}
        note="outreach from this agent"
        icon={<EnvelopeSimple size={18} weight="bold" />}
        tone="primary"
      />
      <SummaryCard
        label="Reply rate"
        value={rates.replyRate === null ? null : formatShare(rates.replyRate)}
        note={
          outreach.replies === null
            ? "no reply count recorded"
            : `${countOf(outreach.replies, "reply", "replies")} received`
        }
        icon={<ArrowBendUpLeft size={18} weight="bold" />}
      />
      <SummaryCard
        label="Backlinks won"
        value={count(outreach.won)}
        note={rates.wonOfSent === null ? undefined : `${formatShare(rates.wonOfSent)} of everything sent`}
        icon={<LinkSimple size={18} weight="bold" />}
        tone="success"
      />
    </SummaryRow>
  );
}

/**
 * Sent → Replied → Backlinks won, every bar on the SAME scale (emails sent),
 * so the bars' lengths are the drop-off. The rate under each step is against
 * the step before it, which is the question each one answers.
 */
export function OutreachFunnel({ outreach }: { outreach: OffPageOutreach }) {
  const rates = outreachRates(outreach);
  // Emails sent is the scale. Only when that figure is missing does the
  // largest step stand in, so the bars that do exist still mean something.
  const scale = outreach.sent ?? Math.max(outreach.replies ?? 0, outreach.won ?? 0);
  const step = (value: number | null, what: string) => ({
    value: value ?? 0,
    display: value === null ? "—" : formatCount(value),
    ariaLabel: value === null ? `${what}: not recorded` : `${what}: ${formatCount(value)}`,
  });

  return (
    <Panel title="Outreach funnel" hint="Each step measured against emails sent">
      <div className="flex flex-col gap-4">
        <BarRow label="Sent" max={scale} tone="accent" {...step(outreach.sent, "Emails sent")} />
        <BarRow
          label="Replied"
          max={scale}
          tone="info"
          {...step(outreach.replies, "Replies")}
          note={
            rates.replyRate === null
              ? undefined
              : `${formatShare(rates.replyRate)} of emails sent got a reply`
          }
        />
        <BarRow
          label="Backlinks won"
          max={scale}
          tone="good"
          {...step(outreach.won, "Backlinks won")}
          note={
            rates.wonOfReplies === null
              ? undefined
              : `${formatShare(rates.wonOfReplies)} of replies became a link`
          }
        />
      </div>
      {outreach.sent === 0 && (
        <p className="text-xs text-ink-soft">
          The agent has a record for your account, and no outreach has gone out from it yet.
        </p>
      )}
    </Panel>
  );
}

/**
 * The site's backlinks when the campaign started, and now, on one scale.
 *
 * A dip is drawn in the warn tone and said plainly. It is information — links
 * rot and sites delete pages — not an error in the agent or the screen.
 */
export function BacklinkProfile({ outreach }: { outreach: OffPageOutreach }) {
  const change = backlinkChange(outreach);
  const dipped = change !== null && change.delta < 0;
  const scale = Math.max(outreach.before ?? 0, outreach.now ?? 0);

  return (
    <Panel title="Backlink profile" hint="Links pointing at your site, before and now">
      {outreach.before === null && outreach.now === null ? (
        <p className="text-sm text-ink-soft">This record has no backlink counts yet.</p>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            <BarRow
              label="Before"
              value={outreach.before ?? 0}
              max={scale}
              display={count(outreach.before) ?? "—"}
              tone="muted"
              ariaLabel={`Backlinks when the campaign started: ${count(outreach.before) ?? "not recorded"}`}
            />
            <BarRow
              label="Now"
              value={outreach.now ?? 0}
              max={scale}
              display={count(outreach.now) ?? "—"}
              tone={dipped ? "warn" : "good"}
              ariaLabel={`Backlinks now: ${count(outreach.now) ?? "not recorded"}`}
            />
          </div>
          {change !== null && (
            <p className={`text-sm tabular-nums ${dipped ? "font-medium text-warn" : "text-ink-soft"}`}>
              {change.delta === 0
                ? "No change since the campaign started"
                : `${formatChange(change)} since the campaign started`}
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

export function OutreachPanels({ outreach }: { outreach: OffPageOutreach }) {
  return (
    <>
      <OutreachSummary outreach={outreach} />
      <PanelPair>
        <OutreachFunnel outreach={outreach} />
        <BacklinkProfile outreach={outreach} />
      </PanelPair>
    </>
  );
}
