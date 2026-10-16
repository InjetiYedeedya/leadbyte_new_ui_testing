import {
  GOALS,
  GOOGLE_HOURS,
  NO_HOURS_GOALS,
  budgetCurrencyNote,
  googleAdsLaunchExtras,
  googleAdsPayload,
  readGoogleAdsForm,
  validateGoogleAds,
  type GoogleAdsSetup,
} from "@/lib/data/google-ads-setup";

function formOf(entries: Record<string, string | string[]>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const one of Array.isArray(value) ? value : [value]) form.append(key, one);
  }
  return form;
}

const VALID: GoogleAdsSetup = {
  businessName: "ZippyGo",
  service: "Voice-first flight booking",
  offer: "none",
  customOffer: "",
  goal: "leads",
  subGoal: "Forms",
  ages: ["All"],
  gender: "all",
  interests: ["Travel"],
  customInterest: "",
  startDate: "2099-01-01",
  endDate: "2099-01-31",
  scheduleStart: "9:00 AM",
  scheduleEnd: "9:00 PM",
  budgetType: "daily",
  budgetAmount: 2500,
  automationMode: "full",
  audienceType: "new",
  audiences: [],
  // Leads → Forms needs one of the account's lead forms (2026-09-30).
  leadForm: { id: "lf-1", name: "Quote request" },
  storeLocations: [],
};

describe("readGoogleAdsForm", () => {
  it("drops a sub-goal the chosen goal does not own", () => {
    // `brand` has no sub-goals. Sending one invents a field the backend has no
    // branch for, and it would sit in the saved row looking meaningful.
    const setup = readGoogleAdsForm(formOf({ goal: "brand", subGoal: "Forms" }));
    expect(setup.subGoal).toBe("");
  });

  it("keeps a sub-goal the goal does own", () => {
    expect(readGoogleAdsForm(formOf({ goal: "conversions", subGoal: "Calls" })).subGoal).toBe(
      "Calls",
    );
  });

  it("rejects a sub-goal from a different goal", () => {
    // `Forms` belongs to `leads`, not `conversions`.
    expect(readGoogleAdsForm(formOf({ goal: "conversions", subGoal: "Forms" })).subGoal).toBe("");
  });

  it("collapses age bands to All when All is among them", () => {
    // Targeting "everyone" and "25-34" at once is not a thing to ask for.
    const setup = readGoogleAdsForm(formOf({ ages: ["All", "25-34"] }));
    expect(setup.ages).toEqual(["All"]);
  });

  it("keeps a custom offer only when custom is chosen", () => {
    expect(readGoogleAdsForm(formOf({ offer: "custom", customOffer: " $20 off " })).customOffer).toBe("$20 off");
    expect(readGoogleAdsForm(formOf({ offer: "none", customOffer: "40" })).customOffer).toBe("");
  });

  it("reads an old percentage offer as no offer", () => {
    // A stored draft from before the custom/none model.
    for (const old of ["5", "10", "25"]) {
      expect(readGoogleAdsForm(formOf({ offer: old })).offer).toBe("none");
    }
  });

  it("falls back to safe defaults for anything unrecognised", () => {
    const setup = readGoogleAdsForm(formOf({ offer: "999", gender: "x", budgetType: "weekly" }));
    // An unknown budget type reads as NOT CHOSEN, which the validator reports.
    expect([setup.offer, setup.gender, setup.budgetType]).toEqual(["none", "all", ""]);
  });
});

