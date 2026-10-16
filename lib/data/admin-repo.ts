import { devGlobal } from "@/lib/dev-global";
import { isBackendConfigured } from "@/lib/api/config";
import { ApiError, apiDelete, apiPost, apiPut, apiRequest } from "@/lib/api/client";
import { readTable, rowsFrom } from "@/lib/api/read-cascade";
import { isRedirectError } from "@/lib/auth/session-expired";
import { normEmail, type Row } from "@/lib/admin/fields";
import { ADMIN_TABLES } from "@/lib/admin/tables";
import { dropAdminScans } from "@/lib/admin/scan-cache";
import { buildAdminFixtures, buildApiKeyFixtures } from "./admin-fixtures";

/**
 * The admin panel's access to the backend: whole tables, one row, and writes.
 *
 * Deliberately table-shaped rather than one method per screen. Every screen is
 * "read a few tables, then map them", and the mapping lives in pure, tested
 * modules under `lib/admin/`. A method per screen would put that mapping here,
 * where it cannot be tested without a network — the reason the house rule puts
 * payload shapes in pure modules.
 *
 * SERVER-ONLY: it reaches `lib/api/client.ts`.
 */

export interface TableRead {
  /** False when the read failed — the screen says "couldn't load", not "empty". */
  ok: boolean;
  rows: Row[];
  error: string | null;
}

export interface ApiKeySaveResult {
  message: string;
  synced: boolean;
}

export interface AdminRepo {
  /** Every row of a table. Admin-only on the backend. */
  scan(table: string): Promise<TableRead>;
  /** One row by its partition key, or null when there is none. */
  getRow(table: string, key: string): Promise<Row | null>;
  /** One customer's rows in a table keyed or indexed by email. */
  userRows(table: string, email: string): Promise<TableRead>;
  /** Writes a whole row, key included. Creates or replaces. */
  put(table: string, row: Row): Promise<void>;
  /** Changes some fields of an existing row. The key goes in the URL only. */
  patch(table: string, key: string, fields: Row): Promise<void>;
  remove(table: string, key: string): Promise<void>;
  apiKeys(): Promise<TableRead>;
  setApiKey(name: string, value: string): Promise<ApiKeySaveResult>;
  testN8n(): Promise<{ ok: boolean; message: string }>;
  /** Asks n8n to email an invite. True when it accepted the request. */
  sendInviteEmail(body: Record<string, unknown>): Promise<boolean>;
}

/**
 * The field each table is keyed on, for the mock's upserts and deletes.
 * Anything unlisted is keyed on `email`, the backend's own default.
 */
const KEY_FIELDS: Readonly<Record<string, string>> = {
  [ADMIN_TABLES.users]: "user_id",
  [ADMIN_TABLES.activityLog]: "logId",
  [ADMIN_TABLES.adminNotifications]: "notificationId",
  [ADMIN_TABLES.errorNotifications]: "errorId",
  [ADMIN_TABLES.integrationRequests]: "requestId",
  [ADMIN_TABLES.orders]: "order_id",
};

function keyField(table: string): string {
  return KEY_FIELDS[table] ?? "email";
}

function matchesKey(row: Row, field: string, key: string): boolean {
  const value = row[field];
  if (field === "email") return normEmail(value) === normEmail(key);
  return value !== undefined && String(value) === key;
}

const mockTables = devGlobal<Record<string, Row[]>>("admin_tables", () => buildAdminFixtures());
const mockApiKeys = devGlobal<Row[]>("admin_api_keys", () => buildApiKeyFixtures());

class MockAdminRepo implements AdminRepo {
  async scan(table: string): Promise<TableRead> {
    return { ok: true, rows: [...(mockTables[table] ?? [])], error: null };
  }

  async getRow(table: string, key: string): Promise<Row | null> {
    const field = keyField(table);
    return (mockTables[table] ?? []).find((row) => matchesKey(row, field, key)) ?? null;
  }

  async userRows(table: string, email: string): Promise<TableRead> {
    const rows = (mockTables[table] ?? []).filter((row) => normEmail(row.email) === normEmail(email));
    return { ok: true, rows, error: null };
  }

