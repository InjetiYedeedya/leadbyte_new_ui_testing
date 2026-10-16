import {
  decodePick,
  decodePicks,
  readAudienceType,
  type AudienceType,
  type PickedOption,
} from "./ads-lists";
import {
  budgetStrings,
  buildChatPayload,
  isCalendarDay,
  NOT_PROVIDED,
  orAbsent,
  utcDay,
  type CampaignField,
} from "./ads-chat-payload";
import { offerValue, readOffer, type AdOffer } from "./ads-offer";
/**
 * The Google Ads agent's setup form: its vocabulary, and the payload it sends.
 *
 * Pure on purpose. Every option list and every conditional rule lives here
 * rather than in JSX, so the shape the backend receives is testable without a
 * browser — and so the three other ad wizards can follow the same shape rather
 * than each inventing one.
 *
 * ## The contract (from the live app, 2026-09-03)
 *
 *   POST /api/webhook/google-ads-chat   action_type: get_suggestion | approved
 *                                                    | revise | user_suggestion
 *   POST /api/webhook/adsreceiver       agent_type: google_ads,
 *                                       action: execute_campaign
 *   POST /api/data/leadbyte_google_ads  the saved setup
 *
 * The legacy form is a nine-step wizard. This is one page with sections, which
 * is not a cosmetic choice: a wizard needs client state to hold nine steps of
 * answers, while one form posts once and needs none. The fields, their names
 * and their validation are identical — only the number of Next buttons differs.
 */

/**
 * The offer: the customer's own words, or none — the same model as Meta's
 * (`ads-offer.ts`). The fixed percentages ("5", "10", "25") are gone; a stale
 * "5" from an old draft reads as none.
 */
export type Offer = AdOffer;

/**
 * Ad goals, and the sub-goals each one takes.
 *
 * Only `leads` and `conversions` have sub-goals; the rest take none, and
 * sending one anyway would be inventing a field the backend does not expect.
 */
export const GOALS = [
  { id: "brand", label: "Brand awareness", subGoals: [] },
  { id: "traffic", label: "Website traffic", subGoals: [] },
  { id: "leads", label: "Leads", subGoals: ["Calls", "Forms", "Website"] },
  { id: "conversions", label: "Conversions", subGoals: ["Calls", "Website"] },
  { id: "app_promo", label: "App promotion", subGoals: [] },
  { id: "app_actions", label: "App actions", subGoals: [] },
  // From the legacy flow (guide §3, 2026-09-30): drives store visits, and needs
  // store locations with a Google Business Profile id. Sent as "local store"
  // (`goalInWords`). There is no Remarketing goal: reaching people who already
  // know you is the audience choice (Retargeting), not a goal.
  { id: "local_store", label: "Local store and visit", subGoals: [] },
] as const;

export type GoalId = (typeof GOALS)[number]["id"];

/** The Leads sub-goal that must name one of the account's Google lead forms. */
export const LEAD_FORM_SUBGOAL = "Forms";
export const LOCAL_GOAL = "local_store";

/**
 * The lead form the agent creates for the customer, offered after the
 * account's own forms — Google's twin of Meta's `META_CUSTOM_FORM`. Posted like
 * any other pick, so "Lead form ID" carries `custom` for it.
 */
export const GOOGLE_CUSTOM_FORM = { id: "custom", name: "Custom Form" } as const;

/**
 * Goals Google does not allow daily hours for (legacy guide §3): the hours are
 * hidden on the form for these and dropped on the server whatever was posted.
 */
export const NO_HOURS_GOALS: readonly string[] = [LOCAL_GOAL, "app_promo", "app_actions"];

