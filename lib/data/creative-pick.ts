import { cookies } from "next/headers";
import type { PromptChoice } from "@/lib/data/creative-prompts";

/**
 * The creative prompt job in flight, and the prompt the customer picked.
 *
 * ## Why a cookie
 *
 * The pick is made on the semi form and used on submit — two requests apart,
 * with an upload in between. It has to survive that, and a reload, without
 * being trusted from the browser: the launch body it feeds spends ad budget.
 * Same reasoning as `ads-suggestion`'s own storage, and `leadbyte_`-prefixed so
 * signing out clears it.
 *
 * ## Why the prompt TEXT is stored and not just its index
 *
 * The launch body carries the prompt verbatim (`selected_prompt`). Re-fetching
 * it at submit time would mean the pipeline could answer differently — or not
 * at all — between the pick and the launch, and the campaign would then run on
 * a prompt nobody chose.
 */

const PICK_COOKIE = "leadbyte_creative_pick";
/** An hour: long enough to finish a form, short enough not to outlive a plan. */
const MAX_AGE = 60 * 60;

export interface CreativePick {
  jobId: string;
  token: string;
  /** Set once the customer has chosen. Absent while the job is still running. */
  chosen?: { index: number; model: string; prompt: string };
}

const OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
} as const;

/** Parses the stored value. Pure, so it can be tested without `cookies()`. */
export function parsePick(raw: string | undefined): CreativePick | null {
  if (raw === undefined || raw.trim() === "") return null;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (value === null || typeof value !== "object") return null;
    const pick = value as Record<string, unknown>;
    if (typeof pick.jobId !== "string" || typeof pick.token !== "string") return null;

    const chosen = pick.chosen as Record<string, unknown> | undefined;
    return {
      jobId: pick.jobId,
      token: pick.token,
      ...(chosen &&
      typeof chosen.index === "number" &&
      typeof chosen.model === "string" &&
      typeof chosen.prompt === "string"
        ? { chosen: { index: chosen.index, model: chosen.model, prompt: chosen.prompt } }
        : {}),
    };
  } catch {
    // A value we cannot read is not a pick. Falling back to "no prompt chosen"
    // launches the way every campaign did before this existed.
    return null;
  }
}

export function serialisePick(pick: CreativePick): string {
  return Buffer.from(JSON.stringify(pick), "utf8").toString("base64url");
}

export async function currentPick(): Promise<CreativePick | null> {
  const store = await cookies();
  return parsePick(store.get(PICK_COOKIE)?.value);
}

export async function setPickJob(jobId: string, token: string): Promise<void> {
  const store = await cookies();
  store.set(PICK_COOKIE, serialisePick({ jobId, token }), OPTIONS);
}

/** Records the choice against the job already stored. */
export async function setChosenPrompt(choice: PromptChoice): Promise<boolean> {
  const current = await currentPick();
  if (current === null) return false;

  const store = await cookies();
  store.set(
    PICK_COOKIE,
    serialisePick({
      ...current,
      chosen: { index: choice.index, model: choice.model, prompt: choice.prompt },
    }),
    OPTIONS,
  );
  return true;
}

export async function clearPick(): Promise<void> {
  const store = await cookies();
  store.delete(PICK_COOKIE);
}
