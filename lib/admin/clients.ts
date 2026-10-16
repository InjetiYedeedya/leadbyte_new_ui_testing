import {
  formatDateTime,
  humanizeKey,
  normEmail,
  pick,
  pickString,
  safeCellText,
  timeOf,
  truthy,
  type Row,
} from "./fields";

/**
 * The Clients screen and the Overview it feeds.
 *
 * A client is a `leadbyte_users` row, joined to the business-details table for
 * the company name (the users table only holds the Google/display name), and
 * to every agent-config table for the agents they have set up.
 */

/** One agent-config table's rows, as read — `ok: false` when the read failed. */
export interface AgentConfigSet {
  name: string;
  rows: Row[];
  ok: boolean;
}

export type Provider = "google" | "email" | "unknown";

export interface ClientAgentConfig {
  name: string;
  /** Up to eight stored fields, as label/value text. */
  fields: { label: string; value: string }[];
}

export interface Client {
  /** Stable row identity: the email, or the uid when a row has no email. */
  key: string;
  email: string;
  company: string;
  name: string;
  provider: Provider;
  providerRaw: string;
  createdAt: number | null;
  createdLabel: string;
  lastLoginAt: number | null;
  lastLoginLabel: string;
  uid: string;
  /** Null when the row does not say. */
  emailVerified: boolean | null;
  /** Names of the agents this client has a configuration for. */
  agents: string[];
  agentConfigs: ClientAgentConfig[];
}

/** Fields that describe the row, not the configuration. */
const CONFIG_NOISE = new Set(["email", "created_at", "updated_at", "user_id", "uid", "id"]);

function providerOf(raw: string): Provider {
  const value = raw.toLowerCase();
  if (value === "") return "unknown";
  if (value.includes("google")) return "google";
  return "email";
}

/** email → company name, from the business-details table. */
export function companyByEmail(details: readonly Row[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of details) {
    const email = normEmail(row.email);
    const company = pickString(row, "companyName", "company_name", "businessName");
    if (email !== "" && company !== "" && !map.has(email)) map.set(email, company);
  }
  return map;
}

function configFields(row: Row): { label: string; value: string }[] {
  return Object.entries(row)
    .filter(([key]) => !CONFIG_NOISE.has(key))
    .slice(0, 8)
    .map(([key, value]) => ({ label: humanizeKey(key), value: safeCellText(key, value) }));
}

export function buildClients(
  users: readonly Row[],
  details: readonly Row[],
  configs: readonly AgentConfigSet[],
): Client[] {
  const companies = companyByEmail(details);
  const seen = new Set<string>();
  const clients: Client[] = [];

  for (const row of users) {
    const email = normEmail(row.email);
    const uid = pickString(row, "user_id", "uid");
    const key = email || uid;
    // A row with neither is not a client anyone can act on.
    if (key === "" || seen.has(key)) continue;
    seen.add(key);

    const agentConfigs: ClientAgentConfig[] = [];
    if (email !== "") {
      for (const set of configs) {
        const found = set.rows.find((config) => normEmail(config.email) === email);
        if (found) agentConfigs.push({ name: set.name, fields: configFields(found) });
      }
    }

    const verified = pick(row, "emailVerified", "email_verified");
    const createdRaw = pick(row, "created_at", "createdAt");
    const loginRaw = pick(row, "last_login", "lastLogin");
    const providerRaw = pickString(row, "provider");

    clients.push({
      key,
      email,
      company: pickString(row, "companyName") || companies.get(email) || "",
      name: pickString(row, "displayName", "name"),
      provider: providerOf(providerRaw),
      providerRaw,
      createdAt: timeOf(createdRaw),
      createdLabel: formatDateTime(createdRaw),
      lastLoginAt: timeOf(loginRaw),
      lastLoginLabel: formatDateTime(loginRaw),
      uid,
      emailVerified: verified === undefined ? null : truthy(verified),
      agents: agentConfigs.map((config) => config.name),
      agentConfigs,
    });
  }

  // Newest first: the question on arrival is "who signed up lately".
  return clients.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/** What the Clients search box matches: company, email and name. */
export function clientSearchText(client: Client): string {
  return `${client.company} ${client.email} ${client.name}`;
}

export interface AdoptionTile {
  name: string;
  count: number;
  /** Share of all configurations, 0-100. */
  share: number;
}

export interface Overview {
  totalClients: number;
  totalConfigs: number;
  /** Signed up in the last seven days. */
  newClients: number;
  /** Null when nobody has configured anything. */
  mostAdopted: { name: string; count: number } | null;
  /** Ranked, most configured first. */
  adoption: AdoptionTile[];
  /** Agent tables whose read failed — their counts are unknown, not zero. */
  unreadable: string[];
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function buildOverview(
  clients: readonly Client[],
  configs: readonly AgentConfigSet[],
  now: Date = new Date(),
): Overview {
  const readable = configs.filter((set) => set.ok);
  const totalConfigs = readable.reduce((sum, set) => sum + set.rows.length, 0);

  const adoption = readable
    .map((set) => ({
      name: set.name,
      count: set.rows.length,
      share: totalConfigs > 0 ? (set.rows.length / totalConfigs) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const top = adoption[0];
  const cutoff = now.getTime() - WEEK_MS;

  return {
    totalClients: clients.length,
    totalConfigs,
    newClients: clients.filter((c) => c.createdAt !== null && c.createdAt >= cutoff).length,
    mostAdopted: top && top.count > 0 ? { name: top.name, count: top.count } : null,
    adoption,
    unreadable: configs.filter((set) => !set.ok).map((set) => set.name),
  };
}

/**
 * The columns an agent's configuration table shows.
 *
 * The legacy panel took the keys of the FIRST row, so one sparse row hid every
 * field the others had. This takes keys in order of first appearance across
 * all rows, email first, and caps at six so the table still fits.
 */
export function configColumns(rows: readonly Row[]): string[] {
  const keys: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key === "email") continue;
      if (CONFIG_NOISE.has(key) || keys.includes(key)) continue;
      keys.push(key);
    }
  }
  const hasEmail = rows.some((row) => pick(row, "email") !== undefined);
  return [...(hasEmail ? ["email"] : []), ...keys].slice(0, 6);
}

export interface ConfigRow {
  key: string;
  email: string;
  cells: Record<string, string>;
}

export function configRows(rows: readonly Row[], columns: readonly string[]): ConfigRow[] {
  return rows.map((row, index) => ({
    key: `${normEmail(row.email) || "row"}-${index}`,
    email: normEmail(row.email),
    cells: Object.fromEntries(
      columns.map((column) => [
        column,
        safeCellText(column, row[column], column === "email" ? 120 : 60),
      ]),
    ),
  }));
}
