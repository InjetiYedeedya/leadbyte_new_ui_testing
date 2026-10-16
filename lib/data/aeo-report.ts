/**
 * The AEO audit, turned into the things a screen renders.
 *
 * Pure. No fetching, no JSX, no cookies — the same division of labour that
 * puts `mapWebsiteAudit` and `mapGeoAnalysis` in a module of their own and
 * leaves the repo three lines of glue. It is here so every rule below is
 * tested against a payload captured from a real run, rather than being a
 * property of some JSX nobody re-reads.
 *
 * ## The rules it holds
 *
 * - **However many areas arrive, arrive.** The integration brief says nine;
 *   the live service sent ten (`ai_visibility` was there). Nothing counts
 *   them, nothing lays out a fixed grid, nothing hard-codes a key.
 * - **A missing figure is an em dash, never zero.** A score of 0 and no score
 *   at all are different sentences, and the app already learned this twice —
 *   `formatMoney` for a null CPA, and every backend score arriving as 0 and
 *   being mapped to null so the audit page could say "not scored yet".
 * - **One set of thresholds.** 70 and 40, the same numbers
 *   `overview/website-audit` colours its score by and `page-sections` tones
 *   its rows by. A fourth threshold appearing in a fourth file is how two
 *   screens end up disagreeing about what "good" is.
 * - **Nothing is re-ranked.** Gaps arrive sorted by points and pages by score,
 *   worst first, and both orders are the service's own judgement.
 */

import type { BadgeVariant } from "@/components/ui/badge";
import type {
  AeoArea,
  AeoDeployment,
  AeoFix,
  AeoGap,
  AeoResult,
  AeoSurface,
} from "@/lib/data/aeo-audit";

/** Where "good" stops and "needs work" starts. Shared, once. */
export const GOOD_AT = 70;
export const WARN_AT = 40;

export type ScoreTone = "good" | "warn" | "crit" | "none";

export function scoreTone(score: number | null): ScoreTone {
  if (score === null) return "none";
  if (score >= GOOD_AT) return "good";
  if (score >= WARN_AT) return "warn";
  return "crit";
}

const TONE_TEXT: Record<ScoreTone, string> = {
  good: "text-good",
  warn: "text-warn",
  crit: "text-crit",
  none: "text-ink-soft",
};

export function scoreToneClass(score: number | null): string {
  return TONE_TEXT[scoreTone(score)];
}

/**
 * A figure with at most one decimal, and no decorative `.0`.
 *
 * The service sends fractional earnings — 14.5, 13.7, 6.7, 2.2 — beside whole
 * ones. Rounding them all to integers loses the difference between 14.5 and 15
 * on a 15-point area, which is the difference between "nearly perfect" and
 * "perfect"; printing `10.0` beside `2` just looks like two kinds of number.
 */
export function formatPoints(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return (Math.round(value * 10) / 10).toString();
}

/** `14.5/15`. The one place an area's score is spelled. */
export function areaScoreLabel(area: AeoArea): string {
  return `${formatPoints(area.earned)}/${formatPoints(area.weight)}`;
}

/**
 * How full an area's bar is.
 *
 * A weight of zero would be a division by zero AND an area that cannot be
 * scored, so it draws empty rather than full — an empty bar on an unscored row
 * is quiet, a full one is a claim.
 */
export function areaShare(area: AeoArea): number {
  if (area.weight <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((area.earned / area.weight) * 100)));
}

/**
 * Areas worth acting on first: the biggest gap between earned and weight.
 *
 * Used only to pick what the summary names. The full list keeps the service's
 * own order, because that order groups site-wide checks with page-level ones
 * in a way a shortfall sort would scatter.
 */
export function biggestShortfalls(areas: AeoArea[], count = 3): AeoArea[] {
  return [...areas]
    .filter((a) => a.weight > 0 && a.earned < a.weight)
    .sort((a, b) => b.weight - b.earned - (a.weight - a.earned))
    .slice(0, count);
}

/**
 * "19 pages" / "6 of 19 pages" — and null when there is nothing honest to say.
 *
 * The two numbers are only worth showing together when they differ; when they
 * match, "19 of 19" invites the reader to look for the missing thirteen.
 */
export function coverageLabel(result: AeoResult): string | null {
  const { pages_audited: audited, pages_found: found } = result;
  if (audited === null && found === null) return null;
  if (audited === null) return `${found} pages found`;
  if (found === null || found === audited) {
    return `${audited} ${audited === 1 ? "page" : "pages"} audited`;
  }
  return `${audited} of ${found} pages audited`;
}

