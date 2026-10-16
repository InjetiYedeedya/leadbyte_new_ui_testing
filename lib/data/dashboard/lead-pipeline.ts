import { flatten, normKey, numeric, pickNum, pickRaw, pickStr, type Row } from "./fields";

/**
 * The Lead Qualification tab's data: one row per lead, the agent's settings,
 * and the runs still sending.
 *
 * From the legacy dashboard's implementation guide (§5.2). Three tables:
 *
 *   leadbyte_lead_activity       one row per lead
 *   leadbyte_lead_qualification  the agent's settings, one record per user
 *   leadbyte_agent_jobs          runs, of every agent — filtered to this one
 *
 * Pure and client-safe: the reader lives in the tab (it reaches
 * `lib/api/client.ts`, which is server-only), and the island imports the
 * filter and CSV helpers from here.
 *
 * ## The rules each of which was a real bug in the legacy dashboard
 *
 * - **`mails` is not a number.** It holds the sent emails themselves. Printing
 *   it put a JSON blob in a table cell; reading it as a number gave NaN. The
 *   count is how many entries it has, and the bodies never leave this module.
 * - **"Sent to sales" is `sales_contact` exactly 1 or true.** The field also
 *   carries other values that are not a hand-off, and reading anything truthy
 *   as one counted leads nobody sent anywhere.
 * - **A missing `send_mail` is "not contacted"**, not unknown — a row exists
 *   for a lead the agent never got to.
 * - **Replied is a value in `lead_reply` or `last_reply_at`**, and 0, false and
 *   blank are not values: `replied_to_seq: 0` once turned 1 reply into 123
 *   (see `present` in `lib/data/lead-qualification.ts`).
 * - **A missing score is Unscored, never Cold.** Cold is a verdict; no number
 *   is the absence of one.
 */

/* ---------- leads ---------- */

export type ScoreGroup = "hot" | "warm" | "cold" | "unscored";

/** The pipeline stages a bar can filter the table by. */
export type PipelineStage = "contacted" | "opened" | "replied" | "sales";

