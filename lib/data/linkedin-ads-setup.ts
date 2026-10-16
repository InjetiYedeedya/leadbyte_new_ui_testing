import { AUTOMATION_MODES } from "./google-ads-setup";
import {
  budgetStrings,
  buildChatPayload,
  campaignWindow,
  orAbsent,
} from "./ads-chat-payload";

/**
 * The LinkedIn Ads agent's setup: vocabulary, validation and payload.
 *
 * The third of the three ad wizards, and the least like the other two:
 *
 *   - **No offer, no age, no gender, no location.** LinkedIn targets by
 *     professional attributes, so the audience is `criteria` + each one's
 *     `targeting` values instead. (City, state, region and country were asked here once; the
 *     product owner dropped them on 2026-10-08 as not needed.)
 *   - **Goal and ad format are both required, and the format depends on the
 *     goal.** The goal has no default — the customer picks it.
 *   - **Semi automation has its own endpoint**, `/api/webhook/linkedin-ads-semi`,
 *     rather than the shared receiver.
 *   - The receiver is `/api/webhook/ads-receiver` — WITH a hyphen, unlike
 *     Google's and Meta's `adsreceiver`. See `agent-setup.ts`.
 *
 * ## Goal → format
 *
 * `GOAL_FORMATS` is the live app's own pairing, taken from
 * `LINKEDIN_ADS_AGENT_SPEC.md` §5.6 (2026-10-08). It replaced a list inferred
 * from LinkedIn's documentation, which offered formats the agent was never
 * built for (Document, Message, Job collection) and missed ones it was
 * (Follower ad, Conversation ad, Lead gen form). The format goes to the agent
 * as these labels, verbatim.
 */

export { AUTOMATION_MODES };

export const LINKEDIN_GOALS = [
  { id: "awareness", label: "Brand awareness" },
  { id: "visits", label: "Website visits" },
  { id: "engagement", label: "Engagement" },
  { id: "video", label: "Video views" },
  { id: "leads", label: "Lead generation" },
  { id: "conversions", label: "Website conversions" },
  { id: "jobs", label: "Job applicants" },
] as const;

export type LinkedInGoalId = (typeof LINKEDIN_GOALS)[number]["id"];

/** The live app's goal → format pairing (spec §5.6). Order is the spec's. */
export const GOAL_FORMATS: Record<LinkedInGoalId, string[]> = {
  awareness: ["Single image", "Carousel", "Video", "Text ad", "Spotlight", "Follower ad"],
  visits: ["Single image", "Carousel", "Video", "Conversation ad"],
  engagement: ["Single image", "Carousel", "Video", "Event ad"],
  video: ["Video"],
  leads: ["Lead gen form", "Single image", "Video", "Conversation ad"],
  conversions: ["Single image", "Carousel", "Video"],
  jobs: ["Job ad", "Single image"],
};

/**
 * Targeting criteria, with their quick picks (spec §5.5).
 *
 * `interests` is always on. "None" is not a criterion: in the live app it is a
 * reset back to Member interests only, so it is not listed here and nothing
 * stores it. `freeText: false` means the quick picks are the whole list —
 * company size and degree are fixed sets, and the server holds the answers to
 * them.
 */
export const CRITERIA = [
  {
    id: "industries",
    label: "Company industries",
    presets: ["Information Technology", "Finance", "Healthcare", "Marketing", "Education", "Manufacturing", "Consulting", "Retail"],
    freeText: true,
    placeholder: "Search or add...",
  },
  {
    id: "size",
    label: "Company size",
    presets: ["Self-employed", "1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"],
    freeText: false,
    placeholder: "",
  },
  {
    id: "titles",
    label: "Job titles",
    presets: [],
    freeText: true,
    placeholder: "CEO, Founder, Marketing Manager, HR Director...",
  },
  {
    id: "skills",
    label: "Job skills",
    presets: ["Digital Marketing", "Python", "Sales", "Leadership", "Data Analysis", "Project Management", "SEO", "Copywriting"],
    freeText: true,
    placeholder: "Search or add...",
  },
  {
    id: "education",
    label: "Education degrees",
    presets: ["Bachelor's", "Master's", "MBA", "Doctorate", "Professional certification"],
    freeText: false,
    placeholder: "",
  },
  {
    id: "interests",
    label: "Member interests",
    presets: ["B2B Marketing", "SaaS", "Artificial Intelligence", "Entrepreneurship", "Business Strategy", "Leadership", "Startups", "Venture Capital"],
    freeText: true,
    placeholder: "Search or add...",
  },
] as const;

export type CriterionId = (typeof CRITERIA)[number]["id"];

/** The one criterion that cannot be turned off. */
export const ALWAYS_ON_CRITERION: CriterionId = "interests";

/** Caps on what one criterion carries, so a pasted essay cannot ride along. */
export const MAX_TARGETING_VALUES = 30;
export const MAX_TARGETING_VALUE_LENGTH = 80;

/** The form field one criterion's values post under. */
export function targetingField(id: CriterionId): string {
  return `targeting_${id}`;
}

function criterionById(id: string): (typeof CRITERIA)[number] | undefined {
  return CRITERIA.find((criterion) => criterion.id === id);
}

export const LINKEDIN_BUDGET_TYPES = ["daily", "lifetime"] as const;

export function linkedInGoalById(id: string): (typeof LINKEDIN_GOALS)[number] | undefined {
  return LINKEDIN_GOALS.find((goal) => goal.id === id);
}

export function formatsForGoal(goal: string): string[] {
  return GOAL_FORMATS[goal as LinkedInGoalId] ?? [];
}

