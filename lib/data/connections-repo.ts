import { devGlobal } from "@/lib/dev-global";
import { isBackendConfigured } from "@/lib/api/config";
import { checkOAuthStatus } from "@/lib/api/oauth-status";
import type { ConnectionsState } from "./types";

export interface ConnectionsRepo {
  get(businessId: string): Promise<ConnectionsState>;
  skip(businessId: string): Promise<void>;
}

const state = devGlobal<Record<string, ConnectionsState>>("connections_state", () => ({}));

function defaultState(businessId: string): ConnectionsState {
  return { businessId, googleAnalyticsConnected: false, skipped: false };
}

class MockConnectionsRepo implements ConnectionsRepo {
  async get(businessId: string): Promise<ConnectionsState> {
    return state[businessId] ?? defaultState(businessId);
  }


  async skip(businessId: string): Promise<void> {
    const current = state[businessId] ?? defaultState(businessId);
    state[businessId] = { ...current, skipped: true };
  }
}

/**
 * Reads the real connection state from the backend's Frontend Check tables.
 *
 * `skipped` has NO backend equivalent — it is a purely local onboarding
 * choice ("I'll connect analytics later"), so it stays in process memory even
 * in live mode. That is a known limitation: it resets on server restart, and
 * must move to the database before this ships. Everything else is live.
 */
class HttpConnectionsRepo implements ConnectionsRepo {
  async get(businessId: string): Promise<ConnectionsState> {
    const result = await checkOAuthStatus("googleAnalytics", businessId);
    return {
      businessId,
      // Only a live, unexpired connection counts. "expired" deliberately reads
      // as not connected so the user is prompted to reconnect.
      googleAnalyticsConnected: result.status === "valid",
      skipped: state[businessId]?.skipped ?? false,
    };
  }


  async skip(businessId: string): Promise<void> {
    const current = state[businessId] ?? defaultState(businessId);
    state[businessId] = { ...current, skipped: true };
  }
}

let instance: ConnectionsRepo | null = null;

export function getConnectionsRepo(): ConnectionsRepo {
  if (!instance) {
    instance = isBackendConfigured() ? new HttpConnectionsRepo() : new MockConnectionsRepo();
  }
  return instance;
}
