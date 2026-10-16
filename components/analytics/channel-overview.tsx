import Link from "@/components/ui/app-link";
import { PlatformLogo } from "@/components/analytics/platform-logo";
import { shortDay, type Timeline, type TimelineBand } from "@/lib/data/analytics-timeline";
import { formatCount, formatMoney } from "@/lib/format";

/**
 * One figure in a channel card.
 *
 * `note` is the line under the number, and it is rendered only when it says
 * something the card has not: repeating "Google Analytics" under a figure on a
 * card already headed Google Analytics is furniture. Ad spend uses it to say
 * the currency is unknown, which is the one thing a bare 3,334 cannot say.
 */
export interface ChannelStat {
  label: string;
  value: string | null;
  note?: string;
}

export interface PerformanceChannel {
  id: "analytics" | "search" | "ads";
  title: string;
  source: string;
  description: string;
  stats: ChannelStat[];
  bandKey: string;
  /** "Explore website", "Explore campaigns" — the design names the destination. */
  exploreLabel: string;
  /**
   * Where "Explore" goes — a page of ours, or null when there is no detail.
   *
   * `/analytics/explore?source=ads`, NOT a link to the customer's own Google
   * Ads or Analytics account: we have no URL for one, and inventing it is the
   * kind of dead control this redesign removed.
   */
  exploreHref: string | null;
  /**
   * The ad platforms behind this card, when it has any.
   *
   * The Paid advertising card covers Google Ads AND Meta Ads, so a single
   * generic icon said less than the two platforms' own marks do. Empty for the
   * channels that are one source.
   */
  platforms?: string[];
}

const TONES = {
  analytics: { ink: "text-accent", soft: "bg-accent/8", stroke: "stroke-accent", fill: "fill-accent/10", border: "border-accent" },
  search: { ink: "text-good", soft: "bg-good-soft/60", stroke: "stroke-good", fill: "fill-good/10", border: "border-good" },
  ads: { ink: "text-warn", soft: "bg-warn-soft/60", stroke: "stroke-warn", fill: "fill-warn/10", border: "border-warn" },
};

function ChannelIcon({ id }: { id: PerformanceChannel["id"] }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
    {id === "analytics" ? <><path d="M5 20v-6M12 20V9M19 20V4" strokeWidth="3.5" /></> : id === "search" ? <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></> : <><path d="m4 10 15-5v14L4 14zM4 10v4M8 16l1 5h3l-1-4M22 9v6" /></>}
  </svg>;
}

/**
 * A small, server-rendered chart. A missing report breaks the line, not a zero.
 *
 * The trend's box, in CSS pixels. Fixed, and deliberately not a viewBox.
 *
 * It was one SVG drawn at 380x165 and stretched to the card, which is right
 * for a card in a three-up row and wrong for a lone one: with a single
 * channel connected the card is the page's full width, so the chart and its
 * axis text came out over three times their size and filled a laptop screen.
 * Now only the line stretches; the text and the height do not.
 */
const TREND = { height: 165, top: 24, bottom: 33, left: 34, right: 20 } as const;
const TREND_PLOT = 1000;

