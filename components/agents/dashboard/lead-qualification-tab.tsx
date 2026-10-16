import { Play, UsersThree } from "@phosphor-icons/react/ssr";
import { isBackendConfigured } from "@/lib/api/config";
import { readTable, type SourceOutcome } from "@/lib/api/read-cascade";
import type { DashboardTabProps } from "@/lib/data/dashboard/tabs";
import {
  buildPipeline,
  mapLeadRuns,
  mapLeadSettings,
  mapLeads,
} from "@/lib/data/dashboard/lead-pipeline";
import { countOf } from "@/lib/format";
import { LoadFailed, NothingYet } from "@/components/agents/dashboard/parts";
import { AgentStatusStrip } from "./lead-qualification/agent-status-strip";
import { LeadBoard } from "./lead-qualification/lead-board";
import { LeadQualificationConfigure } from "@/components/agents/lead-qualification-configure";
import { PanelControls } from "@/components/agents/agent-dashboard-split";
import { getConnectedMailbox } from "@/lib/data/email-callback";
import { adsLeadsSummary } from "@/lib/data/lead-selection";
import { listLiveCampaigns, type LiveCampaignsRead } from "@/lib/data/campaign-controls-api";
import { currentCampaign } from "@/lib/data/campaign-job";
import { CampaignControls } from "@/components/agents/campaign-controls";
import { LiveCampaigns } from "./lead-qualification/live-campaigns";
import {
  controlLeadCampaign,
  controlLeadCampaignById,
  stopAllLeadCampaigns,
} from "@/app/(app)/agents/[agentId]/actions";

/**
 * The Lead Qualification tab (legacy dashboard guide §5.2): the agent's state,
 * the lead pipeline, the score mix, outreach, and every lead in a table that
 * opens into a drawer.
 *
 * A Server Component that reads its three tables and hands the island mapped
 * data. Its own reader rather than `getLeadActivity` in
 * `lib/data/lead-qualification.ts`: that one swallows a failed read into `[]`,
 * and this tab has to tell "couldn't load" from "no leads yet" — the one says
 * try again, the other says wait for the agent.
 *
 * Only the lead table decides the tab's state. The settings drive the status
 * strip, which says for itself when it could not be read; a failed runs read
 * only loses the "N queued" chip, because the leads themselves are still right.
 */

const EMPTY: SourceOutcome = { ok: true, error: null, rows: [] };

async function readLeadTables(email: string, uid: string | undefined) {
  // Unconfigured is a working environment, not a failed one: no backend means
  // no rows, and an honest empty state — not "couldn't load".
  if (!isBackendConfigured()) return { leads: EMPTY, settings: EMPTY, runs: EMPTY };
  const [leads, settings, runs] = await Promise.all([
    // By email only: the table has no user_id index, and the uid route
    // answers "Could not resolve userId to email" for accounts it has no
    // mapping for (see `lib/data/lead-qualification.ts`).
    readTable("leadbyte_lead_activity", { email }),
    readTable("leadbyte_lead_qualification", { uid, email }),
    readTable("leadbyte_agent_jobs", { email }),
  ]);
  return { leads, settings, runs };
}

/**
 * The run control. It is the SAME dialog the Agents row opens
 * (`LeadQualificationConfigure`) rather than a second way to start a run:
 * a run needs a lead source and a template, and the dialog is where those are
 * answered. Only the trigger's wording and styling differ.
 */
const RUN_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm " +
  "font-semibold text-surface transition hover:bg-accent-ink focus-visible:outline " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "active:scale-[0.98] motion-reduce:transform-none";

/**
 * The campaigns still sending. No uid or no backend means there is nothing to
 * ask — read as an empty list, not a failure.
 */
async function readLiveCampaigns(uid: string | undefined): Promise<LiveCampaignsRead> {
  if (!isBackendConfigured() || !uid) return { status: "ok", jobs: [] };
  return listLiveCampaigns(uid);
}

/**
 * Pause / resume / cancel. The live list when the backend has it; until its
 * route is deployed (`unavailable`), the one campaign this browser remembers —
 * the controls the agent page has always had — so Stop never disappears.
 */
async function CampaignSection({ live }: { live: LiveCampaignsRead }) {
  if (live.status === "ok") {
    return <LiveCampaigns jobs={live.jobs} onControl={controlLeadCampaignById} onStopAll={stopAllLeadCampaigns} />;
  }
  if (live.status === "failed") return <LoadFailed what="your running campaigns" />;
  const remembered = await currentCampaign();
  return remembered ? (
    <CampaignControls state={remembered.state} startedAt={remembered.startedAt} onControl={controlLeadCampaign} />
  ) : null;
}

export async function LeadQualificationTab({ tab, email, uid }: DashboardTabProps) {
  const [outcomes, mailbox, adsSummary, live] = await Promise.all([
    readLeadTables(email, uid),
    getConnectedMailbox(),
    adsLeadsSummary(email),
    readLiveCampaigns(uid),
  ]);
  const leads = mapLeads(outcomes.leads.rows);
  const runs = outcomes.runs.ok ? mapLeadRuns(outcomes.runs.rows) : [];
  const pipeline = buildPipeline(leads, runs);

  return (
    <div className="@container flex min-w-0 flex-col gap-4">
      {/* The agent's name and its state are one card: a title bar above a
          status bar repeated the same subject twice over. */}
      {/* Pinned like every tab's title row. The wrapper is in the card's colour
          so nothing scrolling beneath shows through the strip's round corners. */}
      <div className="z-10 bg-surface-raised xl:sticky xl:top-0">
      <AgentStatusStrip
        settings={mapLeadSettings(outcomes.settings.rows)}
        ok={outcomes.settings.ok}
        heading={
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-surface"
            >
              <UsersThree size={18} weight="bold" />
            </span>
            <h3 className="truncate text-base font-bold text-ink">{tab.title}</h3>
          </div>
        }
        action={
          <>
            <LeadQualificationConfigure
              label="Run agent"
              mailbox={mailbox}
              adsSummary={adsSummary}
              className={RUN_BUTTON}
              icon={<Play size={16} weight="fill" aria-hidden="true" />}
            />
            <PanelControls />
          </>
        }
      />
      </div>

      <CampaignSection live={live} />

      {!outcomes.leads.ok ? (
        <LoadFailed what="your leads" />
      ) : leads.length === 0 ? (
        <NothingYet
          title="No leads yet"
          description={
            pipeline.queued > 0
              ? `A run is in progress with ${countOf(pipeline.queued, "lead")} queued. Each one appears here with its score and replies once the agent has contacted it.`
              : "Once your outreach agent starts sending, each lead it contacts appears here with its score, its emails and any reply."
          }
        />
      ) : (
        <LeadBoard leads={leads} pipeline={pipeline} />
      )}
    </div>
  );
}
