import { buildRevisePayload } from "@/lib/data/ads-revise-payload";
import type { CampaignField } from "@/lib/data/ads-chat-payload";

const INTRO =
  "My Meta Ads AI Agent setup is complete. Please help me finalize and create the Facebook and Instagram campaign.";

const FIELDS: CampaignField[] = [
  ["Business name", "Smile Dental Clinic"],
  ["Ad goal", "leads"],
  ["Budget display", "$50 / day"],
];

const BASE = {
  intro: INTRO,
  fields: FIELDS,
  email: "owner@example.com",
  userId: "uid-1",
  sessionId: "session_1",
  userDetails: { budget_type: "daily" },
  previousPlan: "Objective of the campaign: Lead generation",
};

describe("buildRevisePayload", () => {
  it("sends the whole brief on a revise, not just the action", () => {
    const body = buildRevisePayload({ ...BASE, kind: "revise" });
    expect(body.chatInput).toBe(
      `${INTRO}\n\nBusiness name: Smile Dental Clinic\nAd goal: leads\nBudget display: $50 / day`,
    );
    expect(body.campaign_data).toEqual({
      "Business name": "Smile Dental Clinic",
      "Ad goal": "leads",
      "Budget display": "$50 / day",
    });
    expect(body).toMatchObject({
      action_type: "revise",
      user_decision: "revise",
      session_id: "session_1",
      email_address: "owner@example.com",
      user_id: "uid-1",
      user_details: { budget_type: "daily" },
    });
    expect(body).not.toHaveProperty("suggestion");
    expect(body.previous_suggestion).toBe("Objective of the campaign: Lead generation");
  });

  it("keeps the brief as chatInput and sends the customer's words beside it", () => {
    const body = buildRevisePayload({
      ...BASE,
      kind: "suggestion",
      suggestion: "  Use video instead  ",
    });
    expect(String(body.chatInput).startsWith(INTRO)).toBe(true);
    expect(body).toMatchObject({
      action_type: "user_suggestion",
      user_decision: "suggestion",
      suggestion: "Use video instead",
      user_suggestion: "Use video instead",
      previous_suggestion: "Objective of the campaign: Lead generation",
    });
  });

  it("leaves user_details out when the agent never sent any", () => {
    const body = buildRevisePayload({ ...BASE, kind: "revise", userDetails: {} });
    expect(body).not.toHaveProperty("user_details");
  });
});
