import {
  META_BUDGET_TYPES,
  metaAdsPayload,
  readMetaAdsForm,
  validateMetaAds,
  type MetaAdsSetup,
} from "@/lib/data/meta-ads-setup";
import {
  formatsForGoal,
  linkedInAdsPayload,
  readLinkedInAdsForm,
  validateLinkedInAds,
  type LinkedInAdsSetup,
} from "@/lib/data/linkedin-ads-setup";

function formOf(entries: Record<string, string | string[]>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const one of Array.isArray(value) ? value : [value]) form.append(key, one);
  }
  return form;
}

const META: MetaAdsSetup = {
  businessName: "ZippyGo",
  locations: [{ country: "India", state: "Telangana", city: "Hyderabad", zip: "" }],
  service: "Voice-first flight booking",
  offer: "custom",
  customOffer: "10% off your first booking",
  goal: "leads",
  subGoal: "Instant forms",
  adFormat: "image",
  ages: ["All"],
  gender: "all",
  interests: ["Travel"],
  customInterest: "",
  startDate: "2099-01-10",
  endDate: "2099-02-09",
  customTiming: false,
  scheduleStart: "",
  scheduleEnd: "",
  budgetType: "daily",
  budgetAmount: 5000,
  automationMode: "full",
  audienceType: "new",
  audiences: [],
  // Leads → Instant forms needs one of the account's instant forms (2026-09-30).
  leadForm: { id: "if-1", name: "Lead form" },
  engagementPost: "",
};

