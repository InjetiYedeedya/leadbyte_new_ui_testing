import { strategyForGoal } from "./openai-bidding";
import type { CampaignLocation } from "./campaign-locations";
import { decodePicks, pickProblems, type LocationPick } from "./location-picks";

/** The setup form's location picker posts its places under this name — the same as Google's. */
export const LOCATION_PICKS_INPUT = "locationPicks";

/**
 * The picker's places as the request's locations. One pick is one place at
 * its own level, so a state pick carries no city and a postcode pick carries
 * whatever parents were chosen with it. A pick with no country is dropped:
 * `pickProblems` has already said so.
 */
export function picksToLocations(picks: readonly LocationPick[]): CampaignLocation[] {
  return picks
    .filter((pick) => pick.country.trim() !== "")
    .map((pick) => ({
      country: pick.country,
      state: pick.type === "country" ? "" : (pick.state ?? ""),
      city: pick.type === "city" || pick.type === "zip" ? (pick.city ?? "") : "",
      zip: pick.type === "zip" ? (pick.zip ?? "") : "",
    }));
}
import { budgetMinimum, formatBudget } from "./openai-currency";
import type { AdsBudgetType, AdsGoal, AdsPlatform } from "./ads-types";

/**
 * The ChatGPT Ads setup form: vocabulary, reader and validation.
 *
 * Replaces `openai-ads-setup.ts`, which built an n8n `chatInput`/`campaign_data`
 * payload for webhooks that will never exist. What carried over is the
 * vocabulary — and it carried over because it turned out to be right: the five
 * goals and two budget types match the service's allowed values exactly, so
 * there is no mapping table and no chance of one drifting.
 *
 * ## What is new, and why the form got longer
 *
 * The service requires four things the old form never asked for —
 * `brand_name`, `business_description`, `destination_url` and `context_hints`.
 * Three are collected here (the fourth comes from `generate`'s topics), and all
 * three are PREFILLED from the business profile and the website analysis the
 * app already holds. Prefilled, not hidden: they are sent to a model that
 * writes the advert, and a description someone never saw is a campaign written
 * about a business they do not recognise.
 *
 * ## The one renamed value
 *
 * The platform id is `web`, not `website`. It is changed at the source rather
 * than mapped on the way out, because a mapper is a second place to keep in
 * sync and nothing has ever shipped on the old spelling — this agent has never
 * launched a campaign.
 */

export const ADS_GOALS = [
  { id: "awareness", label: "Awareness" },
  { id: "traffic", label: "Traffic" },
  { id: "leads", label: "Leads" },
  { id: "sales", label: "Sales" },
  { id: "app", label: "App installs" },
] as const satisfies readonly { id: AdsGoal; label: string }[];

/**
 * Goals that optimise for a conversion event, offered only when the account
 * has at least one (the key save's `conversion_events`, 2026-10-03).
 */
export const CONVERSION_GOALS: readonly AdsGoal[] = ["leads", "app"];

export const ADS_BUDGET_TYPES = ["daily", "lifetime"] as const satisfies readonly AdsBudgetType[];

/**
 * Where the ads may run. Multi-select: one campaign can be eligible on iOS and
 * Android at once, and forcing a single choice would mean two campaigns for one
 * intention.
 */
export const ADS_PLATFORMS = [
  { id: "web", label: "Web" },
  { id: "android_app", label: "Android app" },
  { id: "ios_app", label: "iOS app" },
] as const satisfies readonly { id: AdsPlatform; label: string }[];

/**
 * The service's own floor, enforced here as well.
 *
 * Its message says why, and it is worth repeating: keywords alone produce weak
 * topics and copy. Catching it on our side means the customer sees it beside
 * the box while they are still typing, rather than after a round trip.
 */
export const DESCRIPTION_MIN = 40;

