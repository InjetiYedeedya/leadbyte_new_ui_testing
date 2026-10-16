import { cache } from "react";

import { isBackendConfigured } from "@/lib/api/config";
import { TABLE_CANDIDATES, matchWebsiteRow } from "@/lib/data/ads-website-details";
import { rowsFrom } from "@/lib/api/read-cascade";
import { ApiError, apiGet } from "@/lib/api/client";

/**
 * Reads the `ads-website details` row for this account and website.
 *
 * Server-only. `cache()`d because an ad agent's page and its setup form both
 * want it in one render.
 *
 * ## Why it goes through `readTable`
 *
 * It used to build its own paths, and they were the wrong ones. Measured
 * against the live backend on two accounts (2026-09-08):
 *
 * - `/api/data-by-uid` and `/api/query-by-uid` answer **404 for every table
 *   name**, including names that cannot exist — missing ROUTES, not missing
 *   tables. Six of the nine calls went to doors that are not there.
 * - `/api/data/{table}/{key}` answers **500**.
 * - `/api/scan-by-uid/{table}/{email}` answers **403**; the same route with a
 *   uid answers 200 and no rows.
 *
 * `readTable` is the documented cascade (FRONTEND_BACKEND_API_CALLS.md §10)
 * and the one the analytics tables already use: uid index, then email as the
 * partition key, then `/api/scan/{table}/{email}` for a table that carries the
 * email as an ordinary ATTRIBUTE. That last route is the one this file never
 * tried, and it is the shape a table nobody put in the Lambda's alias map is
 * most likely to have.
 *
 * The table name is still unconfirmed (see `TABLE_CANDIDATES`), so each
 * candidate goes through the cascade until one returns rows. When a row is
 * found its FIELD NAMES are logged — no sample has ever been seen, and that
 * one line is what replaces all of this guessing with a single name.
 *
 * Never throws, and never blocks the form. This is a convenience — showing
 * someone what we already know — so a table that does not exist yet must leave
 * the setup exactly as it was.
 */
export interface AdsWebsiteDetails {
  /**
   * The row, which is the whole of it.
   *
   * There was a `fields` half as well — the row turned into label/value pairs
   * for a "What we already know" panel above the form. The panel is gone: it
   * showed everything the row held, including the render engine, the scrape
   * notes and a greeting message, none of which anyone reading a setup form
   * needs. The row now feeds the form's own inputs and nothing else.
   */
  row: Record<string, unknown>;
}

export const getAdsWebsiteDetails = cache(async function getAdsWebsiteDetails(
  userId: string | undefined,
  websiteUrl: string,
  email?: string,
): Promise<AdsWebsiteDetails | null> {
  if (!isBackendConfigured()) return null;
  if (websiteUrl.trim() === "") return null;

  // `user_id` FIRST, and the email only as a fallback. The schema is now
  // confirmed from the DynamoDB console (2026-09-08):
  //
  //   ads-website_details    partition key `user_id` (S)
  //                          sort key      `website_url` (S)
  //
  // So this table is one of the few that is genuinely NOT email-keyed, exactly
  // as the requirement said. The email is kept behind the uid only because the
  // uid that works may not be the Firebase one — see below.
  const identifiers = [userId, email].filter(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  );
  if (identifiers.length === 0) return null;

  const attempts: string[] = [];

  for (const table of TABLE_CANDIDATES) {
    const name = encodeURIComponent(table);
    // `/api/query/{table}/{user_id}` is the call that matches this schema:
    // query on the PARTITION key, which returns every row for the user, and
    // the sort key (`website_url`) is then matched here — a GetItem would need
    // both halves and we only know one for certain.
    //
    // `/api/data-by-uid` is deliberately gone. It resolves a uid to an email
    // before reading, which is the wrong move for a table whose key IS the
    // uid, and it was answering `404 Could not resolve userId to email` — an
    // error about the resolver, mistaken for an error about the table.
    //
    // Spelled out rather than delegated to `readTable` because that keeps only
    // the LAST error, and one route's failure was masking the others' clean
    // "no rows". Which route said what is the whole of the information here.
    const paths = [
      // FIRST, and the one that matches this table. Reading the Lambda's
      // source settled it: `scan-by-uid` filters on `userId` then `user_id`
      // with the value from the URL, which is exactly this table's partition
      // key. It had been dropped from this list before the real table name
      // was known, so the right route and the right name were never tried
      // together.
      ...(userId ? [`/api/scan-by-uid/${name}/${encodeURIComponent(userId)}`] : []),
      // Then the email routes, which CANNOT work here and are kept only so a
      // reshaped table still reads: `/api/query` queries whatever
      // `getPartitionKeyName()` returns — `email` by default, not `user_id` —
      // and its fallback scans `email` fields, which are empty in this row.
      // That is why every one of these answered 200 with no rows.
      ...identifiers.map((id) => `/api/query/${name}/${encodeURIComponent(id)}`),
      ...identifiers.map((id) => `/api/scan/${name}/${encodeURIComponent(id)}`),
    ];

    // The uid route alone first — it is the one that matches this table, and
    // when the row exists it is the only call made. Only when it finds
    // nothing are the remaining routes tried, and those TOGETHER: they were
    // awaited one after another, five round trips in a row on every visit to
    // an ad agent's setup for an account with no row yet. Results are still
    // read in the order listed, so the priority between routes is unchanged.
    const [first, ...rest] = paths;
    const rounds = first === undefined ? [] : [[first], rest];
    for (const round of rounds) {
      if (round.length === 0) continue;
      const settled = await Promise.allSettled(round.map((path) => apiGet<unknown>(path)));
      for (let i = 0; i < round.length; i++) {
        const path = round[i]!;
        const outcome = settled[i]!;
        if (outcome.status === "rejected") {
          const error = outcome.reason;
          const detail =
            error instanceof ApiError ? `${error.status} ${error.message}` : "failed";
          attempts.push(`${path} -> ${detail}`);
          continue;
        }

        const rows = rowsFrom(outcome.value);
        if (rows.length === 0) {
          attempts.push(`${path} -> 200, no rows`);
          continue;
        }

        // Rows came back. Log their KEYS before matching — if the website
        // filter then rejects them, the keys are what say why.
        const keys = [...new Set(rows.flatMap((r) => Object.keys(r as object)))];
        const row = matchWebsiteRow(rows, websiteUrl);
        if (row === null) {
          console.log(
            `[ads-website-details] ${path} -> ${rows.length} row(s), none for ` +
              `${websiteUrl}. Keys: ${keys.join(", ")}`,
          );
          continue;
        }

        console.log(
          `[ads-website-details] FOUND via ${path} for ${websiteUrl}. ` +
            `Fields: ${Object.keys(row).join(", ")}`,
        );
        return { row };
      }
    }
  }

  // One line per route, so "the table is empty", "the route is wrong" and
  // "this account cannot be resolved" stop looking identical.
  console.log(
    `[ads-website-details] no row for ${websiteUrl}. ${attempts.join(" | ")}`,
  );
  return null;
})
