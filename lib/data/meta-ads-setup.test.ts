import {
  META_CUSTOM_FORM,
  META_GOALS,
  META_HOURS,
  META_OFFER_PRESETS,
  metaAdsLaunchExtras,
  metaAdsPayload,
  metaGoalById,
  metaOfferValue,
  readMetaAdsForm,
  validateMetaAds,
  type MetaAdsSetup,
} from "@/lib/data/meta-ads-setup";

/**
 * The legacy spec's rules for the Meta setup form (MA-STEP-03 … 08). The
 * broader payload tests live in `meta-linkedin-setup.test.ts`.
 */

function formOf(entries: Record<string, string | string[]>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const one of Array.isArray(value) ? value : [value]) form.append(key, one);
  }
  return form;
}

const NOW = new Date("2026-10-02T12:00:00Z");
const CONTEXT = { email: "a@b.com", sessionId: "s1" };

const SETUP: MetaAdsSetup = {
  businessName: "ZippyGo",
  locations: [],
  service: "Voice-first flight booking",
  offer: "none",
  customOffer: "",
  goal: "traffic",
  subGoal: "Link clicks",
  adFormat: "image",
  ages: ["All"],
  gender: "all",
  interests: ["Travel"],
  customInterest: "",
  startDate: "2026-10-05",
  endDate: "2026-10-20",
  customTiming: false,
  scheduleStart: "",
  scheduleEnd: "",
  budgetType: "daily",
  budgetAmount: 500,
  automationMode: "full",
  audienceType: "new",
  audiences: [],
  leadForm: null,
  engagementPost: "",
};

const dataOf = (setup: MetaAdsSetup) => metaAdsPayload(setup, CONTEXT).campaign_data as Record<string, string>;

describe("Meta setup — the starting point is valid", () => {
  it("has no problems", () => {
    expect(validateMetaAds(SETUP, NOW)).toEqual([]);
  });
});

describe("Leads sub-goals (MA-STEP-04)", () => {
  it("are exactly the spec's six", () => {
    expect(metaGoalById("leads")?.subGoals).toEqual([
      "Instant forms",
      "Phone calls",
      "Website",
      "Instagram",
      "Messenger",
      "WhatsApp",
    ]);
  });

  it("are kept only under Leads", () => {
    expect(readMetaAdsForm(formOf({ goal: "leads", subGoal: "WhatsApp" })).subGoal).toBe("WhatsApp");
    expect(readMetaAdsForm(formOf({ goal: "traffic", subGoal: "WhatsApp" })).subGoal).toBe("");
    // The old spelling is not an answer any more.
    expect(readMetaAdsForm(formOf({ goal: "leads", subGoal: "Instagram messages" })).subGoal).toBe("");
  });

  it("has every goal still listed", () => {
    expect(META_GOALS.map((g) => g.id)).toEqual(["awareness", "traffic", "engagement", "leads", "app", "sales"]);
  });
});

describe("Interests (MA-STEP-05f)", () => {
  it("needs at least one for a new audience", () => {
    expect(validateMetaAds({ ...SETUP, interests: [] }, NOW)).toContain("Select at least one interest or behavior.");
  });

  it("accepts Other with its text, and asks for the text without it", () => {
    expect(validateMetaAds({ ...SETUP, interests: ["Other"], customInterest: "Pilots" }, NOW)).toEqual([]);
    const problems = validateMetaAds({ ...SETUP, interests: ["Other"], customInterest: "" }, NOW);
    expect(problems).toEqual(["Describe the interest you meant by “Other”."]);
  });

  it("is not asked of a retargeting campaign", () => {
    const setup = { ...SETUP, interests: [], audienceType: "retargeting" as const, audiences: [{ id: "a", name: "Buyers" }] };
    expect(validateMetaAds(setup, NOW)).toEqual([]);
  });
});

describe("Instant forms — the custom form (§6.4)", () => {
  const custom = JSON.stringify(META_CUSTOM_FORM);

  it("counts as a valid pick and sends `custom` as the form id", () => {
    const setup = readMetaAdsForm(formOf({ goal: "leads", subGoal: "Instant forms", leadForm: custom }));
    expect(setup.leadForm).toEqual({ id: "custom", name: "Custom Form" });
    expect(validateMetaAds({ ...SETUP, goal: "leads", subGoal: "Instant forms", leadForm: setup.leadForm }, NOW)).toEqual(
      [],
    );
    const data = dataOf({ ...SETUP, goal: "leads", subGoal: "Instant forms", leadForm: setup.leadForm });
    expect(data["Instant form ID"]).toBe("custom");
    expect(data["Instant form"]).toBe("Custom Form");
  });
});

