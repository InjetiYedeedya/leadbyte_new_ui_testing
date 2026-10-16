import { randomUUID } from "node:crypto";
import { isBackendConfigured } from "@/lib/api/config";
import { apiPost } from "@/lib/api/client";
import { isRedirectError } from "@/lib/auth/session-expired";
import { getAdminRepo } from "@/lib/data/admin-repo";
import { normEmail, type Row } from "./fields";
import { ADMIN_TABLES } from "./tables";

/**
 * Agent failures, written where the team can read them: the admin panel's
 * Errors screen (`LeadByteErrorNotifications`).
 *
 * The customer is shown a plain sentence on purpose — "The ad agent ran into
 * a problem on its side" rather than n8n's "Error in workflow" — and the real
 * reason went only to the server log, which nobody looks at while a customer
 * is waiting. So when an agent failed for one account, nobody could tell why
 * from anywhere (2026-10-08). Now each failure is also a row on that screen,
 * and the customer's message carries a short reference that names it.
 *
 * MUST NEVER THROW: it runs inside an action's failure path, and a failed log
 * write must not replace the message the customer is about to read.
 * SERVER-ONLY.
 */

/** Long enough to read, short enough not to fill the Errors list. */
const MAX_DETAIL = 1_000;

/**
 * The failure text with anything credential-shaped masked. Pure.
 *
 * Errors carry the upstream reply verbatim, and an upstream reply can echo a
 * token or a bearer header back. Keys and values both: `"access_token":"…"`,
 * `Bearer …`, and anything shaped like a JWT.
 */
export function maskSecrets(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(
      /("?(?:pass(?:word)?|secret|token|access_token|refresh_token|api[_-]?key|apikey|authori[sz]ation|credential|cookie)"?\s*[:=]\s*)("[^"]*"|[^\s,}&]+)/gi,
      "$1[redacted]",
    );
}

/** The detail an error carries — its message, then its cause. Pure. */
export function failureDetail(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` (cause: ${error.cause.message})` : "";
    return `${error.name}: ${error.message}${cause}`;
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

/** A reference a customer can read out: 6 characters, no lookalikes. Pure. */
export function failureReference(seed: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    const code = seed.charCodeAt(i % seed.length) + i * 7;
    out += alphabet[code % alphabet.length];
  }
  return out;
}

export interface AgentFailure {
  agentId: string;
  /** Which step failed, in our words: "approve plan", "launch campaign"… */
  step: string;
  email: string;
  error: unknown;
}

/** The Errors row for a failure. Pure, so its shape is tested. */
export function buildFailureRow(
  failure: AgentFailure,
  reference: string,
  errorId: string,
  now: Date,
): Row {
  const detail = maskSecrets(failureDetail(failure.error)).slice(0, MAX_DETAIL);
  return {
    errorId,
    timestamp: now.toISOString(),
    agentType: failure.agentId,
    priority: "HIGH",
    workflowName: `app: ${failure.step}`,
    errorMessage: `[${reference}] ${normEmail(failure.email)} — ${detail}`,
    userEmail: normEmail(failure.email),
    reference,
    status: "Active",
    cleared: false,
    source: "leadbyte-app",
  };
}

/**
 * Records the failure and returns the reference to show the customer. Never
 * throws; the reference is returned even when the write fails, because the
 * server log still carries it.
 */
export async function reportAgentFailure(failure: AgentFailure): Promise<string> {
  const errorId = randomUUID();
  const reference = failureReference(errorId.replace(/-/g, ""));
  const row = buildFailureRow(failure, reference, errorId, new Date());
  console.error(`[${failure.agentId}] ${failure.step} failed — reference ${reference}:`, failure.error);
  try {
    if (isBackendConfigured()) {
      await apiPost(`/api/data/${ADMIN_TABLES.errorNotifications}`, row);
    } else {
      await getAdminRepo().put(ADMIN_TABLES.errorNotifications, row);
    }
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(`[${failure.agentId}] could not record failure ${reference}:`, error);
  }
  return reference;
}

/** The customer's sentence with its reference attached. Pure. */
export function withReference(message: string, reference: string): string {
  return `${message} (Reference ${reference} — quote it if you contact support.)`;
}
