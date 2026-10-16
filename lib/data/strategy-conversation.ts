import { devGlobal } from "@/lib/dev-global";
import { isRedirectError } from "@/lib/auth/session-expired";
import { apiGet, apiPut } from "@/lib/api/client";
import { isBackendConfigured } from "@/lib/api/config";
import { newSessionId, type StrategyTurn } from "@/lib/data/marketing-strategy";

/**
 * The strategy conversation, per business.
 *
 * The agent keeps its own memory keyed by `sessionId`; this keeps OUR side —
 * the id to reuse, and the transcript to render. Both are needed: the agent
 * will not replay the thread back to us, so if we lose it the customer's own
 * questions and answers vanish from the screen while the agent carries on
 * remembering them.
 *
 * ## Where it lives
 *
 * In process memory (`devGlobal`, for the reason below) AND, with a backend,
 * on the account's own `Leadbyte_User_Overall_Details` row as one JSON field,
 * `strategy_conversation` — written with the same partial PUT the profile
 * screens use. Memory alone was the whole store until 2026-10-08, and the live
 * site (Cloudflare Workers) loses process memory between requests: customers
 * came back to an empty strategy screen and an agent that behaved as though
 * they had already talked. Memory is now only a cache in front of the row.
 *
 * Saving is best effort and never throws: a failed save costs the transcript
 * on the next cold start, which is what always happened before, and must not
 * cost the reply the customer is waiting for.
 *
 * ## Why `devGlobal`
 *
 * Next dev compiles a module into more than one bundle, and a plain
 * module-level object is not guaranteed to be the same one across two Server
 * Actions in different routes. That exact bug cost real time on the paywall
 * gate.
 */

export interface StrategyConversation {
  sessionId: string;
  turns: StrategyTurn[];
  /** Set when a turn failed, so the screen can offer a retry instead of
      pretending the message was delivered. Memory only — it describes this
      moment, not the conversation. */
  error?: string;
}

/** The profile row the transcript is stored on (see `business-profile-repo.ts`). */
const OVERALL_DETAILS_TABLE = "t36c087b3a";
const FIELD = "strategy_conversation";

/**
 * DynamoDB caps an item at 400 KB and the profile row carries the whole
 * analysis beside this. Older turns are dropped first; the agent still has
 * them in its own memory, so nothing is lost to IT.
 */
export const MAX_STORED_TURNS = 60;
export const MAX_STORED_CHARS = 120_000;

const conversations = devGlobal<Record<string, StrategyConversation>>(
  "strategy_conversations",
  () => ({}),
);

/** The stored form: the newest turns that fit, as one JSON string. Pure. */
export function serialiseConversation(conversation: StrategyConversation): string {
  let turns = conversation.turns.slice(-MAX_STORED_TURNS);
  let text = JSON.stringify({ sessionId: conversation.sessionId, turns });
  while (text.length > MAX_STORED_CHARS && turns.length > 1) {
    turns = turns.slice(1);
    text = JSON.stringify({ sessionId: conversation.sessionId, turns });
  }
  return text;
}

/** A stored conversation, or null for anything unusable. Pure. */
export function parseStoredConversation(raw: unknown): StrategyConversation | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const { sessionId, turns } = value as { sessionId?: unknown; turns?: unknown };
  if (typeof sessionId !== "string" || sessionId === "" || !Array.isArray(turns)) return null;
  const clean = turns.filter(
    (turn): turn is StrategyTurn =>
      !!turn &&
      typeof turn === "object" &&
      ((turn as StrategyTurn).role === "user" || (turn as StrategyTurn).role === "agent") &&
      typeof (turn as StrategyTurn).text === "string" &&
      typeof (turn as StrategyTurn).at === "string",
  );
  return { sessionId, turns: clean };
}

async function readStored(businessId: string): Promise<StrategyConversation | null> {
  try {
    const payload = await apiGet<{ data?: Record<string, unknown> | null }>(
      `/api/data/${OVERALL_DETAILS_TABLE}/${encodeURIComponent(businessId)}`,
    );
    return parseStoredConversation(payload?.data?.[FIELD]);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(`[strategy] could not read the stored conversation for ${businessId}:`, error);
    return null;
  }
}

async function store(businessId: string, conversation: StrategyConversation): Promise<void> {
  conversations[businessId] = conversation;
  if (!isBackendConfigured()) return;
  try {
    // A partial update: the key travels in the URL and is NOT repeated in the
    // body (CLAUDE.md, "Writing to the generic data API").
    await apiPut(`/api/data/${OVERALL_DETAILS_TABLE}/${encodeURIComponent(businessId)}`, {
      [FIELD]: serialiseConversation(conversation),
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(`[strategy] could not save the conversation for ${businessId}:`, error);
  }
}

/**
 * Reads the thread, creating one on first use.
 *
 * With a backend the stored row wins over memory: the live site runs many
 * isolates, and one that cached the thread earlier would otherwise show it
 * without the turns another isolate has since saved. Memory answers only when
 * the row has nothing (a conversation not yet saved) or cannot be read. A
 * memory-held `error` survives a read that agrees on the session.
 */
export async function getConversation(businessId: string): Promise<StrategyConversation> {
  const cached = conversations[businessId];
  const stored = isBackendConfigured() ? await readStored(businessId) : null;
  if (stored) {
    const merged =
      cached?.error && cached.sessionId === stored.sessionId ? { ...stored, error: cached.error } : stored;
    conversations[businessId] = merged;
    return merged;
  }
  if (cached) return cached;
  // Not saved until a turn is: an unstarted conversation needs no row.
  const created: StrategyConversation = { sessionId: newSessionId(), turns: [] };
  conversations[businessId] = created;
  return created;
}

export async function appendTurn(businessId: string, turn: StrategyTurn): Promise<void> {
  const conversation = await getConversation(businessId);
  await store(businessId, { sessionId: conversation.sessionId, turns: [...conversation.turns, turn] });
}

export async function setConversationError(businessId: string, error: string): Promise<void> {
  const conversation = await getConversation(businessId);
  conversations[businessId] = { ...conversation, error };
}

/** Starts over with a NEW session id, so the agent forgets too. Reusing the id
    would leave it answering from a conversation the customer cannot see. */
export async function resetConversation(businessId: string): Promise<void> {
  await store(businessId, { sessionId: newSessionId(), turns: [] });
}