export interface Lead {
  /** Unique per row — the table's raw key, which is `email#<uuid>`. */
  id: string;
  name: string;
  /** The lead's address alone, with the `#<uuid>` suffix removed. */
  email: string;
  status: string;
  score: number | null;
  scoreGroup: ScoreGroup;
  scoreReason: string;
  lastScoreUpdated: string;
  /** How many entries `mails` holds. Never the entries themselves. */
  emailsSent: number;
  opens: number | null;
  clicks: number | null;
  /** How many conversation threads the lead has — `thread_ids`' length; null when absent. */
  messages: number | null;
  contacted: boolean;
  opened: boolean;
  replied: boolean;
  sentToSales: boolean;
  /** Epoch ms, for sorting; null when missing or unreadable. */
  lastSentAt: number | null;
  /** `14 Sep 2026`, formatted here so the server and browser print the same. */
  lastSentLabel: string;
  lastSentSubject: string;
  lastReplyAt: number | null;
  lastReplyLabel: string;
  lastReplyFrom: string;
  lastReplyText: string;
  template: string;
  attachmentUrl: string;
  jobId: string;
  agentName: string;
  /** `YYYY-MM-DD` — the day the From / To filters compare against; "" when unknown. */
  day: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A time, however it arrived: ISO text, a bare day, or epoch seconds or
 * milliseconds (numbers under 10^11 are seconds — that is the year 5138 in ms).
 */
export function toEpoch(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" || /^\d+(\.\d+)?$/.test(String(value).trim())) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n < 1e11 ? n * 1000 : n;
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * `14 Sep 2026`, in UTC. Not `toLocaleDateString`: en-GB spells September
 * "Sept", and a local-time format prints a different day on the server and in
 * the browser for anyone far enough from UTC.
 */
export function formatDay(epoch: number | null): string {
  if (epoch === null) return "";
  const d = new Date(epoch);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}`;
}

function isoDay(epoch: number | null): string {
  return epoch === null ? "" : new Date(epoch).toISOString().slice(0, 10);
}

/** "2d ago". `now` is injectable so this is testable without a clock. */
export function timeAgo(epoch: number | null, now: number = Date.now()): string {
  if (epoch === null) return "";
  const seconds = Math.max(0, Math.round((now - epoch) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** A JSON string is read as the value it encodes; anything else is returned as is. */
function decoded(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text.startsWith("[") && !text.startsWith("{")) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

/**
 * How many entries a list-ish field holds: an array's length or an object's
 * key count, including either arriving as JSON text. A bare non-empty string is
 * one entry (one mail body, one thread id). A NUMBER is not a count here —
 * `mails` holds mails, and a number in it is not something we can read.
 */
export function entryCount(value: unknown): number {
  const v = decoded(value);
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === "object") return Object.keys(v).length;
  if (typeof v === "string") return v.trim() === "" ? 0 : 1;
  return 0;
}

/** Contacted: `send_mail` is true, "yes", or a number above 0. Missing is no. */
export function isContacted(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "yes" || text === "true") return true;
    const n = numeric(text);
    return n !== null && n > 0;
  }
  return false;
}

/** Sent to sales: `sales_contact` exactly 1 or true. Nothing else counts — not "1", not "yes". */
export function isSentToSales(value: unknown): boolean {
  return value === true || value === 1;
}

/** Does the field hold a value? 0, false, blank, "0", "false" and "no" do not. */
function hasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    return text !== "" && text !== "0" && text !== "false" && text !== "no";
  }
  return true;
}

/** Replied: `lead_reply` or `last_reply_at` has a value. */
export function hasReplied(flat: Row): boolean {
  return hasValue(flat[normKey("lead_reply")]) || hasValue(flat[normKey("last_reply_at")]);
}

/** Hot ≥ 70, Warm ≥ 40, Cold below, Unscored with no number. */
export function scoreGroupOf(score: number | null): ScoreGroup {
  if (score === null) return "unscored";
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

export const SCORE_GROUP_LABEL: Record<ScoreGroup, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
  unscored: "Unscored",
};

/** `lead_reply` as text, when it is the reply itself rather than a flag. */
function replyText(flat: Row): string {
  const text = pickStr(flat, "last_reply_text");
  if (text) return text;
  const reply = flat[normKey("lead_reply")];
  return typeof reply === "string" && hasValue(reply) ? reply.trim() : "";
}

export function mapLead(row: unknown, index = 0): Lead | null {
  const flat = flatten(row);
  const rawEmail = pickStr(flat, "lead_email", "leadEmail");
  const email = rawEmail.split("#")[0]!.trim();
  const name = pickStr(flat, "lead_name", "leadName", "name");
  if (email === "" && name === "") return null;

  const score = pickNum(flat, "score", "lead_score");
  const opens = pickNum(flat, "opens", "open_count");
  const lastSentAt = toEpoch(pickRaw(flat, "last_sent_at"));
  const lastReplyAt = toEpoch(pickRaw(flat, "last_reply_at"));
  const threads = pickRaw(flat, "thread_ids", "threadIds");
  const day = isoDay(toEpoch(pickRaw(flat, "date")) ?? lastSentAt);

  return {
    id: rawEmail || `${name}#${index}`,
    name,
    email,
    status: pickStr(flat, "lead_status", "leadStatus"),
    score,
    scoreGroup: scoreGroupOf(score),
    scoreReason: pickStr(flat, "score_reason"),
    lastScoreUpdated: formatDay(toEpoch(pickRaw(flat, "last_score_updated"))),
    emailsSent: entryCount(flat[normKey("mails")]),
    opens,
    clicks: pickNum(flat, "clicks", "click_count"),
    messages: threads === undefined ? null : entryCount(threads),
    contacted: isContacted(flat[normKey("send_mail")]),
    opened: opens !== null && opens > 0,
    replied: hasReplied(flat),
    sentToSales: isSentToSales(flat[normKey("sales_contact")]),
    lastSentAt,
    lastSentLabel: formatDay(lastSentAt),
    lastSentSubject: pickStr(flat, "last_sent_subject"),
    lastReplyAt,
    lastReplyLabel: formatDay(lastReplyAt),
    lastReplyFrom: pickStr(flat, "last_reply_from"),
    lastReplyText: replyText(flat),
    template: pickStr(flat, "template", "email_template"),
    attachmentUrl: pickStr(flat, "attachment_url"),
    jobId: pickStr(flat, "job_id", "jobId"),
    agentName: pickStr(flat, "agent_name", "agentName"),
    day,
  };
}