describe("validateGoogleAds", () => {
  it("passes a complete setup", () => {
    expect(validateGoogleAds(VALID)).toEqual([]);
  });

  it("reports every problem at once, not one per round trip", () => {
    const problems = validateGoogleAds({
      ...VALID,
      businessName: "",
      service: "",
      budgetAmount: 0,
    });
    expect(problems).toHaveLength(3);
  });

  it("requires a sub-goal only when the goal has them", () => {
    expect(validateGoogleAds({ ...VALID, goal: "leads", subGoal: "" })).toHaveLength(1);
    expect(validateGoogleAds({ ...VALID, goal: "brand", subGoal: "" })).toEqual([]);
  });

  it("needs a start date not before yesterday (UTC) and an end after it", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    expect(validateGoogleAds({ ...VALID, startDate: "", endDate: "" }, now)).toEqual([
      "Choose a start date.",
      "Choose an end date.",
    ]);
    // Yesterday in UTC is allowed: the customer's own today may still be it.
    expect(validateGoogleAds({ ...VALID, startDate: "2026-10-01", endDate: "2026-10-05" }, now)).toEqual([]);
    expect(validateGoogleAds({ ...VALID, startDate: "2026-09-30", endDate: "2026-10-05" }, now)).toContain(
      "Start date can't be in the past.",
    );
    expect(validateGoogleAds({ ...VALID, startDate: "2026-10-05", endDate: "2026-10-05" }, now)).toContain(
      "End date must be after start date.",
    );
  });

  it("needs an interest for a new audience, but not for retargeting", () => {
    expect(validateGoogleAds({ ...VALID, interests: [] })).toEqual(["Select at least one interest or behavior."]);
    expect(validateGoogleAds({ ...VALID, interests: ["Other"], customInterest: "" })).toEqual([
      "Describe the interest you meant by “Other”.",
    ]);
    expect(validateGoogleAds({ ...VALID, interests: ["Other"], customInterest: "pilots" })).toEqual([]);
    expect(
      validateGoogleAds({
        ...VALID,
        interests: [],
        audienceType: "retargeting",
        audiences: [{ id: "a1", name: "Visitors" }],
      }),
    ).toEqual([]);
  });

  it("takes either hour optional, and refuses only a pair that runs backwards", () => {
    expect(validateGoogleAds({ ...VALID, scheduleStart: "", scheduleEnd: "" })).toEqual([]);
    expect(validateGoogleAds({ ...VALID, scheduleStart: "9:00 PM", scheduleEnd: "" })).toEqual([]);
    expect(validateGoogleAds({ ...VALID, scheduleStart: "", scheduleEnd: "3:00 AM" })).toEqual([]);
    expect(validateGoogleAds({ ...VALID, scheduleStart: "9:00 PM", scheduleEnd: "9:00 AM" })).toEqual([
      "Schedule end time must be after the start time.",
    ]);
  });

  it("rejects a zero budget, which would launch a campaign that cannot run", () => {
    expect(validateGoogleAds({ ...VALID, budgetAmount: 0 })).toHaveLength(1);
  });
});