describe("Retargeting payload (§7, §15.1)", () => {
  const audiences = [
    { id: "a1", name: "Buyers", profileId: "x" },
    { id: "a2", name: "Visitors" },
  ];
  const retargeting: MetaAdsSetup = { ...SETUP, audienceType: "retargeting", audiences };

  it("drops the five new-audience keys and names the audiences", () => {
    const data = dataOf(retargeting);
    for (const key of ["Age range", "Gender", "Interests and behaviors", "Selected interests", "Other interest (optional)"]) {
      expect(data).not.toHaveProperty(key);
    }
    expect(data["Audience type"]).toBe("Retargeting");
    expect(data["Retargeting audiences"]).toBe("Buyers, Visitors");
  });

  it("keeps the new-audience keys, and no audience list, for a new audience", () => {
    const data = dataOf(SETUP);
    expect(data["Age range"]).toBe("All");
    expect(data["Selected interests"]).toBe("Travel");
    expect(data).not.toHaveProperty("Retargeting audiences");
  });

  it("adds the two `{ id, name }` arrays beside the full picks on the launch body", () => {
    const extras = metaAdsLaunchExtras(retargeting);
    const pairs = [
      { id: "a1", name: "Buyers" },
      { id: "a2", name: "Visitors" },
    ];
    expect(extras.retargetingAudiences).toEqual(audiences);
    expect(extras.retargetingData).toEqual(pairs);
    expect(extras.selectedRetargetingAudiences).toEqual(pairs);
    expect(metaAdsLaunchExtras(SETUP)).toEqual({ audienceType: "new" });
  });
});

describe("Offer (MA-STEP-03)", () => {
  it("offers the fifteen suggestions", () => {
    expect(META_OFFER_PRESETS).toHaveLength(15);
    expect(META_OFFER_PRESETS[0]).toBe("$20 off your first purchase");
  });

  it("formats none, custom text and an empty custom", () => {
    expect(metaOfferValue("none", "")).toBe("No offer");
    expect(metaOfferValue("custom", "  $20 off  ")).toBe("$20 off");
    expect(metaOfferValue("custom", "")).toBe("Custom offer");
  });

  it("reads the trimmed custom text and sends it", () => {
    const setup = readMetaAdsForm(formOf({ goal: "sales", offer: "custom", customOffer: " Buy one, get one free " }));
    expect(setup.offer).toBe("custom");
    expect(setup.customOffer).toBe("Buy one, get one free");
    const data = dataOf({ ...SETUP, offer: setup.offer, customOffer: setup.customOffer });
    expect(data["Offer type"]).toBe("custom");
    expect(data["Offer value"]).toBe("Buy one, get one free");
  });

  it("does not refuse an empty custom offer", () => {
    expect(validateMetaAds({ ...SETUP, offer: "custom", customOffer: "" }, NOW)).toEqual([]);
  });

  it("treats an old percentage value as no offer", () => {
    const setup = readMetaAdsForm(formOf({ goal: "leads", offer: "5", customOffer: "5" }));
    expect(setup.offer).toBe("none");
    expect(setup.customOffer).toBe("");
    expect(dataOf({ ...SETUP, offer: setup.offer })["Offer value"]).toBe("No offer");
  });
});

describe("Campaign dates (MA-STEP-06)", () => {
  it("reads real days only", () => {
    const setup = readMetaAdsForm(formOf({ startDate: "2026-10-05", endDate: "2026-02-30" }));
    expect(setup.startDate).toBe("2026-10-05");
    expect(setup.endDate).toBe("");
  });

  it("requires both dates", () => {
    const problems = validateMetaAds({ ...SETUP, startDate: "", endDate: "" }, NOW);
    expect(problems).toEqual(expect.arrayContaining(["Choose a start date.", "Choose an end date."]));
  });

  it("refuses an end on or before the start", () => {
    expect(validateMetaAds({ ...SETUP, endDate: SETUP.startDate }, NOW)).toEqual(["End date must be after start date."]);
    expect(validateMetaAds({ ...SETUP, endDate: "2026-10-04" }, NOW)).toEqual(["End date must be after start date."]);
  });

  it("allows yesterday in UTC, for time zones behind it, and nothing earlier", () => {
    expect(validateMetaAds({ ...SETUP, startDate: "2026-10-01" }, NOW)).toEqual([]);
    expect(validateMetaAds({ ...SETUP, startDate: "2026-09-30" }, NOW)).toEqual(["Start date can't be in the past."]);
  });

  it("sends the dates as chosen", () => {
    const data = dataOf(SETUP);
    expect(data["Campaign start date"]).toBe("2026-10-05");
    expect(data["Campaign end date"]).toBe("2026-10-20");
  });
});

