import { aeoRequest } from "@/lib/api/aeo-client";
import type { AeoResult, AeoSurface } from "./aeo-audit";

/**
 * Putting an audit's fixes on the customer's site — the "How to apply them"
 * section of the report.
 *
 * Three calls, all to the AEO service:
 *
 *   GET  /api/leadbyte/github/status?user_id&domain   is GitHub connected?
 *   DELETE /api/leadbyte/github/connection?user_id&domain   forget the link
 *   POST /api/audits/{id}/preview  { repo, branch }   the change we WOULD make
 *   POST /api/audits/{id}/deploy   { repo, branch }   open the pull request
 *
 * `preview` and `deploy` are separate routes on purpose (the service's own
 * words): previewing needs no access and changes nothing, deploying writes to
 * somebody's repository. The screen keeps the same split — nothing opens a
 * pull request except a button that says so, shown only after a preview.
 *
 * Even `deploy` is not a deployment. It opens a pull request that waits for a
 * person to merge it.
 */

// ---------------------------------------------------------------------------
// The routes, as tabs
// ---------------------------------------------------------------------------

export interface ApplyRoute {
  id: string;
  label: string;
  /** Today's score, the left side of "46 → 77". */
  from: number | null;
  /** What this route could reach, the right side. */
  to: number | null;
  suggested: boolean;
  /** Said above the panel when the route cannot reach everything. */
  shortfall: string | null;
}

/**
 * The routes that can be used on this site, in the service's order, the
 * suggested one first.
 *
 * Unavailable routes are not tabs — there is nothing to do on one — and are
 * returned separately so the screen can say why each is missing rather than
 * dropping it without a word.
 */
export function applyRoutes(result: AeoResult): {
  routes: ApplyRoute[];
  unavailable: AeoSurface[];
} {
  const available = result.surfaces.filter((s) => s.available);
  const suggestedId = result.deployment?.surface ?? "";
  const ordered = [
    ...available.filter((s) => s.id === suggestedId),
    ...available.filter((s) => s.id !== suggestedId),
  ];
  return {
    routes: ordered.map((surface) => ({
      id: surface.id,
      label: surface.label || surface.id,
      from: result.score,
      to: surface.achievable,
      suggested: surface.id === suggestedId,
      shortfall: shortfallSentence(surface, available, result.ceiling),
    })),
    unavailable: result.surfaces.filter((s) => !s.available),
  };
}

/**
 * "GitHub pull request cannot reach 23 points here — Server rendering, AI
 * visibility, Freshness. Another route may."
 *
 * "Another route may" is said only when it is true: some other usable route
 * is not blocked from at least one of the same areas. Otherwise the sentence
 * stops at the list, because pointing at routes that cannot help is worse
 * than saying nothing.
 */
export function shortfallSentence(
  surface: AeoSurface,
  available: AeoSurface[],
  ceiling: number | null,
): string | null {
  const points =
    surface.unreachable ??
    (surface.achievable !== null ? (ceiling ?? 100) - surface.achievable : null);
  if (points === null || points <= 0) return null;

  const areas = surface.unreachable_areas;
  const label = surface.label || surface.id;
  const head = `${label} cannot reach ${points} ${points === 1 ? "point" : "points"} here`;
  if (areas.length === 0) return `${head}.`;

  const another = available.some(
    (other) =>
      other.id !== surface.id &&
      areas.some((area) => !other.unreachable_areas.includes(area)),
  );
  return `${head} — ${areas.join(", ")}.${another ? " Another route may." : ""}`;
}

// ---------------------------------------------------------------------------
// GitHub connection
// ---------------------------------------------------------------------------