  async put(table: string, row: Row): Promise<void> {
    dropAdminScans();
    const field = keyField(table);
    const key = String(row[field] ?? "");
    if (key === "") throw new Error(`Row for ${table} has no ${field}`);
    const rows = mockTables[table] ?? [];
    const index = rows.findIndex((existing) => matchesKey(existing, field, key));
    if (index === -1) rows.push({ ...row });
    else rows[index] = { ...row };
    mockTables[table] = rows;
  }

  async patch(table: string, key: string, fields: Row): Promise<void> {
    dropAdminScans();
    const field = keyField(table);
    const rows = mockTables[table] ?? [];
    const index = rows.findIndex((existing) => matchesKey(existing, field, key));
    if (index === -1) throw new Error(`No row ${key} in ${table}`);
    rows[index] = { ...rows[index], ...fields };
  }

  async remove(table: string, key: string): Promise<void> {
    dropAdminScans();
    const field = keyField(table);
    mockTables[table] = (mockTables[table] ?? []).filter((row) => !matchesKey(row, field, key));
  }

  async apiKeys(): Promise<TableRead> {
    return { ok: true, rows: [...mockApiKeys], error: null };
  }

  async setApiKey(name: string, value: string): Promise<ApiKeySaveResult> {
    const masked = `${"•".repeat(12)}${value.slice(-4)}`;
    const next = {
      key_name: name,
      masked_value: masked,
      has_value: true,
      updated_at: new Date().toISOString(),
      updated_by: "mock",
      synced_to_n8n: true,
    };
    const index = mockApiKeys.findIndex((row) => row.key_name === name);
    if (index === -1) mockApiKeys.push(next);
    else mockApiKeys[index] = next;
    return { message: "Saved (demo mode — nothing was sent to n8n).", synced: true };
  }

  async testN8n(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: "Demo mode: no n8n instance to test against." };
  }

  async sendInviteEmail(): Promise<boolean> {
    // Nothing to send to in mock mode. Returning false is the honest answer —
    // the Roles screen then offers the copyable link, which is the real
    // fallback when email delivery fails.
    return false;
  }
}

/**
 * A full-table scan is slower than the 8s read deadline assumes: it pages
 * through every row server-side. 20s is generous for the table sizes seen so
 * far, and a failure still falls back to "couldn't load" rather than hanging.
 */
const SCAN_TIMEOUT_MS = 20_000;

/**
 * Does this failure mean the table simply does not exist on this backend?
 *
 * DynamoDB answers a scan of a missing table with ResourceNotFoundException,
 * whose message is exactly "Requested resource not found", and the Lambda
 * passes it through. Seen live on 2026-09-23 for three agent tables the
 * admin panel lists (OpenAI Ads, Podcast, Custom Agent) that were never
 * created on `leadbyte-api_v1`.
 *
 * For a list of agent configurations, a table that is not there holds zero
 * configurations. Reporting it as a failed read put a "couldn't read"
 * warning on the Overview and three errors in the log on every render, for
 * something that is not a fault.
 */
