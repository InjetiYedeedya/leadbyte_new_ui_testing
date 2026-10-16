import { cache } from "react";
import { isBackendConfigured } from "@/lib/api/config";
import { readTable } from "@/lib/api/read-cascade";
import { flatten, normKey, pickNum, ratio, type Row } from "@/lib/data/dashboard/fields";
import { formatCount } from "@/lib/format";

/**
 * The Off-Page SEO agent's outreach record, from `off_page_seo`.
 *
 * ## Why this is built although it reads nothing today
 *
 * The table's partition key `email` is the OUTREACH TARGET's address
 * (`media@ibm.com`), and the account is a plain attribute, `user_email` — see
 * the note on `AGENT_TABLES["off-page-seo"]` in `lib/data/agent-dashboard.ts`.
 * Every route this app can call looks rows up by the ACCOUNT's email, so every
 * one of them answers with nothing; the backend confirmed there is no index on
 * `user_email` yet (2026-09-16). The product owner chose to build the whole
 * panel anyway, so the tab lights up the day the backend can find the record,
 * with no frontend change — only this reader's routes answering.
 *
 * ## Why rows are filtered on `user_email` even though the read is by account
 *
 * Because the table is keyed on the TARGET. Should a route ever match an
 * account email against the partition key — an account whose own address was
 * also emailed as a target, say — the row it returns is someone else's
 * outreach TO this customer, not this customer's outreach. A row is shown as
 * the account's only when its own `user_email` says so, and a row with no
 * `user_email` at all is dropped: we cannot prove whose it is, and showing
 * another customer's figures is the one failure worse than an empty panel.
 *
 * Accepted spellings are the legacy guide's (§5.1), matched after `normKey`.
 */

const SENT = ["outreachemailsent", "sentmails", "emailssent", "mailssent"];
const REPLIES = ["replybackfromoutreach", "replymails", "replies", "mailsreplied"];
const BEFORE = ["initialbacklinks", "initialbacklink"];
const NOW = ["currentbacklinks", "currentbacklink"];
const WON = ["backlink", "backlinks", "newbacklinks"];
const OWNER = ["useremail"];

export interface OffPageOutreach {
  /** Outreach emails the agent sent. Null when no row carried the figure. */
  sent: number | null;
  replies: number | null;
  /** The site's backlink count when the campaign started. */
  before: number | null;
  /** The site's backlink count now. */
  now: number | null;
  /** Links the outreach won — read, or `now − before` when no row says. */
  won: number | null;
}

/** The rows that belong to this account by their own `user_email`. Case-insensitive. */
export function rowsForAccount(rows: readonly unknown[], accountEmail: string): Row[] {
  const account = accountEmail.trim().toLowerCase();
  if (account === "") return [];
  return rows.map(flatten).filter((flat) => {
    const owner = OWNER.map((name) => flat[normKey(name)]).find((v) => typeof v === "string");
    return typeof owner === "string" && owner.trim().toLowerCase() === account;
  });
}

/** Adds up a figure across rows; null when no row carried it at all. */
function total(rows: Row[], names: string[]): number | null {
  let sum = 0;
  let seen = false;
  for (const row of rows) {
    const value = pickNum(row, ...names);
    if (value !== null) {
      sum += value;
      seen = true;
    }
  }
  return seen ? sum : null;
}

function extreme(rows: Row[], names: string[], pick: (a: number, b: number) => number): number | null {
  const values = rows.map((row) => pickNum(row, ...names)).filter((v): v is number => v !== null);
  return values.length === 0 ? null : values.reduce((a, b) => pick(a, b));
}

/**
 * The account's outreach, or null when there is no record to show.
 *
 * The spec is one record per account, and that is the normal case. When
 * several come back, two kinds of figure need two different rules:
 *
 * - **Sent, replies and won are FLOWS** — each row counts its own emails and
 *   links, so they are summed.
 * - **Before and now are LEVELS** — each row is a snapshot of the same site's
 *   one backlink profile, so summing them would count that profile once per
 *   row. The rows carry no reliable date to order them by, so "before" is the
 *   smallest baseline seen (the earliest-looking one: a profile being built
 *   grows) and "now" the largest count seen. The cost is known and accepted:
 *   across several rows a dip cannot show, because max ≥ min. Within the
 *   single record the spec describes, it can and does.
 *
 * Won falls back to `now − before` only when NO row carried a won figure,
 * and never below zero: a profile that shrank won nothing, it did not win a
 * negative number of links. The shrink is shown on the backlink panel.
 */
export function mapOffPageOutreach(rows: readonly Row[]): OffPageOutreach | null {
  if (rows.length === 0) return null;
  const list = [...rows];
  const before = extreme(list, BEFORE, Math.min);
  const now = extreme(list, NOW, Math.max);
  const readWon = total(list, WON);
  const won =
    readWon ?? (before !== null && now !== null ? Math.max(0, now - before) : null);
  return {
    sent: total(list, SENT),
    replies: total(list, REPLIES),
    before,
    now,
    won,
  };
}

/* ---------- the rates the panels print ---------- */

export interface OutreachRates {
  /** Replies ÷ emails sent. */
  replyRate: number | null;
  /** Backlinks won ÷ emails sent — "of everything sent". */
  wonOfSent: number | null;
  /** Backlinks won ÷ replies — the step before it in the funnel. */
  wonOfReplies: number | null;
}

export function outreachRates(outreach: OffPageOutreach): OutreachRates {
  return {
    replyRate: ratio(outreach.replies, outreach.sent),
    wonOfSent: ratio(outreach.won, outreach.sent),
    wonOfReplies: ratio(outreach.won, outreach.replies),
  };
}

export interface BacklinkChange {
  /** Now − before. Negative when the profile shrank. */
  delta: number;
  /** The change against the baseline, or null when the baseline was 0. */
  share: number | null;
}

/** How the profile moved, or null when either end is missing. */
export function backlinkChange(outreach: OffPageOutreach): BacklinkChange | null {
  if (outreach.before === null || outreach.now === null) return null;
  const delta = outreach.now - outreach.before;
  return { delta, share: outreach.before > 0 ? delta / outreach.before : null };
}

/** "+14 (+22%)", "−3 (−5%)", "+4" (no baseline to measure against). */
export function formatChange(change: BacklinkChange): string {
  const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");
  const count = `${sign(change.delta)}${formatCount(Math.abs(change.delta))}`;
  if (change.share === null) return count;
  const pct = Math.abs(change.share * 100);
  const shown = pct < 10 && pct !== 0 ? pct.toFixed(1) : String(Math.round(pct));
  return `${count} (${sign(change.delta)}${shown}%)`;
}

/* ---------- the read ---------- */

export interface OutreachOutcome {
  ok: boolean;
  outreach: OffPageOutreach | null;
}

/**
 * Reads the account's outreach record. Never throws (the cascade does not).
 *
 * `ok: false` only when every route failed — "no record we can find" is
 * `ok: true, outreach: null`, which is TODAY's answer for every account, and
 * the tab says so without implying the agent never ran.
 *
 * Unconfigured is a working environment: no backend, no record, no mock
 * figures invented to fill the panel.
 */
export const readOffPageOutreach = cache(
  async (email: string, uid?: string): Promise<OutreachOutcome> => {
    if (!isBackendConfigured()) return { ok: true, outreach: null };
    const outcome = await readTable("off_page_seo", { email, ...(uid ? { uid } : {}) });
    if (!outcome.ok) return { ok: false, outreach: null };
    return { ok: true, outreach: mapOffPageOutreach(rowsForAccount(outcome.rows, email)) };
  },
);
