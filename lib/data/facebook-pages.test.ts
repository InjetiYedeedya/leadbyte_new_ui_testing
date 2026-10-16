import { fetchFacebookPages, parsePagesWithTokens, saveFacebookPage } from "./facebook-pages";

const apiRequest = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }));

const PAGE = { id: "1002719136257600", name: "LeadByte AI", category: "Software", access_token: "PAGE-TOKEN" };

afterEach(() => apiRequest.mockReset());

describe("parsePagesWithTokens", () => {
  it("reads the three shapes the webhook has answered with", () => {
    const want = [{ id: PAGE.id, name: "LeadByte AI", category: "Software", accessToken: "PAGE-TOKEN" }];
    expect(parsePagesWithTokens([{ user: { name: "Thilak Sai" }, pages: [PAGE] }])).toEqual(want);
    expect(parsePagesWithTokens([PAGE])).toEqual(want);
    expect(parsePagesWithTokens({ pages: [PAGE] })).toEqual(want);
  });

  it("accepts the alternative key names and drops a page with no id", () => {
    expect(parsePagesWithTokens([{ pageId: 7, pageName: "Seven" }, { name: "No id" }])).toEqual([
      { id: "7", name: "Seven", category: "", accessToken: "" },
    ]);
    expect(parsePagesWithTokens(null)).toEqual([]);
  });
});

describe("fetchFacebookPages", () => {
  it("never hands a token to its caller", async () => {
    apiRequest.mockResolvedValue([{ pages: [PAGE] }]);
    const pages = await fetchFacebookPages("a@b.com");
    expect(pages).toEqual([{ id: PAGE.id, name: "LeadByte AI", category: "Software" }]);
    expect(JSON.stringify(pages)).not.toContain("PAGE-TOKEN");
    expect(apiRequest).toHaveBeenCalledWith("/api/webhook/facebook-accounts?email=a%40b.com");
  });

  it("is an empty list when the backend fails", async () => {
    apiRequest.mockRejectedValue(new Error("down"));
    expect(await fetchFacebookPages("a@b.com")).toEqual([]);
  });
});

describe("saveFacebookPage", () => {
  const CHOSEN = { id: PAGE.id, name: "LeadByte AI" };
  const SAVE = "/api/webhook/facebook-selected-account";

  it("sends the legacy body, token included, for the chosen page", async () => {
    apiRequest.mockResolvedValueOnce({ pages: [PAGE] }).mockResolvedValueOnce({ success: true });
    expect(await saveFacebookPage("a@b.com", "uid-1", CHOSEN)).toEqual({ saved: true });
    expect(apiRequest).toHaveBeenLastCalledWith(SAVE, {
      method: "POST",
      body: { id: PAGE.id, name: "LeadByte AI", category: "Software", access_token: "PAGE-TOKEN", email: "a@b.com", userId: "uid-1" },
    });
  });

  it("still reaches fb_selected_account when the page list fails", async () => {
    apiRequest.mockRejectedValueOnce(new Error("Error in workflow")).mockResolvedValueOnce({ success: true });
    expect(await saveFacebookPage("a@b.com", "uid-1", CHOSEN)).toEqual({ saved: true });
    expect(apiRequest).toHaveBeenLastCalledWith(SAVE, {
      method: "POST",
      body: { id: PAGE.id, name: "LeadByte AI", category: "", access_token: "", email: "a@b.com", userId: "uid-1" },
    });
  });

  it("does not send a page the list says this login does not own", async () => {
    apiRequest.mockResolvedValueOnce({ pages: [PAGE] });
    expect(await saveFacebookPage("a@b.com", "uid-1", { id: "someone-elses", name: "X" })).toMatchObject({ saved: false });
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("treats a 200 that says success: false as not saved", async () => {
    apiRequest.mockResolvedValueOnce({ pages: [PAGE] }).mockResolvedValueOnce({ success: false, error: "n8n failed" });
    expect(await saveFacebookPage("a@b.com", "uid-1", CHOSEN)).toEqual({ saved: false, reason: "n8n failed (while saving the page you chose)." });
  });

  it("keeps anything token-shaped out of the reason", async () => {
    apiRequest.mockResolvedValueOnce({ pages: [PAGE] }).mockRejectedValueOnce(new Error(`bad token EAA${"x".repeat(60)}`));
    expect(await saveFacebookPage("a@b.com", "uid-1", CHOSEN)).toEqual({
      saved: false,
      reason: "bad token [hidden] (while saving the page you chose).",
    });
  });
});