export interface LinkedInAdsSetup {
  businessName: string;
  /** Empty when none was chosen — there is no default goal. */
  goal: LinkedInGoalId | "";
  budgetType: string;
  budgetAmount: number;
  days: number;
  /** In the order chosen, Member interests always last. */
  criteria: CriterionId[];
  /** Each chosen criterion's values. A criterion with none is absent. */
  targeting: Partial<Record<CriterionId, string[]>>;
  customTargeting: string;
  adFormat: string;
  automationMode: string;
}

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readLinkedInAdsForm(form: FormData): LinkedInAdsSetup {
  const goal: LinkedInGoalId | "" = linkedInGoalById(str(form.get("goal")))?.id ?? "";
  // Unknown ids dropped, Member interests forced on and moved last — the order
  // the step shows its blocks in. A stray "none" from an older form is not a
  // criterion and simply falls out.
  const chosen = [
    ...new Set(
      form
        .getAll("criteria")
        .map((value) => criterionById(str(value))?.id)
        .filter((id): id is CriterionId => id !== undefined && id !== ALWAYS_ON_CRITERION),
    ),
  ];
  const criteria: CriterionId[] = [...chosen, ALWAYS_ON_CRITERION];

  const targeting: Partial<Record<CriterionId, string[]>> = {};
  for (const id of criteria) {
    const criterion = criterionById(id);
    if (!criterion) continue;
    const seen = new Set<string>();
    const values: string[] = [];
    for (const raw of form.getAll(targetingField(id))) {
      const value = str(raw).slice(0, MAX_TARGETING_VALUE_LENGTH);
      // A fixed list (size, degree) accepts only its own options.
      if (value === "" || (!criterion.freeText && !(criterion.presets as readonly string[]).includes(value))) {
        continue;
      }
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      values.push(value);
      if (values.length === MAX_TARGETING_VALUES) break;
    }
    if (values.length > 0) targeting[id] = values;
  }

  const adFormat = str(form.get("adFormat"));

  return {
    businessName: str(form.get("businessName")),
    goal,
    budgetType:
      LINKEDIN_BUDGET_TYPES.find((b) => b === str(form.get("budgetType"))) ?? "daily",
    budgetAmount: Number(str(form.get("budgetAmount"))) || 0,
    days: Number(str(form.get("days"))) || 0,
    criteria,
    targeting,
    customTargeting: str(form.get("customTargeting")),
    // Dropped when it does not belong to the goal, for the same reason a
    // sub-goal is: LinkedIn rejects the pairing at campaign creation, and a
    // saved row claiming otherwise is worse than an empty field.
    adFormat: formatsForGoal(goal).includes(adFormat) ? adFormat : "",
    automationMode:
      AUTOMATION_MODES.find((m) => m === str(form.get("automationMode"))) ?? "full",
  };
}

export function validateLinkedInAds(setup: LinkedInAdsSetup): string[] {
  const problems: string[] = [];

  if (setup.businessName === "") problems.push("Company or brand name is required.");
  if (setup.goal === "") {
    problems.push("Choose what the campaign should do.");
  } else if (setup.adFormat === "") {
    problems.push(`Choose an ad format for the ${linkedInGoalById(setup.goal)?.label.toLowerCase()} goal.`);
  }
  if (!Number.isInteger(setup.days) || setup.days < 1 || setup.days > 365) {
    problems.push("Duration must be between 1 and 365 days.");
  }
  if (!(setup.budgetAmount > 0)) problems.push("Budget must be more than zero.");

  return problems;
}

function criterionLabel(id: CriterionId): string {
  return criterionById(id)?.label ?? id;
}

/**
 * Each criterion's values under its own name, the live app's shape (spec §5.7):
 * `Job titles: CEO, Founder | Member interests: SaaS`. One flat list lost which
 * value belonged to which criterion — a title and a skill read the same.
 */
export function targetingDetails(setup: Pick<LinkedInAdsSetup, "criteria" | "targeting">): string {
  return setup.criteria
    .filter((id) => (setup.targeting[id]?.length ?? 0) > 0)
    .map((id) => `${criterionLabel(id)}: ${(setup.targeting[id] ?? []).join(", ")}`)
    .join(" | ");
}

/**
 * The LinkedIn Ads chat payload.
 *
 * Same structure as the other two. LinkedIn's labels are the most inferred of
 * the three — its targeting criteria have no equivalent in Meta's confirmed
 * set — so these are named after the form's own questions. See `ads-chat-payload.ts`.
 */
export function linkedInAdsPayload(
  setup: LinkedInAdsSetup,
  { email, userId, sessionId }: { email: string; userId?: string; sessionId: string },
): Record<string, unknown> {
  const { start, end } = campaignWindow(setup.days);
  const budget = budgetStrings(setup.budgetAmount, setup.budgetType);

  return buildChatPayload({
    intro:
      "My LinkedIn Ads AI Agent setup is complete. Please help me finalize and create the LinkedIn campaign.",
    email,
    userId,
    sessionId,
    actionType: "get_suggestion",
    fields: [
      ["Business name", orAbsent(setup.businessName)],
      ["Ad goal", setup.goal],
      ["Ad format", orAbsent(setup.adFormat)],
      ["Targeting criteria", setup.criteria.map(criterionLabel).join(", ")],
      ["Targeting details", targetingDetails(setup)],
      ["Other targeting (optional)", orAbsent(setup.customTargeting, "")],
      ["Campaign start date", start],
      ["Campaign end date", end],
      ["Budget type", setup.budgetType],
      ["Budget amount", budget.amount],
      ["Budget display", budget.display],
    ],
  });
}
