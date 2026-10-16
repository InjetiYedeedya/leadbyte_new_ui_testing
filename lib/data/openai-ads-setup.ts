import { AUTOMATION_MODES } from "./google-ads-setup";
import { buildChatPayload, orAbsent } from "./ads-chat-payload";
import { formatLocations, readLocations, type CampaignLocation } from "./campaign-locations";

/**
 * The OpenAI Ads agent's setup: vocabulary, validation and payload.
 *
 * Parallel to `google-ads-setup.ts` and `meta-ads-setup.ts` — the same three
 * exported functions in the same order — because anyone changing one will come
 * looking for the others. What differs is real:
 *
 *   - **The customer supplies an API key, not an OAuth grant.** The other
 *     three platforms are connected by walking the browser through a consent
 *     screen (`/api/ads/connect`); this one is a secret typed into a box. It
 *     lives in an httpOnly cookie (`openai-key.ts`) and is passed in here
 *     rather than read from a form field, so it cannot arrive from the
 *     browser.
 *   - **The campaign window is a date range**, not "run for N days". So there
 *     is no `campaignWindow()` call: the two dates ARE the answer, and
 *     deriving them from a duration would throw away what the customer chose.
 *   - **It asks which platforms are eligible** (iOS / Android / web), which no
 *     other setup form does.
 *   - **There is no offer, age, gender or interest targeting here.** Those are
 *     Meta and Google's vocabulary; adding fields this platform has no branch
 *     for would be inventing a contract.
 *
 * ## The contract, and how much of it is confirmed
 *
 * Nothing here is confirmed. There is no captured execution and no n8n
 * workflow for OpenAI Ads yet (checked 2026-09-10: no `openai` reference
 * anywhere in the repo or `docs/`), so the paths in `AGENT_BACKENDS` are
 * deliberately absent and the field labels below are OUR choice, written to
 * match the other platforms' style. When the backend team answers, expect the
 * labels to be the thing that needs correcting — they are read by name.
 */

export { AUTOMATION_MODES };

/**
 * What the campaign is for.
 *
 * Deliberately short and platform-neutral: Meta's six goals and Google's are
 * each that platform's own product vocabulary, and guessing an OpenAI-specific
 * list would be inventing one. These five are what "goal" means for any ad
 * campaign, and the backend switches on the id.
 */
export const OPENAI_GOALS = [
  { id: "awareness", label: "Awareness" },
  { id: "traffic", label: "Traffic" },
  { id: "leads", label: "Leads" },
  { id: "sales", label: "Sales" },
  { id: "app", label: "App installs" },
] as const;

export type OpenAiGoalId = (typeof OPENAI_GOALS)[number]["id"];

/** Daily or lifetime, the two the budget step offers. */
export const OPENAI_BUDGET_TYPES = ["daily", "lifetime"] as const;

/**
 * Where the ads may run.
 *
 * Multi-select: one campaign can be eligible on iOS and Android at once, and
 * forcing a single choice would mean two campaigns for one intention.
 */
export const OPENAI_PLATFORMS = [
  { id: "ios", label: "iOS" },
  { id: "android", label: "Android" },
  { id: "website", label: "Website" },
] as const;

export type OpenAiPlatformId = (typeof OPENAI_PLATFORMS)[number]["id"];

