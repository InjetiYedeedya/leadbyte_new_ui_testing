import { buildLaunchPayload } from "@/lib/data/ads-launch-payload";
import { expandLocationAnswers } from "@/lib/data/semi-form";
import type { BusinessProfile } from "@/lib/data/types";

const PROFILE = {
  businessId: "a@b.com",
  businessName: "ZippyGo",
  businessType: "Travel & Tourism",
  industry: "Travel",
  websiteUrl: "https://zippygo.ai/",
  description: "AI voice assistant for booking flights.",
  websiteAuditScore: 0,
  geoVisibilityScore: 0,
  brand: { logo: "https://s3/logo.png" },
} satisfies BusinessProfile;

const CONTEXT = {
  email: "a@b.com",
  userId: "uid-1",
  sessionId: "session-1",
  plan: "Recommended Campaign Type(s)\n- App Campaign",
  userDetails: {
    "Business name": "ZippyGo",
    "Ad goal": "app promo",
    "Sub goal": "Not applicable",
    "Age range": "18-24, 25-34",
    Gender: "all",
    // Already composed as `ages - gender - interests`, the way the setup form
    // writes it — see `meta-ads-setup.ts`.
    "Interests and behaviors": "18-24, 25-34 - all - Luxury Travel, kayak",
    "Campaign start date": "2026-09-02",
    "Campaign end date": "2026-09-12",
    "Budget display": "$20 / day",
    "Offer value": "$20 off",
    "Service or product": "Voice-based flight booking",
  },
  formData: {
    Status: "PAUSED",
    "Daily Budget (USD)": "9",
    "App ID": "com.zippygontimes",
  },
  automationMode: "full" as const,
  profile: PROFILE,
};

