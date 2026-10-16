import type { AiBotAccess, GeoAnalysisPage, GeoSignal } from "@/lib/data/types";

/**
 * The GEO analysis dashboard's arithmetic, kept out of the page so it can be
 * tested (2026-10-09 design).
 *
 * Every figure here is derived from something the backend measured. Where the
 * design asked for something it does not measure — a severity per category,
 * "high impact" per fix — it is not here, and the page says what it shows
 * instead.
 */

export type Tone = "good" | "warn" | "crit";

/**
 * Which colour a 0-100 score is drawn in. The product's existing bands —
 * 80 and up good, 50 to 79 middling, under 50 poor — the same as the Overview
 * (`overview-summary.ts` `scoreTone`) and the Website audit's page table, so
 * one score is never green on one screen and amber on the next.
 */
export const GOOD_FROM = 80;
export const WARN_FROM = 50;

export function scoreTone(score: number): Tone {
  if (score >= GOOD_FROM) return "good";
  if (score >= WARN_FROM) return "warn";
  return "crit";
}

const TONE_WORD: Record<Tone, string> = { good: "Excellent", warn: "Needs work", crit: "Poor" };

/** The word under one of the four sub-scores, from the same bands. */
export function subScoreVerdict(score: number): { label: string; tone: Tone } {
  const tone = scoreTone(score);
  return { label: TONE_WORD[tone], tone };
}

/** The badge and sentence beside the overall score. Our bands, not the backend's. */
export function overallVerdict(score: number): { label: string; tone: Tone; sentence: string } {
  if (score >= GOOD_FROM) {
    return {
      label: "Strong",
      tone: "good",
      sentence: "Your content is easy for AI engines to find and quote. Keep it fresh to stay there.",
    };
  }
  if (score >= WARN_FROM) {
    return {
      label: "Needs improvement",
      tone: "warn",
      sentence:
        "Your content is partially visible to AI engines. Fix the issues below to get more mentions and traffic.",
    };
  }
  return {
    label: "Poor",
    tone: "crit",
    sentence: "AI engines struggle to find and quote your content. Start with the quick wins below.",
  };
}

/**
 * Pages sorted by how readable they are to an AI engine, from each page's
 * extractability score, in the same bands as every other score here: good,
 * middling and poor. Unscored pages are left out of all three rather than
 * guessed.
 */
export function extractabilityBuckets(pages: readonly GeoAnalysisPage[]): {
  good: number;
  partial: number;
  poor: number;
  scored: number;
} {
  let good = 0;
  let partial = 0;
  let poor = 0;
  for (const page of pages) {
    const score = page.extractabilityScore;
    if (score === null) continue;
    const tone = scoreTone(score);
    if (tone === "good") good += 1;
    else if (tone === "warn") partial += 1;
    else poor += 1;
  }
  return { good, partial, poor, scored: good + partial + poor };
}

export interface CategoryRow {
  group: GeoSignal["group"];
  /** Page-checks that failed: a signal missing from 5 of 17 pages is 5. */
  missing: number;
  /** How many of this group's signals every page passes. */
  passing: number;
  checks: number;
  /** Share of all page-checks in the group that passed, 0-100. */
  coverage: number;
}

const GROUP_ORDER: GeoSignal["group"][] = ["Structure", "Markup", "Trust & authorship"];

/** One row per signal group, in the fixed order the rest of the page uses. */
export function categoryRows(signals: readonly GeoSignal[]): CategoryRow[] {
  return GROUP_ORDER.flatMap((group) => {
    const rows = signals.filter((signal) => signal.group === group);
    if (rows.length === 0) return [];
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    const passed = rows.reduce((sum, row) => sum + Math.min(row.pages, row.total), 0);
    return [
      {
        group,
        missing: total - passed,
        passing: rows.filter((row) => row.pages >= row.total).length,
        checks: rows.length,
        coverage: total > 0 ? Math.round((passed / total) * 100) : 0,
      },
    ];
  });
}

/** The fix for each signal, as an instruction, and why it matters. */
const FIXES: Record<string, { action: (pages: string) => string; why: string }> = {
  "Questions as headings": {
    action: (n) => `Use questions as headings on ${n}`,
    why: "Matches how people ask AI engines",
  },
  "Answer near the top": {
    action: (n) => `Put the answer near the top of ${n}`,
    why: "Gives engines a quotable answer",
  },
  "Schema.org markup": {
    action: (n) => `Add Schema.org markup to ${n}`,
    why: "Helps AI engines understand the page",
  },
  "FAQ or Article schema": {
    action: (n) => `Add FAQ or Article schema to ${n}`,
    why: "Helps AI engines understand the page",
  },
  "Entity markup": {
    action: (n) => `Add entity markup to ${n}`,
    why: "Says clearly who the business is",
  },
  "Knowledge-graph markup": {
    action: (n) => `Add knowledge-graph markup to ${n}`,
    why: "Connects your site to who you are",
  },
  "Author named": {
    action: (n) => `Add an author byline to ${n}`,
    why: "Improves E-E-A-T signals",
  },
  "Published date": {
    action: (n) => `Add a published or updated date to ${n}`,
    why: "Shows content freshness",
  },
  "Cites its sources": {
    action: (n) => `Cite your sources on ${n}`,
    why: "Makes your claims easier to trust",
  },
  "Social profiles linked": {
    action: (n) => `Link your social profiles on ${n}`,
    why: "Confirms the business is real",
  },
  "Editorial policy": {
    action: (n) => `Add an editorial policy to ${n}`,
    why: "Shows how content is checked",
  },
  "Experience & expertise depth": {
    action: (n) => `Show experience and expertise on ${n}`,
    why: "Improves E-E-A-T signals",
  },
};

export interface QuickWin {
  title: string;
  why: string;
  /** Pages missing this signal. */
  pages: number;
  total: number;
  group: GeoSignal["group"];
}

/**
 * The signals missing from the most pages, as fixes. Ranked by how many pages
 * each one would improve — the one measure of reach the data has — not by an
 * "impact" nobody computed.
 */
export function quickWins(signals: readonly GeoSignal[], count = 5): QuickWin[] {
  return signals
    .map((signal) => ({ signal, missing: signal.total - Math.min(signal.pages, signal.total) }))
    .filter(({ missing, signal }) => missing > 0 && FIXES[signal.label] !== undefined)
    .sort((a, b) => b.missing - a.missing)
    .slice(0, count)
    .map(({ signal, missing }) => {
      const fix = FIXES[signal.label]!;
      return {
        title: fix.action(missing === 1 ? "1 page" : `${missing} pages`),
        why: fix.why,
        pages: missing,
        total: signal.total,
        group: signal.group,
      };
    });
}

/**
 * Which AI engines the crawler check covers, named the way people know them.
 * Only engines whose crawler is actually in the robots.txt check appear, so
 * the picture never names an engine nothing was measured for.
 */
const ENGINE_OF_BOT: Record<string, string> = {
  gptbot: "ChatGPT",
  "chatgpt-user": "ChatGPT",
  "oai-searchbot": "ChatGPT",
  perplexitybot: "Perplexity",
  "perplexity-user": "Perplexity",
  claudebot: "Claude",
  "claude-web": "Claude",
  "anthropic-ai": "Claude",
  "google-extended": "Google AI",
  bingbot: "Bing Copilot",
};

export function enginesChecked(bots: readonly AiBotAccess[]): string[] {
  const engines: string[] = [];
  for (const { bot } of bots) {
    const engine = ENGINE_OF_BOT[bot.trim().toLowerCase()];
    if (engine && !engines.includes(engine)) engines.push(engine);
  }
  return engines;
}

