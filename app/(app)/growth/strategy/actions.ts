"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentBusinessId } from "@/components/page-shell";
import { getSession } from "@/lib/auth/session";
import { sendStrategyMessage } from "@/lib/data/marketing-strategy";
import { startStrategy } from "@/lib/data/strategy-start";
import {
  appendTurn,
  getConversation,
  resetConversation,
  setConversationError,
} from "@/lib/data/strategy-conversation";
import { beginTurn, endTurn, isTurnInFlight } from "@/lib/data/strategy-inflight";
import { dismissGooglePrompt } from "@/lib/data/google-prompt";

/**
 * One turn: record what the customer said, ask the agent, record the reply.
 *
 * The user turn is appended BEFORE the call and kept even when the call fails.
 * Dropping it would erase what they typed at exactly the moment they need to
 * decide whether to retry it.
 */
async function runTurn(businessId: string, chatInput: string): Promise<void> {
  // One turn at a time. The button disables itself while a turn runs, but a
  // reload, a second tab, or someone who gives up waiting and clicks again all
  // get past that — and each one is another paid run interleaved into the SAME
  // agent session. See `strategy-inflight.ts`.
  if (!beginTurn(businessId)) {
    console.warn(`[strategy] a turn is already running for ${businessId} — ignoring this one`);
    await setConversationError(
      businessId,
      "Your last message is still being answered. Give the agent a moment.",
    );
    return;
  }

  const session = await getSession();
  const { sessionId } = await getConversation(businessId);

  await appendTurn(businessId, { role: "user", text: chatInput, at: new Date().toISOString() });

  try {
    const output = await sendStrategyMessage({
      sessionId,
      chatInput,
      userId: session?.userId,
      email: session?.businessId,
    });
    await appendTurn(businessId, { role: "agent", text: output, at: new Date().toISOString() });
  } catch (error) {
    console.error("[strategy] turn failed:", error);
    await setConversationError(
      businessId,
      error instanceof Error ? error.message : "The strategy agent could not be reached.",
    );
  } finally {
    // `finally`, so a thrown turn does not lock the conversation until the
    // stale timeout rescues it.
    endTurn(businessId);
  }
}

/**
 * Begins the conversation. No questionnaire — the agent interviews the
 * customer itself, so there is nothing for us to collect first.
 */
export async function beginStrategy(): Promise<void> {
  const businessId = await currentBusinessId();
  // The opening message is an agent turn like any other, and pressing Start
  // twice is the easiest way to get two of them.
  if (isTurnInFlight(businessId)) {
    console.warn(`[strategy] already starting for ${businessId} — ignoring`);
    revalidatePath("/growth/strategy");
    redirect("/growth/strategy");
  }
  await startStrategy(businessId);
  revalidatePath("/growth/strategy");
  redirect("/growth/strategy");
}

/** A follow-up message on the same `sessionId`, so the agent keeps its context. */
export async function sendStrategyReply(formData: FormData): Promise<void> {
  const businessId = await currentBusinessId();
  const message = String(formData.get("message") ?? "").trim();

  if (message !== "") {
    await runTurn(businessId, message);
  }

  revalidatePath("/growth/strategy");
  redirect("/growth/strategy");
}

/** Start again, with a new session id so the agent forgets too. */
export async function restartStrategy(): Promise<void> {
  const businessId = await currentBusinessId();
  await resetConversation(businessId);
  revalidatePath("/growth/strategy");
  redirect("/growth/strategy");
}

/**
 * "Start without connecting" on the ad-accounts gate.
 *
 * Answers the ask and begins the conversation in ONE submit — two steps would
 * mean answering the question and then still having to press start, which
 * reads as the answer not having worked.
 *
 * It records nothing. The ask is raised from connection status alone now, so
 * the next visit asks again until an account is actually connected; that is the
 * chosen behaviour, not an oversight. An earlier version stored a year-long
 * "not now" cookie, which meant almost nobody saw the ask twice and anyone who
 * dismissed it could not find it again.
 */
export async function skipAdsAndBegin(): Promise<void> {
  const businessId = await currentBusinessId();
  if (isTurnInFlight(businessId)) {
    console.warn(`[strategy] already starting for ${businessId} — ignoring`);
    revalidatePath("/growth/strategy");
    redirect("/growth/strategy");
  }
  await startStrategy(businessId);

  revalidatePath("/growth/strategy");
  redirect("/growth/strategy");
}

/**
 * "Move to strategy" from the Connect-Google banner's dialog.
 *
 * A navigation that also remembers the answer. The control used to be a plain
 * link, so the banner it was declining followed the customer to the page they
 * had just asked to be taken to and asked again — see
 * `lib/data/google-prompt.ts`.
 *
 * A Server Action rather than a `Link` because writing the cookie is the whole
 * point, and cookies are writable only from an action or a Route Handler.
 */
export async function skipGoogleAndPlan(): Promise<void> {
  await dismissGooglePrompt();
  // Outside any try/catch, and last: `redirect()` throws NEXT_REDIRECT by
  // design, and rule 4 is that nothing which runs after a side effect may
  // swallow it.
  redirect("/growth/strategy");
}