describe("Meta Ads setup", () => {
  it("bills daily or lifetime, as the legacy app does", () => {
    expect(META_BUDGET_TYPES).toEqual(["daily", "lifetime"]);
    expect(readMetaAdsForm(formOf({ budgetType: "lifetime" })).budgetType).toBe("lifetime");
    // "monthly" was never a Meta budget; a value nothing handles must not survive the read.
    expect(readMetaAdsForm(formOf({ budgetType: "monthly" })).budgetType).toBe("");
    // And not choosing one is a problem the form names, not a silent "daily".
    expect(validateMetaAds(readMetaAdsForm(formOf({ budgetType: "" })))).toContain("Choose a budget type.");
  });

  it("forces a lifetime budget when custom timing is on", () => {
    // Custom timing spans a window, so a budget that resets inside it would
    // quietly mean something else.
    const setup = readMetaAdsForm(
      formOf({ customTiming: "on", budgetType: "daily", scheduleStart: "9:00 AM", scheduleEnd: "6:00 PM" }),
    );
    expect(setup.budgetType).toBe("lifetime");
  });

  it("drops the schedule entirely when custom timing is off", () => {
    const setup = readMetaAdsForm(formOf({ scheduleStart: "9:00 AM", scheduleEnd: "6:00 PM" }));
    expect([setup.scheduleStart, setup.scheduleEnd]).toEqual(["", ""]);
  });

  it("keeps only sub-goals the Meta goal owns", () => {
    // `Instant forms` is a leads sub-goal, not an awareness one.
    expect(readMetaAdsForm(formOf({ goal: "awareness", subGoal: "Instant forms" })).subGoal).toBe("");
    expect(readMetaAdsForm(formOf({ goal: "awareness", subGoal: "Reach" })).subGoal).toBe("Reach");
  });

  it("sends the labels the live workflow actually uses", () => {
    // Copied from a real n8n execution: these are human sentences, not
    // identifiers. `businessName` is a different key and the agent will not
    // find it.
    const data = metaAdsPayload(META, { email: "a@b.com", sessionId: "s1" })
      .campaign_data as Record<string, string>;

    expect(Object.keys(data)).toEqual(
      expect.arrayContaining([
        "Business name",
        "Service or product",
      "Ad format",
        "Ad goal",
        "Sub goal",
        "Instant form ID",
        "Audience type",
        "Interests and behaviors",
        "Other interest (optional)",
        "Campaign start date",
        "Budget display",
      ]),
    );
  });

  it("writes an absent value out rather than leaving it blank", () => {
    // An empty string in a prompt reads as a field the model should fill in.
    const data = metaAdsPayload({ ...META, locations: [] }, { email: "a@b.com", sessionId: "s1" })
      .campaign_data as Record<string, string>;
    expect(data["City"]).toBe("Not provided");
    expect(data["Sub goal"]).toBe("Instant forms");
  });

  it("fills all four location labels from the cascades", () => {
    // The live body carries the place four ways and the workflow reads all of
    // them; Country and State used to go out as "Not provided" every time.
    const data = metaAdsPayload(
      {
        ...META,
        locations: [
          { country: "India", state: "Tamil Nadu", city: "Kanchipuram", zip: "" },
          { country: "India", state: "Karnataka", city: "Gulbarga", zip: "" },
        ],
      },
      { email: "a@b.com", sessionId: "s1" },
    ).campaign_data as Record<string, string>;

    expect(data["Location"]).toBe("Kanchipuram > Tamil Nadu > India | Gulbarga > Karnataka > India");
    expect(data["Country"]).toBe("India");
    expect(data["State"]).toBe("Tamil Nadu, Karnataka");
    expect(data["City"]).toBe("Kanchipuram, Gulbarga");
  });

  it("reads the location cascades off the form", () => {
    const setup = readMetaAdsForm(
      formOf({
        "location:0_country": "India",
        "location:0_state": "Tamil Nadu",
        "location:0_city": "Kanchipuram",
      }),
    );

    expect(setup.locations).toEqual([
      { country: "India", state: "Tamil Nadu", city: "Kanchipuram", zip: "" },
    ]);
  });

  it("no longer demands a location at setup", () => {
    // The setup form stopped asking on 2026-09-08. The campaign-details form
    // the agent returns has its own "Location Type" question, so requiring one
    // here blocked a launch on an answer the customer is about to be asked for
    // anyway.
    expect(validateMetaAds({ ...META, locations: [] })).not.toContain(
      "Add at least one location to target.",
    );
    expect(validateMetaAds(META)).not.toContain("Add at least one location to target.");
  });

  it("sends the start and end dates the customer chose", () => {
    const data = metaAdsPayload(META, { email: "a@b.com", sessionId: "s1" })
      .campaign_data as Record<string, string>;

    expect(data["Campaign start date"]).toBe("2099-01-10");
    expect(data["Campaign end date"]).toBe("2099-02-09");
  });

  it("formats the budget as the workflow prints it", () => {
    const data = metaAdsPayload({ ...META, budgetAmount: 10 }, { email: "a@b.com", sessionId: "s1" })
      .campaign_data as Record<string, string>;
    expect(data["Budget amount"]).toBe("$10");
    expect(data["Budget display"]).toBe("$10 / day");
  });

  it("replaces the Other chip with what the customer actually typed", () => {
    const data = metaAdsPayload(
      { ...META, interests: ["Travel", "Other"], customInterest: "Corporate travel desks" },
      { email: "a@b.com", sessionId: "s1" },
    ).campaign_data as Record<string, string>;

    expect(data["Interests and behaviors"]).toContain("Corporate travel desks");
    // The chips as clicked are still sent separately, as the live app does.
    expect(data["Selected interests"]).toBe("Travel, Other");
  });

  it("asks what Other meant rather than sending the word", () => {
    const problems = validateMetaAds({ ...META, interests: ["Other"], customInterest: "" });
    expect(problems).toHaveLength(1);
  });

  it("requires both ends of a custom timing window", () => {
    expect(
      validateMetaAds({ ...META, customTiming: true, scheduleStart: "9:00 AM", scheduleEnd: "" }),
    ).toHaveLength(1);
  });
});

const LINKEDIN: LinkedInAdsSetup = {
  businessName: "ZippyGo",
  goal: "leads",
  budgetType: "daily",
  budgetAmount: 4000,
  days: 30,
  criteria: ["titles", "interests"],
  targeting: { titles: ["Head of Travel"] },
  customTargeting: "",
  adFormat: "Lead gen form",
  automationMode: "full",
};