export function isMissingTable(error: unknown): boolean {
  if (error instanceof ApiError && error.status === 404) return true;
  return error instanceof Error && /requested resource not found/i.test(error.message);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A 200 that says `success: false` is still a failure. */
function assertSucceeded(payload: unknown, what: string): void {
  const body = payload as { success?: unknown; error?: unknown } | null;
  if (body && body.success === false) {
    throw new Error(typeof body.error === "string" ? body.error : `${what} failed`);
  }
}

class HttpAdminRepo implements AdminRepo {
  async scan(table: string): Promise<TableRead> {
    try {
      const payload = await apiRequest<unknown>(`/api/admin/scan/${encodeURIComponent(table)}`, {
        timeoutMs: SCAN_TIMEOUT_MS,
      });
      assertSucceeded(payload, `Scan of ${table}`);
      return { ok: true, rows: rowsFrom(payload), error: null };
    } catch (error) {
      if (isRedirectError(error)) throw error;
      if (isMissingTable(error)) return { ok: true, rows: [], error: null };
      console.error(`[admin] scan of ${table} failed:`, error);
      return { ok: false, rows: [], error: messageOf(error) };
    }
  }

  async getRow(table: string, key: string): Promise<Row | null> {
    try {
      const payload = await apiRequest<{ data?: unknown }>(
        `/api/data/${encodeURIComponent(table)}/${encodeURIComponent(key)}`,
      );
      const data = payload?.data;
      return data && typeof data === "object" && !Array.isArray(data) ? (data as Row) : null;
    } catch (error) {
      if (isRedirectError(error)) throw error;
      // No row is the normal answer for most keys, not a fault worth logging.
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }

  /**
   * The customer's own routes first, then a filtered admin scan.
   *
   * BACKEND.md Q3: the generic data API returns rows keyed to the CALLER, so a
   * query for another account's email may be refused. The admin scan is the
   * route that is allowed to see everyone's rows; it is heavier, so it is
   * only the fallback, used when the direct read failed rather than when it
   * merely found nothing.
   */
  async userRows(table: string, email: string): Promise<TableRead> {
    const direct = await readTable(table, { email });
    if (direct.ok) return { ok: true, rows: direct.rows, error: null };

    const scanned = await this.scan(table);
    if (!scanned.ok) return scanned;
    return {
      ok: true,
      rows: scanned.rows.filter((row) => normEmail(row.email) === normEmail(email)),
      error: null,
    };
  }

  async put(table: string, row: Row): Promise<void> {
    // Any admin write makes the remembered table reads stale — see
    // `lib/admin/scan-cache.ts`. Cleared first, so even a write that then
    // fails is not hidden behind an old copy.
    dropAdminScans();
    // POST with the key in the body: the legacy app's call for a whole-row
    // save, and the one known to work in production (CLAUDE.md, "Writing to
    // the generic data API").
    assertSucceeded(await apiPost<unknown>(`/api/data/${encodeURIComponent(table)}`, row), `Save to ${table}`);
  }

  async patch(table: string, key: string, fields: Row): Promise<void> {
    dropAdminScans();
    // The key is in the URL and must NOT be repeated in the body — DynamoDB
    // rejects a SET on a key attribute.
    assertSucceeded(
      await apiPut<unknown>(`/api/data/${encodeURIComponent(table)}/${encodeURIComponent(key)}`, fields),
      `Update of ${table}`,
    );
  }

  async remove(table: string, key: string): Promise<void> {
    dropAdminScans();
    assertSucceeded(
      await apiDelete<unknown>(`/api/data/${encodeURIComponent(table)}/${encodeURIComponent(key)}`),
      `Delete from ${table}`,
    );
  }

  async apiKeys(): Promise<TableRead> {
    try {
      const payload = await apiRequest<unknown>("/api/admin/api-keys");
      assertSucceeded(payload, "Reading API keys");
      return { ok: true, rows: rowsFrom(payload), error: null };
    } catch (error) {
      if (isRedirectError(error)) throw error;
      console.error("[admin] reading API keys failed:", error);
      return { ok: false, rows: [], error: messageOf(error) };
    }
  }

  async setApiKey(name: string, value: string): Promise<ApiKeySaveResult> {
    dropAdminScans();
    const payload = await apiPut<{ message?: unknown; synced_to_n8n?: unknown }>("/api/admin/api-keys", {
      key_name: name,
      key_value: value,
    });
    assertSucceeded(payload, "Saving the key");
    return {
      message: typeof payload?.message === "string" ? payload.message : "Key saved.",
      synced: payload?.synced_to_n8n === true,
    };
  }

  async testN8n(): Promise<{ ok: boolean; message: string }> {
    try {
      const payload = await apiPost<{ success?: unknown; credential_count?: unknown; error?: unknown }>(
        "/api/admin/api-keys/test-n8n",
      );
      if (payload?.success === true) {
        const n = typeof payload.credential_count === "number" ? payload.credential_count : null;
        return { ok: true, message: n === null ? "Connected to n8n." : `Connected — ${n} credentials found in n8n.` };
      }
      return { ok: false, message: typeof payload?.error === "string" ? payload.error : "n8n did not answer." };
    } catch (error) {
      if (isRedirectError(error)) throw error;
      return { ok: false, message: messageOf(error) };
    }
  }

  async sendInviteEmail(body: Record<string, unknown>): Promise<boolean> {
    try {
      const payload = await apiPost<unknown>("/api/webhook/admin-invite", body);
      assertSucceeded(payload, "Invite email");
      return true;
    } catch (error) {
      if (isRedirectError(error)) throw error;
      console.error("[admin] invite email was not sent:", error);
      return false;
    }
  }
}

let instance: AdminRepo | null = null;

export function getAdminRepo(): AdminRepo {
  if (!instance) {
    instance = isBackendConfigured() ? new HttpAdminRepo() : new MockAdminRepo();
  }
  return instance;
}
