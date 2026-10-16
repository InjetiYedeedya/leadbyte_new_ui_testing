import type { CampaignLocation } from "./campaign-locations";
import type { AdsAdType, AdsBidding, AdsCampaignRequest, ApiLocation } from "./ads-types";
import type { ChatGptAdsSetup } from "./chatgpt-ads-setup";
import type { AdsFieldProblem } from "./ads-errors";
import { strategyForGoal } from "./openai-bidding";
import type { DestinationField } from "./ads-destination";

/**
 * Turning what the customer filled in into the object `prepare` and `create`
 * take.
 *
 * One builder for both, because the service takes an identical body for each —
 * which is the point of `prepare`: it is `create` with the spending removed, so
 * anything it accepts, `create` will accept. Two builders would let the
 * rehearsal and the performance drift.
 */

/** The copy, after `generate` wrote it and the customer edited it. */
export interface AdsCopy {
  title: string;
  description: string;
  topics: string[];
}

/**
 * A cascade of places → the objects the service wants.
 *
 * ## Objects, not strings
 *
 * This returned `["South Plainfield, New York, United States"]` — one flat
 * string per place, most specific first, and marked UNCONFIRMED because the
 * contract's only example was `["United States"]`. The backend answered
 * (2026-09-16): each place is an OBJECT, `country` always required, narrowed
 * by whichever levels were chosen. Plain strings are still accepted, so this
 * is not a breaking change on their side — but a parsed string is a guess
 * about where the commas fall, and an object is not.
 *
 * ## A postcode REPLACES state and city
 *
 * `{ country, postal_code }`, never all four. That is the contract's own
 * table: a postcode already names somewhere more precisely than a city does,
 * and sending both invites the two to disagree.
 *
 * `formatLocations()` is deliberately NOT used: it builds the four separate
 * `Location`/`Country`/`State`/`City` strings the n8n webhooks read. That is a
 * different contract for a different backend.
 */
export function toApiLocations(locations: readonly CampaignLocation[]): ApiLocation[] {
  const seen = new Set<string>();
  const places: ApiLocation[] = [];

  for (const place of locations) {
    const country = place.country.trim();
    // Without a country there is no place — and `country` is the one field the
    // service requires, so a row missing it would be a guaranteed 422.
    if (country === "") continue;

    const state = place.state.trim();
    const city = place.city.trim();
    const postal = place.zip.trim();

    const target: ApiLocation = { country };
    if (postal !== "") {
      target.postal_code = postal;
    } else {
      // Each level only means something with the one above it: a city with no
      // state is ambiguous across countries, so a gap stops the narrowing.
      if (state !== "") target.state = state;
      if (state !== "" && city !== "") target.city = city;
    }

    // Deduped on the built target, not the raw row: two rows that narrow to
    // the same place are one place, however they were typed.
    const key = JSON.stringify(target);
    if (seen.has(key)) continue;
    seen.add(key);
    places.push(target);
  }

  return places;
}

/**
 * The places to keep out, in the same object shape as the targets.
 *
 * An exclusion is only ever a country here — the form offers nothing narrower —
 * so every entry is a bare `{ country }`. Blanks are dropped rather than sent
 * as an empty country, which the service reads as a place and refuses.
 */
/**
 * The same places as ONE-LINE LABELS, for the calls that still want strings.
 *
 * `advise` and `generate` are not the campaign request. They take a
 * `locations` list of their own and their handler joins it — a live run
 * answered `sequence item 0: expected str instance, dict found`, which is
 * Python's `", ".join()` refusing a dict. So objects go to `prepare` and
 * `create`, where the contract asks for them, and these two keep the strings
 * they have always had.
 *
 * Most specific first, the way an address reads, and commas rather than the
 * `>` the n8n webhooks use — this list is read by a language model, not by a
 * resolver.
 */