function ChannelTrend({ band, dates, tone }: { band: TimelineBand; dates: string[]; tone: typeof TONES.analytics }) {
  const present = band.values.filter((value): value is number => value !== null);
  if (present.length < 2) return <p className="py-6 text-sm text-ink-soft">Daily trend appears when at least two days have been reported.</p>;
  const peak = Math.max(1, ...present);
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  const ceiling = Math.ceil(peak / magnitude) * magnitude;
  const plotH = TREND.height - TREND.top - TREND.bottom;
  // Fractions of the plot, 0..1: the line is drawn in `TREND_PLOT` units and
  // the labels and dots are placed by percentage, so they agree at any width.
  const fx = (i: number) => i / Math.max(1, dates.length - 1);
  const fy = (value: number) => 1 - value / ceiling;
  const pct = (fraction: number) => `${(fraction * 100).toFixed(3)}%`;
  const segments: { i: number; value: number }[][] = [];
  let segment: { i: number; value: number }[] = [];
  band.values.forEach((value, i) => {
    if (value === null) { if (segment.length) segments.push(segment); segment = []; }
    else segment.push({ i, value });
  });
  if (segment.length) segments.push(segment);
  const labels = [...new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1])];
  const coords = (points: { i: number; value: number }[]) =>
    points.map(p => `${(fx(p.i) * TREND_PLOT).toFixed(1)},${(fy(p.value) * TREND_PLOT).toFixed(1)}`).join(" ");

  return <div role="img" aria-label={`${band.label}, ${present.length} reported days. Missing reports are gaps.`} className="flex" style={{ height: TREND.height }}>
    {/* Formatted like the figures on screen: raw floats ("42.779999999999994") were read aloud. */}
    <span className="sr-only">{dates.map((date, i) => { const value = band.values[i]; return `${date}: ${value === null || value === undefined ? "No data" : band.format === "amount" ? formatMoney(value) : formatCount(value)}`; }).join("; ")}</span>
    <svg aria-hidden="true" width={TREND.left} height={TREND.height} className="shrink-0 overflow-visible">
      {[0, 0.5, 1].map(fraction => <text key={fraction} x={TREND.left - 7} y={TREND.top + plotH * (1 - fraction) + 4} textAnchor="end" className="fill-ink-soft text-[11px]">{Number((ceiling * fraction).toFixed(1))}</text>)}
    </svg>
    <div className="relative min-w-0 flex-1" style={{ marginRight: TREND.right }}>
      <svg aria-hidden="true" className="absolute inset-0 size-full overflow-visible">
        {[0, 0.5, 1].map(fraction => <line key={fraction} x1="0" x2="100%" y1={TREND.top + plotH * (1 - fraction)} y2={TREND.top + plotH * (1 - fraction)} className="stroke-border/70" />)}
        {labels.map(i => <text key={i} x={pct(fx(i))} y={TREND.height - 10} textAnchor={i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle"} className="fill-ink-soft text-[11px]">{shortDay(dates[i]!)}</text>)}
      </svg>
      <svg aria-hidden="true" viewBox={`0 0 ${TREND_PLOT} ${TREND_PLOT}`} preserveAspectRatio="none" className="absolute inset-x-0 w-full overflow-visible" style={{ top: TREND.top, height: plotH }}>
        {segments.map((points, i) => points.length > 1 ? <g key={i}>
          <polygon points={`${(fx(points[0]!.i) * TREND_PLOT).toFixed(1)},${TREND_PLOT} ${coords(points)} ${(fx(points[points.length - 1]!.i) * TREND_PLOT).toFixed(1)},${TREND_PLOT}`} className={tone.fill} />
          <polyline points={coords(points)} fill="none" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className={tone.stroke} />
        </g> : null)}
      </svg>
      {/* A day reported on its own, between two gaps: a ring, drawn in HTML so
          the stretched layer cannot flatten it into an oval. */}
      {segments.filter(points => points.length === 1).map(([point]) => <span key={point!.i} aria-hidden="true" className={`absolute size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full border ${tone.border}`} style={{ left: pct(fx(point!.i)), top: TREND.top + plotH * fy(point!.value) }} />)}
    </div>
  </div>;
}

export function ChannelOverview({ channels, timeline }: { channels: PerformanceChannel[]; timeline: Timeline }) {
  if (!channels.length) return null;
  // Two across from tablet width. Three full-width cards put 1900px of stack
  // between the heading and the timeline at 768px — the page's one comparison
  // view was three screens down, and each card was 705px wide to say two
  // numbers.
  const columns =
    channels.length === 1
      ? "grid-cols-1"
      : channels.length === 2
        ? "grid-cols-1 md:grid-cols-2"
        : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";
  return <section aria-label="Performance by channel" className={`grid ${columns} gap-4`}>
    {channels.map(channel => {
      const tone = TONES[channel.id];
      const band = timeline.bands.find(item => item.key === channel.bandKey);
      return <article key={channel.id} aria-labelledby={`channel-${channel.id}`} className="flex min-w-0 flex-col rounded-lg border border-border bg-surface p-4 shadow-[0_2px_6px_rgba(17,24,25,0.02)]">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          {channel.platforms && channel.platforms.length > 0 ? (
            <span className="flex shrink-0 items-center -space-x-2" aria-hidden="true">
              {channel.platforms.map(platform => (
                <span key={platform} className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface">
                  <PlatformLogo platform={platform} className="h-6 w-6" />
                </span>
              ))}
            </span>
          ) : (
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tone.soft} ${tone.ink}`}><ChannelIcon id={channel.id} /></span>
          )}
          <div className="min-w-0"><h2 id={`channel-${channel.id}`} className="text-base font-bold tracking-tight text-ink">{channel.title}</h2><p className="mt-0.5 text-xs text-ink-soft">{channel.source}</p></div>
          {channel.exploreHref && <Link href={channel.exploreHref} className="ml-auto shrink-0 rounded-md text-xs font-medium text-accent-ink transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{channel.exploreLabel} <span aria-hidden="true">↗</span></Link>}
        </div>
        <p className="mt-1 text-sm leading-5 text-ink-soft">{channel.description}</p>
        <dl className={`mt-3 grid gap-3 ${channel.stats.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {channel.stats.map(stat => <div key={stat.label} className="min-w-0 rounded-md border border-border px-3 py-2">
            <dt className="text-xs text-ink-soft">{stat.label}</dt>
            <dd className="mt-1 text-[1.75rem] font-semibold leading-9 tracking-tight tabular-nums text-ink">{stat.value ?? "—"}</dd>
            {stat.note && <dd className="mt-1 text-xs leading-5 text-ink-soft">{stat.note}</dd>}
          </div>)}
        </dl>
        <div className="mt-3">
          {band && <><h3 className="mb-2 text-xs font-bold text-ink">{band.label} (daily)</h3><ChannelTrend band={band} dates={timeline.dates} tone={tone} /></>}
        </div>
      </article>;
    })}
  </section>;
}