describe("buildLaunchPayload", () => {
  const payload = buildLaunchPayload(CONTEXT);

  /**
   * The flow's nodes read different spellings of the same fact. Sending only
   * one means some branch silently gets nothing — which is the kind of failure
   * that looks like the campaign was never configured.
   */
  it("sends every identifier under both names the flow reads", () => {
    expect(payload.email).toBe("a@b.com");
    expect(payload.email_address).toBe("a@b.com");
    expect(payload.userId).toBe("uid-1");
    expect(payload.user_id).toBe("uid-1");
    expect(payload.sessionId).toBe("session-1");
    expect(payload.session_id).toBe("session-1");
  });

  it("sends the plan as both `requirements` and `aiSuggestion`", () => {
    expect(payload.requirements).toContain("App Campaign");
    expect(payload.aiSuggestion).toBe(payload.requirements);
  });

  it("repeats the business block under all three names", () => {
    const details = payload.businessDetails as Record<string, string>;
    expect(details.companyName).toBe("ZippyGo");
    expect(details.brandLogoUrl).toBe("https://s3/logo.png");
    expect(payload.business_details).toEqual(details);
    // businessInfo is the same block PLUS the campaign summary.
    expect((payload.businessInfo as Record<string, string>).companyName).toBe("ZippyGo");
  });

  it("merges the form answers over the planned campaign", () => {
    const merged = payload.campaignFormData as Record<string, unknown>;
    // From the plan…
    expect(merged["Ad goal"]).toBe("app promo");
    // …and from the form, which wins because the customer just typed it.
    expect(merged["Status"]).toBe("PAUSED");
    expect(merged["App ID"]).toBe("com.zippygontimes");
    // The nested copy the flow expects.
    expect(merged.businessDetails).toBeDefined();
  });

  it("keeps `user_details` as the plan alone, unmerged", () => {
    // Verbatim, blanks and all: the captured working body sends the agent's
    // echo untouched, and `interests` is an ARRAY there — filling it with a
    // string would change its type on a branch that may iterate it.
    expect(payload.user_details).toEqual(CONTEXT.userDetails);
    expect((payload.user_details as Record<string, string>).Status).toBeUndefined();
  });

  /**
   * `chatInput` belongs to the APPROVE hop, where it is the setup summary. The
   * captured receiver body has none, and sending the plan under a third name
   * here once masked the real fault: the launch was going to the wrong webhook.
   */
  it("sends no `chatInput` — that is the approve hop's field", () => {
    expect("chatInput" in payload).toBe(false);
  });

  it("sends the details-form answers as `dynamicFormData`, twice over", () => {
    expect(payload.dynamicFormData).toEqual(CONTEXT.formData);
    expect((payload.campaignFormData as Record<string, unknown>).dynamicFormData).toEqual(
      CONTEXT.formData,
    );
  });

  /**
   * REGRESSION. Every one of these went out blank because `businessInfo` read
   * the agent's echo, which does not carry them — the captured working body has
   * `goal`, `audience` and `budget` filled from the SETUP form's labels.
   */
  it("fills businessInfo from the merged campaign, not the empty echo", () => {
    const withSetup = buildLaunchPayload({
      ...CONTEXT,
      // The echo the agent really sends: keys present, values blank.
      userDetails: { business_name: "", interests: "" },
      campaign: [
        ["Ad goal", "awareness"],
        ["Sub goal", "Reach"],
        ["Budget display", "$12 / day"],
        ["Age range", "All"],
        ["Gender", "all"],
        ["Interests and behaviors", "All - all - Business Owners"],
        ["Schedule start time", "All day"],
        ["Schedule end time", "All day"],
      ],
    });
    const info = withSetup.businessInfo as Record<string, string>;
    expect(info.goal).toBe("awareness");
    expect(info.subGoal).toBe("Reach");
    expect(info.budget).toBe("$12 / day");
    expect(info.audience).toBe("All - all - Business Owners");
    expect(info.schedule).toBe("All day to All day");
  });

  it("names Meta's placements, and omits the key for other platforms", () => {
    const meta = buildLaunchPayload({ ...CONTEXT, platforms: "Facebook Ads, Instagram Ads" });
    expect((meta.businessInfo as Record<string, string>).platforms).toBe(
      "Facebook Ads, Instagram Ads",
    );
    expect("platforms" in (payload.businessInfo as Record<string, unknown>)).toBe(false);
  });

  it("writes the audience as one line, ages - gender - interests", () => {
    expect((payload.businessInfo as Record<string, string>).audience).toBe(
      "18-24, 25-34 - all - Luxury Travel, kayak",
    );
  });

  /**
   * REGRESSION. `businessInfo` read these from the agent's PLAN, which never
   * carries them, so every run went out with `location: "Not provided"` even
   * after the customer filled the location cascade.
   */
  it("takes the place from the details form, not from the plan", () => {
    const located = buildLaunchPayload({
      ...CONTEXT,
      formData: {
        ...CONTEXT.formData,
        "Location Type": "Newark, New Jersey, United States",
        "Location Type_country": "United States",
        "Location Type_state": "New Jersey",
        "Location Type_city": "Newark",
      },
    });
    const info = located.businessInfo as Record<string, string>;
    expect(info.location).toBe("Newark, New Jersey, United States");
    expect(info.country).toBe("United States");
    expect(info.state).toBe("New Jersey");
    expect(info.city).toBe("Newark");
  });

  it("carries EVERY picked place, at mixed levels, not only the last one (2026-10-01)", () => {
    const US = "United States";
    const answers = {
      "Location Type": "Country, State, City, Zip Code",
      "Location Type_picks": JSON.stringify([
        { type: "country", country: US },
        { type: "state", country: US, state: "New York" },
        { type: "state", country: US, state: "California" },
        { type: "state", country: US, state: "Texas" },
        { type: "city", country: US, state: "New York", city: "New York City" },
        { type: "city", country: US, state: "California", city: "Los Angeles" },
        { type: "city", country: US, state: "Texas", city: "Dallas" },
        { type: "zip", country: US, zip: "10001" },
        { type: "zip", country: US, zip: "90210" },
        { type: "zip", country: US, zip: "75201" },
      ]),
    };
    // The same merge `launchCampaign` makes before building the body.
    const formData = { ...answers, ...expandLocationAnswers(answers) } as Record<string, string>;
    const body = JSON.parse(JSON.stringify(buildLaunchPayload({ ...CONTEXT, formData }))) as Record<string, unknown>;

    const dynamic = body.dynamicFormData as Record<string, unknown>;
    expect(dynamic["Location Type_locations"]).toHaveLength(10);
    expect(dynamic["Location Type_state"]).toBe("New York, California, Texas");
    expect(dynamic["Location Type_city"]).toBe("New York City, Los Angeles, Dallas");
    expect(dynamic["Location Type_zip"]).toBe("10001, 90210, 75201");
    expect(dynamic).not.toHaveProperty("Location Type_picks");

    const info = body.businessInfo as Record<string, string>;
    expect(info.state).toBe("New York, California, Texas");
    expect(info.city).toBe("New York City, Los Angeles, Dallas");
    expect(info.location).toContain("75201 > United States");
  });

  it('still says "Not provided" when nobody named a place', () => {
    const info = payload.businessInfo as Record<string, string>;
    expect(info.location).toBe("Not provided");
    expect(info.city).toBe("Not provided");
  });

  it("defaults an unset schedule to `Any time to Any time`", () => {
    expect((payload.businessInfo as Record<string, string>).schedule).toBe(
      "Any time to Any time",
    );
  });

  it("sends the three constants every observed run carries", () => {
    expect(payload.selectionMode).toBe("ask");
    expect(payload.user_decision).toBe("approved");
    expect(payload.audienceType).toBe("new");
    expect(payload.action).toBe("execute_campaign");
  });

  it("includes creative URLs in the merged form data for semi", () => {
    const semi = buildLaunchPayload({
      ...CONTEXT,
      automationMode: "semi",
      creatives: { landscapeImage: "https://s3/landscape.png" },
    });
    expect((semi.campaignFormData as Record<string, string>).landscapeImage).toBe(
      "https://s3/landscape.png",
    );
    expect(semi.automationMode).toBe("semi");
  });

  it("omits the user id entirely rather than sending it blank", () => {
    const anonymous = buildLaunchPayload({ ...CONTEXT, userId: undefined });
    expect("user_id" in anonymous).toBe(false);
    expect("userId" in anonymous).toBe(false);
  });

  it("survives a missing profile rather than throwing", () => {
    // A launch must not fail because the profile has not loaded.
    const bare = buildLaunchPayload({ ...CONTEXT, profile: null });
    expect((bare.businessDetails as Record<string, string>).companyName).toBe("");
  });
});