export interface ChatGptAdsSetup {
  goal: AdsGoal;
  budgetType: AdsBudgetType | "";
  budgetAmount: number;
  /** What the picker posted, kept so its own problems can be reported. */
  locationPicks: LocationPick[];
  /** Where to run, one entry per picked place. */
  locations: CampaignLocation[];
  /**
   * Where NOT to run — plain country names, not a cascade.
   *
   * Deliberately coarser than `locations`: an exclusion is almost always a
   * whole country, and a second three-level cascade would double the size of
   * the form to express something nobody asks for.
   */
  excludeLocations: string[];
  platforms: AdsPlatform[];
  /**
   * The conversions this campaign optimises for. Conversions goals only.
   *
   * Empty for awareness and traffic, and empty is also what a conversions
   * campaign sends when the account has no events — the service runs it as a
   * clicks campaign and says so, which is better than blocking someone who has
   * not installed a pixel yet.
   */
  conversionEventIds: string[];
  /** `YYYY-MM-DD`, straight from a native date input. */
  startDate: string;
  endDate: string;
  brandName: string;
  businessDescription: string;
  destinationUrl: string;
  /**
   * The bid strategy the customer chose, by `openai-bidding.ts` id.
   *
   * The OBJECTIVE is deliberately not stored: it is derived from the goal, so
   * a stored copy could only ever disagree with it.
   */
  bidStrategy: string;
  /**
   * Zero means "not set" — the payload turns it back into null, because a bid
   * of nothing is not an absent bid.
   *
   * Asked for on the setup step now, not on Review. It used to wait for
   * `advise`'s `bidding.needs_bid_amount`, because nothing before that knew
   * whether a bid was wanted. The customer now picks the strategy themselves
   * (`openai-bidding.ts`), so `requiresBid` answers it up front and the
   * question can sit beside the choice that raises it.
   */
  bidAmount: number;
}

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * An absolute http(s) link, or "".
 *
 * The profile stores a bare host (`novaflow.io`) — Stage 01 accepts one — and
 * the service demands an absolute link. Left as typed, `destination_url` is a
 * relative path and the 422 it earns reads as though the URL were malformed
 * rather than merely scheme-less.
 */