describe("googleAdsPayload", () => {
  const context = { email: "a@b.com", userId: "uid-1", sessionId: "s1" };

  /**
   * These labels are copied from a live n8n execution. Google's differ from
   * Meta's in ways that look like typos and are not: "Lead form ID" rather than
   * "Instant form ID", and a "(optional)" suffix that is part of the key.
   */
  it("uses Google's own label set, not Meta's", () => {
    // A campaign with none of the optional picks keeps the captured shape exactly.
    const data = googleAdsPayload({ ...VALID, subGoal: "Calls", leadForm: null }, context)
      .campaign_data as Record<string, string>;

    expect(Object.keys(data)).toEqual([
      "Business name",
      "Location",
      "Country",
      "State",
      "City",
      "Service or product",
      "Offer type",
      "Offer value",
      "Ad goal",
      "Sub goal",
      "Lead form ID",
      "Audience type",
      "Age range",
      "Gender",
      "Interests and behaviors",
      // Added 2026-09-08: Google sent only the joined line, so the checkbox
      // picks and the free-text "other" never reached the workflow. Meta has
      // always sent all three and the working `adsreceiver` body carries them.
      "Selected interests",
      "Other interest (optional)",
      "Campaign start date",
      "Campaign end date",
      "Schedule start time (optional)",
      "Schedule end time (optional)",
      "Budget type",
      "Budget amount",
      "Budget display",
    ]);
  });

  it("asks no place on the setup form — the details form does", () => {
    const data = googleAdsPayload(VALID, context).campaign_data as Record<string, string>;
    expect([data.Location, data.Country, data.State, data.City]).toEqual([
      "Not provided",
      "Not provided",
      "Not provided",
      "Not provided",
    ]);
    expect(validateGoogleAds(VALID)).not.toContain("Add at least one location.");
  });

  it("sends the goal in words, as the live payload spells it", () => {
    const data = googleAdsPayload({ ...VALID, goal: "app_promo" }, context)
      .campaign_data as Record<string, string>;
    expect(data["Ad goal"]).toBe("app promo");
  });

  it("says `Any time` for an unset schedule, not Meta's `All day`", () => {
    const data = googleAdsPayload({ ...VALID, scheduleStart: "", scheduleEnd: "" }, context)
      .campaign_data as Record<string, string>;
    expect(data["Schedule start time (optional)"]).toBe("Any time");
  });

  it("opens with the exact sentence the workflow expects", () => {
    // Not "…create the Google Ads campaign" — the live intro says "the campaign".
    expect(googleAdsPayload(VALID, context).chatInput).toContain(
      "My Google Ads AI Agent setup is complete. Please help me finalize and create the campaign.",
    );
  });

  it("carries interests, which Google collects just as Meta does", () => {
    const data = googleAdsPayload(
      { ...VALID, interests: ["Travel", "Other"], customInterest: "frequent flyers" },
      context,
    ).campaign_data as Record<string, string>;
    expect(data["Interests and behaviors"]).toBe("Travel, frequent flyers");
  });

  it("sends the offer in the customer's words, or a spelled-out absence", () => {
    const value = (offer: "custom" | "none", customOffer: string) => {
      const data = googleAdsPayload({ ...VALID, offer, customOffer }, context).campaign_data as Record<string, string>;
      return [data["Offer type"], data["Offer value"]];
    };
    expect(value("custom", "$20 off your first purchase")).toEqual(["custom", "$20 off your first purchase"]);
    expect(value("custom", "")).toEqual(["custom", "Custom offer"]);
    expect(value("none", "")).toEqual(["none", "No offer"]);
  });

  it("sends the chosen dates and hours, and Any time for an unset hour", () => {
    const data = googleAdsPayload({ ...VALID, scheduleEnd: "" }, context).campaign_data as Record<string, string>;
    expect(data["Campaign start date"]).toBe("2099-01-01");
    expect(data["Campaign end date"]).toBe("2099-01-31");
    expect(data["Schedule start time (optional)"]).toBe("9:00 AM");
    expect(data["Schedule end time (optional)"]).toBe("Any time");
  });

  it("carries the identifiers the webhook keys on", () => {
    const payload = googleAdsPayload(VALID, context);
    expect(payload.email_address).toBe("a@b.com");
    expect(payload.user_id).toBe("uid-1");
    expect(payload.session_id).toBe("s1");
    expect(payload.action_type).toBe("get_suggestion");
  });

  it("omits user_id rather than sending it empty", () => {
    const payload = googleAdsPayload(VALID, { email: "a@b.com", sessionId: "s1" });
    expect("user_id" in payload).toBe(false);
  });
});

/**
 * Regression: the interests a customer types were not reaching the workflow.
 * Google sent only the joined "Interests and behaviors" line, so a free-text
 * audience — which is where the ads-website prefill puts anything the checkbox
 * list has no option for — went nowhere. Meta has always sent all three.
 */