export interface GithubStatus {
  /** False is OUR setup problem (the app has no credentials), not theirs. */
  configured: boolean;
  connected: boolean;
  /** The repository already connected for this site, when there is one. */
  repo: string;
  /** GitHub's install page. Opened in a new tab: its callback lands on the
      service, not on us, so this tab stays put and polls. */
  installUrl: string;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseGithubStatus(raw: unknown): GithubStatus {
  const s = record(raw);
  const installUrl = str(s.install_url);
  return {
    configured: s.configured === true,
    connected: s.connected === true,
    repo: str(s.repo),
    // Only ever GitHub. It is opened from our page, so a value that pointed
    // anywhere else would be us sending the customer there.
    installUrl: /^https:\/\/github\.com\//.test(installUrl) ? installUrl : "",
  };
}

export async function readGithubStatus(userId: string, domain: string): Promise<GithubStatus> {
  const query = new URLSearchParams({ user_id: userId, domain });
  const payload = await aeoRequest<unknown>(`/api/leadbyte/github/status?${query}`, {
    operation: "github",
  });
  return parseGithubStatus(payload);
}

/**
 * Forget this site's saved GitHub link (live on aeo-agent, 2026-10-01).
 *
 * It clears the link in the AEO service's own store, for this account and this
 * site only; calling it twice, or for a site never connected, is harmless. It
 * does NOT uninstall the GitHub App — that is done on GitHub, under Settings →
 * Applications — so the customer is told so. Answers with the same status
 * shape as `readGithubStatus`: `connected: false` and a fresh install link.
 */
export async function disconnectGithub(userId: string, domain: string): Promise<GithubStatus> {
  const query = new URLSearchParams({ user_id: userId, domain });
  const payload = await aeoRequest<unknown>(`/api/leadbyte/github/connection?${query}`, {
    operation: "github",
    method: "DELETE",
  });
  return parseGithubStatus(payload);
}

// ---------------------------------------------------------------------------
// Preview and pull request
// ---------------------------------------------------------------------------

/** `owner/name`, GitHub's own character set. */
const REPO_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
/** Git allows more, but nothing a customer would type needs more. */
const BRANCH_PATTERN = /^[A-Za-z0-9._\/-]{1,200}$/;

/**
 * The repository and branch as typed, tidied, or the reason they cannot be
 * used. A pasted `https://github.com/owner/name(.git)` is accepted, because
 * that is what people copy from the address bar.
 */
export function readRepoInput(
  repoRaw: string,
  branchRaw: string,
): { ok: true; repo: string; branch: string } | { ok: false; message: string } {
  const repo = repoRaw
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  const branch = branchRaw.trim() || "main";
  if (!REPO_PATTERN.test(repo)) {
    return { ok: false, message: "Enter the repository as owner/repository." };
  }
  if (!BRANCH_PATTERN.test(branch) || branch.includes("..")) {
    return { ok: false, message: "That branch name isn't valid." };
  }
  return { ok: true, repo, branch };
}

export interface PullRequestPreview {
  repo: string;
  branch: string;
  /** The service's own note about the branch, e.g. that it will be created. */
  branchNote: string;
  ships: number;
  heldBack: number;
  filesChanged: number;
  addedLines: number;
  diff: string;
  canPush: boolean;
  pushBlockedReason: string;
  pullRequestUrl: string;
  achievable: number | null;
}

export function parsePreview(raw: unknown): PullRequestPreview {
  const d = record(raw);
  const url = str(d.pull_request_url);
  return {
    repo: str(d.repo),
    branch: str(d.branch),
    branchNote: str(d.branch_note),
    ships: num(d.ships) ?? 0,
    heldBack: num(d.held_back) ?? 0,
    filesChanged: num(d.files_changed) ?? 0,
    addedLines: num(d.added_lines) ?? 0,
    diff: typeof d.diff === "string" ? d.diff : "",
    canPush: d.can_push === true,
    pushBlockedReason: str(d.push_blocked_reason),
    // Rendered as a link on our page, so only ever a GitHub URL.
    pullRequestUrl: /^https:\/\/github\.com\//.test(url) ? url : "",
    achievable: num(d.achievable),
  };
}

/**
 * The change we would propose. Creates nothing.
 *
 * `user_id` is what lets the service answer `can_push` for THIS account
 * (backend, 2026-09-26): it checks whether the account has a GitHub
 * connection for the audit's domain, the same check `/deploy` makes. Without
 * it `can_push` is always false and "Open pull request" never appears.
 */
export async function previewPullRequest(
  jobId: string,
  userId: string,
  repo: string,
  branch: string,
): Promise<PullRequestPreview> {
  const payload = await aeoRequest<unknown>(`/api/audits/${encodeURIComponent(jobId)}/preview`, {
    operation: "preview",
    method: "POST",
    body: { repo, branch, user_id: userId },
  });
  return parsePreview(payload);
}

/**
 * Open the pull request, through the LeadByte route (backend, 2026-09-26).
 *
 * `user_id` rides in the body: it is how the service finds THIS account's
 * GitHub installation for the site. The service answers 400 with a readable
 * `detail` ("connect GitHub for this site first", a missing branch…), which
 * the action shows as-is.
 */
export async function openPullRequest(
  jobId: string,
  userId: string,
  repo: string,
  branch: string,
): Promise<PullRequestPreview> {
  const payload = await aeoRequest<unknown>(
    `/api/leadbyte/audits/${encodeURIComponent(jobId)}/deploy`,
    { operation: "deploy", method: "POST", body: { user_id: userId, repo, branch } },
  );
  return parsePreview(payload);
}

/** Only `owner/name` strings survive: they are shown in a list and posted back. */
export function parseRepoList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (value): value is string => typeof value === "string" && readRepoInput(value, "main").ok,
  );
}

/**
 * The repositories this account's GitHub installation may touch, for a
 * picker — chosen on GitHub's own screen, so retyping one invites a typo.
 * Only meaningful once `connected` is true.
 */
export async function listGithubRepos(userId: string, domain: string): Promise<string[]> {
  const query = new URLSearchParams({ user_id: userId, domain });
  const payload = await aeoRequest<unknown>(`/api/leadbyte/github/repos?${query}`, {
    operation: "github",
  });
  return parseRepoList(payload);
}
