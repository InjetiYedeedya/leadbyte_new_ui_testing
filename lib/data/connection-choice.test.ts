import { firstUnmetStep, runGateCopy } from "@/lib/data/agent-run-gate";
import { resultFromIntegration, rowHasChosenAccount } from "@/lib/api/oauth-status";
import { parseIntegrations } from "@/lib/api/integrations-status";
import {
  RECONNECT_MESSAGE,
  WORKFLOW_CRASH_MESSAGE,
  reconnectMessageFor,
  workflowCrashMessageFor,
} from "@/lib/data/agent-setup";

/**
 * Backend finding, 2026-09-30: a chosen ad account was saved on 1 of 10 Google
 * Ads connections and 2 of 14 Meta ones. With none, the workflow has nowhere
 * to build a campaign, so an ad agent now stops at "choose your ad account".
 */
describe("the choose-an-ad-account step", () => {
  it("comes after purchase and connection, for the ad agents only", () => {
    const facts = { purchased: true, connected: true, accountChosen: false };
    expect(firstUnmetStep("google-ads", facts)).toBe("account");
    expect(firstUnmetStep("meta-ads", facts)).toBe("account");
    expect(firstUnmetStep("linkedin-ads", facts)).toBe("account");
    expect(firstUnmetStep("lead-qualification", facts)).toBeNull();
    expect(firstUnmetStep("google-ads", { ...facts, connected: false })).toBe("connection");
    expect(firstUnmetStep("google-ads", { ...facts, purchased: false })).toBe("purchase");
  });

  it("never blocks when the caller does not know", () => {
    expect(firstUnmetStep("google-ads", { purchased: true, connected: true })).toBeNull();
  });

  it("sends people back through consent to the picker, returning to the agent", () => {
    expect(runGateCopy("google-ads", "Google Ads", "account")).toMatchObject({
      title: "Choose your Google Ads ad account",
      fixHref: "/api/ads/connect?platform=google-ads&from=agent",
      fixLabel: "Choose ad account",
    });
    expect(runGateCopy("linkedin-ads", "LinkedIn Ads", "account").fixHref).toBe(
      "/agents/linkedin-ads/connect",
    );
  });
});

describe("rowHasChosenAccount", () => {
  it("reads the account our picker saves", () => {
    expect(rowHasChosenAccount({ selectedAccount: JSON.stringify({ id: "123", name: "Acme" }) })).toBe(true);
    expect(rowHasChosenAccount({ selectedAccount: { id: 555 } })).toBe(true);
  });

  it("is false for a row with no choice, or a choice with no id", () => {
    expect(rowHasChosenAccount({ Status: "Done" })).toBe(false);
    expect(rowHasChosenAccount({ selectedAccount: "not json" })).toBe(false);
    expect(rowHasChosenAccount({ selectedAccount: JSON.stringify({ name: "no id" }) })).toBe(false);
  });
});

describe("parseIntegrations — the backend's one-call status", () => {
  const payload = {
    success: true,
    data: {
      "google-ads": {
        status: "connected",
        selected_account: { account_id: "1234567890", name: "Acme Ltd", expires_at: null },
        accounts: [{ account_id: "1234567890", name: "Acme Ltd", selected: true }],
      },
      "meta-ads": { status: "connected", selected_account: null, accounts: [{ account_id: "1" }, { account_id: "2" }] },
      "linkedin-ads": { status: "expired", accounts: [{ account_id: "5099", expires_at: "2026-09-01T10:00:00.000Z" }] },
      facebook: { status: "revoked", accounts: [] },
      "google-search-console": { status: "not_connected", accounts: [] },
      youtube: { status: "something-new" },
    },
  };
  const map = parseIntegrations(payload)!;

  it("maps each platform's status into ours", () => {
    expect(resultFromIntegration(map["google-ads"]!).status).toBe("valid");
    expect(resultFromIntegration(map["linkedin-ads"]!).status).toBe("expired");
    // Removed on the provider's side means reconnect, the same as expired.
    expect(resultFromIntegration(map.facebook!).status).toBe("expired");
    expect(resultFromIntegration(map["google-search-console"]!).status).toBe("not-connected");
    // Unknown words block nothing.
    expect(resultFromIntegration(map.youtube!).status).toBe("error");
  });

  it("says whether an account is chosen — and when it did not say", () => {
    expect(map["google-ads"]!.accountChosen).toBe(true);
    expect(map["google-ads"]!.selectedName).toBe("Acme Ltd");
    expect(map["meta-ads"]!.accountChosen).toBe(false);
    expect(map["linkedin-ads"]!.accountChosen).toBeNull();
  });

  it("is null for a refusal or an unreadable body, so the tables are read instead", () => {
    expect(parseIntegrations({ success: false, error: "nope" })).toBeNull();
    expect(parseIntegrations("nonsense")).toBeNull();
  });
});

describe("reconnectMessageFor", () => {
  it("recognises Google and Facebook refusing our access", () => {
    expect(reconnectMessageFor('{"error":"invalid_grant","error_description":"Token has been expired or revoked."}')).toBe(RECONNECT_MESSAGE);
    expect(reconnectMessageFor("OAuthException: Error validating access token: Session has expired")).toBe(RECONNECT_MESSAGE);
  });

  it("leaves everything else to the usual wording", () => {
    expect(reconnectMessageFor("Authentication required")).toBeNull();
    expect(reconnectMessageFor("Daily budget is required")).toBeNull();
  });
});

describe("workflowCrashMessageFor", () => {
  it("rewords n8n's own crash messages", () => {
    expect(workflowCrashMessageFor("Error in workflow")).toBe(WORKFLOW_CRASH_MESSAGE);
    expect(workflowCrashMessageFor('{"message":"Error in workflow"}')).toBe(WORKFLOW_CRASH_MESSAGE);
    expect(workflowCrashMessageFor("Workflow could not be started!")).toBe(WORKFLOW_CRASH_MESSAGE);
  });

  it("leaves real refusals alone", () => {
    expect(workflowCrashMessageFor("Daily budget is required")).toBeNull();
  });
});
