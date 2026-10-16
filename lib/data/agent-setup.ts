import {
  blockingErrorCard,
  blockingErrorSentence,
  detectAdsBlockingError,
  type BlockingErrorCard,
} from "@/lib/data/ads-blocking-error";
import { numericRowId } from "@/lib/api/row-id";
import { launchMarkedAt } from "@/lib/data/launch-marker";
import { redactSecrets } from "@/lib/log-redact";
import { cache } from "react";
import { revalidateTag } from "next/cache";
import { ApiError, ApiTimeoutError, apiRequest } from "@/lib/api/client";
import { refusalOf } from "@/lib/api/refusal";
import { rowsFrom } from "@/lib/api/read-cascade";
import { isBackendConfigured } from "@/lib/api/config";
import { isRedirectError } from "@/lib/auth/session-expired";

/**
 * Where each agent's setup is saved, and what starts it.
 *
 * ## The contract (from the live app's own code, 2026-09-03)
 *
 * Every agent follows the same two steps — save the setup, then trigger the
 * automation — but the details are NOT uniform, and the differences are the
 * kind that cost an afternoon to find:
 *
 * - **`agentType` casing differs per agent.** `LEAD_QUALIFICATION` is
 *   SCREAMING_SNAKE; `google_ads` is lower_snake. They are not
 *   interchangeable: the backend switches on the exact string.
 * - **LinkedIn's receiver is spelled differently.** Google and Meta post to
 *   `/api/webhook/adsreceiver`; LinkedIn posts to `/api/webhook/ads-receiver`,
 *   with a hyphen. Someone will "fix" that inconsistency one day and break one
 *   of the three.
 * - **The ad agents go through a chat webhook first**, then the receiver. The
 *   others trigger `/api/webhook/main` directly.
 *
 * All of it lives here so no page or action repeats a path, a casing or a
 * spelling. Adding the remaining six agents means adding entries, not code.
 */

export type AgentBackendId =
  | "lead-qualification"
  | "on-page-seo"
  | "off-page-seo"
  | "google-ads"
  | "meta-ads"
  | "linkedin-ads"
  | "openai-ads"
  | "social-media";

export interface AgentBackend {
  /** `/api/data/{table}` — POST, with the key in the body (the legacy shape). */
  table: string;
  /**
   * The conversational endpoint the ad agents post to first. Absent for agents
   * that trigger `main` directly.
   */
  chatPath?: string;
  /** What actually starts the automation, at full automation. */
  triggerPath: string;
  /**
   * Where a SEMI-automated launch goes instead.
   *
   * A different endpoint, not a flag: the semi flow expects creative the
   * customer supplies, so n8n runs a different workflow for it.
   */
  semiPath?: string;
  /**
   * Social Media only: the first-time activation request for a platform the
   * team sets up by hand (YouTube). Sent BESIDE a run, never instead of one.
   */
  activationPath?: string;
  /** The discriminator the backend switches on. Casing is per-agent and exact. */
  agentType: string;
}