export const AGE_RANGES = ["All", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"] as const;
export const GENDERS = ["all", "male", "female"] as const;
export const BUDGET_TYPES = ["daily", "lifetime"] as const;

/** The budget choices as the legacy app words them: "Daily budget", "Lifetime budget". */
export const BUDGET_TYPE_LABELS: Record<(typeof BUDGET_TYPES)[number], string> = {
  daily: "Daily budget",
  lifetime: "Lifetime budget",
};

/**
 * What the budget box is in: "INR" when the chosen ad account says, otherwise
 * whose currency it is. Never a guessed symbol — the legacy Google form printed
 * "$" and "US Dollars" to an INR account.
 */
export function budgetCurrencyNote(currency: string): string {
  return /^[A-Z]{3}$/.test(currency) ? `(in ${currency}, your ad account's currency)` : "(in your ad account's currency)";
}
export const AUTOMATION_MODES = ["full", "semi"] as const;

/**
 * The daily schedule's hours: 12:00 AM to 11:00 PM. The label IS the posted
 * value, and "Schedule start time (optional)" carries it as written.
 *
 * Both ends are optional. `ANY_TIME` is what an unset one says, because the
 * live payload's unset schedule reads "Any time" — a campaign with no hour
 * restriction is the normal case, and forcing a start on someone who never
 * chose one would quietly narrow their reach. On the form it is the first
 * option, posted as an empty value.
 */
export const ANY_TIME = "Any time";

function hourLabel(hour: number): string {
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:00 ${hour < 12 ? "AM" : "PM"}`;
}

export const GOOGLE_HOURS: readonly string[] = Array.from({ length: 24 }, (_, hour) => hourLabel(hour));

/**
 * The 24-hour clock hour of an hour label, or -1 for anything else. Meta's
 * labels are a subset of these, spelled the same, so this reads both.
 */
export function clockHourOf(label: string): number {
  return GOOGLE_HOURS.indexOf(label);
}

export function goalById(id: string): (typeof GOALS)[number] | undefined {
  return GOALS.find((goal) => goal.id === id);
}

export interface GoogleAdsSetup {
  businessName: string;
  // No locations (2026-10-09): where the ads run is asked once, on the
  // campaign-details form (`withLocationField`), not here as well.
  service: string;
  offer: Offer;
  customOffer: string;
  goal: GoalId;
  subGoal: string;
  ages: string[];
  gender: string;
  /** Google's payload carries "Interests and behaviors" exactly as Meta's does. */
  interests: string[];
  customInterest: string;
  /** `YYYY-MM-DD`, from the date inputs. Empty when missing or not a real day. */
  startDate: string;
  endDate: string;
  /** A `GOOGLE_HOURS` label, or empty for "Any time" (and always for `NO_HOURS_GOALS`). */
  scheduleStart: string;
  scheduleEnd: string;
  budgetType: string;
  budgetAmount: number;
  automationMode: string;
  /** New audience, or retargeting the saved audiences below. */
  audienceType: AudienceType;
  audiences: PickedOption[];
  /** Leads → Forms only: the Google lead form the ads collect into. */
  leadForm: PickedOption | null;
  /** Local store and visit only: the stores, each with its Business Profile id. */
  storeLocations: PickedOption[];
}

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function day(value: FormDataEntryValue | null): string {
  const text = str(value);
  return isCalendarDay(text) ? text : "";
}

/** A listed hour, or empty — "Any time", or anything that is not on the list. */
function hour(value: FormDataEntryValue | null): string {
  const text = str(value);
  return GOOGLE_HOURS.includes(text) ? text : "";
}

/** Reads the form, keeping every value the backend's own field names use. */
export function readGoogleAdsForm(form: FormData): GoogleAdsSetup {
  const offer = readOffer(form.get("offer"));
  const goal = (goalById(str(form.get("goal")))?.id ?? "leads") as GoalId;

  // "All" is not a real age band and cannot be combined with one — selecting
  // both would ask the backend to target everyone and 25-34 at once.
  const ages = form.getAll("ages").map((value) => str(value)).filter(Boolean);
  const interests = form.getAll("interests").map((value) => str(value)).filter(Boolean);
  const subGoal = (goalById(goal)?.subGoals as readonly string[] | undefined)?.includes(
    str(form.get("subGoal")),
  )
    ? str(form.get("subGoal"))
    : "";
  const audienceType = readAudienceType(form.get("audienceType"));
  const noHours = NO_HOURS_GOALS.includes(goal);

  return {
    businessName: str(form.get("businessName")),
    service: str(form.get("service")),
    offer,
    customOffer: offer === "custom" ? str(form.get("customOffer")) : "",
    goal,
    // Dropped when the goal has none: sending a sub-goal the goal does not own
    // invents a field the backend has no branch for.
    subGoal,
    ages: ages.includes("All") ? ["All"] : ages,
    gender: GENDERS.find((g) => g === str(form.get("gender"))) ?? "all",
    interests,
    customInterest: interests.includes("Other") ? str(form.get("customInterest")) : "",
    startDate: day(form.get("startDate")),
    endDate: day(form.get("endDate")),
    // Stored empty when unrestricted, so the payload's own "Any time" wording
    // is decided in one place rather than two.
    // Not for local and app goals, whatever was posted — Google refuses hours there.
    scheduleStart: noHours ? "" : hour(form.get("scheduleStart")),
    scheduleEnd: noHours ? "" : hour(form.get("scheduleEnd")),
    // Empty when none was chosen; the validator says so (`validateGoogleAds`).
    budgetType: BUDGET_TYPES.find((b) => b === str(form.get("budgetType"))) ?? "",
    budgetAmount: Number(str(form.get("budgetAmount"))) || 0,
    automationMode:
      AUTOMATION_MODES.find((m) => m === str(form.get("automationMode"))) ?? "full",
    audienceType,
    // Each only where its question applies, so a pick left over from another
    // choice never ships.
    audiences: audienceType === "retargeting" ? decodePicks(form.getAll("retargetingAudience")) : [],
    leadForm: goal === "leads" && subGoal === LEAD_FORM_SUBGOAL ? decodePick(form.get("leadForm")) : null,
    storeLocations:
      goal === LOCAL_GOAL
        ? decodePicks(form.getAll("storeLocation")).filter((store) => (store.profileId ?? "") !== "")
        : [],
  };
}

/**
 * What is wrong with this setup, in the customer's words.
 *
 * Returned as a list rather than thrown one at a time: a form that reports its
 * first problem, then its second after a round trip, is a form people abandon.
 *
 * `now` is injectable so the date rules are testable. The earliest start
 * allowed is YESTERDAY in UTC, not today — the same rule as `validateMetaAds`:
 * the browser already refuses a past day in the customer's own time zone, and
 * the server cannot see that zone.
 */
export function validateGoogleAds(setup: GoogleAdsSetup, now = new Date()): string[] {
  const problems: string[] = [];

  if (setup.businessName === "") problems.push("Business name is required.");
  if (setup.service === "") problems.push("Tell us what you're advertising.");
  // No custom-offer check: an empty description is sent as "Custom offer"
  // rather than refused, as Meta's is.
  // Interests describe a NEW audience; retargeting reaches people already in a
  // saved audience, so neither rule applies to it.
  if (setup.audienceType === "new") {
    if (setup.interests.includes("Other") && setup.customInterest === "") {
      problems.push("Describe the interest you meant by “Other”.");
    } else if (setup.interests.length === 0) {
      problems.push("Select at least one interest or behavior.");
    }
  }
  const subGoals = goalById(setup.goal)?.subGoals ?? [];
  if (subGoals.length > 0 && setup.subGoal === "") {
    problems.push(`Choose what the ${goalById(setup.goal)?.label.toLowerCase()} goal should drive.`);
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
  // Both hours are optional; only a pair that runs backwards is refused.
  if (
    setup.scheduleStart !== "" &&
    setup.scheduleEnd !== "" &&
    clockHourOf(setup.scheduleEnd) <= clockHourOf(setup.scheduleStart)
  ) {
    problems.push("Schedule end time must be after the start time.");
  }
  if (setup.budgetType === "") problems.push("Choose a budget type.");
  if (!(setup.budgetAmount > 0)) problems.push("Budget must be more than zero.");
  if (setup.audienceType === "retargeting" && setup.audiences.length === 0) {
    problems.push("Choose at least one saved audience to retarget, or target a new audience.");
  }
  if (setup.goal === "leads" && setup.subGoal === LEAD_FORM_SUBGOAL && setup.leadForm === null) {
    problems.push("Choose the Google lead form the ads should use.");
  }
  if (setup.goal === LOCAL_GOAL && setup.storeLocations.length === 0) {
    problems.push("Choose at least one store location with a Google Business Profile.");
  }

  return problems;
}

/**
 * The Google Ads chat payload, in the backend's own shape.
 *
 * Every label, every constant and the intro sentence are copied from a live
 * n8n execution (2026-09-03). Five things differ from Meta's and were wrong
 * when this was inferred from Meta alone:
 *
 *   - `"Lead form ID"`, where Meta says `"Instant form ID"`.
 *   - `"Schedule start time (optional)"` — the suffix is part of the key.
 *   - An unset schedule reads `"Any time"`, not Meta's `"All day"`.
 *   - Google carries `"Interests and behaviors"` too, which the inferred
 *     version omitted entirely.
 *   - The goal is sent in words: `app_promo` goes over the wire as
 *     `"app promo"`.
 *
 * There is no automation-mode line: it is a decision about our own UI, not
 * something the campaign builder is told.
 */
export function googleAdsPayload(
  setup: GoogleAdsSetup,
  { email, userId, sessionId }: { email: string; userId?: string; sessionId: string },
): Record<string, unknown> {
  const budget = budgetStrings(setup.budgetAmount, setup.budgetType);
  const retargeting = setup.audienceType === "retargeting";

  const interests = setup.interests
    .filter((interest) => interest !== "Other")
    .concat(setup.customInterest === "" ? [] : [setup.customInterest])
    .join(", ");

  // A retargeting campaign carries NO new-audience fields, as Meta's does not:
  // age, gender and interests describe people to find, and a saved audience is
  // people already found. "Retargeting audiences" takes their place.
  const audience: CampaignField[] = retargeting
    ? [["Retargeting audiences", orAbsent(setup.audiences.map((a) => a.name).join(", "))]]
    : [
        ["Age range", setup.ages.length > 0 ? setup.ages.join(", ") : "All"],
        ["Gender", setup.gender],
        // Three lines, matching Meta's payload and the working `adsreceiver`
        // body captured on 2026-09-03. Google sent only the joined line, so the
        // checkbox picks and the "Other interest" free text never reached the
        // workflow at all — which is why an audience typed into that box did not
        // arrive. The joined line is for the model to read; the two below are
        // the parts, and n8n's branches read whichever is in front of them.
        ["Interests and behaviors", orAbsent(interests, NOT_PROVIDED)],
        ["Selected interests", orAbsent(setup.interests.join(", "), "")],
        ["Other interest (optional)", orAbsent(setup.customInterest, "")],
      ];

  return buildChatPayload({
    intro:
      "My Google Ads AI Agent setup is complete. Please help me finalize and create the campaign.",
    email,
    userId,
    sessionId,
    actionType: "get_suggestion",
    fields: [
      ["Business name", orAbsent(setup.businessName)],
      // The place is not asked here any more (2026-10-09): the campaign-details
      // form asks it, and the launch body carries it from there
      // (`Location Type`, `_locations`, `_country`/`_state`/`_city`/`_zip`).
      // The four keys stay, spelled out as absent, so the plan hop keeps the
      // shape its workflow was built against.
      ["Location", NOT_PROVIDED],
      ["Country", NOT_PROVIDED],
      ["State", NOT_PROVIDED],
      ["City", NOT_PROVIDED],
      ["Service or product", orAbsent(setup.service)],
      ["Offer type", setup.offer],
      ["Offer value", offerValue(setup.offer, setup.customOffer)],
      // In words, not the id: the live payload reads "app promo".
      ["Ad goal", goalInWords(setup.goal)],
      ["Sub goal", orAbsent(setup.subGoal, "Not applicable")],
      // `custom` for the lead form the agent creates (`GOOGLE_CUSTOM_FORM`).
      ["Lead form ID", setup.leadForm?.id ?? "Not applicable"],
      // The legacy flow's two values, spelled as the live payload spells the first.
      ["Audience type", retargeting ? "Retargeting" : "New Audience"],
      ...audience,
      // The two chosen dates, no longer "today + N days" (`campaignWindow`).
      ["Campaign start date", orAbsent(setup.startDate)],
      ["Campaign end date", orAbsent(setup.endDate)],
      ["Schedule start time (optional)", orAbsent(setup.scheduleStart, ANY_TIME)],
      ["Schedule end time (optional)", orAbsent(setup.scheduleEnd, ANY_TIME)],
      ["Budget type", setup.budgetType],
      ["Budget amount", budget.amount],
      ["Budget display", budget.display],
      // Only when they apply, so the captured body's shape is unchanged for
      // every campaign that has none of them.
      ...(setup.leadForm ? ([["Lead form", setup.leadForm.name]] as [string, string][]) : []),
      ...(setup.storeLocations.length > 0
        ? ([["Store locations", setup.storeLocations.map((s) => s.name).join("; ")]] as [string, string][])
        : []),
    ],
  });
}

/**
 * The structured half of the new answers, for the launch body — ids the
 * executor acts on, which the prose fields above cannot carry (legacy guide
 * §6: `audienceType`, the chosen audiences, `locationData`).
 */
export function googleAdsLaunchExtras(setup: GoogleAdsSetup): Record<string, unknown> {
  // The chosen audiences three ways, as Meta's launch body names them
  // (`metaAdsLaunchExtras`): the executor's branches read different ones.
  // `retargetingAudiences` keeps the whole pick; the other two are `{ id, name }`.
  const chosen = setup.audiences.map(({ id, name }) => ({ id, name }));
  return {
    audienceType: setup.audienceType,
    ...(setup.audiences.length > 0
      ? { retargetingAudiences: setup.audiences, retargetingData: chosen, selectedRetargetingAudiences: chosen }
      : {}),
    ...(setup.leadForm ? { leadFormId: setup.leadForm.id } : {}),
    ...(setup.storeLocations.length > 0
      ? {
          locationData: setup.storeLocations.map((store) => ({
            id: store.id,
            address: store.name,
            asset_set: store.assetSet ?? "",
            business_profile_id: store.profileId ?? "",
          })),
        }
      : {}),
  };
}

/** `app_promo` → `app promo` (and `local_store` → `local store`), as the live payload spells it. */
export function goalInWords(goal: string): string {
  return goal.replace(/_/g, " ");
}