/**
 * The caveats the service attaches to its own numbers.
 *
 * All four are empty strings on a clean run, and an empty one is dropped
 * rather than rendered as a blank line. They are shown verbatim: each is the
 * service explaining why a figure is what it is, and paraphrasing it would be
 * us explaining a calculation we did not make.
 */
export function resultCaveats(result: AeoResult): string[] {
  return [result.ceiling_note, result.coverage_note, result.render_note, result.generation_note]
    .map((note) => note.trim())
    .filter((note) => note !== "");
}

/**
 * Severity, in the badge vocabulary the audit screen already uses.
 *
 * Deliberately the same map as `overview/website-audit`: two reports in one
 * product colouring "high" differently is the kind of thing nobody reports as
 * a bug and everybody reads as one. Anything unrecognised is amber, never
 * green — an unknown severity must not look safe.
 */
const SEVERITY_VARIANT: Record<string, BadgeVariant> = {
  critical: "confidence-low",
  high: "confidence-medium",
  medium: "confidence-partial",
  low: "confidence-high",
};

export function severityVariant(severity: string): BadgeVariant {
  return SEVERITY_VARIANT[severity.toLowerCase()] ?? "confidence-partial";
}

/** "8 points · low effort · 19 pages" — the one line under a gap's title. */
export function gapSummary(gap: AeoGap): string {
  const parts = [`${formatPoints(gap.points)} ${gap.points === 1 ? "point" : "points"}`];
  if (gap.effort) parts.push(`${gap.effort} effort`);
  if (gap.where) parts.push(gap.where);
  return parts.join(" · ");
}

/**
 * The hint `PageSections` renders beside a page, and reads back for its gauge.
 *
 * That component parses `N/100 …` out of this string to size its bar — an
 * arrangement it documents, and the reason this returns a string rather than a
 * number. Keep the `/100` or the gauge silently disappears.
 */
export function pageHint(score: number): string {
  return `${Math.round(score)}/100 page score`;
}

/** Whether there is anything at all to draw. */
export function hasReportBody(result: AeoResult): boolean {
  return (
    result.areas.length > 0 ||
    result.gaps.length > 0 ||
    result.pages.length > 0 ||
    result.score !== null
  );
}

// ---------------------------------------------------------------------------
// Fixes (Layer 2) and the routes to the site (Layer 3)
// ---------------------------------------------------------------------------

export type FixStatus = "ready" | "approved" | "awaiting";

/**
 * Whether a fix can be used as it stands.
 *
 * Only body copy is held, and it stays held until the service says a person
 * approved it. There is no approve button in this app, so today every held
 * fix reads "awaiting" — which is the truth, not a gap in the screen.
 */
export function fixStatus(fix: AeoFix): FixStatus {
  if (!fix.needs_approval) return "ready";
  return fix.approved ? "approved" : "awaiting";
}

export const FIX_STATUS_LABEL: Record<FixStatus, string> = {
  ready: "Ready",
  approved: "Approved",
  awaiting: "Needs approval",
};

export const FIX_STATUS_VARIANT: Record<FixStatus, BadgeVariant> = {
  ready: "fix-ready",
  approved: "fix-ready",
  awaiting: "fix-awaiting",
};

/**
 * The counts, taken from the list itself.
 *
 * Not from `auto_count` / `pending_count`. The integration brief called 70
 * the total; the live payload for the same run carried 134 fixes, 70 of them
 * ready and 64 held. Counting what we render means the sentence and the list
 * beneath it can never disagree.
 */
