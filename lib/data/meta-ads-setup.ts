import { AGE_RANGES, AUTOMATION_MODES, GENDERS } from "./google-ads-setup";
import {
  budgetStrings,
  buildChatPayload,
  isCalendarDay,
  orAbsent,
  utcDay,
  type CampaignField,
} from "./ads-chat-payload";
import { formatLocations, readLocations, type CampaignLocation } from "./campaign-locations";
import {
  decodePick,
  decodePicks,
  readAudienceType,
  type AudienceType,
  type PickedOption,
} from "./ads-lists";
import { offerValue, readOffer, type AdOffer } from "./ads-offer";
import { postLaunchExtras, readPostReference } from "./engagement-post";

/**
 * The Meta Ads agent's setup: vocabulary, validation and payload.
 *
 * Deliberately parallel to `google-ads-setup.ts` — same three exported
 * functions, same shape — because the two forms ask most of the same questions
 * and anyone changing one will look for the other. What differs is real and is
 * listed here rather than discovered later:
 *
 *   - Meta's goals are its own (`awareness`, `engagement`, `sales`…), and four
 *     of the six carry sub-goals rather than Google's two.
 *   - Budget is daily or lifetime, the same two as Google — the legacy app's
 *     own values, and the only two Meta has. It read "daily or monthly" until
 *     2026-10-01; "monthly" was never in the legacy app and is not a Meta
 *     budget at all.
 *   - `customTiming` forces a lifetime budget (Meta allows ad scheduling only
 *     on one); the toggle is therefore a budget decision wearing a schedule's
 *     clothes.
 *   - Interests exist here and nowhere else, and a new audience needs one.
 *   - The campaign runs between two chosen dates, as Google's does, but a
 *     custom schedule picks hours from `META_HOURS` (6 AM to 11 PM) behind a
 *     toggle that forces a lifetime budget; Google's hours are optional and
 *     run the whole day.
 *
 * ## The contract
 *
 *   POST /api/webhook/meta-ads-chat   action_type: get_suggestion | approved
 *                                                  | revise | user_suggestion
 *   POST /api/webhook/adsreceiver     agent_type: meta_ads
 *   POST /api/data/leadbyte_meta_ads  the saved setup
 */

export { AGE_RANGES, AUTOMATION_MODES, GENDERS };

export const META_GOALS = [
  { id: "awareness", label: "Awareness", subGoals: ["Reach", "Impressions"] },
  { id: "traffic", label: "Traffic", subGoals: ["Link clicks", "Landing page views"] },
  { id: "engagement", label: "Engagement", subGoals: [] },
  {
    id: "leads",
    label: "Leads",
    // The legacy spec's six, in its order (MA-STEP-04).
    subGoals: ["Instant forms", "Phone calls", "Website", "Instagram", "Messenger", "WhatsApp"],
  },
  { id: "app", label: "App promotion", subGoals: ["Installs", "In-app events"] },
  { id: "sales", label: "Sales", subGoals: [] },
] as const;

export type MetaGoalId = (typeof META_GOALS)[number]["id"];

/**
 * The goals a discount offer means something for. The form asks the goal FIRST
 * and shows the Offer question only for these (product notes, 2026-09-30: the
 * goal decides what comes next) — "10% off" on a reach campaign is noise.
 * Enforced here too, so an offer left over from switching goals never ships.
 */
export const META_OFFER_GOALS: readonly MetaGoalId[] = ["traffic", "leads", "sales"];

export function goalTakesOffer(goal: string): boolean {
  return (META_OFFER_GOALS as readonly string[]).includes(goal);
}

/**
 * Interest categories.
 *
 * The live app's list is longer than the spec quoted ("Fitness…Other"), so this
 * is the readable subset plus `Other`, which is what the free-text box is for.
 * Adding to it is safe; the backend takes whatever strings are sent.
 */
/**
 * What the creative should be.
 *
 * Chosen at setup because it is the one input the three-model creative writer
 * cannot infer: `POST /api/creative/generate-prompts` takes `ad_format`, and
 * an image prompt and a video prompt are different pieces of writing. It was
 * hardcoded to `"image"`, so asking for video produced image prompts.
 */