/**
 * Every lead, newest send first. A row with neither a name nor an address is
 * dropped rather than rendered blank. Ids are made unique: two rows with the
 * same key would share a React key and one would silently vanish.
 */
export function mapLeads(rows: readonly unknown[]): Lead[] {
  const seen = new Map<string, number>();
  const leads: Lead[] = [];
  rows.forEach((row, index) => {
    const lead = mapLead(row, index);
    if (!lead) return;
    const count = seen.get(lead.id) ?? 0;
    seen.set(lead.id, count + 1);
    leads.push(count === 0 ? lead : { ...lead, id: `${lead.id}~${count}` });
  });
  return leads.sort((a, b) => (b.lastSentAt ?? 0) - (a.lastSentAt ?? 0));
}

/* ---------- agent settings ---------- */

export interface LeadAgentSettings {
  status: string;
  configured: boolean;
  outreachEmail: string;
  companyName: string;
  websiteUrl: string;
  leadDatabaseUrl: string;
  leadsVersion: number | null;
  companyDocUrl: string;
  updatedAt: number | null;
}

/**
 * The settings record, with ONLY the fields the strip shows. `outreachPassword`
 * lives in the same row and is deliberately never read: building a new object
 * field by field, rather than spreading the row, is what keeps it from ever
 * reaching a prop, a log or the browser.
 */
export function mapLeadSettings(rows: readonly unknown[]): LeadAgentSettings | null {
  if (rows.length === 0) return null;
  // One record per user, but a re-setup can leave two; the latest wins.
  const flats = rows.map(flatten).sort(
    (a, b) => (toEpoch(pickRaw(b, "updated_at")) ?? 0) - (toEpoch(pickRaw(a, "updated_at")) ?? 0),
  );
  const flat = flats[0]!;
  const configured = flat[normKey("configured")];
  return {
    status: pickStr(flat, "status"),
    configured: configured === true || configured === 1 || String(configured).toLowerCase() === "true",
    outreachEmail: pickStr(flat, "outreachEmail", "outreach_email"),
    companyName: pickStr(flat, "companyName", "company_name"),
    websiteUrl: pickStr(flat, "websiteUrl", "website_url"),
    leadDatabaseUrl: pickStr(flat, "leadDatabaseUrl", "lead_database_url"),
    leadsVersion: pickNum(flat, "leadsVersion", "leads_version"),
    companyDocUrl: pickStr(flat, "companyDocUrl", "attachedDocumentUrl", "attached_document"),
    updatedAt: toEpoch(pickRaw(flat, "updated_at", "updatedAt")),
  };
}

export type AgentState = "active" | "inactive" | "not-configured";

const ACTIVE_STATUSES = new Set(["active", "running", "enabled", "live"]);

/**
 * Active when the record says so. A record whose status names something else
 * ("paused") is inactive and says its own word — reporting it as "Not
 * configured" would send someone to set up an agent that is already set up.
 */
export function agentStateOf(settings: LeadAgentSettings | null): AgentState {
  if (!settings) return "not-configured";
  const status = normKey(settings.status);
  if (ACTIVE_STATUSES.has(status)) return "active";
  if (status === "") return settings.configured ? "active" : "not-configured";
  if (status === "notconfigured" || status === "unconfigured") return "not-configured";
  return "inactive";
}

/* ---------- runs in progress ---------- */

export interface LeadRun {
  id: string;
  status: string;
  /** Leads this run has still to send to. */
  incoming: number;
}

const OPEN_RUN = new Set(["queued", "pending", "processing", "running", "inprogress"]);

/**
 * This agent's runs that are still going. `leadbyte_agent_jobs` holds every
 * agent's jobs, so a run is kept only when its name or type says Lead
 * Qualification (`LEAD_QUALIFICATION`, `lead-qualification`, …) AND its status
 * is one of the open ones. "Incoming" is `pending`; without it, `total − sent`.
 */
