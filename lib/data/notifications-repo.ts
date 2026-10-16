import { devGlobal } from "@/lib/dev-global";
import { getAgentRepo, AGENT_DEFINITIONS } from "./agent-repo";

export interface Notification {
  id: string;
  agentName: string;
  time: string;
  title: string;
  detail: string;
  href: string;
  read: boolean;
}

const ATTENTION_TAGS = new Set(["NEEDS APPROVAL", "AWAITING REVIEW", "BLOCKED"]);

const readIds = devGlobal<Record<string, Set<string>>>("notifications_read_ids", () => ({}));

export interface NotificationsRepo {
  list(businessId: string): Promise<Notification[]>;
  markAllRead(businessId: string): Promise<void>;
}

class MockNotificationsRepo implements NotificationsRepo {
  async list(businessId: string): Promise<Notification[]> {
    const repo = getAgentRepo();
    const states = await repo.listStates(businessId);
    const read = readIds[businessId] ?? new Set<string>();

    const items: Notification[] = [];
    for (const state of states) {
      const def = AGENT_DEFINITIONS.find((d) => d.id === state.agentId);
      const latestRun = state.runs[0];
      if (!def || !latestRun) continue;
      for (const entry of latestRun.entries) {
        if (!ATTENTION_TAGS.has(entry.tag)) continue;
        const id = `${state.agentId}-${latestRun.runId}-${entry.time}`;
        items.push({
          id,
          agentName: def.name,
          time: entry.time,
          title: entry.title,
          detail: entry.detail,
          href: `/agents/${state.agentId}`,
          read: read.has(id),
        });
      }
    }
    return items;
  }

  async markAllRead(businessId: string): Promise<void> {
    const items = await this.list(businessId);
    readIds[businessId] = new Set(items.map((i) => i.id));
  }
}

let instance: NotificationsRepo | null = null;

export function getNotificationsRepo(): NotificationsRepo {
  if (!instance) instance = new MockNotificationsRepo();
  return instance;
}