describe("googleAdsPayload interests", () => {
  const context = { email: "a@b.com", userId: "uid-1", sessionId: "s1" };

  it("sends the picks and the free text as their own fields", () => {
    const data = googleAdsPayload(
      { ...VALID, interests: ["Technology", "Other"], customInterest: "restaurant owners" },
      context,
    ).campaign_data as Record<string, string>;

    expect(data["Selected interests"]).toBe("Technology, Other");
    expect(data["Other interest (optional)"]).toBe("restaurant owners");
    // The joined line drops the literal "Other" and carries the real words.
    expect(data["Interests and behaviors"]).toBe("Technology, restaurant owners");
  });

  it("sends empty strings rather than omitting them when nothing was picked", () => {
    const data = googleAdsPayload(
      { ...VALID, interests: [], customInterest: "" },
      context,
    ).campaign_data as Record<string, string>;

    // A missing key is a different message to an empty one — the same rule the
    // rest of these payloads follow.
    expect(data).toHaveProperty("Selected interests");
    expect(data).toHaveProperty("Other interest (optional)");
  });
});

describe("the live-list answers (legacy flow guide §3, 2026-09-30)", () => {
  const context = { email: "a@b.com", userId: "uid-1", sessionId: "s1" };
  const pick = (id: string, name: string, extra: Record<string, string> = {}) =>
    JSON.stringify({ id, name, ...extra });

  it("reads retargeting audiences only when retargeting", () => {
    const base = { goal: "brand", audienceType: "retargeting", retargetingAudience: [pick("a1", "Visitors"), pick("a1", "Visitors")] };
    expect(readGoogleAdsForm(formOf(base)).audiences).toEqual([{ id: "a1", name: "Visitors" }]);
    expect(readGoogleAdsForm(formOf({ ...base, audienceType: "new" })).audiences).toEqual([]);
  });

  it("needs a lead form for Leads → Forms, and none otherwise", () => {
    const withForm = readGoogleAdsForm(formOf({ goal: "leads", subGoal: "Forms", leadForm: pick("lf", "Quote") }));
    expect(withForm.leadForm).toEqual({ id: "lf", name: "Quote" });
    expect(validateGoogleAds({ ...VALID, leadForm: null })).toContain("Choose the Google lead form the ads should use.");
    expect(readGoogleAdsForm(formOf({ goal: "leads", subGoal: "Calls", leadForm: pick("lf", "Quote") })).leadForm).toBeNull();
  });

  it("keeps only stores with a Business Profile, and drops hours for local campaigns", () => {
    const setup = readGoogleAdsForm(
      formOf({
        goal: "local_store",
        storeLocation: [pick("s1", "1 Main St", { profileId: "gbp", assetSet: "as" }), pick("s2", "No profile")],
        scheduleStart: "9:00 AM",
        scheduleEnd: "5:00 PM",
      }),
    );
    expect(setup.storeLocations.map((s) => s.id)).toEqual(["s1"]);
    expect(setup.scheduleStart).toBe("");
    expect(googleAdsLaunchExtras(setup).locationData).toEqual([
      { id: "s1", address: "1 Main St", asset_set: "as", business_profile_id: "gbp" },
    ]);
    expect(validateGoogleAds({ ...setup, businessName: "x", service: "y", budgetAmount: 10, storeLocations: [] })).toContain(
      "Choose at least one store location with a Google Business Profile.",
    );
  });

  it("says Retargeting in the payload, and the audiences by name", () => {
    const data = googleAdsPayload(
      { ...VALID, audienceType: "retargeting", audiences: [{ id: "a1", name: "Visitors" }] },
      context,
    ).campaign_data as Record<string, string>;
    expect(data["Audience type"]).toBe("Retargeting");
    expect(data["Retargeting audiences"]).toBe("Visitors");
    expect(data["Lead form ID"]).toBe("lf-1");
    // A saved audience is people already found: none of the new-audience keys.
    for (const key of ["Age range", "Gender", "Interests and behaviors", "Selected interests", "Other interest (optional)"]) {
      expect(data).not.toHaveProperty(key);
    }
  });

  it("names the retargeted audiences three ways in the launch extras, as Meta does", () => {
    const audiences = [{ id: "a1", name: "Visitors", profileId: "p" }];
    const extras = googleAdsLaunchExtras({ ...VALID, audienceType: "retargeting", audiences });
    expect(extras.retargetingAudiences).toEqual(audiences);
    expect(extras.retargetingData).toEqual([{ id: "a1", name: "Visitors" }]);
    expect(extras.selectedRetargetingAudiences).toEqual([{ id: "a1", name: "Visitors" }]);
    expect(googleAdsLaunchExtras(VALID)).not.toHaveProperty("retargetingData");
  });

  it("sends custom as the lead form id for the form the agent creates", () => {
    const setup = readGoogleAdsForm(
      formOf({ goal: "leads", subGoal: "Forms", leadForm: pick("custom", "Custom Form") }),
    );
    expect(setup.leadForm).toEqual({ id: "custom", name: "Custom Form" });
    const data = googleAdsPayload({ ...VALID, leadForm: setup.leadForm }, context).campaign_data as Record<string, string>;
    expect(data["Lead form ID"]).toBe("custom");
    expect(googleAdsLaunchExtras({ ...VALID, leadForm: setup.leadForm }).leadFormId).toBe("custom");
  });
});