export const AGENT_BACKENDS: Record<AgentBackendId, AgentBackend> = {
  "lead-qualification": {
    table: "leadbyte_lead_qualification",
    triggerPath: "/api/webhook/main",
    // SCREAMING_SNAKE, unlike the three ad agents below.
    agentType: "LEAD_QUALIFICATION",
  },
  // On-Page / Off-Page SEO have no dedicated webhook yet (confirmed with the
  // backend, 2026-09-04). Until one exists they reuse the generic `main` webhook
  // with their own SCREAMING_SNAKE agent_type, exactly as Lead Qualification
  // does — the MAIN n8n workflow routes on `agent_type`. Swap `triggerPath` to a
  // dedicated route the moment the backend team gives us the URLs; nothing else
  // here changes. The table names are the real ones (leadbyte_on_page_seo /
  // leadbyte_off_page_seo) so a future `saveAgentSetup` addresses them correctly.
  "on-page-seo": {
    table: "leadbyte_on_page_seo",
    triggerPath: "/api/webhook/main",
    agentType: "ON_PAGE_SEO",
  },
  "off-page-seo": {
    table: "leadbyte_off_page_seo",
    triggerPath: "/api/webhook/main",
    agentType: "OFF_PAGE_SEO",
  },
  /**
   * Social Media (ported from the legacy `SocialMedia.jsx`, 2026-10-01).
   *
   * Full automation goes to the shared `/api/webhook/main` with
   * `agent_type: SOCIAL_MEDIA` (legacy `triggerWebhook`); semi automation —
   * the customer's own images or video — to `/api/webhook/social-media-semi`
   * (legacy `SEMI_AUTO_ENDPOINTS.SOCIAL_MEDIA`). `social-media-activation`
   * is NOT a run: in legacy it was the first-time YouTube / X request that
   * ends in "our team will contact you", sent beside a run. This app used to
   * send only that, which is why nothing was ever posted.
   */
  "social-media": {
    table: "leadbyte_social_media",
    triggerPath: "/api/webhook/main",
    semiPath: "/api/webhook/social-media-semi",
    activationPath: "/api/webhook/social-media-activation",
    agentType: "SOCIAL_MEDIA",
  },
  "google-ads": {
    table: "leadbyte_google_ads",
    chatPath: "/api/webhook/google-ads-chat",
    triggerPath: "/api/webhook/adsreceiver",
    semiPath: "/api/webhook/google-ads-semi",
    agentType: "google_ads",
  },
  "meta-ads": {
    table: "leadbyte_meta_ads",
    chatPath: "/api/webhook/meta-ads-chat",
    triggerPath: "/api/webhook/adsreceiver",
    semiPath: "/api/webhook/meta-ads-semi",
    agentType: "meta_ads",
  },
  "linkedin-ads": {
    table: "leadbyte_linkedin_ads",
    chatPath: "/api/webhook/linkedin-ads-chat",
    // NOT `adsreceiver`. The hyphen is the backend's, and it differs from the
    // other two on purpose-by-accident. Verified against the live app's code.
    triggerPath: "/api/webhook/ads-receiver",
    // LinkedIn's semi flow has its own endpoint too, spelled with the hyphen
    // its receiver uses.
    semiPath: "/api/webhook/linkedin-ads-semi",
    agentType: "linkedin_ads",
  },
  /**
   * OpenAI Ads — WIRED BUT NOT CONNECTED.
   *
   * Every path is deliberately absent, and that is not an oversight: no n8n
   * workflow for this platform exists yet (checked 2026-09-10 — no `openai`
   * reference anywhere in the repo or `docs/`). `askAgent`, `askSemi` and
   * `triggerAgent` all throw `AgentSetupError` on a missing path, so a launch
   * fails loudly and says so, instead of POSTing a real campaign to a URL
   * somebody guessed.
   *
   * Filling this in when the backend team answers is four lines and nothing
   * else in the app moves:
   *
   *   chatPath:    the conversational endpoint (the setup form's first hop)
   *   semiPath:    the semi-automation workflow, which replies with a form schema
   *   triggerPath: the receiver — note Google and Meta say `adsreceiver`,
   *                LinkedIn says `ads-receiver`; ask which this one is
   *
   * `agentType` and `table` follow the lower_snake convention the three ad
   * agents use, and are the two most likely to be right — but confirm the
   * table name, because a POST to a table that does not exist is a save that
   * silently does nothing.
   */
  "openai-ads": {
    table: "leadbyte_openai_ads",
    agentType: "openai_ads",
    // triggerPath is required by the type, so this names the receiver we would
    // expect and would still fail loudly if wrong — but nothing reaches it
    // until `chatPath` exists, because the setup form's first hop is the chat
    // one and it throws without a path.
    triggerPath: "",
  },
};

export function agentBackend(agentId: string): AgentBackend | null {
  return AGENT_BACKENDS[agentId as AgentBackendId] ?? null;
}