export function toLocationLabels(locations: readonly CampaignLocation[]): string[] {
  const labels: string[] = [];
  for (const place of locations) {
    const parts = [place.zip, place.city, place.state, place.country]
      .map((part) => part.trim())
      .filter((part) => part !== "");
    // The country is the last part, so nothing here means no place at all.
    if (place.country.trim() === "") continue;
    const label = parts.join(", ");
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
}

export function toApiExcludes(countries: readonly string[]): ApiLocation[] {
  const seen = new Set<string>();
  const places: ApiLocation[] = [];
  for (const raw of countries) {
    const country = raw.trim();
    if (country === "" || seen.has(country)) continue;
    seen.add(country);
    places.push({ country });
  }
  return places;
}

/**
 * Whether this campaign has to name a bid.
 *
 * Two sources, and the order between them is the whole point:
 *
 *   - **the STRATEGY the customer chose** decides, and nothing overrides it
 *     downward. `openai-bidding.ts` marks each one `requiresBid`; a manual
 *     strategy needs an amount, by definition of being manual;
 *   - `advise`'s `bidding.needs_bid_amount` can only ADD a requirement.
 *
 * `advise` used to win outright, and that was the second half of the live bug
 * below. Look at what it is ASKED (`ads-api.ts`): goal, budget, locations,
 * dates, tracking — **no strategy**. So its `bidding` block says what the
 * service would have picked, not what the customer picked, and letting it
 * answer `needs_bid_amount: false` over an explicit "Maximum CPC bid" dropped
 * a cap the customer had typed. The asymmetry is deliberate: adding a
 * requirement asks one more question, removing one spends money unattended.
 *
 * This read `setup.goal === "awareness"` until 2026-09-17, which was a proxy
 * for the strategy from before there was a strategy picker. Awareness is the
 * only goal whose sole strategy is manual, so the proxy was right there and
 * wrong everywhere else: **Traffic + "Maximum CPC bid" sent
 * `bid_amount: null`** — the customer named a cap, the form never asked for it
 * because the check said it was not needed, and the campaign went out with
 * automatic bidding instead of the manual one they picked. Conversions +
 * "Manual: maximum bid" had the same hole.
 *
 * Asking when neither says to is worse than cosmetic: `needs_bid_amount: false`
 * means bidding is automatic and a bid amount is *not wanted at all*, so a
 * number typed into a box we should not have shown becomes a cap the customer
 * never meant to set.
 */
export function needsBidAmount(setup: ChatGptAdsSetup, bidding?: AdsBidding): boolean {
  // The customer's own pick first, and it cannot be overruled downward.
  if (strategyForGoal(setup.goal, setup.bidStrategy).requiresBid) return true;
  // The service may ADD a requirement we did not know about.
  return bidding?.needs_bid_amount === true;
}

/**
 * What still stops this campaign being sent, as field problems.
 *
 * Shaped like the service's own 422 rows so the review screen has one renderer
 * for "what we noticed" and "what it refused", and the `field` values match the
 * API's names rather than our input names — this is the last checkpoint before
 * a request, so its vocabulary should be the request's.
 */
export function requestProblems(
  setup: ChatGptAdsSetup,
  copy: AdsCopy,
  adType: AdsAdType,
  image: { imageUrl?: string; outputKey?: string },
  bidding?: AdsBidding,
): AdsFieldProblem[] {
  const problems: AdsFieldProblem[] = [];

  if (copy.title.trim() === "") {
    problems.push({ field: "headline", message: "write a headline" });
  }
  if (copy.description.trim() === "") {
    problems.push({ field: "description", message: "write a description" });
  }
  if (copy.topics.filter((topic) => topic.trim() !== "").length === 0) {
    problems.push({
      field: "context_hints",
      message: "at least one topic is required — topics are the only targeting this platform offers",
    });
  }

  // The service refuses a place that is both targeted and excluded, and it is
  // right to: the two instructions cannot both be obeyed, so whichever wins is
  // a coin toss the customer did not call.
  // Compared on COUNTRY, because that is all an exclusion names. Excluding
  // "United States" while targeting a city inside it is the same contradiction
  // as excluding a country targeted outright, and the service refuses both.
  const targeted = new Set(toApiLocations(setup.locations).map((place) => place.country));
  const both = setup.excludeLocations.filter((place) => targeted.has(place.trim()));
  if (both.length > 0) {
    problems.push({
      field: "exclude_locations",
      message: `${both.join(", ")} is both targeted and excluded — remove it from one of the two`,
    });
  }

  if (needsBidAmount(setup, bidding) && !(setup.bidAmount > 0)) {
    problems.push({
      field: "bid_amount",
      message: "name the most you will pay — this campaign has no automatic bidding",
    });
  }

  // The two halves of the ad_type contract, which the service enforces with a
  // 422 each. Catching them here is the difference between a message beside the
  // control and a round trip.
  if (adType === "semi" && (image.imageUrl ?? "") === "") {
    problems.push({ field: "image_url", message: "upload the image this ad should show" });
  }
  if (adType === "full" && (image.outputKey ?? "") === "") {
    problems.push({
      field: "output_key",
      message: "the image has not finished rendering yet",
    });
  }

  return problems;
}

/**
 * The campaign object itself.
 *
 * `output_key` is NOT here on purpose — for `create` it is a SIBLING of
 * `request`, not a member of it (`{action, request, output_key}`). Putting it
 * inside would leave the service seeing no rendered image and answering
 * `ImageMissing`, which is the guard that stops an ad going live with no
 * picture at all. `createCampaign` in `ads-api.ts` owns that placement.
 */
export function buildCampaignRequest(
  setup: ChatGptAdsSetup,
  copy: AdsCopy,
  adType: AdsAdType,
  {
    imageUrl,
    launchImmediately = false,
    bidding,
    destinations,
    smartLinkUrl,
    conversionEventIds,
  }: {
    imageUrl?: string;
    launchImmediately?: boolean;
    bidding?: AdsBidding;
    /** The per-platform links, from `draft.destinations`. */
    destinations?: Partial<Record<DestinationField, string>>;
    /** The link `generate` already minted, from `draft.destination`. */
    smartLinkUrl?: string;
    /**
     * Defaults to the setup's own answer — this override exists for a caller
     * that has a fresher list than the draft.
     */
    conversionEventIds?: readonly string[];
  } = {},
): AdsCampaignRequest {
  const strategy = strategyForGoal(setup.goal, setup.bidStrategy);
  const request: AdsCampaignRequest = {
    goal: setup.goal,
    budget_type: setup.budgetType || "daily", // never "" here: validateAdsSetup refused it
    budget_amount: setup.budgetAmount,
    locations: toApiLocations(setup.locations),
    exclude_locations: toApiExcludes(setup.excludeLocations),
    platforms: setup.platforms,
    brand_name: setup.brandName,
    business_description: setup.businessDescription,
    destination_url: setup.destinationUrl,
    start_date: setup.startDate,
    end_date: setup.endDate,
    ad_type: adType,
    // Null, never 0. The contract treats a bid as "the most you will pay", so a
    // zero is an instruction to pay nothing and win nothing — not "unset".
    bid_amount: needsBidAmount(setup, bidding) && setup.bidAmount > 0 ? setup.bidAmount : null,
    headline: copy.title.trim(),
    description: copy.description.trim(),
    context_hints: copy.topics.map((topic) => topic.trim()).filter((topic) => topic !== ""),
    // Always present, empty array included — see the note on the field.
    conversion_event_setting_ids: (conversionEventIds ?? setup.conversionEventIds ?? []).filter(
      (id) => id.trim() !== "",
    ),
    // Default false: the campaign is created PAUSED and someone looks at it
    // before it spends.
    launch_immediately: launchImmediately,
  };

  // The strategy the customer picked, where the service has a name for it.
  // Omitted rather than guessed for Conversions' manual bid — see `wire` in
  // `openai-bidding.ts`. Without this a Traffic campaign bid at "Maximum CPC"
  // was indistinguishable from an automatic one.
  if (strategy.wire) {
    request.bid_strategy = strategy.wire;
  }

  // Semi only. For full automation the contract says the field is FORBIDDEN,
  // not optional — so it is omitted entirely rather than sent as null, which is
  // a different message.
  if (adType === "semi" && (imageUrl ?? "") !== "") {
    request.image_url = imageUrl;
  }

  // The destinations this request never carried until 2026-09-21.
  //
  // `destination_url` above is ONE of them — whichever won the fallback in
  // `readAdsSetupForm` — so a three-platform campaign arrived describing only
  // the website. The service then re-resolved with one usable link, set
  // `needs_smart_link` false, and never minted anything: every stored campaign
  // came back `dynamic_url: ''`.
  //
  // Each is omitted when blank rather than sent empty, for the same reason as
  // everywhere else: an empty destination is a link to nowhere, and the service
  // would have to treat it as one.
  const appStore = destinations?.app_store_url?.trim();
  const playStore = destinations?.play_store_url?.trim();
  const smartLink = smartLinkUrl?.trim();
  if (appStore) request.app_store_url = appStore;
  if (playStore) request.play_store_url = playStore;
  // Sent so the service REUSES the link it already minted rather than keying a
  // second one on the same three destinations and splitting the reporting.
  if (smartLink) request.smart_link_url = smartLink;

  return request;
}
