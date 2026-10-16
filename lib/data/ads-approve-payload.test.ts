import { buildApprovePayload } from "@/lib/data/ads-approve-payload";
import type { CampaignField } from "@/lib/data/ads-chat-payload";
import type { BusinessProfile } from "@/lib/data/types";

/**
 * The captured live body, from the n8n `metaads` execution of 2026-09-04.
 * Every expectation below is read off that capture rather than invented.
 */
const INTRO =
  "My Meta Ads AI Agent setup is complete. Please help me finalize and create the Facebook and Instagram campaign.";

const FIELDS: CampaignField[] = [
  ["Business name", "Zippygo"],
  [
    "Location",
    "Kanchipuram, Alagāpuram > Tamil Nadu > India | Anantapur > Andhra Pradesh > India | Gulbarga > Karnataka > India",
  ],
  ["Country", "India"],
  ["State", "Tamil Nadu, Andhra Pradesh, Karnataka"],
  ["City", "Kanchipuram, Alagāpuram, Anantapur, Gulbarga"],
  ["Ad goal", "app"],
  ["Sub goal", "Installs"],
  ["Budget type", "daily"],
  ["Budget amount", "$15"],
  ["Budget display", "$15 / day"],
];

const PROFILE = {
  businessId: "thilak@ntimes.ai",
  businessName: "ZippyGo",
  businessType: "Travel & Tourism",
  industry: "Travel",
  websiteUrl: "novaflow.io",
  description: "AI Powered Voice Based Flight Booking application",
  websiteAuditScore: 0,
  geoVisibilityScore: 0,
  brand: {
    logo: "https://socailmediaposts.s3.ap-southeast-2.amazonaws.com/brand-logos/thilak_ntimes_ai/2026-07-29T09-17-24-408Z_zippygologo.png",
  },
} satisfies BusinessProfile;

/** What the agent returned from the get_suggestion turn, by its own labels. */
const USER_DETAILS = {
  business_name: "ZippyGo",
  budget_type: "",
  location: "",
  campaign_goal: "App Installs",
  "Campaign Type": "App Promotion",
  subgoal: "installs",
  ad_goal: "App Installs",
};

const CONTEXT = {
  intro: INTRO,
  fields: FIELDS,
  email: "thilak@ntimes.ai",
  userId: "yNGTBxGSJZPkoCWZXDcAOce7oGH2",
  sessionId: "session_1788517831921_3pssllzxq",
  automationMode: "full" as const,
  userDetails: USER_DETAILS,
  profile: PROFILE as BusinessProfile | null,
};

describe("buildApprovePayload", () => {
  it("sends exactly the keys the live body carries", () => {
    expect(Object.keys(buildApprovePayload(CONTEXT)).sort()).toEqual(
      [
        "action_type",
        "automationMode",
        "business_details",
        "campaign_data",
        "chatInput",
        "email_address",
        "selectionMode",
        "session_id",
        "timestamp",
        "user_decision",
        "user_details",
        "user_id",
      ].sort(),
    );
  });

  it("repeats the setup summary as chatInput, not the agent's plan", () => {
    const payload = buildApprovePayload(CONTEXT);

    expect(payload.chatInput).toBe(
      `${INTRO}\n\n${FIELDS.map(([label, value]) => `${label}: ${value}`).join("\n")}`,
    );
  });

  it("keeps campaign_data and user_details apart", () => {
    const payload = buildApprovePayload(CONTEXT);

    // campaign_data is the setup as WE labelled it on page one…
    expect(payload.campaign_data).toEqual({
      "Business name": "Zippygo",
      Location:
        "Kanchipuram, Alagāpuram > Tamil Nadu > India | Anantapur > Andhra Pradesh > India | Gulbarga > Karnataka > India",
      Country: "India",
      State: "Tamil Nadu, Andhra Pradesh, Karnataka",
      City: "Kanchipuram, Alagāpuram, Anantapur, Gulbarga",
      "Ad goal": "app",
      "Sub goal": "Installs",
      "Budget type": "daily",
      "Budget amount": "$15",
      "Budget display": "$15 / day",
    });
    // …and user_details is the agent's own structured reading of it.
    expect(payload.user_details).toEqual(USER_DETAILS);
  });

  it("marks the decision three ways, because the flow reads all three", () => {
    const payload = buildApprovePayload(CONTEXT);

    expect(payload.action_type).toBe("approved");
    expect(payload.user_decision).toBe("approved");
    expect(payload.automationMode).toBe("full");
  });

  it("carries selectionMode as an explicit null", () => {
    const payload = buildApprovePayload(CONTEXT);

    expect("selectionMode" in payload).toBe(true);
    expect(payload.selectionMode).toBeNull();
  });

  it("builds business_details from the profile", () => {
    expect(buildApprovePayload(CONTEXT).business_details).toEqual({
      companyName: "ZippyGo",
      // A stored bare host goes out with its scheme — n8n does not add one.
      websiteUrl: "https://novaflow.io",
      reportEmail: "thilak@ntimes.ai",
      businessType: "Travel & Tourism",
      businessTypeOther: "",
      specialization: "AI Powered Voice Based Flight Booking application",
      brandLogoUrl:
        "https://socailmediaposts.s3.ap-southeast-2.amazonaws.com/brand-logos/thilak_ntimes_ai/2026-07-29T09-17-24-408Z_zippygologo.png",
    });
  });

  it("never doubles a scheme that is already stored", () => {
    const profile = { ...CONTEXT.profile!, websiteUrl: "https://novaflow.io" };
    expect(buildApprovePayload({ ...CONTEXT, profile }).business_details).toMatchObject({
      websiteUrl: "https://novaflow.io",
    });
  });

  it("still sends business_details when there is no profile", () => {
    // A blank block is a readable answer; a missing one makes the flow's
    // business branch read `undefined.companyName`.
    expect(buildApprovePayload({ ...CONTEXT, profile: null }).business_details).toEqual({
      companyName: "",
      websiteUrl: "",
      reportEmail: "thilak@ntimes.ai",
      businessType: "",
      businessTypeOther: "",
      specialization: "",
      brandLogoUrl: "",
    });
  });

  it("says semi when semi was chosen", () => {
    expect(buildApprovePayload({ ...CONTEXT, automationMode: "semi" }).automationMode).toBe("semi");
  });

  it("omits user_id when the session has none", () => {
    const payload = buildApprovePayload({ ...CONTEXT, userId: undefined });

    expect("user_id" in payload).toBe(false);
  });
});

describe("approving before the mode is chosen (Google and Meta, 2026-10-06)", () => {
  it("sends automationMode as an explicit null, not a missing key", () => {
    const payload = buildApprovePayload({ ...CONTEXT, automationMode: null });
    expect("automationMode" in payload).toBe(true);
    expect(payload.automationMode).toBeNull();
    expect(payload.user_decision).toBe("approved");
  });
});