export class AgentSetupError extends Error {
  constructor(
    message: string,
    readonly userMessage?: string,
    /**
     * The call ran out of time rather than failing. n8n usually keeps going
     * after we stop waiting, so for a launch this means "probably running" —
     * reporting it as a failure invited a retry that launched a second paid
     * campaign (audit, 2026-09-29).
     */
    readonly timedOut: boolean = false,
    /**
     * A refusal the customer can act on, laid out as a card — title, what is
     * wrong, the fix, and where to make it (`blockingErrorCard`). Only set for
     * a 200 that carried `status: "error"` / `error_code`.
     */
    readonly card?: BlockingErrorCard,
  ) {
    super(message);
    this.name = "AgentSetupError";
  }
}

/** Wraps a failed call, keeping whether it was a timeout. */
function setupError(what: string, error: unknown): AgentSetupError {
  const detail = error instanceof Error ? error.message : String(error);
  return new AgentSetupError(
    `${what} failed: ${detail}`,
    humanMessage(detail),
    error instanceof ApiTimeoutError,
  );
}

/** A 200 that says `success: false` is a failure, not a done. */
function assertAccepted(what: string, reply: unknown): void {
  // FIRST: a 200 whose content is a refusal — `status: "error"` or an
  // `error_code` (Meta with no Instagram linked, say). Checked before the
  // `output` shortcut below, because a refusal can carry text too, and
  // treating it as an answer is how "we are creating your campaign" was shown
  // for campaigns n8n had refused (legacy flow guide §7, 2026-09-30).
  const blocked = detectAdsBlockingError(reply);
  if (blocked) {
    // The whole reply, so the log says exactly what n8n answered — the only
    // way to tell a real refusal from a reply shape we misread.
    console.error(`[agent-setup] ${what} answered with a refusal:`, JSON.stringify(redactSecrets(reply)).slice(0, 2000));
    throw new AgentSetupError(
      `${what} was refused: ${blocked.code}`,
      blockingErrorSentence(blocked),
      false,
      blockingErrorCard(reply) ?? undefined,
    );
  }
  // A reply that carries the agent's own words is an answer, whatever its
  // `success` flag says — throwing would hide a plan or a form it did return.
  const node = Array.isArray(reply) ? reply[0] : reply;
  const output = node && typeof node === "object" ? (node as { output?: unknown }).output : undefined;
  if (typeof output === "string" && output.trim() !== "") return;
  const refusal = refusalOf(reply);
  if (refusal !== null) {
    throw new AgentSetupError(`${what} was refused: ${refusal}`, humanMessage(refusal));
  }
}

/**
 * How long to wait on a setup call.
 *
 * These hand off to n8n workflows that do real work before answering — the
 * same reason `saveGoogleSelection` and `selectAdAccount` have their own
 * deadlines. The 8s read deadline aborts them, and an abort reads to the
 * customer as a failure for something that succeeded.
 */
const SETUP_TIMEOUT_MS = 30_000;

/**
 * Step 1: save the setup.
 *
 * `POST /api/data/{table}` with the key IN THE BODY. That is deliberate and it
 * is the legacy app's shape: `PUT` is an update and rejects a body carrying the
 * partition key, which is what broke sign-in on 2026-09-02. A first save is a
 * POST.
 */
export async function saveAgentSetup(
  agentId: AgentBackendId,
  fields: Record<string, unknown>,
): Promise<void> {
  const { table } = AGENT_BACKENDS[agentId];

  try {
    const reply = await apiRequest<unknown>(`/api/data/${table}`, {
      method: "POST",
      body: fields,
      timeoutMs: SETUP_TIMEOUT_MS,
    });
    assertAccepted(`saving ${table}`, reply);
    // Marks the browser's router cache stale, so no screen keeps saying
    // "not set up" / "not launched" after this — a hidden launch is a second
    // paid campaign waiting to happen.
    if (typeof fields.email === "string") revalidateTag(setupTag(fields.email));
  } catch (error) {
    // A dead session leaves as a redirect, not as this call's own
    // failure — see isRedirectError in session-expired.ts.
    if (isRedirectError(error) || error instanceof AgentSetupError) throw error;
    throw setupError(`saving ${table}`, error);
  }
}