describe("the chosen creative prompt", () => {
  it("omits all four prompt fields when nothing was picked", () => {
    // Every campaign launched before the pipeline was wired went out this way,
    // so absent is a shape the flow already handles. An empty string is not.
    const payload = buildLaunchPayload(CONTEXT);
    expect("selected_prompt" in payload).toBe(false);
    expect("selected_prompt_index" in payload).toBe(false);
    expect("selected_prompt_model" in payload).toBe(false);
    expect("prompt_job_id" in payload).toBe(false);
  });

  it("carries the pick, with the pipeline's own index", () => {
    const payload = buildLaunchPayload({
      ...CONTEXT,
      selectedPrompt: {
        jobId: "session_1755782456789_ab12cd34e",
        index: 1,
        model: "deepseek-v4-flash",
        prompt: "2-shot 9:16 UGC ad",
      },
    });
    expect(payload.selected_prompt).toBe("2-shot 9:16 UGC ad");
    expect(payload.selected_prompt_index).toBe(1);
    expect(payload.selected_prompt_model).toBe("deepseek-v4-flash");
    expect(payload.prompt_job_id).toBe("session_1755782456789_ab12cd34e");
  });

  it("keeps index 0 rather than treating it as missing", () => {
    const payload = buildLaunchPayload({
      ...CONTEXT,
      selectedPrompt: { jobId: "j", index: 0, model: "gpt-5.5", prompt: "p" },
    });
    expect(payload.selected_prompt_index).toBe(0);
  });
});

/**
 * Regression: the audience never reached the executor.
 *
 * `campaignFormData` was merged from the agent's `user_details`, and the
 * captured receiver body shows that object is near-empty — `business_name: ""`,
 * `interests: []`. The audience lives under the SETUP form's labels, which the
 * agent does not echo back, so "Interests and behaviors", "Selected interests"
 * and "Other interest (optional)" were absent from every launch.
 */
describe("buildLaunchPayload campaignFormData", () => {
  const SETUP = [
    ["Business name", "ZippyGo"],
    ["Interests and behaviors", "All - all - Luxury Travel, kayak"],
    ["Selected interests", "Luxury Travel, Other"],
    ["Other interest (optional)", "kayak, air travel"],
  ] as const;

  it("carries the setup audience through to the receiver", () => {
    const payload = buildLaunchPayload({
      ...CONTEXT,
      campaign: SETUP,
      userDetails: { business_name: "", interests: "" },
    });
    const merged = payload.campaignFormData as Record<string, unknown>;

    expect(merged["Selected interests"]).toBe("Luxury Travel, Other");
    expect(merged["Other interest (optional)"]).toBe("kayak, air travel");
    expect(merged["Interests and behaviors"]).toBe("All - all - Luxury Travel, kayak");
  });

  it("lets the details form win over the setup for the same label", () => {
    // The form answers are what the customer just typed; the setup is the
    // earlier version of the same field.
    const payload = buildLaunchPayload({
      ...CONTEXT,
      campaign: [["Budget Amount", "5"]],
      formData: { "Budget Amount": "25" },
    });
    expect((payload.campaignFormData as Record<string, unknown>)["Budget Amount"]).toBe("25");
  });

  it("works with no setup campaign at all", () => {
    // Older suggestions have no stored fields; a launch must not depend on it.
    expect(() => buildLaunchPayload({ ...CONTEXT, campaign: undefined })).not.toThrow();
  });
});

/**
 * The Meta semi receiver body, checked field-for-field against the captured
 * working request (2026-09-08). The launch that failed was not missing data —
 * it was posted to the wrong webhook, so this asserts the shape the
 * `adsreceiver` workflow actually reads.
 */
