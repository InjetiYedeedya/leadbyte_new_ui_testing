import { cache } from "react";
import { getAdminRepo, type TableRead } from "@/lib/data/admin-repo";
import { buildClients, type AgentConfigSet, type Client } from "./clients";
import { ADMIN_TABLES, AGENT_CONFIG_TABLES } from "./tables";
import { cachedScan, rememberScan } from "./scan-cache";

/**
 * The admin reads several screens share, each once per render.
 *
 * `cache()` is per render, so nothing here can leak between admins or go
 * stale — it only stops the Overview's four tiles and the Clients table each
 * scanning the users table on the same request. SERVER-ONLY.
 */

/**
 * A whole-table read for an admin SCREEN — remembered for a few seconds across
 * requests (`scan-cache.ts`) as well as within one render (`cache()`).
 * Server Actions must not use this: they read the repo directly, fresh.
 */
export const scanTable = cache(async (table: string): Promise<TableRead> => {
  const remembered = cachedScan(table);
  if (remembered) return remembered;
  const read = await getAdminRepo().scan(table);
  rememberScan(table, read);
  return read;
});

export const loadAgentConfigs = cache(async (): Promise<AgentConfigSet[]> => {
  const reads = await Promise.all(AGENT_CONFIG_TABLES.map(({ table }) => scanTable(table)));
  return AGENT_CONFIG_TABLES.map(({ name }, index) => {
    const read = reads[index];
    return { name, rows: read?.rows ?? [], ok: read?.ok ?? false };
  });
});

export interface ClientsRead {
  clients: Client[];
  /** False when the users table itself could not be read. */
  ok: boolean;
  configs: AgentConfigSet[];
  /** The raw user rows — the grant screen writes one back whole. */
  userRows: TableRead["rows"];
}

export const loadClients = cache(async (): Promise<ClientsRead> => {
  const [users, details, configs] = await Promise.all([
    scanTable(ADMIN_TABLES.users),
    scanTable(ADMIN_TABLES.overallDetails),
    loadAgentConfigs(),
  ]);
  return {
    clients: buildClients(users.rows, details.rows, configs),
    ok: users.ok,
    configs,
    userRows: users.rows,
  };
});