export function fixCounts(fixes: AeoFix[]): { total: number; ready: number; awaiting: number } {
  const awaiting = fixes.filter((f) => fixStatus(f) === "awaiting").length;
  return { total: fixes.length, ready: fixes.length - awaiting, awaiting };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The one sentence that opens the fixes card. Null when nothing was written. */
export function fixesSentence(fixes: AeoFix[]): string | null {
  const { total, ready, awaiting } = fixCounts(fixes);
  if (total === 0) return null;
  const wrote = `We wrote ${plural(total, "fix", "fixes")} for this site.`;
  if (awaiting === 0) return `${wrote} All of them are ready to use.`;
  const held = `${plural(awaiting, "changes", "change")} what your pages say, so ${
    awaiting === 1 ? "it needs" : "they need"
  } a person to approve ${awaiting === 1 ? "it" : "them"} first.`;
  if (ready === 0) return `${wrote} ${held}`;
  return `${wrote} ${plural(ready, "is", "are")} ready to use. ${held}`;
}

/** "6 fixes · 3 need approval" — the figure beside a page row. */
export function fixCountLabel(fixes: AeoFix[]): string | null {
  const { total, awaiting } = fixCounts(fixes);
  if (total === 0) return null;
  const base = plural(total, "fix", "fixes");
  if (awaiting === 0) return base;
  return `${base} · ${awaiting} ${awaiting === 1 ? "needs" : "need"} approval`;
}

/**
 * Fixes grouped by where they go, in the order they arrived.
 *
 * Keyed on `where`, which is a page path or `"whole site"`. The page list
 * looks its own paths up here; whatever is left over (the sitemap) gets a row
 * of its own, so no fix is ever dropped for not matching a page.
 */
export function groupFixesByPlace(fixes: AeoFix[]): Map<string, AeoFix[]> {
  const groups = new Map<string, AeoFix[]>();
  for (const fix of fixes) {
    const group = groups.get(fix.where);
    if (group) group.push(fix);
    else groups.set(fix.where, [fix]);
  }
  return groups;
}

/** "whole site" → "Whole site". A path is left exactly as it is. */
export function placeLabel(where: string): string {
  if (!where) return "Elsewhere";
  if (where.startsWith("/")) return where;
  return where.charAt(0).toUpperCase() + where.slice(1);
}

/**
 * Where in the site a fix belongs, in the service's own words.
 *
 * The deployment preview carries one sentence per kind ("the page's HTML,
 * immediately before the closing head tag"), which is exactly what someone
 * pasting a fix by hand needs, and exactly what we should not paraphrase.
 */
export function fixLocation(fix: AeoFix, deployment: AeoDeployment | null): string | null {
  if (!deployment) return null;
  const where = fix.kind.startsWith("head")
    ? deployment.head_location
    : fix.kind === "body"
      ? deployment.body_location
      : fix.kind === "root_file"
        ? deployment.root_file_location
        : "";
  return where.trim() || null;
}

/**
 * A rewritten heading, as the before and after.
 *
 * The preview for one is a small JSON object labelled `text`
 * (`{"from": "Features", "to": "What features are included?"}`). Printed raw
 * it is a snippet of code where two short phrases belong. Anything that does
 * not parse into both halves falls back to the raw preview.
 */
export function headingRewrite(fix: AeoFix): { from: string; to: string } | null {
  if (fix.fix_type !== "rewrite_heading") return null;
  try {
    const parsed: unknown = JSON.parse(fix.preview);
    if (!parsed || typeof parsed !== "object") return null;
    const { from, to } = parsed as Record<string, unknown>;
    if (typeof from !== "string" || typeof to !== "string" || !from || !to) return null;
    return { from, to };
  } catch {
    return null;
  }
}

/** Prose is wording; everything else is code. The disclosure says which. */
export function previewToggleLabel(fix: AeoFix): string {
  return fix.language === "text" ? "Show the wording" : "Show the code";
}

/**
 * The score the fixes could take the site to — only when it is an upgrade.
 *
 * Equal to the current score (or below it) is not something to announce, and
 * with no current score there is nothing for it to be compared with.
 */
export function reachableScore(result: AeoResult): number | null {
  const reach = result.deployment?.achievable ?? null;
  if (reach === null || result.score === null || result.fixes.length === 0) return null;
  return reach > result.score ? reach : null;
}

/** "+19 points · can't help with Freshness, AI visibility" */
export function surfaceDetail(surface: AeoSurface): string | null {
  if (!surface.available) return surface.note ? `Not available: ${surface.note}` : "Not available";
  const parts: string[] = [];
  if (surface.gain !== null && surface.gain > 0) {
    parts.push(`+${formatPoints(surface.gain)} ${surface.gain === 1 ? "point" : "points"}`);
  }
  if (surface.unreachable_areas.length > 0) {
    parts.push(`can't help with ${surface.unreachable_areas.join(", ")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Whether anything has actually reached the site.
 *
 * The deployment block is a preview until someone runs a real deploy, which
 * this app never does. A pull-request link or changed files are the only
 * evidence that one happened.
 */
export function hasShipped(deployment: AeoDeployment | null): boolean {
  if (!deployment) return false;
  return deployment.pull_request_url !== "" || (deployment.files_changed ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Plain words for what the service sends as codes and markup
// ---------------------------------------------------------------------------

const DISCOVERY_LABEL: Record<string, string> = {
  sitemap: "Pages found from your sitemap",
  "rendered-crawl": "Pages found by loading the site in a browser",
};

/**
 * How the audit found the pages, as a sentence.
 *
 * `discovery_source` is a code (`sitemap`, `rendered-crawl`), and printing it
 * raw put "Pages found via rendered-crawl" in the report's header. An unknown
 * code still says something rather than nothing, with its dashes spaced out.
 */
export function discoveryLabel(source: string): string | null {
  const code = source.trim();
  if (!code) return null;
  return DISCOVERY_LABEL[code] ?? `Pages found via ${code.replace(/[-_]+/g, " ")}`;
}

/**
 * Prose with its Markdown links reduced to their text.
 *
 * The AI visibility check writes its sources as `([zippygo.co.in](https://…))`,
 * which renders as literal brackets. Only for prose — `evidence` stays exactly
 * as sent, because for llms.txt the evidence IS the file, links and all.
 */
export function plainProse(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((?:https?:)?[^)\s]*\)/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function surfaceLabel(id: string, surfaces: AeoSurface[]): string {
  return surfaces.find((s) => s.id === id)?.label || id;
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

/**
 * Said under a fix the suggested route cannot deliver.
 *
 * On a JavaScript-only site every held fix ships by pull request alone while
 * the service suggests the copy-paste pack, and without this line the report
 * implies the suggested route carries everything it lists. Null when the
 * suggested route can take the fix, and when the fix names no route at all —
 * saying "only through nothing" helps nobody.
 */
export function fixRouteNote(
  fix: AeoFix,
  deployment: AeoDeployment | null,
  surfaces: AeoSurface[],
): string | null {
  if (!deployment?.surface || fix.ships_via.length === 0) return null;
  if (fix.ships_via.includes(deployment.surface)) return null;
  // Labels are the service's own ("GitHub pull request"), kept as sent. All
  // four read after "a", which is why the article is not computed.
  const labels = fix.ships_via.map((id) => surfaceLabel(id, surfaces));
  return `Only through a ${joinLabels(labels)}`;
}

/**
 * The route the headline's "with these fixes" figure is for.
 *
 * That figure is the SUGGESTED route's, and another route can reach higher —
 * 73 by copy-paste against 77 by pull request on the same site. Naming it
 * stops the headline reading as a contradiction of the list below.
 */
export function suggestedSurfaceLabel(result: AeoResult): string | null {
  const id = result.deployment?.surface;
  if (!id) return null;
  const surface = result.surfaces.find((s) => s.id === id);
  return surface?.label || null;
}

// ---------------------------------------------------------------------------
// Approving held fixes
// ---------------------------------------------------------------------------

/** The fixes still waiting for a person, in the order they arrived. */
export function awaitingFixes(fixes: AeoFix[]): AeoFix[] {
  return fixes.filter((fix) => fixStatus(fix) === "awaiting");
}

/**
 * The ids an approval may actually send.
 *
 * Only ids of fixes that are held right now, whatever the form posted: a
 * stale tab, a doubled submit or an edited form can name a fix that is
 * already approved, ready, or not in this audit at all, and none of those is
 * the customer approving copy they have read. `"all"` means every held fix,
 * resolved from the job the server just read — never from a list the browser
 * sent.
 */
export function approvableIds(fixes: AeoFix[], requested: string[] | "all"): string[] {
  const held = awaitingFixes(fixes).map((fix) => fix.id).filter(Boolean);
  if (requested === "all") return held;
  const wanted = new Set(requested);
  return held.filter((id) => wanted.has(id));
}

/**
 * What approving them will do, in the service's route names.
 *
 * `pending_ships_via` empty is a real case the service documents: no route
 * can carry these yet, and approving them changes nothing on the site today.
 * Saying so is the difference between an approval and a button that looks
 * like it did something.
 */
export function pendingRouteSentence(result: AeoResult): string {
  const labels = result.pending_ships_via.map(
    (id) => result.surfaces.find((s) => s.id === id)?.label || id,
  );
  if (labels.length === 0) {
    return "No route can carry these yet, so approving them changes nothing on your site today.";
  }
  const list =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
  return `Once approved, they can go out through a ${list}. Approving does not change your site by itself.`;
}

/**
 * The first few lines of a fix's content, as a taste of what is approved.
 *
 * Cut on a word, never mid-word, and only marked with an ellipsis when
 * something was actually cut. The whole text is one click away in the page
 * list; the checklist exists to be read quickly.
 */
export function previewTaste(preview: string, max = 280): string {
  const text = preview.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