describe("budgetCurrencyNote", () => {
  it("names the account's currency code when known, and never guesses one", () => {
    expect(budgetCurrencyNote("INR")).toBe("(in INR, your ad account's currency)");
    expect(budgetCurrencyNote("")).toBe("(in your ad account's currency)");
    expect(budgetCurrencyNote("rupees")).toBe("(in your ad account's currency)");
  });
});

describe("goals", () => {
  it("offers the legacy seven, with no Remarketing", () => {
    expect(GOALS.map((goal) => goal.id)).toEqual([
      "brand",
      "traffic",
      "leads",
      "conversions",
      "app_promo",
      "app_actions",
      "local_store",
    ]);
  });

  it("sends Local store and visit as `local store`, and asks it no hours", () => {
    const data = googleAdsPayload(
      { ...VALID, goal: "local_store", subGoal: "", leadForm: null },
      { email: "a@b.com", sessionId: "s1" },
    ).campaign_data as Record<string, string>;
    expect(data["Ad goal"]).toBe("local store");
    expect(NO_HOURS_GOALS).toEqual(["local_store", "app_promo", "app_actions"]);
  });

  it("reads an old `local` or `remarketing` goal as the default", () => {
    expect(readGoogleAdsForm(formOf({ goal: "local" })).goal).toBe("leads");
    expect(readGoogleAdsForm(formOf({ goal: "remarketing" })).goal).toBe("leads");
  });
});

describe("schedule", () => {
  it("lists every hour from 12:00 AM to 11:00 PM", () => {
    expect(GOOGLE_HOURS).toHaveLength(24);
    expect(GOOGLE_HOURS[0]).toBe("12:00 AM");
    expect(GOOGLE_HOURS[12]).toBe("12:00 PM");
    expect(GOOGLE_HOURS[23]).toBe("11:00 PM");
  });

  it("reads dates and listed hours, and anything else as unset", () => {
    const setup = readGoogleAdsForm(
      formOf({ startDate: "2099-02-01", endDate: "2099-02-30", scheduleStart: "6:00 AM", scheduleEnd: "Any time" }),
    );
    expect([setup.startDate, setup.endDate, setup.scheduleStart, setup.scheduleEnd]).toEqual([
      "2099-02-01",
      "",
      "6:00 AM",
      "",
    ]);
    expect(readGoogleAdsForm(formOf({ scheduleStart: "09:00" })).scheduleStart).toBe("");
  });

  it("drops the hours for the app goals too", () => {
    const setup = readGoogleAdsForm(formOf({ goal: "app_actions", scheduleStart: "9:00 AM", scheduleEnd: "5:00 PM" }));
    expect([setup.scheduleStart, setup.scheduleEnd]).toEqual(["", ""]);
  });
});
