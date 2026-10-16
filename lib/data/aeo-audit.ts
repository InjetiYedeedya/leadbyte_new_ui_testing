/**
 * The AEO audit service, as this app uses it.
 *
 * Three calls, and the contract between them is a state machine the screens
 * follow exactly:
 *
 *   start(subdomain:false)                    -> a job, already running
 *   start(subdomain:true), none found         -> a job, already running
 *   start(subdomain:true), subdomains found   -> NOTHING started, pick first
 *   select(picked)                            -> one job per site
 *   poll(id)                                  -> the job, and its result
 *
 * ## `needs_selection` is the discriminator, not the length of the list
 *
 * The first two rows above are identical on the wire on purpose, and an empty
 * `subdomains: []` may never be read as "no subdomains, so it started". That
 * is why `AeoStart` is a tagged union here rather than an object with
 * optional fields — a caller cannot forget to check.
 *
 * ## Reads never throw; writes always do
 *
 * The same split `lib/data/ads-api.ts` states. `readAeoJob` is polled every
 * few seconds by a screen that must keep working through a dropped request, so
 * it catches and reports a state. `startAeoAudit` and `startAeoSelection`
 * spend the customer's time and the service's compute, so a failure there is
 * raised and the screen says so.
 *
 * Every parser below is defensive in the style of `lib/data/analysis-job.ts`:
 * an unrecognised `state` becomes `"unknown"` rather than throwing inside a
 * poll, and a missing field becomes its empty value rather than `undefined`
 * leaking into the render.
 */

export { AEO_STAGES, isAeoFinished, isAeoReportReady, type AeoJobState, type AeoJobView } from "@/lib/data/aeo-stages";
import type { AeoJobState, AeoJobView } from "@/lib/data/aeo-stages";
import { AeoApiError, aeoRequest } from "@/lib/api/aeo-client";


const KNOWN_STATES: readonly AeoJobState[] = [
  "queued",
  "running",
  "done",
  "blocked",
  "error",
];


export interface AeoArea {
  key: string;
  label: string;
  earned: number;
  weight: number;
  reason: string;
  evidence: string;
  improvement: string;
  worst_page: string;
  page_count: number;
}

export interface AeoPage {
  url: string;
  path: string;
  score: number;
}

export interface AeoGapPage {
  where: string;
  evidence: string;
}

export interface AeoGap {
  key: string;
  title: string;
  points: number;
  effort: string;
  severity: string;
  where: string;
  check_id: string;
  evidence: string;
  pages: AeoGapPage[];
  improvement: string;
  /**
   * The routes a fix for this gap could ship by. Empty means the service
   * wrote nothing for it — freshness, AI visibility and server rendering all
   * need a change we cannot hand over as a snippet.
   */
  ships_via: string[];
}

export interface AeoCompetitor {
  name: string;
  url: string;
  why: string;
}

/**
 * One piece of content the service wrote for the site (Layer 2).
 *
 * `needs_approval` marks body copy — answer blocks, FAQs, rewritten headings —
 * which changes what a page SAYS, so the service holds it for a person. Head
 * tags, schema and the sitemap describe what is already there and ship as-is.
 */
export interface AeoFix {
  id: string;
  action: string;
  rationale: string;
  /** A page path, or `"whole site"` for a root file like sitemap.xml. */
  where: string;
  /** `head_schema`, `head_meta`, `body` or `root_file`: where in the site it goes. */
  kind: string;
  fix_type: string;
  needs_approval: boolean;
  approved: boolean;
  preview: string;
  /** `json`, `html`, `xml` or `text`. */
  language: string;
  ships_via: string[];
}

/**
 * One way the fixes could reach the site, and the score it could get to
 * (Layer 3). A PREVIEW: nothing about it means anything was pushed.
 */
export interface AeoSurface {
  id: string;
  label: string;
  available: boolean;
  /** Why it is unavailable, e.g. "this site is not WordPress". */
  note: string;
  achievable: number | null;
  gain: number | null;
  /** Points this route cannot reach on this site. */
  unreachable: number | null;
  unreachable_areas: string[];
}

/**
 * The route the service would use, and where each kind of fix belongs.
 *
 * `pull_request_url` and `files_changed` stay empty until a real deploy runs,
 * which is a separate call this app does not make. Only the fields a screen
 * reads are declared.
 */
export interface AeoDeployment {
  surface: string;
  achievable: number | null;
  pull_request_url: string;
  files_changed: number | null;
  head_location: string;
  root_file_location: string;
  body_location: string;
  platform_notes: string[];
}

/**
 * The audit itself: Layer 1 (the scores), Layer 2 (`fixes`) and Layer 3
 * (`deployment`, `surfaces`).
 *
 * `blocked` and `skipped` also arrive — the service's own quality gates and
 * de-duplication — and are left out: they explain fixes it chose NOT to
 * write, which is housekeeping, not something a customer acts on.
 */
