import { randomUUID } from "node:crypto";
import { ApiTimeoutError, apiRequest } from "@/lib/api/client";

/**
 * The marketing-strategy agent.
 *
 * ## The contract (backend team, 2026-09-03)
 *
 *   POST /api/webhook/marketing-strategy
 *   { action: "sendMessage", sessionId, chatInput }   → { output: "..." }
 *
 * `x-api-key` only — no JWT today. `apiPost` attaches the key.
 *
 * ## It is a CONVERSATION, not a request
 *
 * The agent remembers context per `sessionId` and asks follow-up questions.
 * Ask it for a strategy with only goal/budget/target and it answers with a
 * question — "what's your business name and website?" — not a strategy. So a
 * single fire-and-render would show the customer a question where they expected
 * a plan.
 *
 * Two consequences the rest of the code is built around:
 *
 *   1. `sessionId` is generated once and reused for every turn. A new id per
 *      message would restart the conversation each time, and the agent would
 *      ask the same follow-up forever.
 *   2. The first message carries everything we ALREADY know — business name and
 *      website come from the profile — so the common case resolves in one turn
 *      instead of two. Asking a customer for a website URL we are already
 *      displaying on another tab is the kind of thing that reads as broken.
 *
 * ## Shape tolerance
 *
 * The Lambda forwards n8n's response verbatim, so the body is whatever the
 * agent returned. Today that is `{ output }`; the backend says richer JSON may
 * follow. `readOutput` therefore accepts the documented shape, a bare string,
 * and a single-element array, and returns "" for anything else rather than
 * rendering `[object Object]`.
 */

const ROUTE = "/api/webhook/marketing-strategy";

/**
 * How long to let one turn take.
 *
 * The client's default is 8s, tuned for parallel table reads. That aborted
 * every real turn: the backend measured ~6s for a trivial reply, and building
 * an actual strategy takes considerably longer. Two minutes is generous enough
 * for the agent to think and still bounded, so a hung agent cannot hold a
 * Server Action open forever.
 */
export const TURN_TIMEOUT_MS = 120_000;

export interface StrategyTurn {
  role: "user" | "agent";
  text: string;
  /** ISO, so a rendered thread can show ordering without a second source. */
  at: string;
}

export function newSessionId(): string {
  // Shaped like the backend's own samples (`strategy_1788332425797_4gkq7kd…`)
  // so an id in our logs can be matched against theirs by eye.
  return `strategy_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 11)}`;
}

/**
 * The opening message.
 *
 * Just "Hi". The agent runs the interview itself — asking for goal, budget,
 * target, and anything else it needs — so front-loading our own questionnaire
 * both duplicated its work and forced its answers into a shape it never asked
 * for. Backend's instruction, 2026-09-03.
 */
export const OPENING_MESSAGE = "Hi";

export function readOutput(payload: unknown): string {
  if (typeof payload === "string") return payload.trim();

  if (Array.isArray(payload)) {
    // n8n hands back one item per node run; a single-item array is the common
    // shape when the workflow ends on one node.
    return payload.length > 0 ? readOutput(payload[0]) : "";
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["output", "text", "message", "response"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
  }

  return "";
}

/**
 * One turn of the conversation.
 *
 * Throws on transport failure so the caller can say so; a silent "" would be
 * indistinguishable from the agent having nothing to say.
 */
export async function sendStrategyMessage(input: {
  sessionId: string;
  chatInput: string;
  userId?: string;
  email?: string;
}): Promise<string> {
  const body: Record<string, unknown> = {
    action: "sendMessage",
    sessionId: input.sessionId,
    chatInput: input.chatInput,
  };

  // This route forwards the body verbatim and does NOT inject user_id itself,
  // unlike the account-selection routes — the backend said so explicitly. So we
  // send it, when the session has one.
  if (input.userId) body.user_id = input.userId;
  if (input.email) body.email = input.email;

  let payload: unknown;
  try {
    payload = await apiRequest<unknown>(ROUTE, {
      method: "POST",
      body,
      timeoutMs: TURN_TIMEOUT_MS,
    });
  } catch (error) {
    // "The operation was aborted due to timeout" is DOM wording, and it lands
    // in front of a customer. Say what happened to their message instead.
    //
    // `apiRequest` classifies the abort now, so `ApiTimeoutError` is the shape
    // that actually arrives; the raw DOM names stay as a guard for any path
    // that ever calls fetch without going through the client.
    if (
      error instanceof ApiTimeoutError ||
      (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))
    ) {
      // NOT "send it again": the agent keeps state per session and has almost
      // certainly received the message, so resending ran a second paid turn
      // with the same words (audit, 2026-09-29).
      throw new Error(
        "The strategy agent is taking longer than usual. It has your message — reload in a minute to see its reply instead of sending it again.",
      );
    }
    throw error;
  }
  const output = readOutput(payload);

  if (output === "") {
    console.error("[strategy] agent returned no readable output:", payload);
    throw new Error("The strategy agent returned an empty response.");
  }

  return output;
}