export const AD_FORMATS = ["image", "video"] as const;

export const INTERESTS = [
  "Fitness",
  "Travel",
  "Technology",
  "Fashion",
  "Food & drink",
  "Finance",
  "Education",
  "Real estate",
  "Health",
  "Entertainment",
  "Other",
] as const;

/** Daily or lifetime — the legacy app's two, and the only two Meta offers. */
export const META_BUDGET_TYPES = ["daily", "lifetime"] as const;

/**
 * Meta's offer: the customer's own words, or none (MA-STEP-03). The model is
 * shared with Google (`ads-offer.ts`); these names are kept for Meta's callers.
 */
export {
  AD_OFFERS as META_OFFERS,
  OFFER_PRESETS as META_OFFER_PRESETS,
  offerValue as metaOfferValue,
} from "./ads-offer";
export type MetaOffer = AdOffer;

function hourLabel(hour: number): string {
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:00 ${hour < 12 ? "AM" : "PM"}`;
}

/**
 * The hours a custom schedule can start or end on: 6:00 AM to 11:00 PM, as
 * the legacy flow lists them (MA-STEP-07). The label IS the posted value, and
 * "Schedule start time" carries it as written.
 */
export const META_HOURS: readonly string[] = Array.from({ length: 18 }, (_, i) => hourLabel(i + 6));

/** The 24-hour clock hour of a `META_HOURS` label, or -1 for anything else. */
export function metaHourOf(label: string): number {
  const index = META_HOURS.indexOf(label);
  return index === -1 ? -1 : index + 6;
}

/**
 * The instant form the agent creates for the customer, offered after the
 * account's own forms (legacy §6.4). Posted like any other pick; `custom` is
 * what "Instant form ID" carries for it.
 */
export const META_CUSTOM_FORM = { id: "custom", name: "Custom Form" } as const;

export function metaGoalById(id: string): (typeof META_GOALS)[number] | undefined {
  return META_GOALS.find((goal) => goal.id === id);
}

export interface MetaAdsSetup {
  businessName: string;
  /** Every place the campaign should run. See `campaign-locations.ts`. */
  locations: CampaignLocation[];
  service: string;
  offer: MetaOffer;
  /** The offer in the customer's words. Empty unless `offer` is `custom`. */
  customOffer: string;
  goal: MetaGoalId;
  /**
   * True when the form posted no goal at all. The form starts with nothing
   * chosen (2026-10-06), so this is reported as a problem rather than
   * silently defaulted to Leads, which `goal` still falls back to only so the
   * type stays a real goal.
   */
  goalMissing?: boolean;
  subGoal: string;
  ages: string[];
  gender: string;
  interests: string[];
  customInterest: string;
  /** `YYYY-MM-DD`, from the date inputs. Empty when missing or not a real day. */
  startDate: string;
  endDate: string;
  customTiming: boolean;
  /** A `META_HOURS` label, or empty when custom timing is off or the value was not one. */
  scheduleStart: string;
  scheduleEnd: string;
  budgetType: string;
  budgetAmount: number;
  /** `image` or `video`. Drives the creative writer's `ad_format`. */
  adFormat: string;
  automationMode: string;
  /** New audience, or retargeting the saved audiences below. */
  audienceType: AudienceType;
  audiences: PickedOption[];
  /** Leads → Instant forms only: the Meta instant form the ads collect into. */
  leadForm: PickedOption | null;
  /**
   * Engagement only: the published post to promote — its id, Meta's
   * `pageId_postId`, or its link (`engagement-post.ts`). "" otherwise, and
   * "" when what was typed is none of those.
   */
  engagementPost: string;
  /** True when an Engagement campaign was sent something that is not a post. */
  engagementPostInvalid?: boolean;
}

/** The Leads sub-goal that must name one of the account's instant forms. */
export const INSTANT_FORM_SUBGOAL = "Instant forms";

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function day(value: FormDataEntryValue | null): string {
  const text = str(value);
  return isCalendarDay(text) ? text : "";
}

function hour(value: FormDataEntryValue | null): string {
  const text = str(value);
  return META_HOURS.includes(text) ? text : "";
}

export function readMetaAdsForm(form: FormData): MetaAdsSetup {
  const chosenGoal = metaGoalById(str(form.get("goal")));
  const goal = (chosenGoal?.id ?? "leads") as MetaGoalId;
  // Anything but the two current answers — a stale "5" from an old draft, or a
  // goal that takes no offer — is no offer.
  const offer: MetaOffer =
    goalTakesOffer(goal) ? readOffer(form.get("offer")) : "none";
  const ages = form.getAll("ages").map((value) => str(value)).filter(Boolean);
  const interests = form.getAll("interests").map((value) => str(value)).filter(Boolean);
  const customTiming = str(form.get("customTiming")) !== "";
  const subGoal = (metaGoalById(goal)?.subGoals as readonly string[] | undefined)?.includes(
    str(form.get("subGoal")),
  )
    ? str(form.get("subGoal"))
    : "";
  const audienceType = readAudienceType(form.get("audienceType"));
  // Only an Engagement campaign promotes an existing post; a post left in the
  // field after switching goals must not ride along.
  const typedPost = goal === "engagement" ? str(form.get("engagementPost")) : "";
  const engagementPost = readPostReference(typedPost);

  return {
    businessName: str(form.get("businessName")),
    locations: readLocations(form),
    service: str(form.get("service")),
    offer,
    customOffer: offer === "custom" ? str(form.get("customOffer")) : "",
    goal,
    ...(chosenGoal ? {} : { goalMissing: true }),
    subGoal,
    ages: ages.includes("All") ? ["All"] : ages,
    gender: GENDERS.find((g) => g === str(form.get("gender"))) ?? "all",
    interests,
    // Only meaningful alongside the `Other` chip; carrying it otherwise would
    // send a free-text interest nobody asked for.
    customInterest: interests.includes("Other") ? str(form.get("customInterest")) : "",
    startDate: day(form.get("startDate")),
    endDate: day(form.get("endDate")),
    customTiming,
    scheduleStart: customTiming ? hour(form.get("scheduleStart")) : "",
    scheduleEnd: customTiming ? hour(form.get("scheduleEnd")) : "",
    // Custom timing forces a lifetime budget, as in the legacy app: Meta runs
    // ads on a schedule only under a lifetime budget.
    // Empty when none was chosen — the form no longer pre-picks one, and the
    // validator says so rather than this guessing "daily".
    budgetType: customTiming
      ? "lifetime"
      : (META_BUDGET_TYPES.find((b) => b === str(form.get("budgetType"))) ?? ""),
    budgetAmount: Number(str(form.get("budgetAmount"))) || 0,
    adFormat: AD_FORMATS.find((f) => f === str(form.get("adFormat"))) ?? "image",
    automationMode:
      AUTOMATION_MODES.find((m) => m === str(form.get("automationMode"))) ?? "full",
    audienceType,
    audiences: audienceType === "retargeting" ? decodePicks(form.getAll("retargetingAudience")) : [],
    // `META_CUSTOM_FORM` arrives as an ordinary pick (`{ id: "custom" }`), so
    // it needs no case of its own here.
    leadForm: goal === "leads" && subGoal === INSTANT_FORM_SUBGOAL ? decodePick(form.get("leadForm")) : null,
    engagementPost,
    ...(goal === "engagement" && typedPost !== "" && engagementPost === "" ? { engagementPostInvalid: true } : {}),
  };
}

/**
 * What stops this setup launching.
 *
 * `now` is injectable so the date rules are testable. The earliest start
 * allowed is YESTERDAY in UTC, not today: the browser already refuses a past
 * day in the customer's own time zone, and the server cannot see that zone.
 */
export function validateMetaAds(setup: MetaAdsSetup, now = new Date()): string[] {
  const problems: string[] = [];

  if (setup.businessName === "") problems.push("Business name is required.");
  // No location check. The setup form stopped asking (2026-09-08): the
  // campaign-details form the agent returns carries its own "Location Type"
  // question, and asking the same thing twice — once before the agent has
  // planned anything and again after — is how a form gets a reputation. The
  // four location strings are still built from whatever `readLocations` finds,
  // which is nothing here, and the details form supplies them.

  if (setup.service === "") problems.push("Tell us what you're advertising.");
  // No custom-offer check: an empty description is sent as "Custom offer"
  // rather than refused (MA-STEP-03c).
  const subGoals = metaGoalById(setup.goal)?.subGoals ?? [];
  if (setup.goalMissing) {
    problems.push("Choose what the campaign should do.");
  } else if (subGoals.length > 0 && setup.subGoal === "") {
    problems.push(`Choose what the ${metaGoalById(setup.goal)?.label.toLowerCase()} goal should drive.`);
  }
  // Interests describe a NEW audience. Retargeting reaches people already in
  // a saved audience, so neither rule applies to it (MA-STEP-05f).
  if (setup.audienceType === "new") {
    const named = setup.interests.filter((interest) => interest !== "Other");
    if (setup.interests.includes("Other") && setup.customInterest === "") {
      problems.push("Describe the interest you meant by “Other”.");
    } else if (named.length === 0 && !setup.interests.includes("Other")) {
      problems.push("Select at least one interest or behavior.");
    }
  }

  if (setup.startDate === "") {
    problems.push("Choose a start date.");
  } else if (setup.startDate < utcDay(now, -1)) {
    problems.push("Start date can't be in the past.");
  }
  if (setup.endDate === "") {
    problems.push("Choose an end date.");
  } else if (setup.startDate !== "" && setup.endDate <= setup.startDate) {
    // `YYYY-MM-DD` compares correctly as a string, with no time zone to get wrong.
    problems.push("End date must be after start date.");
  }

  if (setup.budgetType === "") problems.push("Choose a budget type.");
  if (!(setup.budgetAmount > 0)) problems.push("Budget must be more than zero.");
  if (setup.customTiming) {
    if (setup.scheduleStart === "" || setup.scheduleEnd === "") {
      problems.push("Custom timing needs a start and an end time.");
    } else if (metaHourOf(setup.scheduleEnd) <= metaHourOf(setup.scheduleStart)) {
      problems.push("Schedule end time must be after the start time.");
    }
  }
  if (setup.audienceType === "retargeting" && setup.audiences.length === 0) {
    problems.push("Choose at least one saved audience to retarget, or target a new audience.");
  }
  if (setup.goal === "leads" && setup.subGoal === INSTANT_FORM_SUBGOAL && setup.leadForm === null) {
    problems.push("Choose the instant form the ads should use.");
  }
  if (setup.goal === "engagement" && setup.engagementPost === "") {
    problems.push(
      setup.engagementPostInvalid
        ? "That isn't a Facebook or Instagram post. Paste the post's ID or its link."
        : "Add the ID or link of the Facebook or Instagram post to promote.",
    );
  }

  return problems;
}

/**
 * The Meta Ads chat payload, in the backend's own shape.
 *
 * Every label here is copied from a live n8n execution, capitalisation
 * included. `campaign_data` and `chatInput` are built from one list so they
 * cannot disagree — see `ads-chat-payload.ts`.
 *
 * `Audience type` and `Instant form ID` are the customer's answers since
 * 2026-09-30 (retargeting and instant forms, legacy flow guide §3): "New
 * Audience" / "Not applicable" when they chose neither, as before.
 *
 * A retargeting campaign carries NO new-audience fields (§7, §15.1): age,
 * gender and interests describe people to find, and a saved audience is people
 * already found. "Retargeting audiences" takes their place.
 *
 * The four location labels are one answer written four ways —
 * `campaign-locations.ts` owns that, because the workflow reads all four and
 * they must not disagree.
 */
export function metaAdsPayload(
  setup: MetaAdsSetup,
  { email, userId, sessionId }: { email: string; userId?: string; sessionId: string },
): Record<string, unknown> {
  const budget = budgetStrings(setup.budgetAmount, setup.budgetType);
  const place = formatLocations(setup.locations);
  const retargeting = setup.audienceType === "retargeting";

  const ages = setup.ages.length > 0 ? setup.ages.join(", ") : "All";
  // The live app concatenates the audience into one line for the model, and
  // also sends the parts separately. Both, because it reads both.
  const interestList = setup.interests
    .filter((interest) => interest !== "Other")
    .concat(setup.customInterest === "" ? [] : [setup.customInterest])
    .join(", ");

  const audience: CampaignField[] = retargeting
    ? [["Retargeting audiences", orAbsent(setup.audiences.map((a) => a.name).join(", "))]]
    : [
        ["Age range", ages],
        ["Gender", setup.gender],
        ["Interests and behaviors", `${ages} - ${setup.gender} - ${orAbsent(interestList, "")}`],
        ["Selected interests", orAbsent(setup.interests.join(", "), "")],
        ["Other interest (optional)", orAbsent(setup.customInterest, "")],
      ];

  return buildChatPayload({
    intro:
      "My Meta Ads AI Agent setup is complete. Please help me finalize and create the Facebook and Instagram campaign.",
    email,
    userId,
    sessionId,
    actionType: "get_suggestion",
    fields: [
      ["Business name", orAbsent(setup.businessName)],
      ["Location", place.location],
      ["Country", place.country],
      ["State", place.state],
      ["City", place.city],
      ["Service or product", orAbsent(setup.service)],
      // Carried in `campaign_data` so it reaches the stored suggestion, which
      // is where `startCreativePrompts` reads it from two pages later.
      ["Ad format", setup.adFormat],
      ["Offer type", setup.offer],
      ["Offer value", offerValue(setup.offer, setup.customOffer)],
      ["Ad goal", setup.goal],
      ["Sub goal", orAbsent(setup.subGoal, "Not applicable")],
      ["Instant form ID", setup.leadForm?.id ?? "Not applicable"],
      ["Audience type", retargeting ? "Retargeting" : "New Audience"],
      ...audience,
      ["Campaign start date", orAbsent(setup.startDate)],
      ["Campaign end date", orAbsent(setup.endDate)],
      ["Custom timing schedule", setup.customTiming ? "Enabled" : "Disabled"],
      ["Schedule start time", setup.customTiming ? orAbsent(setup.scheduleStart, "All day") : "All day"],
      ["Schedule end time", setup.customTiming ? orAbsent(setup.scheduleEnd, "All day") : "All day"],
      ["Budget type", setup.budgetType],
      ["Budget amount", budget.amount],
      ["Budget display", budget.display],
      ...(setup.leadForm ? ([["Instant form", setup.leadForm.name]] as CampaignField[]) : []),
      // Engagement promotes a post that already exists, so the agent is told
      // which one rather than planning a new ad (LBS-1253).
      ...(setup.goal === "engagement" && setup.engagementPost !== ""
        ? ([["Existing post to promote", setup.engagementPost]] as CampaignField[])
        : []),
    ],
  });
}

/** The ids the executor acts on, for the launch body (see `googleAdsLaunchExtras`). */
export function metaAdsLaunchExtras(setup: MetaAdsSetup): Record<string, unknown> {
  // The legacy body names the chosen audiences three ways and the executor's
  // branches read different ones (§15.1). `retargetingAudiences` keeps the
  // whole pick; the other two are exactly `{ id, name }`.
  const chosen = setup.audiences.map(({ id, name }) => ({ id, name }));
  return {
    audienceType: setup.audienceType,
    ...(setup.audiences.length > 0
      ? { retargetingAudiences: setup.audiences, retargetingData: chosen, selectedRetargetingAudiences: chosen }
      : {}),
    ...(setup.leadForm ? { instantFormId: setup.leadForm.id } : {}),
    ...(setup.goal === "engagement" ? postLaunchExtras(setup.engagementPost) : {}),
  };
}