export interface AeoResult {
  domain: string;
  url: string;
  brand: string;
  platform: string;
  logo: string;
  score: number | null;
  ceiling: number | null;
  ceiling_note: string;
  pages_audited: number | null;
  pages_found: number | null;
  blocked_pages: number | null;
  coverage_note: string;
  discovery_source: string;
  generation_note: string;
  render_note: string;
  gap_count: number | null;
  run_id: string;
  areas: AeoArea[];
  pages: AeoPage[];
  gaps: AeoGap[];
  competitors: AeoCompetitor[];
  fixes: AeoFix[];
  /**
   * The routes the held fixes would ship by once approved. Empty means none
   * can carry them yet, so approving them changes nothing on the site today.
   */
  pending_ships_via: string[];
  /** Null when the service sent no deployment preview at all. */
  deployment: AeoDeployment | null;
  surfaces: AeoSurface[];
}

export interface AeoJob {
  id: string;
  state: AeoJobState;
  stage: string;
  error: string;
  vendor: string;
  url: string;
  result: AeoResult | null;
}

export type AeoStart =
  | { kind: "started"; job: AeoJob }
  | { kind: "needs-selection"; domain: string; subdomains: string[] };

export interface AeoSelectionOutcome {
  jobs: AeoJob[];
  failed: { url: string; error: string }[];
}


export function toJobView(job: AeoJob): AeoJobView {
  return {
    id: job.id,
    url: job.url,
    state: job.state,
    stage: job.stage,
    error: job.error,
    vendor: job.vendor,
    hasResult: job.result !== null,
  };
}


// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * A number, or null when there isn't one.
 *
 * Null rather than 0, every time. A zero here would be a score, a page count
 * or a gap count the audit never reported, and the screens render an em dash
 * for a missing figure precisely so that cannot happen.
 */
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A number where zero is genuinely meaningful — a weight, a point value. */
function numOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function toAeoState(raw: unknown): AeoJobState {
  const value = str(raw);
  return KNOWN_STATES.find((state) => state === value) ?? "unknown";
}

function parseArea(raw: unknown): AeoArea {
  const a = record(raw);
  return {
    key: str(a.key),
    label: str(a.label),
    earned: numOr(a.earned, 0),
    weight: numOr(a.weight, 0),
    reason: str(a.reason),
    evidence: str(a.evidence),
    improvement: str(a.improvement),
    worst_page: str(a.worst_page),
    page_count: numOr(a.page_count, 0),
  };
}

function parseGap(raw: unknown): AeoGap {
  const g = record(raw);
  return {
    key: str(g.key),
    title: str(g.title),
    points: numOr(g.points, 0),
    effort: str(g.effort),
    severity: str(g.severity),
    where: str(g.where),
    check_id: str(g.check_id),
    evidence: str(g.evidence),
    pages: list(g.pages).map((p) => {
      const page = record(p);
      return { where: str(page.where), evidence: str(page.evidence) };
    }),
    improvement: str(g.improvement),
    ships_via: strings(g.ships_via),
  };
}

function strings(value: unknown): string[] {
  return list(value).map(str).filter(Boolean);
}

function parseFix(raw: unknown): AeoFix {
  const f = record(raw);
  return {
    id: str(f.id),
    action: str(f.action),
    rationale: str(f.rationale),
    where: str(f.where),
    kind: str(f.kind),
    fix_type: str(f.fix_type),
    // Anything but an explicit `false` is held. A fix that might change what
    // a page says must never be presented as ready because a field was missing.
    needs_approval: f.needs_approval !== false,
    approved: f.approved === true,
    preview: str(f.preview),
    language: str(f.language),
    ships_via: strings(f.ships_via),
  };
}

function parseSurface(raw: unknown): AeoSurface {
  const s = record(raw);
  return {
    id: str(s.id),
    label: str(s.label),
    available: s.available === true,
    note: str(s.note),
    achievable: num(s.achievable),
    gain: num(s.gain),
    unreachable: num(s.unreachable),
    unreachable_areas: strings(s.unreachable_areas),
  };
}

function parseDeployment(raw: unknown): AeoDeployment | null {
  if (!raw || typeof raw !== "object") return null;
  const d = record(raw);
  return {
    surface: str(d.surface),
    achievable: num(d.achievable),
    pull_request_url: str(d.pull_request_url),
    files_changed: num(d.files_changed),
    head_location: str(d.head_location),
    root_file_location: str(d.root_file_location),
    body_location: str(d.body_location),
    platform_notes: strings(d.platform_notes),
  };
}

