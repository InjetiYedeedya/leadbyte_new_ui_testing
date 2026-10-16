import { beginTurn, endTurn } from "@/lib/data/strategy-inflight";
import { isBackendConfigured } from "@/lib/api/config";
import { getSession } from "@/lib/auth/session";
import { getStrategyRepo } from "@/lib/data/strategy-repo";
import { OPENING_MESSAGE, sendStrategyMessage } from "@/lib/data/marketing-strategy";
import {
  appendTurn,
  getConversation,
  resetConversation,
  setConversationError,
} from "@/lib/data/strategy-conversation";

/**
 * Opens the strategy conversation.
 *
 * Sends "Hi" and lets the agent run the interview. An earlier version asked
 * three questions of our own first and sent the answers as the opening message;
 * the backend's instruction is that the conversation should be direct, because
 * the agent asks for what it needs — and our questionnaire both duplicated that
 * and forced the answers into a shape it never requested.
 */
export async function startStrategy(businessId: string): Promise<void> {
  // With no backend the mock strategy is the working path — an unconfigured
  // environment is a working environment.
  if (!isBackendConfigured()) {
    await getStrategyRepo().generate(businessId);
    return;
  }

  // The opening message is a real agent turn — claimed here so a second press
  // cannot start a parallel one. Two openings on one account would also reset
  // the conversation twice, throwing away the first agent reply as it arrived.
  if (!beginTurn(businessId)) {
    console.warn(`[strategy] a turn is already running for ${businessId} — not starting another`);
    return;
  }

  const session = await getSession();

  // A new session id: this is a fresh strategy, and reusing the old one would
  // have the agent answering from a conversation the customer cannot see.
  await resetConversation(businessId);
  const { sessionId } = await getConversation(businessId);

  await appendTurn(businessId, {
    role: "user",
    text: OPENING_MESSAGE,
    at: new Date().toISOString(),
  });

  try {
    const output = await sendStrategyMessage({
      sessionId,
      chatInput: OPENING_MESSAGE,
      userId: session?.userId,
      email: session?.businessId,
    });
    await appendTurn(businessId, { role: "agent", text: output, at: new Date().toISOString() });
  } catch (error) {
    console.error("[strategy] opening turn failed:", error);
    await setConversationError(
      businessId,
      error instanceof Error ? error.message : "The strategy agent could not be reached.",
    );
  } finally {
    endTurn(businessId);
  }
}