export interface OpenAiAdsSetup {
  goal: OpenAiGoalId;
  /** Every place the campaign should run. See `campaign-locations.ts`. */
  locations: CampaignLocation[];
  budgetType: string;
  budgetAmount: number;
  /** `YYYY-MM-DD`, straight from a native date input. */
  startDate: string;
  endDate: string;
  platforms: OpenAiPlatformId[];
  /** Optional. Zero means "not set" — see `readOpenAiAdsForm`. */
  bidAmount: number;
}

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readOpenAiAdsForm(form: FormData): OpenAiAdsSetup {
  const platforms = form
    .getAll("platforms")
    .map((value) => str(value))
    // Anything the form did not offer is dropped rather than forwarded: a
    // platform the backend has no branch for is a campaign that targets
    // something nobody chose.
    .filter((value): value is OpenAiPlatformId =>
      OPENAI_PLATFORMS.some((platform) => platform.id === value),
    );

  return {
    goal: (OPENAI_GOALS.find((goal) => goal.id === str(form.get("goal")))?.id ??
      "leads") as OpenAiGoalId,
    locations: readLocations(form),
    budgetType:
      OPENAI_BUDGET_TYPES.find((type) => type === str(form.get("budgetType"))) ?? "daily",
    budgetAmount: Number(str(form.get("budgetAmount"))) || 0,
    startDate: str(form.get("startDate")),
    endDate: str(form.get("endDate")),
    platforms,
    // `|| 0` collapses "", whitespace and NaN to the same thing, which is what
    // an untouched optional field means. The payload turns it back into
    // "not provided" rather than sending a zero bid.
    bidAmount: Number(str(form.get("bidAmount"))) || 0,
  };
}

export function validateOpenAiAds(setup: OpenAiAdsSetup): string[] {
  const problems: string[] = [];

  if (!(setup.budgetAmount > 0)) problems.push("Budget must be more than zero.");

  if (setup.startDate === "" || setup.endDate === "") {
    problems.push("Choose a start and an end date.");
  } else if (setup.endDate <= setup.startDate) {
    // String comparison is exact for `YYYY-MM-DD` and needs no timezone, which
    // a `new Date()` round-trip would introduce. Equal dates are refused too:
    // a window of zero length is a campaign that cannot run.
    problems.push("The end date must be after the start date.");
  }

  if (setup.platforms.length === 0) {
    problems.push("Choose at least one platform to run on.");
  }

  // The form's country select is `required`, so a browser stops this — but a
  // POST is not a browser, and the two have to agree or the check is theatre.
  // Unlike Meta's form, this one does ask for a location (`readLocations`
  // already drops any row with no country), so an empty list here means the
  // campaign would target everywhere and spend the budget proving it.
  if (setup.locations.length === 0) {
    problems.push("Add at least one place for the ads to run.");
  }

  if (setup.bidAmount < 0) problems.push("Bid amount cannot be negative.");

  return problems;
}

/**
 * The OpenAI Ads chat payload.
 *
 * `campaign_data` and `chatInput` are built from one list so they cannot
 * disagree — see `ads-chat-payload.ts` for why the same facts go out twice.
 *
 * ## The API key is not one of the fields
 *
 * It rides as its own top-level key via `extras`, and it is kept out of both
 * `chatInput` and `campaign_data` on purpose. `chatInput` is a prompt handed
 * to a model, and `campaign_data` is stored on the suggestion and read back
 * two pages later — a secret in either can surface in the agent's own reply or
 * in a stored row that was never meant to hold credentials.
 */
export function openAiAdsPayload(
  setup: OpenAiAdsSetup,
  {
    email,
    userId,
    sessionId,
    apiKey,
  }: { email: string; userId?: string; sessionId: string; apiKey: string },
): Record<string, unknown> {
  const place = formatLocations(setup.locations);
  const platforms = setup.platforms
    .map((id) => OPENAI_PLATFORMS.find((platform) => platform.id === id)?.id ?? id)
    .join(", ");

  return buildChatPayload({
    intro:
      "My OpenAI Ads AI Agent setup is complete. Please help me finalize and create the campaign.",
    email,
    userId,
    sessionId,
    actionType: "get_suggestion",
    fields: [
      ["Ad goal", setup.goal],
      ["Location", place.location],
      ["Country", place.country],
      ["State", place.state],
      ["City", place.city],
      ["Budget type", setup.budgetType],
      ["Budget amount", String(setup.budgetAmount)],
      ["Campaign start date", setup.startDate],
      ["Campaign end date", setup.endDate],
      ["Eligible platforms", platforms],
      // `orAbsent` rather than the number: a zero here would read as an
      // instruction to bid nothing.
      ["Bid amount", orAbsent(setup.bidAmount > 0 ? setup.bidAmount : "")],
    ],
    extras: { openai_api_key: apiKey },
  });
}