describe("LinkedIn Ads setup", () => {
  it("keeps an ad format only when the goal allows it", () => {
    // `video` allows Video and nothing else.
    expect(readLinkedInAdsForm(formOf({ goal: "video", adFormat: "Carousel" })).adFormat).toBe("");
    expect(readLinkedInAdsForm(formOf({ goal: "video", adFormat: "Video" })).adFormat).toBe("Video");
  });

  it("offers formats per goal, and the job goal's are its own", () => {
    expect(formatsForGoal("video")).toEqual(["Video"]);
    expect(formatsForGoal("jobs")).toEqual(["Job ad", "Single image"]);
    expect(formatsForGoal("nonsense")).toEqual([]);
  });

  it("pairs goals and formats exactly as the live app does (LINKEDIN_ADS_AGENT_SPEC §5.6)", () => {
    expect(formatsForGoal("awareness")).toEqual([
      "Single image", "Carousel", "Video", "Text ad", "Spotlight", "Follower ad",
    ]);
    expect(formatsForGoal("visits")).toEqual(["Single image", "Carousel", "Video", "Conversation ad"]);
    expect(formatsForGoal("engagement")).toEqual(["Single image", "Carousel", "Video", "Event ad"]);
    expect(formatsForGoal("leads")).toEqual(["Lead gen form", "Single image", "Video", "Conversation ad"]);
    expect(formatsForGoal("conversions")).toEqual(["Single image", "Carousel", "Video"]);
  });

  it("always includes interests in the criteria", () => {
    // The live app has interests permanently on.
    expect(readLinkedInAdsForm(formOf({ criteria: ["titles"] })).criteria).toContain("interests");
  });

  it("keeps the order criteria were chosen in, Member interests last", () => {
    const setup = readLinkedInAdsForm(formOf({ criteria: ["skills", "interests", "titles"] }));
    expect(setup.criteria).toEqual(["skills", "titles", "interests"]);
  });

  it("treats a stray `none` as no criterion, leaving Member interests", () => {
    // "None" is a reset in the live app, not a stored choice.
    expect(readLinkedInAdsForm(formOf({ criteria: ["none"] })).criteria).toEqual(["interests"]);
  });

  it("reads each criterion's own values, deduped and only for chosen criteria", () => {
    const setup = readLinkedInAdsForm(
      formOf({
        criteria: ["titles"],
        targeting_titles: ["CEO", "ceo", " Founder "],
        targeting_skills: ["Python"],
        targeting_interests: ["SaaS"],
      }),
    );
    expect(setup.targeting).toEqual({ titles: ["CEO", "Founder"], interests: ["SaaS"] });
  });

  it("holds company size to its own options", () => {
    const setup = readLinkedInAdsForm(
      formOf({ criteria: ["size"], targeting_size: ["11-50", "a billion"] }),
    );
    expect(setup.targeting.size).toEqual(["11-50"]);
  });

  it("sends readable criteria and per-criterion details (spec §5.7)", () => {
    const data = linkedInAdsPayload(
      { ...LINKEDIN, targeting: { titles: ["CEO", "Founder"], interests: ["SaaS"] } },
      { email: "a@b.com", sessionId: "s1" },
    ).campaign_data as Record<string, string>;
    expect(data["Targeting criteria"]).toBe("Job titles, Member interests");
    expect(data["Targeting details"]).toBe("Job titles: CEO, Founder | Member interests: SaaS");
    // Full or Semi is asked on the plan page, after this; a constant "full"
    // here contradicted a Semi choice in every later body (2026-10-08).
    expect(data).not.toHaveProperty("Automation mode");
  });

  it("does not duplicate interests when it is chosen explicitly", () => {
    const setup = readLinkedInAdsForm(formOf({ criteria: ["interests", "titles"] }));
    expect(setup.criteria.filter((c) => c === "interests")).toHaveLength(1);
  });

  it("requires an ad format", () => {
    expect(validateLinkedInAds({ ...LINKEDIN, adFormat: "" })).toHaveLength(1);
  });

  it("has no default goal, and requires one", () => {
    expect(readLinkedInAdsForm(formOf({})).goal).toBe("");
    expect(readLinkedInAdsForm(formOf({ goal: "nonsense" })).goal).toBe("");
    expect(validateLinkedInAds({ ...LINKEDIN, goal: "", adFormat: "" })).toEqual([
      "Choose what the campaign should do.",
    ]);
  });

  it("does not ask for or send a location", () => {
    const data = linkedInAdsPayload(LINKEDIN, { email: "a@b.com", sessionId: "s1" })
      .campaign_data as Record<string, string>;
    for (const key of ["City", "State", "Region", "Country"]) expect(data).not.toHaveProperty(key);
  });
});