export function mapLeadRuns(rows: readonly unknown[]): LeadRun[] {
  const runs: LeadRun[] = [];
  rows.forEach((row, index) => {
    const flat = flatten(row);
    const names = ["name", "agent_name", "agent_type"].map((key) => normKey(pickStr(flat, key)));
    if (!names.some((name) => name.includes("leadqualification"))) return;
    const status = pickStr(flat, "status");
    if (!OPEN_RUN.has(normKey(status))) return;

    let incoming = pickNum(flat, "pending");
    if (incoming === null) {
      const total = pickNum(flat, "total");
      const sent = pickNum(flat, "sent");
      incoming = total === null ? 0 : Math.max(0, total - (sent ?? 0));
    }
    runs.push({ id: pickStr(flat, "job_id", "jobId", "id") || `run-${index}`, status, incoming });
  });
  return runs;
}

/* ---------- the pipeline ---------- */

export interface Pipeline {
  /** Lead rows plus the leads still queued in runs in progress. */
  total: number;
  queued: number;
  runsInProgress: number;
  contacted: number;
  opened: number;
  replied: number;
  sales: number;
  score: Record<ScoreGroup, number>;
  /** Emails sent across every lead — the sum of each lead's `mails` count. */
  emailsSent: number;
}

export function buildPipeline(leads: readonly Lead[], runs: readonly LeadRun[]): Pipeline {
  const queued = runs.reduce((sum, run) => sum + run.incoming, 0);
  const score: Record<ScoreGroup, number> = { hot: 0, warm: 0, cold: 0, unscored: 0 };
  let contacted = 0;
  let opened = 0;
  let replied = 0;
  let sales = 0;
  let emailsSent = 0;
  for (const lead of leads) {
    score[lead.scoreGroup] += 1;
    if (lead.contacted) contacted += 1;
    if (lead.opened) opened += 1;
    if (lead.replied) replied += 1;
    if (lead.sentToSales) sales += 1;
    emailsSent += lead.emailsSent;
  }
  return {
    total: leads.length + queued,
    queued,
    runsInProgress: runs.length,
    contacted,
    opened,
    replied,
    sales,
    score,
    emailsSent,
  };
}

/* ---------- filtering ---------- */

export interface LeadFilters {
  stage: PipelineStage | null;
  score: Exclude<ScoreGroup, "unscored"> | null;
  query: string;
  status: string;
  reply: "" | "replied" | "not-replied";
  sales: "" | "yes" | "no";
  template: string;
  /** `YYYY-MM-DD`, inclusive. */
  from: string;
  to: string;
}

export const NO_FILTERS: LeadFilters = {
  stage: null,
  score: null,
  query: "",
  status: "",
  reply: "",
  sales: "",
  template: "",
  from: "",
  to: "",
};

/** How many of the panel's own filters are set — the count on the Filters button. */
export function extraFilterCount(filters: LeadFilters): number {
  return [filters.status, filters.reply, filters.sales, filters.template, filters.from, filters.to].filter(
    (value) => value !== "",
  ).length;
}

export function anyFilter(filters: LeadFilters): boolean {
  return (
    filters.stage !== null ||
    filters.score !== null ||
    filters.query.trim() !== "" ||
    extraFilterCount(filters) > 0
  );
}

function inStage(lead: Lead, stage: PipelineStage): boolean {
  switch (stage) {
    case "contacted":
      return lead.contacted;
    case "opened":
      return lead.opened;
    case "replied":
      return lead.replied;
    case "sales":
      return lead.sentToSales;
  }
}

/** The text the search box matches: name, email, status, template, subject, reply text. */
function haystack(lead: Lead): string {
  return [lead.name, lead.email, lead.status, lead.template, lead.lastSentSubject, lead.lastReplyText]
    .join("\n")
    .toLowerCase();
}

/**
 * The leads that pass every filter. A lead with no known day is kept out of a
 * date-bounded view — it cannot be shown to fall inside the range.
 */