/**
 * Step 2: start the automation.
 *
 * The ad agents post to their chat webhook first and then the receiver; the
 * others go straight to `main`. Both hops are attempted in order, and the chat
 * hop failing is fatal — starting the receiver for a conversation that was
 * never opened would leave the agent running against nothing.
 */
export async function triggerAgent(
  agentId: AgentBackendId,
  payload: Record<string, unknown>,
  { semi = false }: { semi?: boolean } = {},
): Promise<unknown> {
  const { triggerPath, semiPath, agentType } = AGENT_BACKENDS[agentId];
  // Semi goes to its own workflow. Falling back to the receiver when a platform
  // has no semi endpoint would launch a full-automation campaign for someone who
  // asked to review the creative first — the opposite of what they chose.
  const path = semi ? semiPath : triggerPath;
  if (!path) {
    // Names the endpoint that is actually missing. It always said
    // "semi-automation", which was true while semi was the only optional path
    // — `openai-ads` has no receiver either until the backend team answers,
    // and a full-automation launch reporting a semi problem sends whoever
    // reads the log to the wrong place.
    throw new AgentSetupError(
      `${agentId} has no ${semi ? "semi-automation" : "trigger"} endpoint`,
      "This agent isn't connected to a backend yet.",
    );
  }

  return postToWorkflow(path, { ...payload, agent_type: agentType });
}

/**
 * The first-time activation request for a social platform the team sets up
 * by hand (`activationPath`). Legacy body: `{ user_id, user_email,
 * selected_platform, automation_mode, timestamp }`.
 */
export async function requestSocialActivation(payload: Record<string, unknown>): Promise<void> {
  const path = AGENT_BACKENDS["social-media"].activationPath;
  if (!path) throw new AgentSetupError("social-media has no activation endpoint");
  await postToWorkflow(path, payload);
}

/**
 * One POST to an n8n workflow: health first, one safe retry, refusals read.
 * Returns the accepted reply — Lead Qualification's carries the mail
 * service's own campaign `job_id` (see `campaign-reply.ts`).
 */
