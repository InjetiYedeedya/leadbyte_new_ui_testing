const apiRequest = vi.fn();
vi.mock("@/lib/api/client", () => {
  class ApiError extends Error {
    bodySnippet?: string;
  }
  class ApiTimeoutError extends ApiError {}
  return { ApiError, ApiTimeoutError, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

import {
  ADS_PLATFORMS,
  MAX_ADS_ACCOUNTS,
  parseAccountsParam,
  parseAdAccounts,
  parseStoredAccounts,
  platformFromAny,
  platformFromSlug,
  selectAdAccount,
  slugOf,
  metaSelectBody,
} from "@/lib/data/ads-accounts";

describe("the select-method asymmetry", () => {
  /**
   * Guards the single fact most likely to be "tidied" into a 404 by someone
   * making the two platforms look alike.
   */
  it("selects a Google Ads account with GET", () => {
    expect(ADS_PLATFORMS.googleAds.select.method).toBe("GET");
    expect(ADS_PLATFORMS.googleAds.select.path).toBe(
      "/api/webhook/google-ads-selected-account",
    );
  });

  it("selects a Meta Ads account with POST — the other way round", () => {
    expect(ADS_PLATFORMS.metaAds.select.method).toBe("POST");
    // No `google-` prefix on this one, unlike its Google counterpart.
    expect(ADS_PLATFORMS.metaAds.select.path).toBe("/api/webhook/meta-ads-selected-account");
  });

  it("keeps each platform's own Frontend_Check spelling", () => {
    // One capitalises "Ads" and the other does not. Both are the backend's.
    expect(ADS_PLATFORMS.googleAds.statusTable).toBe("Google_Ads_Frontend_Check");
    expect(ADS_PLATFORMS.metaAds.statusTable).toBe("Meta_ads_Frontend_Check");
  });
});

describe("platformFromSlug", () => {
  it("maps our own URL slugs", () => {
    expect(platformFromSlug("google-ads")).toBe("googleAds");
    expect(platformFromSlug("meta-ads")).toBe("metaAds");
    expect(platformFromSlug("linkedin-ads")).toBe("linkedInAds");
  });

  it("returns null for anything else, so a bad URL cannot pick a platform", () => {
    expect(platformFromSlug("tiktok-ads")).toBeNull();
    expect(platformFromSlug("")).toBeNull();
  });
});

/**
 * The fixture is the real Meta payload, copied verbatim from n8n on
 * 2026-09-03 — including its outer array and the `accounts` / `user` wrapper.
 */
const META_PAYLOAD = [
  {
    accounts: [
      {
        id: "100000000000001",
        account_id: "100000000000001",
        name: "Sample Owner",
        currency: "INR",
        business_name: "",
        account_status: 1,
        amount_spent: "0",
        resource_id: "act_100000000000001",
        fb_user_id: "100000000000009",
        fb_user_name: "Sample Owner",
      },
      {
        id: "100000000000002",
        account_id: "100000000000002",
        name: "Zippygo Travel",
        currency: "USD",
        business_name: "AI AGENT LLC",
        account_status: 1,
        amount_spent: "238389",
        resource_id: "act_100000000000002",
        fb_user_id: "100000000000009",
        fb_user_name: "Sample Owner",
      },
    ],
    user: { id: "100000000000009", name: "Sample Owner" },
  },
];

describe("parseAdAccounts", () => {
  it("finds the rows inside the real payload's array-of-one-wrapper shape", () => {
    // The outer value IS an array, but its rows are wrappers, not accounts.
    // Treating the first array as the list found no ids and returned nothing.
    expect(parseAdAccounts(META_PAYLOAD)).toHaveLength(2);
  });

  it("keeps every field the select call has to send back", () => {
    const [, zippygo] = parseAdAccounts(META_PAYLOAD);

    expect(zippygo).toEqual({
      id: "100000000000002",
      name: "Zippygo Travel",
      currency: "USD",
      businessName: "AI AGENT LLC",
      resourceId: "act_100000000000002",
      fbUserId: "100000000000009",
      organizationReference: "",
      // Meta's `account_status: 1`, in words.
      status: "ACTIVE",
    });
  });

  it("carries the fb user id, which is what Meta's status table is keyed on", () => {
    expect(parseAdAccounts(META_PAYLOAD)[0]!.fbUserId).toBe("100000000000009");
  });

  it("accepts a bare list too, in case n8n sends `$json.accounts`", () => {
    const accounts = parseAdAccounts(META_PAYLOAD[0]!.accounts);
    expect(accounts).toHaveLength(2);
    expect(accounts[1]!.currency).toBe("USD");
  });

  it("reads Google Ads' customer id and descriptive name", () => {
    const accounts = parseAdAccounts({
      data: [{ customer_id: "123-456-7890", descriptive_name: "ZippyGo Search", currency: "INR" }],
    });

    expect(accounts[0]).toEqual({
      id: "123-456-7890",
      name: "ZippyGo Search",
      currency: "INR",
      businessName: "",
      resourceId: "",
      fbUserId: "",
      organizationReference: "",
      status: "",
    });
  });

  it("falls back to the id when the account has no name", () => {
    expect(parseAdAccounts([{ id: "555" }])[0]!.name).toBe("555");
  });

  it("drops rows with no id rather than rendering an unsubmittable choice", () => {
    expect(parseAdAccounts([{ name: "No id here" }])).toEqual([]);
  });

  it("de-duplicates, because a repeated account reads as two identical rows", () => {
    expect(parseAdAccounts([{ id: "1", name: "One" }, { id: "1", name: "One" }])).toHaveLength(1);
  });

  it("coerces a numeric id, which JSON gives unquoted", () => {
    expect(parseAdAccounts([{ id: 1234567890, name: "Numeric" }])[0]!.id).toBe("1234567890");
  });

  it("returns empty for anything unreadable rather than throwing", () => {
    expect(parseAdAccounts(null)).toEqual([]);
    expect(parseAdAccounts({ success: false, error: "no account" })).toEqual([]);
  });
});

describe("platformFromAny", () => {
  it("accepts n8n's spelling from the return URL", () => {
    // The redirect says `platform=meta`; our routes say `meta-ads`.
    expect(platformFromAny("meta")).toBe("metaAds");
    expect(platformFromAny("google")).toBe("googleAds");
  });

  it("accepts our own slugs and the underscored variants", () => {
    expect(platformFromAny("meta-ads")).toBe("metaAds");
    expect(platformFromAny("google_ads")).toBe("googleAds");
    expect(platformFromAny("META")).toBe("metaAds");
  });

  it("accepts n8n's `platform=linkedin` and our LinkedIn slug", () => {
    expect(platformFromAny("linkedin")).toBe("linkedInAds");
    expect(platformFromAny("linkedin-ads")).toBe("linkedInAds");
    expect(platformFromAny("LinkedIn_Ads")).toBe("linkedInAds");
  });

  it("returns null for anything unrecognised", () => {
    expect(platformFromAny("tiktok")).toBeNull();
    expect(platformFromAny(null)).toBeNull();
    expect(platformFromAny("")).toBeNull();
  });
});

/**
 * This is the ONLY way ad accounts ever reach us — the documented list
 * endpoint returns `{"received":true}`, not accounts — so these cases are the
 * difference between a working picker and a customer redoing consent.
 */
describe("parseAccountsParam", () => {
  it("reads the JSON list n8n appends to the callback", () => {
    const raw = JSON.stringify([
      { id: "act_123", name: "ZippyGo", currency: "INR" },
      { account_id: "act_456", account_name: "ZippyGo Test" },
    ]);

    const accounts = parseAccountsParam(raw);
    expect(accounts.map((a) => [a.id, a.name, a.currency])).toEqual([
      ["act_123", "ZippyGo", "INR"],
      ["act_456", "ZippyGo Test", ""],
    ]);
  });

  it("reads a list wrapped in an object, as n8n sometimes sends", () => {
    const raw = JSON.stringify({ accounts: [{ id: "act_9", name: "Wrapped" }] });
    expect(parseAccountsParam(raw)).toHaveLength(1);
  });

  it("caps the list, because this has to fit in a cookie", () => {
    const many = JSON.stringify(
      Array.from({ length: 100 }, (_, i) => ({ id: `act_${i}`, name: `Account ${i}` })),
    );
    expect(parseAccountsParam(many)).toHaveLength(MAX_ADS_ACCOUNTS);
  });

  it("survives malformed JSON without throwing", () => {
    // A broken list must cost a picker, not the connection just approved.
    expect(parseAccountsParam("{not json")).toEqual([]);
    expect(parseAccountsParam("")).toEqual([]);
    expect(parseAccountsParam(null)).toEqual([]);
  });
});

describe("parseStoredAccounts", () => {
  it("round-trips what the callback wrote into the cookie", () => {
    const accounts = parseAccountsParam(JSON.stringify([{ id: "act_1", name: "One" }]));
    expect(parseStoredAccounts(JSON.stringify(accounts))).toEqual(accounts);
  });

  it("treats a missing cookie as no offer", () => {
    expect(parseStoredAccounts(undefined)).toEqual([]);
  });
});

describe("LinkedIn Ads", () => {
  it("selects with POST to the legacy account-selection webhook", () => {
    expect(ADS_PLATFORMS.linkedInAds.select).toEqual({
      path: "/api/webhook/linkedin-account-selection",
      method: "POST",
    });
    expect(ADS_PLATFORMS.linkedInAds.statusTable).toBe("Linkedin-Frontend_Check");
    expect(ADS_PLATFORMS.linkedInAds.connectHref).toBe("/api/ads/connect?platform=linkedin-ads");
    expect(slugOf("linkedInAds")).toBe("linkedin-ads");
  });

  /** The row shape n8n appends to the return URL (LINKEDIN_ADS_FLOW.md 1.2). */
  it("reads LinkedIn's own field names", () => {
    const accounts = parseAccountsParam(
      JSON.stringify([
        {
          adAccountId: "512345678",
          adAccountName: "Acme Technologies",
          organizationReference: "urn:li:organization:12345",
          status: "ACTIVE",
          currency: "USD",
        },
      ]),
    );
    expect(accounts).toEqual([
      {
        id: "512345678",
        name: "Acme Technologies",
        currency: "USD",
        businessName: "",
        resourceId: "",
        fbUserId: "",
        organizationReference: "urn:li:organization:12345",
        status: "ACTIVE",
      },
    ]);
  });
});

describe("choosing a LinkedIn ad account", () => {
  it("sends the legacy body, in LinkedIn's field names, with the uid", async () => {
    apiRequest.mockReset().mockResolvedValue({ success: true });
    await selectAdAccount("linkedInAds", {
      email: "a@b.com",
      userId: "uid-1",
      account: {
        id: "512345678",
        name: "Acme Technologies",
        currency: "USD",
        businessName: "",
        resourceId: "",
        fbUserId: "",
        organizationReference: "urn:li:organization:12345",
        status: "ACTIVE",
      },
    });
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/webhook/linkedin-account-selection",
      expect.objectContaining({
        method: "POST",
        body: {
          adAccountId: "512345678",
          adAccountName: "Acme Technologies",
          organizationReference: "urn:li:organization:12345",
          email: "a@b.com",
          userId: "uid-1",
        },
      }),
    );
  });

  it("leaves the uid off rather than sending it blank", async () => {
    apiRequest.mockReset().mockResolvedValue({ success: true });
    await selectAdAccount("linkedInAds", {
      email: "a@b.com",
      account: {
        id: "1",
        name: "One",
        currency: "",
        businessName: "",
        resourceId: "",
        fbUserId: "",
        organizationReference: "",
        status: "",
      },
    });
    const body = (apiRequest.mock.calls[0]?.[1] as { body: Record<string, unknown> }).body;
    expect(body).not.toHaveProperty("userId");
  });
});

/** The exact list n8n returned for a real LinkedIn login (2026-09-24). */
it("reads the live LinkedIn list, numeric ids and all", () => {
  const live = [
    { adAccountId: 512670674, adAccountName: "Mahi Digital Agency", organizationReference: "urn:li:organization:103350142", status: "ACTIVE", currency: "USD", _hasAccounts: true },
    { adAccountId: 514060735, adAccountName: "Unimakler", organizationReference: "urn:li:organization:102422085", status: "ACTIVE", currency: "INR", _hasAccounts: true },
    { adAccountId: 514098634, adAccountName: "Unimakler", organizationReference: "urn:li:organization:102422085", status: "ACTIVE", currency: "INR", _hasAccounts: true },
    { adAccountId: 522150152, adAccountName: "LeadByte AI", organizationReference: "urn:li:organization:111955236", status: "ACTIVE", currency: "USD", _hasAccounts: true },
    { adAccountId: 548160381, adAccountName: "ZippyGo Smart Travel", organizationReference: "urn:li:organizationBrand:109767041", status: "ACTIVE", currency: "USD", _hasAccounts: true },
  ];
  const accounts = parseAccountsParam(JSON.stringify(live));
  expect(accounts.map((a) => a.id)).toEqual(["512670674", "514060735", "514098634", "522150152", "548160381"]);
  // Two accounts share a name; the id keeps them apart.
  expect(accounts.filter((a) => a.name === "Unimakler")).toHaveLength(2);
  expect(accounts[4]).toMatchObject({
    name: "ZippyGo Smart Travel",
    currency: "USD",
    status: "ACTIVE",
    organizationReference: "urn:li:organizationBrand:109767041",
  });
});

/** The body n8n received for that login's choice — the id as TEXT. */
it("sends the chosen account exactly as n8n received it", async () => {
  apiRequest.mockReset().mockResolvedValue({ success: true });
  const [chosen] = parseAccountsParam(
    JSON.stringify([
      { adAccountId: 548160381, adAccountName: "ZippyGo Smart Travel", organizationReference: "urn:li:organizationBrand:109767041", status: "ACTIVE", currency: "USD" },
    ]),
  );
  await selectAdAccount("linkedInAds", { email: "thilak@ntimes.ai", userId: "yNGTBxGSJZPkoCWZXDcAOce7oGH2", account: chosen! });
  expect((apiRequest.mock.calls[0]?.[1] as { body: unknown }).body).toEqual({
    adAccountId: "548160381",
    adAccountName: "ZippyGo Smart Travel",
    organizationReference: "urn:li:organizationBrand:109767041",
    email: "thilak@ntimes.ai",
    userId: "yNGTBxGSJZPkoCWZXDcAOce7oGH2",
  });
});

describe("metaSelectBody", () => {
  const base = {
    id: "100000000000002",
    name: "Zippygo Travel",
    currency: "USD",
    businessName: "",
    resourceId: "",
    fbUserId: "",
    organizationReference: "",
    status: "ACTIVE" as const,
  };

  it("leaves blank fields off rather than sending empty strings", () => {
    expect(metaSelectBody("a@b.com", base)).toEqual({
      email: "a@b.com",
      account_id: "100000000000002",
      resource_id: "act_100000000000002",
      name: "Zippygo Travel",
      currency: "USD",
    });
  });

  it("never doubles Meta's act_ prefix", () => {
    const body = metaSelectBody("a@b.com", { ...base, id: "act_42" });
    expect(body.account_id).toBe("42");
    expect(body.resource_id).toBe("act_42");
  });

  it("sends the real payload's ids through unchanged", () => {
    const [, zippygo] = parseAdAccounts(META_PAYLOAD);
    const body = metaSelectBody("a@b.com", zippygo!);
    expect(body).toMatchObject({
      account_id: "100000000000002",
      resource_id: "act_100000000000002",
      fb_user_id: "100000000000009",
      business_name: "AI AGENT LLC",
    });
  });
});
