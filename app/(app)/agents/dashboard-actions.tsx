"use server";

import type { ReactNode } from "react";
import { currentBusinessId } from "@/components/page-shell";
import { getSession } from "@/lib/auth/session";
import { getAgentRepo } from "@/lib/data/agent-repo";
import { agentRowStatuses } from "@/lib/data/agent-live-status";
import type { AgentRowStatus } from "@/lib/data/agent-row-status";
import { dashboardTabFor } from "@/lib/data/dashboard/tabs";
import { lockedDashboardTabs } from "@/lib/data/dashboard/locked-tabs";
import { DashboardTabBody } from "@/components/agents/dashboard/dashboard-tab-body";

/**
 * One agent dashboard, read on its own.
 *
 * ## Why this exists
 *
 * The dashboard used to be part of the Agents page's render, so everything it
 * did reloaded the whole page: Refresh (`router.refresh()`) re-ran every read
 * on the page — agent states, mailbox, run gates, the list — to update one
 * panel, and opening a dashboard was a navigation to `?agent=<id>`, which Next
 * treats as a NEW page instance, so the page's own `PageLoading` replaced the
 * screen while a spinner also turned beside the row's arrow. Two loaders for
 * one click, and a list that vanished to show a panel next to it.
 *
 * Now the panel asks for its own content and the page is left alone. The data
 * still comes from the same server-side tab readers (`*-tab.tsx`); only what
 * triggers the read has changed.
 *
 * ## The gate runs here too
 *
 * A Server Action is a public endpoint. The strip shows a tab locked, but a
 * hand-made call could still ask for it, so the same rule the page uses
 * (`lockedDashboardTabs`) is applied before anything is read.
 */
export async function loadAgentDashboard(tabId: string): Promise<ReactNode> {
  const tab = dashboardTabFor(tabId);
  if (!tab) throw new Error("That dashboard does not exist.");

  const businessId = await currentBusinessId();
  const [session, statuses] = await Promise.all([getSession(), agentRowStatuses(businessId)]);

  // Every offered agent, with a missing status read as "needs-setup" — the same
  // filling the page does, so both reach the same verdict.
  const statusById = new Map<string, AgentRowStatus>(
    getAgentRepo()
      .listDefinitions()
      .map((def) => [def.id, statuses.get(def.id) ?? "needs-setup"] as const),
  );
  if (lockedDashboardTabs(statusById).has(tab.id)) {
    throw new Error("That dashboard is not unlocked for this account.");
  }

  return <DashboardTabBody tab={tab} email={session?.businessId ?? businessId} uid={session?.userId} />;
}
