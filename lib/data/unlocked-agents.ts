/**
 * Where a finished payment lands, and how the Agents page reads it back.
 *
 * After paying, the customer goes straight to the Agents page with the
 * agents they bought in `?unlocked=`, and the page says those are unlocked
 * and ready, or, while the purchase is still being recorded, that they are
 * about to be. Only known agent ids survive the read, so a hand-edited link
 * can name nothing that does not exist.
 */

export const UNLOCKED_PARAM = "unlocked";

/** The Agents page, naming what was just bought (or plain, when unknown). */
export function unlockedAgentsHref(agentIds: readonly string[]): string {
  const ids = [...new Set(agentIds.map((id) => id.trim()).filter((id) => id !== ""))];
  return ids.length === 0 ? "/agents" : `/agents?${UNLOCKED_PARAM}=${ids.map(encodeURIComponent).join(",")}`;
}

/** The ids in `?unlocked=`, kept only when they are agents we know. */
export function readUnlockedAgents(raw: string | undefined, known: readonly string[]): string[] {
  if (!raw) return [];
  const allowed = new Set(known);
  return [...new Set(raw.split(",").map((id) => id.trim()))].filter((id) => allowed.has(id));
}
