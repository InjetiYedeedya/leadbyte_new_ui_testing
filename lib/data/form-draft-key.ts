/**
 * The browser-storage key for one agent's setup draft on one account
 * (`components/agents/form-draft.tsx`). The account is HASHED into it, so a
 * second person signing in on the same browser never sees the first one's
 * campaign, and the email itself is not written into storage. Pure, so the
 * server page can build it and hand it to the island.
 */
export function draftKeyFor(agentId: string, account: string): string {
  let hash = 5381;
  for (let i = 0; i < account.length; i++) hash = ((hash << 5) + hash + account.charCodeAt(i)) | 0;
  return `leadbyte.draft.${agentId}.${(hash >>> 0).toString(36)}`;
}