describe("Delivery hours (MA-STEP-07/08b)", () => {
  it("lists 6:00 AM to 11:00 PM by the hour", () => {
    expect(META_HOURS[0]).toBe("6:00 AM");
    expect(META_HOURS).toContain("12:00 PM");
    expect(META_HOURS[META_HOURS.length - 1]).toBe("11:00 PM");
    expect(META_HOURS).toHaveLength(18);
  });

  it("keeps listed hours only, and only with custom timing on", () => {
    const on = readMetaAdsForm(formOf({ customTiming: "on", scheduleStart: "9:00 AM", scheduleEnd: "03:00" }));
    expect([on.scheduleStart, on.scheduleEnd]).toEqual(["9:00 AM", ""]);
    const off = readMetaAdsForm(formOf({ scheduleStart: "9:00 AM", scheduleEnd: "5:00 PM" }));
    expect([off.customTiming, off.scheduleStart, off.scheduleEnd]).toEqual([false, "", ""]);
  });

  it("forces a lifetime budget with custom timing on", () => {
    const setup = readMetaAdsForm(formOf({ customTiming: "on", budgetType: "daily" }));
    expect(setup.budgetType).toBe("lifetime");
  });

  it("needs both times, and the end after the start", () => {
    const timed = { ...SETUP, customTiming: true, budgetType: "lifetime" };
    expect(validateMetaAds({ ...timed, scheduleStart: "9:00 AM", scheduleEnd: "" }, NOW)).toEqual([
      "Custom timing needs a start and an end time.",
    ]);
    expect(validateMetaAds({ ...timed, scheduleStart: "5:00 PM", scheduleEnd: "9:00 AM" }, NOW)).toEqual([
      "Schedule end time must be after the start time.",
    ]);
    expect(validateMetaAds({ ...timed, scheduleStart: "9:00 AM", scheduleEnd: "5:00 PM" }, NOW)).toEqual([]);
  });

  it("writes the schedule as the workflow reads it", () => {
    const timed = dataOf({ ...SETUP, customTiming: true, scheduleStart: "9:00 AM", scheduleEnd: "5:00 PM" });
    expect(timed["Custom timing schedule"]).toBe("Enabled");
    expect(timed["Schedule start time"]).toBe("9:00 AM");
    expect(timed["Schedule end time"]).toBe("5:00 PM");

    const allDay = dataOf(SETUP);
    expect(allDay["Custom timing schedule"]).toBe("Disabled");
    expect(allDay["Schedule start time"]).toBe("All day");
    expect(allDay["Schedule end time"]).toBe("All day");
  });

  it("no longer reads a run length", () => {
    expect(readMetaAdsForm(formOf({ days: "30" }))).not.toHaveProperty("days");
  });
});

describe("Meta goal starts unanswered (2026-10-06)", () => {
  it("reports a missing goal instead of quietly choosing Leads", () => {
    const setup = readMetaAdsForm(formOf({}));
    expect(setup.goalMissing).toBe(true);
    expect(validateMetaAds({ ...SETUP, goalMissing: true }, NOW)).toContain("Choose what the campaign should do.");
  });

  it("is not missing once a goal is posted", () => {
    expect(readMetaAdsForm(formOf({ goal: "leads", subGoal: "WhatsApp" })).goalMissing).toBeUndefined();
  });
});

describe("Meta setup — Engagement promotes an existing post (LBS-1253)", () => {
  const engagement = { ...SETUP, goal: "engagement" as const, subGoal: "" };

  it("needs the post, and says when what was typed is not one", () => {
    expect(validateMetaAds(engagement, NOW)).toContain("Add the ID or link of the Facebook or Instagram post to promote.");
    const typed = readMetaAdsForm(formOf({ goal: "engagement", engagementPost: "my best post" }));
    expect(typed.engagementPost).toBe("");
    expect(validateMetaAds({ ...engagement, ...typed, goal: "engagement" }, NOW)).toContain(
      "That isn't a Facebook or Instagram post. Paste the post's ID or its link.",
    );
  });

  it("tells the agent and the launch which post", () => {
    const setup = { ...engagement, engagementPost: "111111_222222" };
    expect(validateMetaAds(setup, NOW)).toEqual([]);
    expect(dataOf(setup)["Existing post to promote"]).toBe("111111_222222");
    expect(metaAdsLaunchExtras(setup)).toMatchObject({ existingPostId: "111111_222222", object_story_id: "111111_222222" });
  });

  it("drops a post left in the field after switching to another goal", () => {
    const setup = readMetaAdsForm(formOf({ goal: "traffic", engagementPost: "1234567890" }));
    expect(setup.engagementPost).toBe("");
    expect(metaAdsLaunchExtras({ ...SETUP, engagementPost: "1234567890" })).not.toHaveProperty("existingPostId");
  });
});