export function parseAeoResult(raw: unknown): AeoResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = record(raw);
  return {
    domain: str(r.domain),
    url: str(r.url),
    brand: str(r.brand),
    platform: str(r.platform),
    logo: str(r.logo),
    score: num(r.score),
    ceiling: num(r.ceiling),
    ceiling_note: str(r.ceiling_note),
    pages_audited: num(r.pages_audited),
    pages_found: num(r.pages_found),
    blocked_pages: num(r.blocked_pages),
    coverage_note: str(r.coverage_note),
    discovery_source: str(r.discovery_source),
    generation_note: str(r.generation_note),
    render_note: str(r.render_note),
    gap_count: num(r.gap_count),
    run_id: str(r.run_id),
    areas: list(r.areas).map(parseArea),
    pages: list(r.pages).map((p) => {
      const page = record(p);
      return { url: str(page.url), path: str(page.path), score: numOr(page.score, 0) };
    }),
    gaps: list(r.gaps).map(parseGap),
    competitors: list(r.competitors)
      .map((c) => {
        const comp = record(c);
        return { name: str(comp.name), url: str(comp.url), why: str(comp.why) };
      })
      // A competitor with no name is a row that would render blank. The same
      // rule the business profile's competitor card already follows.
      .filter((c) => c.name !== ""),
    // A fix with nothing to action and nothing to show is a blank row.
    fixes: list(r.fixes)
      .map(parseFix)
      .filter((f) => f.action !== "" || f.preview !== ""),
    pending_ships_via: strings(r.pending_ships_via),
    deployment: parseDeployment(r.deployment),
    surfaces: list(r.surfaces)
      .map(parseSurface)
      .filter((s) => s.label !== ""),
  };
}

export function parseAeoJob(raw: unknown, fallbackId = ""): AeoJob {
  const j = record(raw);
  return {
    id: str(j.id) || fallbackId,
    state: toAeoState(j.state),
    stage: str(j.stage),
    error: str(j.error),
    vendor: str(j.vendor),
    url: str(j.url),
    result: parseAeoResult(j.result),
  };
}

export function parseAeoStart(raw: unknown): AeoStart {
  const r = record(raw);
  if (r.needs_selection === true) {
    return {
      kind: "needs-selection",
      domain: str(r.domain),
      subdomains: list(r.subdomains).map(str).filter(Boolean),
    };
  }
  return { kind: "started", job: parseAeoJob(r.job) };
}

export function parseAeoSelection(raw: unknown): AeoSelectionOutcome {
  const r = record(raw);
  return {
    jobs: list(r.jobs).map((j) => parseAeoJob(j)),
    failed: list(r.failed).map((f) => {
      const row = record(f);
      return { url: str(row.url), error: str(row.error) };
    }),
  };
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

/**
 * Start an audit, or discover what there is to audit first.
 *
 * `subdomain: true` picks the longer deadline, because that call queries
 * Certificate Transparency logs and then checks which candidates are live
 * before it answers at all.
 */
export async function startAeoAudit(
  websiteUrl: string,
  { subdomain, userId }: { subdomain: boolean; userId: string },
): Promise<AeoStart> {
  const payload = await aeoRequest<unknown>("/api/leadbyte/audits", {
    operation: subdomain ? "discover" : "start",
    method: "POST",
    body: { website_url: websiteUrl, user_id: userId, subdomain },
  });
  return parseAeoStart(payload);
}

/**
 * Start one audit per site the customer kept.
 *
 * `selected: []` is valid and means the main domain alone — the service
 * always audits it, and it is never offered as one of the choices.
 */
export async function startAeoSelection(
  websiteUrl: string,
  selected: string[],
  userId: string,
): Promise<AeoSelectionOutcome> {
  const payload = await aeoRequest<unknown>("/api/leadbyte/audits/select", {
    operation: "select",
    method: "POST",
    body: { website_url: websiteUrl, user_id: userId, selected },
  });
  return parseAeoSelection(payload);
}

/**
 * Approve held fixes, by id. Throws, like every other call that changes
 * something.
 *
 * The response is meant to carry the updated result, but nothing reads it:
 * the report re-reads the job on the redirect that follows, so the screen
 * shows what the service stored rather than what one response claimed.
 */
export async function approveAeoFixes(jobId: string, artifactIds: string[]): Promise<void> {
  await aeoRequest<unknown>(`/api/audits/${encodeURIComponent(jobId)}/approve`, {
    operation: "approve",
    method: "POST",
    body: { artifact_ids: artifactIds },
  });
}

/**
 * One job's current state. Never throws.
 *
 * A job id the service has never heard of resolves to `error`, because that
 * will not change however long we wait. Anything else — a dropped request, a
 * 500, a deadline — resolves to `unknown`, which is not a finished state, so
 * the board tries again rather than declaring an audit failed over one bad
 * poll.
 */
export async function readAeoJob(id: string, url = ""): Promise<AeoJob> {
  try {
    const payload = await aeoRequest<unknown>(`/api/audits/${encodeURIComponent(id)}`, {
      operation: "poll",
    });
    const job = parseAeoJob(payload, id);
    return job.url ? job : { ...job, url };
  } catch (error) {
    if (error instanceof AeoApiError && error.kind === "not-found") {
      return {
        id,
        state: "error",
        stage: "",
        error: "We couldn't find that audit any more.",
        vendor: "",
        url,
        result: null,
      };
    }
    return { id, state: "unknown", stage: "", error: "", vendor: "", url, result: null };
  }
}