describe("the Meta semi receiver body", () => {
  const MEDIA = {
    type: "image" as const,
    required: true as const,
    url: "https://s3/img.jpg",
    urls: ["https://s3/img.jpg"],
    imageRequirement: "1:1 ratio",
    videoRequirement: null,
  };

  const payload = buildLaunchPayload({
    ...CONTEXT,
    automationMode: "semi",
    platforms: "Facebook Ads, Instagram Ads",
    semiAutomationMedia: MEDIA,
    formData: {
      Status: "PAUSED",
      "Pixel ID": "923329620563382",
      "Location Type": "United States",
      "Location Type_country": "United States",
    },
  });

  it("carries the uploaded creative at the top level and in the merged form", () => {
    expect(payload.semiAutomationMedia).toEqual(MEDIA);
    expect((payload.campaignFormData as Record<string, unknown>).semiAutomationMedia).toEqual(
      MEDIA,
    );
  });

  it("sends the answers the backend's own form asked for", () => {
    const dynamic = payload.dynamicFormData as Record<string, string>;
    expect(dynamic["Pixel ID"]).toBe("923329620563382");
    expect(dynamic.Status).toBe("PAUSED");
    // The location the BACKEND's form collected — we never inject our own.
    expect(dynamic["Location Type"]).toBe("United States");
  });

  it("marks the mode and the action the receiver switches on", () => {
    expect(payload.automationMode).toBe("semi");
    expect(payload.action).toBe("execute_campaign");
    expect(payload.action_type).toBe("approved");
    expect(payload.user_decision).toBe("approved");
  });
});

describe("selectionMode on the launch", () => {
  it("sends what the customer chose on the details form", () => {
    const payload = buildLaunchPayload({ ...CONTEXT, selectionMode: "auto" });
    expect(payload.selectionMode).toBe("auto");
  });

  it("falls back to ask when the campaign predates the question", () => {
    // Every launch before this was a choice sent "ask". An older stored
    // campaign with no answer must keep behaving exactly as it did.
    const payload = buildLaunchPayload({ ...CONTEXT, selectionMode: undefined });
    expect(payload.selectionMode).toBe("ask");
  });
});

describe("a LinkedIn launch", () => {
  const LINKEDIN = {
    ...CONTEXT,
    userDetails: {},
    formData: {},
    campaign: [
      ["Business name", "Acme Technologies"],
      ["City", "San Francisco"],
      ["State", "California"],
      ["Country", "United States"],
      ["Ad goal", "leads"],
      ["Ad format", "Single image"],
      ["Targeting criteria", "titles, interests"],
      ["Targeting values", "CEO, Founder"],
      ["Budget display", "$50 / day"],
    ] as const,
    automationMode: "semi" as const,
    mediaAssets: { images: ["https://s3/banner.png"] },
  };

  it("carries the place the setup form named instead of `Not provided`", () => {
    const info = buildLaunchPayload(LINKEDIN).businessInfo as Record<string, string>;
    expect(info.city).toBe("San Francisco");
    expect(info.state).toBe("California");
    expect(info.country).toBe("United States");
    expect(info.location).toBe("San Francisco > California > United States");
  });

  it("carries the targeting and the ad format", () => {
    const info = buildLaunchPayload(LINKEDIN).businessInfo as Record<string, string>;
    expect(info.targeting).toBe("CEO, Founder");
    expect(info.adFormat).toBe("Single image");
  });

  it("carries the targeting VALUES under today's label, not just the criteria (2026-10-08)", () => {
    // The setup form names them "Targeting details" now; reading only the old
    // "Targeting values" sent "titles, interests" — the criteria, no values.
    const campaign: (readonly [string, string])[] = [
      ...LINKEDIN.campaign.filter(([label]) => label !== "Targeting values"),
      ["Targeting details", "Job titles: CEO | Member interests: SaaS"],
    ];
    const info = buildLaunchPayload({ ...LINKEDIN, campaign }).businessInfo as Record<string, string>;
    expect(info.targeting).toBe("Job titles: CEO | Member interests: SaaS");
  });

  it("sends the uploaded creative as mediaAssets, top level and merged", () => {
    const payload = buildLaunchPayload(LINKEDIN);
    expect(payload.mediaAssets).toEqual({ images: ["https://s3/banner.png"] });
    expect((payload.campaignFormData as Record<string, unknown>).mediaAssets).toEqual({
      images: ["https://s3/banner.png"],
    });
  });

  it("adds none of those keys to a campaign that has no such fields", () => {
    const payload = buildLaunchPayload({ ...CONTEXT, automationMode: "full" as const });
    const info = payload.businessInfo as Record<string, unknown>;
    expect(info).not.toHaveProperty("targeting");
    expect(info).not.toHaveProperty("adFormat");
    expect(payload).not.toHaveProperty("mediaAssets");
  });
});