/**
 * The creative writer takes `ad_format`, and it was hardcoded to "image" —
 * so a customer who asked for video got three image prompts. The Meta form
 * now asks, and the answer has to survive into `campaign_data`, because that
 * is what becomes the stored suggestion the prompt call reads two pages later.
 */
describe("metaAdsPayload ad format", () => {
  const context = { email: "a@b.com", userId: "uid-1", sessionId: "s1" };

  it("carries the chosen format", () => {
    const data = metaAdsPayload({ ...META, adFormat: "video" }, context).campaign_data as Record<
      string,
      string
    >;
    expect(data["Ad format"]).toBe("video");
  });

  it("defaults to image when the form did not say", () => {
    const form = new FormData();
    form.set("businessName", "X");
    form.set("service", "Y");
    expect(readMetaAdsForm(form).adFormat).toBe("image");
  });

  it("ignores a format the pipeline does not accept", () => {
    // A tampered post must not reach `generate-prompts` as an unknown format.
    const form = new FormData();
    form.set("adFormat", "hologram");
    expect(readMetaAdsForm(form).adFormat).toBe("image");
  });
});

describe("readMetaAdsForm — the goal decides whether an offer applies", () => {
  it("keeps the offer for goals a discount means something for", () => {
    for (const goal of ["traffic", "leads", "sales"]) {
      expect(readMetaAdsForm(formOf({ goal, offer: "custom" })).offer).toBe("custom");
    }
  });

  it("drops an offer left over from another goal", () => {
    for (const goal of ["awareness", "engagement", "app"]) {
      const setup = readMetaAdsForm(formOf({ goal, offer: "custom", customOffer: "15" }));
      expect(setup.offer).toBe("none");
      expect(setup.customOffer).toBe("");
    }
  });
});

describe("Meta's live-list answers (2026-09-30)", () => {
  const pick = (id: string, name: string) => JSON.stringify({ id, name });

  it("needs an instant form for Leads → Instant forms, and reads it only then", () => {
    const setup = readMetaAdsForm(formOf({ goal: "leads", subGoal: "Instant forms", leadForm: pick("if", "Quote") }));
    expect(setup.leadForm).toEqual({ id: "if", name: "Quote" });
    expect(readMetaAdsForm(formOf({ goal: "leads", subGoal: "Website", leadForm: pick("if", "Quote") })).leadForm).toBeNull();
    expect(validateMetaAds({ ...META, leadForm: null })).toContain("Choose the instant form the ads should use.");
  });

  it("sends Retargeting and the chosen audiences", () => {
    const setup = { ...META, audienceType: "retargeting" as const, audiences: [{ id: "a", name: "Buyers" }] };
    const data = metaAdsPayload(setup, { email: "a@b.c", sessionId: "s" }).campaign_data as Record<string, string>;
    expect(data["Audience type"]).toBe("Retargeting");
    expect(data["Retargeting audiences"]).toBe("Buyers");
    expect(data["Instant form ID"]).toBe("if-1");
    expect(validateMetaAds({ ...setup, audiences: [] })).toContain(
      "Choose at least one saved audience to retarget, or target a new audience.",
    );
  });
});
