import { NOT_PROVIDED, type CampaignField } from "@/lib/data/ads-chat-payload";

/**
 * The few facts that say WHICH campaign just went out, for the "We are
 * creating your campaign" dialog.
 *
 * The dialog used to be one generic sentence, the same for every campaign,
 * and testers read it as a placeholder (LBS-1147 d). The plan is cleared at
 * launch, so these are taken from it just before and travel in a short-lived
 * cookie (`launch-summary-cookie.ts`).
 *
 * Only what the customer told us: each row is read from their own answers,
 * and a row with nothing behind it is left out, never filled in. Labels
 * differ by platform and between the setup and details forms, so each fact is
 * found by a pattern over both. Pure, so it is tested.
 */

export type SummaryRow = readonly [label: string, value: string];

const EMPTY = new Set(["", NOT_PROVIDED.toLowerCase(), "not applicable", "no offer", "any time"]);

/**
 * Our label, then the patterns its answer may sit under, in order of
 * preference: "Budget display" ("₹500 per day") says more than the bare
 * "Budget amount" beside it.
 */
const FACTS: ReadonlyArray<readonly [string, readonly RegExp[]]> = [
  ["Campaign", [/^campaign name\b/i]],
  ["Goal", [/^(ad goal|campaign (goal|objective)|objective)\b/i]],
  ["Budget", [/^budget display$/i, /^(daily |total )?budget( amount)?\b/i]],
  ["Starts", [/^(campaign )?start date\b/i]],
  ["Ends", [/^(campaign )?end date\b/i]],
  ["Offer", [/^offer value$/i]],
];

const MODE: Record<"full" | "semi", string> = {
  full: "Full automation — the agent writes the ad",
  semi: "Semi automation — your own creative",
};

export function buildLaunchSummary(
  fields: readonly CampaignField[],
  answers: Record<string, string> | undefined,
  mode: "full" | "semi" | undefined,
): SummaryRow[] {
  // The details form is the later, more specific answer, so it is read first.
  const pairs: Array<readonly [string, string]> = [...Object.entries(answers ?? {}), ...fields];
  const rows: SummaryRow[] = [];
  const filled = (value: string) => !EMPTY.has(value.trim().toLowerCase());
  for (const [label, patterns] of FACTS) {
    for (const pattern of patterns) {
      const hit = pairs.find(([key, value]) => pattern.test(key.trim()) && filled(value));
      if (hit) {
        rows.push([label, hit[1].trim().slice(0, 120)]);
        break;
      }
    }
  }
  if (mode) rows.push(["Mode", MODE[mode]]);
  return rows;
}