export function filterLeads(leads: readonly Lead[], filters: LeadFilters): Lead[] {
  const needle = filters.query.trim().toLowerCase();
  return leads.filter((lead) => {
    if (filters.stage && !inStage(lead, filters.stage)) return false;
    if (filters.score && lead.scoreGroup !== filters.score) return false;
    if (filters.status && lead.status !== filters.status) return false;
    if (filters.template && lead.template !== filters.template) return false;
    if (filters.reply === "replied" && !lead.replied) return false;
    if (filters.reply === "not-replied" && lead.replied) return false;
    if (filters.sales === "yes" && !lead.sentToSales) return false;
    if (filters.sales === "no" && lead.sentToSales) return false;
    if (filters.from && (lead.day === "" || lead.day < filters.from)) return false;
    if (filters.to && (lead.day === "" || lead.day > filters.to)) return false;
    if (needle && !haystack(lead).includes(needle)) return false;
    return true;
  });
}

/** The distinct non-blank values of a field, sorted — the options of a filter. */
export function distinctValues(leads: readonly Lead[], pick: (lead: Lead) => string): string[] {
  return [...new Set(leads.map(pick).filter((value) => value !== ""))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/* ---------- status colour ---------- */

/**
 * `lead_status` values are not known in advance, so each one gets a colour by
 * hashing its text into a fixed set of our token pairs. Stable: the same
 * status is the same colour on every row, every visit, every account.
 */
const STATUS_TONES = [
  "bg-accent-soft text-accent-ink",
  "bg-info-soft text-info",
  "bg-good-soft text-good",
  "bg-warn-soft text-warn",
  "bg-violet-soft text-violet",
] as const;

export function statusTone(status: string): string {
  const text = status.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return STATUS_TONES[hash % STATUS_TONES.length]!;
}

/** `in_progress` → `In progress`. */
export function statusLabel(status: string): string {
  const text = status.replace(/[_-]+/g, " ").trim();
  return text === "" ? "" : text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/* ---------- CSV export ---------- */

const CSV_COLUMNS: readonly [string, (lead: Lead) => string | number | null][] = [
  ["Lead name", (l) => l.name],
  ["Email", (l) => l.email],
  ["Status", (l) => l.status],
  ["Score", (l) => l.score],
  ["Score group", (l) => SCORE_GROUP_LABEL[l.scoreGroup]],
  ["Score reason", (l) => l.scoreReason],
  ["Score updated", (l) => l.lastScoreUpdated],
  ["Emails sent", (l) => l.emailsSent],
  ["Opens", (l) => l.opens],
  ["Clicks", (l) => l.clicks],
  ["Messages", (l) => l.messages],
  ["Contacted", (l) => (l.contacted ? "Yes" : "No")],
  ["Last sent", (l) => (l.lastSentAt === null ? "" : new Date(l.lastSentAt).toISOString())],
  ["Last subject", (l) => l.lastSentSubject],
  ["Replied", (l) => (l.replied ? "Yes" : "No")],
  ["Last reply", (l) => (l.lastReplyAt === null ? "" : new Date(l.lastReplyAt).toISOString())],
  ["Reply from", (l) => l.lastReplyFrom],
  ["Reply text", (l) => l.lastReplyText],
  ["Sent to sales", (l) => (l.sentToSales ? "Yes" : "No")],
  ["Template", (l) => l.template],
  ["Attachment", (l) => l.attachmentUrl],
  ["Job ID", (l) => l.jobId],
  ["Agent", (l) => l.agentName],
  ["Date", (l) => l.day],
];

/**
 * One CSV cell. Text that opens with `=`, `+`, `-` or `@` is prefixed with a
 * quote mark: a spreadsheet runs such a cell as a formula, and reply text is
 * written by whoever the lead is.
 */
function csvCell(value: string | number | null): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * The leads as CSV — every field the tab reads, and not the sent mail bodies,
 * which `Lead` never carries. CRLF line ends, as RFC 4180 and Excel expect.
 */
export function leadsToCsv(leads: readonly Lead[]): string {
  const header = CSV_COLUMNS.map(([name]) => csvCell(name)).join(",");
  const body = leads.map((lead) => CSV_COLUMNS.map(([, read]) => csvCell(read(lead))).join(","));
  return [header, ...body].join("\r\n");
}
