import { LoadFailed, NothingYet, Panel } from "@/components/agents/dashboard/parts";
import type { SourceOutcome } from "@/lib/api/read-cascade";
import type { CompetitorRow } from "@/lib/data/agent-dashboard";
import { formatCount } from "@/lib/format";

/**
 * The sites the agent measures the customer against, from `comp_details` —
 * the one Off-Page SEO table that IS readable by account today. A Server
 * Component; the table scrolls sideways inside its own box so a narrow
 * slide-in never scrolls the page.
 */
export function CompetitorsPanel({
  outcome,
  competitors,
}: {
  outcome: SourceOutcome | undefined;
  competitors: CompetitorRow[];
}) {
  if (outcome && !outcome.ok && competitors.length === 0) {
    return <LoadFailed what="your competitors" />;
  }
  if (competitors.length === 0) {
    return (
      <NothingYet
        title="No competitors yet"
        description="The sites this agent measures you against appear here once it has looked at your market."
      />
    );
  }

  const figure = (value: number | null) => (value === null ? "—" : formatCount(value));
  return (
    <Panel title="Competitors" hint="Authority and referring domains, as the agent last measured them">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-ink-soft">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Competitor
              </th>
              <th scope="col" className="w-24 whitespace-nowrap px-3 py-2 text-right font-medium">
                Authority
              </th>
              <th scope="col" className="w-32 whitespace-nowrap px-3 py-2 text-right font-medium">
                Referring domains
              </th>
            </tr>
          </thead>
          <tbody>
            {competitors.map((row) => (
              <tr key={row.name} className="border-b border-border/60 last:border-b-0">
                <td className="break-words px-3 py-2 text-ink">{row.name}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{figure(row.authorityScore)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{figure(row.referringDomains)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