export function absoluteDestination(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function readAdsSetupForm(form: FormData): ChatGptAdsSetup {
  const platforms = form
    .getAll("platforms")
    .map((value) => str(value))
    // Anything the form did not offer is dropped rather than forwarded: a
    // platform the service has no branch for is a campaign running somewhere
    // nobody chose.
    .filter((value): value is AdsPlatform => ADS_PLATFORMS.some((p) => p.id === value));

  return {
    goal: (ADS_GOALS.find((goal) => goal.id === str(form.get("goal")))?.id ?? "leads") as AdsGoal,
    // "" when none was chosen: the form starts on "Select type", and guessing
    // Daily here would launch a budget the customer never picked.
    budgetType: ADS_BUDGET_TYPES.find((t) => t === str(form.get("budgetType"))) ?? "",
    budgetAmount: Number(str(form.get("budgetAmount"))) || 0,
    locationPicks: decodePicks(form.get(LOCATION_PICKS_INPUT)),
    locations: picksToLocations(decodePicks(form.get(LOCATION_PICKS_INPUT))),
    excludeLocations: form
      .getAll("excludeLocations")
      .map((value) => str(value))
      .filter((value) => value !== ""),
    platforms,
    conversionEventIds: form
      .getAll("conversionEventIds")
      .map((value) => str(value))
      .filter((value) => value !== ""),
    startDate: str(form.get("startDate")),
    endDate: str(form.get("endDate")),
    brandName: str(form.get("brandName")),
    businessDescription: str(form.get("businessDescription")),
    // The setup form now asks one URL PER PLATFORM (`destination_url`,
    // `app_store_url`, `play_store_url`), so the campaign's own
    // `destination_url` is the website when there is one and the store listing
    // otherwise — a campaign that runs only in an app store still has to name
    // somewhere, and the service refuses a blank. `destinationUrl` is still
    // read first for a draft saved before the split.
    destinationUrl: absoluteDestination(
      str(form.get("destinationUrl")) ||
        str(form.get("destination_url")) ||
        str(form.get("app_store_url")) ||
        str(form.get("play_store_url")),
    ),
    // `|| 0` collapses "", whitespace and NaN to the same thing, which is what
    // an untouched optional field means.
    bidAmount: Number(str(form.get("bidAmount"))) || 0,
    bidStrategy: str(form.get("bidStrategy")),
  };
}

/**
 * Everything wrong with the setup, all at once.
 *
 * Same shape as the service's own 422, and for the same reason: showing one
 * problem per submit turns a six-field form into six round trips.
 *
 * The bid rule is NOT checked here — whether a bid is required depends on the
 * goal AND on what `advise` said about the bidding strategy, neither of which
 * this step knows. `requestProblems` in `ads-campaign-request.ts` owns it.
 *
 * `currency` is the ad account's, read from `verify` (`OpenAiAccount`). The
 * budget is typed in it, so the platform's minimum has to be checked against it
 * — a USD account's floor is $25 daily / $100 lifetime. It is optional and
 * defaults to the "more than zero" rule alone, so callers with no account yet
 * (and every existing test) behave exactly as before.
 */
export function validateAdsSetup(setup: ChatGptAdsSetup, currency?: string): string[] {
  const problems: string[] = [];

  if (setup.brandName === "") problems.push("Add the business name the ads are for.");

  if (setup.businessDescription.length < DESCRIPTION_MIN) {
    problems.push(
      `Describe the business in at least ${DESCRIPTION_MIN} characters — keywords alone produce weak topics and copy.`,
    );
  }

  if (setup.destinationUrl === "") {
    problems.push("Add the page the ads should send people to.");
  }

  if (setup.budgetType === "") problems.push("Choose a budget type.");

  if (!(setup.budgetAmount > 0)) {
    problems.push("Budget must be more than zero.");
  } else if (currency && setup.budgetType !== "") {
    // The platform's own floor, in the account's currency. `budgetMinimum`
    // returns 0 for a currency with no published floor, which can never fail
    // this — so only currencies we actually know about (USD today) add a rule.
    const floor = budgetMinimum(currency, setup.budgetType);
    if (setup.budgetAmount < floor) {
      const kind = setup.budgetType === "lifetime" ? "Lifetime" : "Daily";
      problems.push(`${kind} budget must be at least ${formatBudget(floor, currency)}.`);
    }
  }

  if (setup.startDate === "" || setup.endDate === "") {
    problems.push("Choose a start and an end date.");
  } else if (setup.endDate <= setup.startDate) {
    // String comparison is exact for `YYYY-MM-DD` and needs no timezone, which
    // a `new Date()` round trip would introduce. Equal dates are refused too: a
    // window of zero length is a campaign that cannot run.
    problems.push("The end date must be after the start date.");
  }

  if (setup.platforms.length === 0) {
    problems.push("Choose at least one platform to run on.");
  }

  // The form's country select is `required`, so a browser stops this — but a
  // POST is not a browser, and the two have to agree or the check is theatre.
  // An empty list means the campaign targets everywhere and spends the budget
  // proving it.
  const placeProblems = pickProblems(setup.locationPicks);
  if (placeProblems.length > 0) {
    problems.push(...placeProblems);
  } else if (setup.locations.length === 0) {
    problems.push("Add at least one place for the ads to run.");
  }

  if (setup.bidAmount < 0) problems.push("Bid amount cannot be negative.");

  // A manual strategy with no amount is the one combination that silently
  // becomes something else: the payload sends null, the service then bids
  // automatically, and the budget goes out a way the customer did not pick.
  // Reach offers no automatic option at all, so this is its only guard.
  const strategy = strategyForGoal(setup.goal, setup.bidStrategy);
  // Over the cap is a 409 AFTER the campaign exists, and `create` is never
  // retried — the customer is left with an orphan. Caught here, it is a
  // sentence beside the field.
  if (strategy.cap !== undefined && setup.bidAmount > strategy.cap) {
    problems.push(
      `The most a ${strategy.label.toLowerCase()} accepts is ${strategy.cap}. A higher bid is refused after the campaign is created.`,
    );
  }
  if (strategy.requiresBid && !(setup.bidAmount > 0)) {
    problems.push(`Enter a bid amount for "${strategy.label}".`);
  }

  return problems;
}