async function postToWorkflow(path: string, body: Record<string, unknown>): Promise<unknown> {
  await assertN8nUp(path);
  logPayload(path, body);

  // Up to two tries, a second apart (legacy flow guide §6) — but ONLY when
  // the first never reached the server. A refusal or a timeout is not retried:
  // either could mean n8n already has the campaign.
  let reply: unknown;
  for (let attempt = 1; ; attempt++) {
    try {
      reply = await apiRequest<unknown>(path, {
        method: "POST",
        body,
        timeoutMs: SETUP_TIMEOUT_MS,
      });
      break;
    } catch (error) {
      // A dead session leaves as a redirect, not as this call's own
      // failure — see isRedirectError in session-expired.ts.
      if (isRedirectError(error)) throw error;
      if (attempt < 2 && neverReachedServer(error)) {
        console.warn(`[agent-setup] ${path} did not connect — trying once more`, error);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      throw setupError(path, error);
    }
  }
  assertAccepted(path, reply);
  return reply;
}

/* ---------- n8n health, and the one safe retry ---------- */

export const N8N_BUSY_MESSAGE =
  "Our automation servers are busy right now. Your details are saved — please try again in a moment.";

/**
 * Whether `/api/n8n-health` says n8n is DOWN. Only an explicit
 * `healthy: false` counts: a health route that cannot be reached, or answers
 * something else, must not block a customer when n8n itself may be fine.
 */
export function n8nReportsDown(reply: unknown): boolean {
  return reply !== null && typeof reply === "object" && (reply as { healthy?: unknown }).healthy === false;
}

const HEALTH_TIMEOUT_MS = 5_000;

/**
 * Asks n8n whether it is up before a step is sent to it (legacy flow guide §4
 * and §6), so a customer is told "busy — your details are saved" instead of
 * waiting out a call to a workflow that cannot answer. Throws only when n8n
 * says it is down.
 */
async function assertN8nUp(what: string): Promise<void> {
  let reply: unknown = null;
  try {
    reply = await apiRequest<unknown>("/api/n8n-health", { method: "GET", timeoutMs: HEALTH_TIMEOUT_MS });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return; // Could not ask: proceed, and let the call itself answer.
  }
  if (n8nReportsDown(reply)) {
    throw new AgentSetupError(`n8n reported unhealthy before ${what}`, N8N_BUSY_MESSAGE);
  }
}

/**
 * A request that never reached the server — the connection itself failed —
 * as opposed to one the backend refused (`ApiError`) or one we stopped
 * waiting for (`ApiTimeoutError`, which n8n usually keeps running). Only this
 * kind is safe to send again: n8n cannot have seen it, so a second try cannot
 * create a second paid campaign.
 */
export function neverReachedServer(error: unknown): boolean {
  return !(error instanceof ApiError) && !(error instanceof ApiTimeoutError) && !isRedirectError(error);
}

const RETRY_DELAY_MS = 1_000;

/**
 * Logs the body actually going out.
 *
 * These payloads are the contract with n8n, and the contract is only ever
 * verified by comparing a captured `adsreceiver` body against ours field by
 * field. Doing that without seeing what we sent is guesswork — the Google
 * interests bug (three fields expected, one sent) survived precisely because
 * nothing here printed the body. `google-save` has logged its body all along
 * for the same reason.
 *
 * Server-side console only, in a BFF whose logs never reach a browser.
 */
function logPayload(path: string, body: Record<string, unknown>): void {
  // Redacted: these bodies carry what customers type, and the On-Page SEO
  // setup sent a WordPress password here in plain text.
  console.log(`[agent-setup] POST ${path} ${JSON.stringify(redactSecrets(body))}`);
}

/**
 * Asks the agent, and RETURNS what it said.
 *
 * The chat hop's answer is the whole point — a written campaign plan the
 * customer reads and approves. An earlier version fired both hops in a loop and
 * discarded every response, which meant the agent did the thinking and nobody
 * ever saw it.
 *
 * Only the chat webhook is called here. Executing the campaign is a separate,
 * later decision — see `triggerAgent`, which posts to the receiver — and
 * running both at once is what made "get a suggestion" and "spend money" the
 * same button.
 */
export async function askAgent(
  agentId: AgentBackendId,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const { chatPath, agentType } = AGENT_BACKENDS[agentId];
  if (!chatPath) {
    // The sentence a customer sees. `openai-ads` reaches this on its very
    // first hop until the backend team supplies the paths, and "something went
    // wrong" would send them round the form again looking for their mistake.
    throw new AgentSetupError(
      `${agentId} has no chat webhook`,
      "This agent isn't connected to a backend yet.",
    );
  }

  const body = { ...payload, agent_type: agentType };
  await assertN8nUp(chatPath);
  logPayload(chatPath, body);

  let reply: unknown;
  try {
    reply = await apiRequest<unknown>(chatPath, {
      method: "POST",
      body,
      timeoutMs: SETUP_TIMEOUT_MS,
    });
  } catch (error) {
    // A dead session leaves as a redirect, not as this call's own
    // failure — see isRedirectError in session-expired.ts.
    if (isRedirectError(error)) throw error;
    throw setupError(chatPath, error);
  }
  assertAccepted(chatPath, reply);
  return reply;
}

/**
 * Calls the semi-automation workflow and returns what it said.
 *
 * Semi is a conversation of its own: called with no answers it replies with a
 * FORM SCHEMA (the extra fields it needs), and called again with those answers
 * plus the creative it prepares the campaign. Both are this one endpoint, which
 * is why the reply matters and cannot be discarded.
 */
export async function askSemi(
  agentId: AgentBackendId,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const { semiPath, agentType } = AGENT_BACKENDS[agentId];
  if (!semiPath) {
    throw new AgentSetupError(`${agentId} has no semi-automation endpoint`);
  }

  const semiBody = { ...payload, agent_type: agentType };
  await assertN8nUp(semiPath);
  logPayload(semiPath, semiBody);

  let reply: unknown;
  try {
    reply = await apiRequest<unknown>(semiPath, {
      method: "POST",
      body: semiBody,
      timeoutMs: SETUP_TIMEOUT_MS,
    });
  } catch (error) {
    // A dead session leaves as a redirect, not as this call's own
    // failure — see isRedirectError in session-expired.ts.
    if (isRedirectError(error)) throw error;
    throw setupError(semiPath, error);
  }
  assertAccepted(semiPath, reply);
  return reply;
}

/** A scan reads the whole table, and 8s was not enough for it cold. */
const SETUP_SCAN_TIMEOUT_MS = 20_000;

const setupTag = (email: string) => `agent-setup:${email}`;

/**
 * Every row this account has in one setup table, fastest route first.
 *
 * Rows are written with `id: numericRowId(email)` as the key (DynamoDB
 * answered "Type mismatch for key id expected: N" to an email), and cannot be
 * read back by that id: `GET /api/data/{table}/{id}` answers 403 "You do not
 * have permission" for any key that is not the caller's own email
 * (BACKEND.md Q3). So: a GET by email (older rows keyed on the email), a query
 * by email, and only then a scan on the `email` attribute — the one route that
 * finds id-keyed rows, and slow enough that it timed out at 8s in the header.
 *
 * Throws on failure, so a failed read is never mistaken for "no rows".
 */
type SetupRequest = (path: string, options: { timeoutMs?: number }) => Promise<unknown>;

async function fetchSetupRows(
  table: string,
  email: string,
  request: SetupRequest,
): Promise<Record<string, unknown>[]> {
  const key = encodeURIComponent(email);
  const routes: Array<[string, number | undefined]> = [
    [`/api/data/${table}/${key}`, undefined],
    [`/api/query/${table}/${key}`, undefined],
    [`/api/scan/${table}/${key}`, SETUP_SCAN_TIMEOUT_MS],
  ];
  let scanError: unknown = null;
  for (const [path, timeoutMs] of routes) {
    try {
      const payload = await request(path, timeoutMs === undefined ? {} : { timeoutMs });
      // Defensive: a scan that ignored its filter must not hand us someone
      // else's setup, so on the scan a row must NAME this account. The two
      // keyed reads are this account's by construction. Compared without case
      // — "Name@Site.com" is still this account's row.
      const scan = path.startsWith("/api/scan/");
      const own = email.trim().toLowerCase();
      const rows = rowsFrom(payload).filter((row) => {
        const rowEmail = typeof row.email === "string" ? row.email.trim().toLowerCase() : undefined;
        return scan ? rowEmail === own : rowEmail === undefined || rowEmail === own;
      });
      if (rows.length > 0) return rows;
    } catch (error) {
      if (path.startsWith("/api/scan/")) scanError = error;
    }
  }
  // The scan is the only route that sees every row, so only its answer can
  // mean "no row". If it failed, throw — "not set up" must never be the
  // answer on the strength of a timeout.
  if (scanError !== null) throw scanError;
  return [];
}

/**
 * This account's setup row for one agent, or null.
 *
 * Read fresh, no `unstable_cache` (2026-10-05): on Cloudflare there is no
 * shared cache (`open-next.config.ts`), so it never hit, and every refusal
 * inside it made the read run a second time. `cache()` on top dedupes the
 * header and page body in one render.
 *
 * Production tables hold duplicates (random ids from before the id was
 * derived), so our own derived id wins, then a launched row, then any row.
 *
 * Never throws: a lookup that fails reads as "no row".
 */
export const getAgentSetupRow = cache(async function readSetupRow(
  agentId: AgentBackendId,
  email: string,
): Promise<Record<string, unknown> | null> {
  if (!isBackendConfigured()) return null;
  const { table } = AGENT_BACKENDS[agentId];
  let rows: Record<string, unknown>[];
  try {
    rows = await fetchSetupRows(table, email, (path, options) => apiRequest<unknown>(path, options));
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(`[agent-setup] could not read ${table}:`, error);
    return null;
  }
  const ownId = numericRowId(email);
  return (
    rows.find((row) => Number(row.id) === ownId) ??
    rows.find((row) => row.status === "submitted") ??
    rows[0] ??
    null
  );
});

/**
 * Whether this agent's setup has already been saved.
 *
 * Read rather than assumed: an agent configured on another device, or before
 * a restart, must not be asked to fill the form again.
 */
export async function agentSetupExists(agentId: AgentBackendId, email: string): Promise<boolean> {
  return (await getAgentSetupRow(agentId, email)) !== null;
}

/**
 * Whether this agent has actually LAUNCHED a campaign for this account.
 *
 * The ad agent page decided "show the setup form" from the mock repo's runs,
 * which are always empty against a live backend — so right after a launch the
 * setup form came back, and submitting it again created a second paid
 * campaign. `launchCampaign` now marks the row `status: "submitted"` on
 * success, and this reads that mark.
 */
export async function agentLaunched(agentId: AgentBackendId, email: string): Promise<{
  launched: boolean;
  launchedAt: string | null;
}> {
  const row = await getAgentSetupRow(agentId, email);
  const status = typeof row?.status === "string" ? row.status : "";
  const launchedAt =
    typeof row?.launched_at === "string"
      ? row.launched_at
      : typeof row?.created_at === "string" && status === "submitted"
        ? row.created_at
        : null;
  if (status === "submitted") return { launched: true, launchedAt };
  // The launch went out but its record could not be written — the marker
  // stands in for the row so the setup form does not offer a second paid
  // launch (`launch-marker.ts`).
  const marked = await launchMarkedAt(agentId);
  return marked ? { launched: true, launchedAt: marked } : { launched: false, launchedAt };
}

/** Anything that looks like a bare status line is ours to phrase, so it is hidden. */
/**
 * Google or Facebook refusing OUR stored access — a grant the customer removed
 * on their side, or a token that lapsed. The backend cannot see this ahead of
 * time for Google (only n8n holds the credentials that could check), so a run
 * is where it surfaces, and the words are the providers' own. Deliberately
 * specific: our own "Authentication required" is a signed-out session and
 * leaves as a redirect long before it gets here.
 */
const PROVIDER_AUTH_FAILURE =
  /invalid_grant|OAuthException|Error validating access token|access token (has )?expired|token (has been )?(expired|revoked)|unauthorized_client|invalid_token|UNAUTHENTICATED/i;

// Not "the ad platform": the same failure reaches the mailbox agents through
// Gmail, so it names the connection generically.
export const RECONNECT_MESSAGE =
  "A connected account refused our access — it may have expired or been removed on its side. " +
  "Reconnect it on the Connections page, then try again.";

/** The customer's sentence for a provider auth failure, or null for anything else. */
export function reconnectMessageFor(detail: string): string | null {
  return PROVIDER_AUTH_FAILURE.test(detail) ? RECONNECT_MESSAGE : null;
}

/**
 * n8n's own words when a workflow crashes part-way: "Error in workflow" (and
 * "Workflow could not be started!" when it never began). Both describe a fault
 * on the agent's side, not anything the customer entered, and shown verbatim
 * they read as a mistake to go looking for (seen on Meta semi, 2026-10-06).
 */
const WORKFLOW_CRASH = /error in workflow|workflow could not be started/i;

export const WORKFLOW_CRASH_MESSAGE =
  "The ad agent ran into a problem on its side. Nothing was launched and nothing was spent. " +
  "Please try again in a few minutes.";

/** The customer's sentence for an n8n workflow crash, or null for anything else. */
export function workflowCrashMessageFor(detail: string): string | null {
  return WORKFLOW_CRASH.test(detail) ? WORKFLOW_CRASH_MESSAGE : null;
}

function humanMessage(detail: string): string | undefined {
  const reconnect = reconnectMessageFor(detail);
  if (reconnect) return reconnect;
  const crash = workflowCrashMessageFor(detail);
  if (crash) return crash;
  const trimmed = detail.trim();
  if (trimmed === "" || /^leadbyte-api returned \d+$/.test(trimmed)) return undefined;
  if (/did not answer within/.test(trimmed)) return undefined;
  return trimmed.slice(0, 200);
}
