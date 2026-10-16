import {
  adsTotals,
  budgetUse,
  calendarDay,
  campaignDay,
  dateRange,
  filterCampaigns,
  isSecretKey,
  mapAdCampaigns,
  newestUpdate,
  NO_FILTERS,
  parseActions,
  rankEfficiency,
  runsWithin,
  sortCampaigns,
  defaultCampaignOrder,
  titleCase,
  toAdCampaign,
  type AdCampaign,
} from "./ads-campaigns";

const GOOGLE_ROW = {
  campaign_name: "Search — Brand",
  campaign_id: "111",
  status: "ENABLED",
  channel_type: "PERFORMANCE_MAX",
  start_date: "2026-09-01",
  end_date: "2037-12-30",
  daily_budget: 50,
  total_budget: 999,
  impressions: 10000,
  clicks: 340,
  cost: 200,
  ctr: 0.034,
  avg_cpc: 0.59,
  avg_cpm: 20,
  conversions: 10,
  conversions_value: 800,
  ios_installs: 4,
  android_app_installs: "7",
  cost_per_ios_install: 12,
  updated_at: "2026-09-28T10:00:00Z",
};

const META_ROW = {
  campaign_name: "Leads — Autumn",
  effective_status: "ACTIVE",
  objective: "OUTCOME_LEADS",
  start_date: "2026-09-01T00:00:00+0000",
  end_date: "2026-09-10",
  lifetime_budget: "300",
  impressions: 5000,
  reach: 4000,
  frequency: 1.25,
  clicks: 100,
  spend: 150,
  ctr: 2.0,
  cpc: 1.5,
  cpm: 30,
  raw_actions: JSON.stringify([
    { action_type: "link_click", value: "100" },
    { action_type: "onsite_conversion.lead_grouped", value: "12" },
    { action_type: "lead", value: "12" },
  ]),
  access_token: "EAAB-secret",
  updated_at: "2026-09-29",
};

function campaign(overrides: Partial<AdCampaign>): AdCampaign {
  return { ...toAdCampaign({ campaign_name: "x" }, "google"), ...overrides };
}

describe("toAdCampaign", () => {
  it("normalises Google's CTR fraction to a percentage and leaves Meta's alone", () => {
    expect(toAdCampaign(GOOGLE_ROW, "google").ctrPct).toBeCloseTo(3.4);
    expect(toAdCampaign(META_ROW, "meta").ctrPct).toBe(2);
    // The same raw value means different things per platform.
    expect(toAdCampaign({ ctr: 0.08 }, "meta").ctrPct).toBe(0.08);
    expect(toAdCampaign({ ctr: 0.08 }, "google").ctrPct).toBeCloseTo(8);
  });

  it("reads each platform's own spelling of cost, CPC and CPM", () => {
    const google = toAdCampaign(GOOGLE_ROW, "google");
    expect(google.spend).toBe(200);
    expect(google.cpc).toBe(0.59);
    expect(google.cpm).toBe(20);
    const meta = toAdCampaign(META_ROW, "meta");
    expect(meta.spend).toBe(150);
    expect(meta.cpc).toBe(1.5);
    expect(meta.cpm).toBe(30);
  });

  it("treats 2037-12-30 as no end date and keeps only the calendar day", () => {
    expect(toAdCampaign(GOOGLE_ROW, "google").endDate).toBeNull();
    expect(toAdCampaign(META_ROW, "meta").startDate).toBe("2026-09-01");
    expect(calendarDay("2026-09-14 10:22:01")).toBe("2026-09-14");
    expect(calendarDay("soon")).toBeNull();
    expect(campaignDay("2026-09-14")).toBe("14 Sep 2026");
    expect(campaignDay(null)).toBe("—");
  });

  it("decides the budget type by whichever budget is set, daily first", () => {
    const google = toAdCampaign(GOOGLE_ROW, "google");
    expect([google.budget, google.budgetType]).toEqual([50, "Daily"]);
    const meta = toAdCampaign(META_ROW, "meta");
    expect([meta.budget, meta.budgetType]).toEqual([300, "Lifetime"]);
    expect(toAdCampaign({ total_budget: 80, daily_budget: 0 }, "meta").budgetType).toBe("Lifetime");
    const none = toAdCampaign({ daily_budget: 0 }, "meta");
    expect([none.budget, none.budgetType]).toEqual([null, null]);
  });

  it("estimates the amount from daily budget × days, or the lifetime budget", () => {
    // Daily with no end date: unknown.
    expect(toAdCampaign(GOOGLE_ROW, "google").estimatedAmount).toBeNull();
    // Daily, 1–10 Sep inclusive: ten days.
    expect(
      toAdCampaign({ daily_budget: 20, start_date: "2026-09-01", end_date: "2026-09-10" }, "google").estimatedAmount,
    ).toBe(200);
    expect(toAdCampaign(META_ROW, "meta").estimatedAmount).toBe(300);
  });

  it("falls back through status, effective_status and configured_status", () => {
    expect(toAdCampaign({ status: "PAUSED", effective_status: "ACTIVE" }, "meta").status).toBe("PAUSED");
    expect(toAdCampaign({ effective_status: "ACTIVE" }, "meta").status).toBe("ACTIVE");
    expect(toAdCampaign({ configured_status: "PAUSED" }, "meta").status).toBe("PAUSED");
    expect(toAdCampaign({}, "meta").status).toBeNull();
  });

  it("title-cases the channel type", () => {
    expect(toAdCampaign(GOOGLE_ROW, "google").channelType).toBe("Performance Max");
    expect(toAdCampaign({ advertising_channel_type: "DEMAND_GEN" }, "google").channelType).toBe("Demand Gen");
    expect(titleCase("  ")).toBeNull();
  });

  it("calculates ROAS, cost per conversion and conversion rate, null-safe", () => {
    const google = toAdCampaign(GOOGLE_ROW, "google");
    expect(google.roas).toBe(4);
    expect(google.costPerConversion).toBe(20);
    expect(google.conversionRate).toBeCloseTo(10 / 340);

    const bare = toAdCampaign({ spend: 0, conversions: 0 }, "meta");
    expect(bare.roas).toBeNull();
    expect(bare.costPerConversion).toBeNull();
    expect(bare.conversionRate).toBeNull();
    // Missing metrics are null, never 0.
    expect(bare.impressions).toBeNull();
    expect(bare.reach).toBeNull();
    expect(bare.frequency).toBeNull();
  });

  it("finds leads and installs by shape, and leads in Meta's action list without double counting", () => {
    const google = toAdCampaign(GOOGLE_ROW, "google");
    expect(google.iosInstalls).toBe(4);
    expect(google.androidInstalls).toBe(7);
    expect(google.leads).toBeNull();

    const meta = toAdCampaign(META_ROW, "meta");
    expect(meta.leads).toBe(12);
    expect(meta.actions[0]).toEqual({ type: "link_click", value: 100 });
    expect(toAdCampaign({ leads: 3 }, "meta").leads).toBe(3);
  });

  it("counts installs from Meta's action list, per OS where it says and in total", () => {
    const meta = toAdCampaign(
      {
        actions: [
          { action_type: "mobile_app_install", value: "9" },
          { action_type: "app_install_ios", value: "5" },
          { action_type: "link_click", value: "40" },
        ],
      },
      "meta",
    );
    expect(meta.iosInstalls).toBe(5);
    expect(meta.androidInstalls).toBeNull();
    // The row split by OS, so the total is the split's.
    expect(meta.installs).toBe(5);

    const noOs = toAdCampaign({ raw_actions: JSON.stringify([{ action_type: "omni_app_install", value: 3 }]) }, "meta");
    expect(noOs.iosInstalls).toBeNull();
    expect(noOs.installs).toBe(3);

    // A row's own columns still win over the action list.
    const google = toAdCampaign(GOOGLE_ROW, "google");
    expect(google.installs).toBe(11);
    expect(toAdCampaign({ campaign_name: "x" }, "meta").installs).toBeNull();
  });

  it("never reads an id as a count", () => {
    // `lead_form_id` contains "lead" and is all digits; it is not 1.2 billion leads.
    const meta = toAdCampaign({ lead_form_id: "1234567890", ios_install_campaign_id: "77" }, "meta");
    expect(meta.leads).toBeNull();
    expect(meta.iosInstalls).toBeNull();
    expect(toAdCampaign({ lead_form_id: "1234567890", lead_count: 4 }, "meta").leads).toBe(4);
  });

  it("parses actions from a list, a JSON string or a map", () => {
    expect(parseActions([{ action_type: "lead", value: "2" }])).toEqual([{ type: "lead", value: 2 }]);
    expect(parseActions({ purchase: 3 })).toEqual([{ type: "purchase", value: 3 }]);
    expect(parseActions("not json")).toEqual([]);
    expect(parseActions(undefined)).toEqual([]);
  });

  it("lists raw fields by name as text, with credentials removed", () => {
    const meta = toAdCampaign({ ...META_ROW, nested: { a: 1 } }, "meta");
    const keys = meta.raw.map(([key]) => key);
    expect(keys).not.toContain("access_token");
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
    expect(meta.raw.find(([key]) => key === "nested")?.[1]).toBe('{"a":1}');
    expect(isSecretKey("refreshToken")).toBe(true);
    expect(isSecretKey("client_secret")).toBe(true);
    expect(isSecretKey("campaign_name")).toBe(false);
  });

  it("keeps keys unique when a name repeats, and finds the newest update", () => {
    const rows = mapAdCampaigns([META_ROW, META_ROW, { ...META_ROW, updated_at: "2026-09-30T01:00:00Z" }], "meta");
    expect(new Set(rows.map((row) => row.key)).size).toBe(3);
    expect(newestUpdate(rows)).toBe("2026-09-30");
    expect(newestUpdate([])).toBeNull();
  });
});

describe("adsTotals", () => {
  it("derives CTR and ROAS from the totals, and is null where nothing reported", () => {
    const totals = adsTotals([
      campaign({ impressions: 1000, clicks: 10, spend: 100, convValue: 300 }),
      campaign({ impressions: 9000, clicks: 890, spend: 100, convValue: null }),
    ]);
    // 900 / 10000, not the mean of 1% and 9.9%.
    expect(totals.ctrPct).toBeCloseTo(9);
    expect(totals.roas).toBeCloseTo(1.5);
    expect(totals.conversions).toBeNull();
    expect(adsTotals([]).spend).toBeNull();
  });
});

describe("rankEfficiency", () => {
  it("ranks by ROAS when any campaign has a conversion value", () => {
    const { mode, items } = rankEfficiency([
      campaign({ key: "a", spend: 100, convValue: 200, roas: 2 }),
      campaign({ key: "b", spend: 100, convValue: 500, roas: 5 }),
      campaign({ key: "c", spend: 100, costPerConversion: 1 }),
    ]);
    expect(mode).toBe("roas");
    expect(items.map((item) => item.campaign.key)).toEqual(["b", "a"]);
    expect(items[0]?.share).toBe(1);
  });

  it("otherwise ranks by cost per result, cheapest first with the longest bar", () => {
    const { mode, items } = rankEfficiency([
      campaign({ key: "dear", costPerConversion: 40 }),
      campaign({ key: "cheap", costPerConversion: 10 }),
      campaign({ key: "none", costPerConversion: null }),
    ]);
    expect(mode).toBe("cost-per-result");
    expect(items.map((item) => item.campaign.key)).toEqual(["cheap", "dear"]);
    expect(items[0]?.share).toBe(1);
    expect(items[1]?.share).toBe(0.25);
  });

  it("keeps at most eight", () => {
    const rows = Array.from({ length: 12 }, (_, i) => campaign({ key: String(i), costPerConversion: i + 1 }));
    expect(rankEfficiency(rows).items).toHaveLength(8);
  });
});

describe("defaultCampaignOrder (2026-10-13)", () => {
  it("puts completed campaigns first, latest start date first, then running, then paused", () => {
    const rows = [
      campaign({ key: "paused", status: "PAUSED", startDate: "2026-09-09" }),
      campaign({ key: "done-old", status: "COMPLETED", startDate: "2026-05-12" }),
      campaign({ key: "live", status: "ACTIVE", startDate: "2026-10-01" }),
      campaign({ key: "done-new", status: "COMPLETED", startDate: "2026-07-21" }),
      campaign({ key: "done-undated", status: "COMPLETED", startDate: null }),
      campaign({ key: "removed", status: "REMOVED", startDate: "2026-10-05" }),
      campaign({ key: "done-mid", status: "COMPLETED", startDate: "2026-06-04" }),
    ];
    expect(defaultCampaignOrder(rows).map((row) => row.key)).toEqual([
      "done-new",
      "done-mid",
      "done-old",
      "done-undated",
      "live",
      "paused",
      "removed",
    ]);
  });
});

describe("sortCampaigns", () => {
  const rows = [
    campaign({ key: "paused-big", status: "PAUSED", spend: 900 }),
    campaign({ key: "live-small", status: "ENABLED", spend: 10 }),
    campaign({ key: "live-big", status: "ACTIVE", spend: 500 }),
    campaign({ key: "paused-unknown", status: "PAUSED", spend: null }),
    campaign({ key: "paused-mid", status: "REMOVED", spend: 50 }),
  ];

  it("puts running campaigns first, then the sort order", () => {
    expect(sortCampaigns(rows, "spend", "desc").map((row) => row.key)).toEqual([
      "live-big",
      "live-small",
      "paused-big",
      "paused-mid",
      "paused-unknown",
    ]);
  });

  it("keeps unknowns last in either direction", () => {
    expect(sortCampaigns(rows, "spend", "asc").map((row) => row.key)).toEqual([
      "live-small",
      "live-big",
      "paused-mid",
      "paused-big",
      "paused-unknown",
    ]);
  });
});

describe("date ranges", () => {
  const now = new Date("2026-09-30T23:30:00Z");

  it("reads presets as UTC calendar days, both ends inclusive", () => {
    expect(dateRange({ date: "today", from: "", to: "" }, now)).toEqual({ from: "2026-09-30", to: "2026-09-30" });
    expect(dateRange({ date: "yesterday", from: "", to: "" }, now)).toEqual({ from: "2026-09-29", to: "2026-09-29" });
    expect(dateRange({ date: "7d", from: "", to: "" }, now)).toEqual({ from: "2026-09-24", to: "2026-09-30" });
    expect(dateRange({ date: "30d", from: "", to: "" }, now)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(dateRange({ date: "custom", from: "2026-08-01", to: "" }, now)).toEqual({ from: "2026-08-01", to: null });
  });

  it("keeps a campaign that ran at any point in the range", () => {
    const aug = campaign({ startDate: "2026-08-01", endDate: "2026-08-31" });
    expect(runsWithin(aug, "2026-08-31", "2026-09-30")).toBe(true);
    expect(runsWithin(aug, "2026-09-01", "2026-09-30")).toBe(false);
    // No end date: still running.
    const open = campaign({ startDate: "2026-01-01", endDate: null });
    expect(runsWithin(open, "2026-09-29", "2026-09-29")).toBe(true);
    // Not started yet.
    expect(runsWithin(campaign({ startDate: "2026-10-05" }), "2026-09-01", "2026-09-30")).toBe(false);
  });
});

describe("filterCampaigns", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  const rows = [
    campaign({ key: "a", campaign: "Brand search", status: "ENABLED", spend: 100, roas: 3 }),
    campaign({ key: "b", campaign: "Retargeting", status: "PAUSED", spend: 20, roas: null }),
    campaign({ key: "c", campaign: "Brand display", status: "PAUSED", spend: null, roas: null }),
  ];
  const keys = (list: AdCampaign[]) => list.map((row) => row.key);

  it("passes everything with no filters", () => {
    expect(keys(filterCampaigns(rows, NO_FILTERS, now))).toEqual(["a", "b", "c"]);
  });

  it("searches by name and filters by status", () => {
    expect(keys(filterCampaigns(rows, { ...NO_FILTERS, search: "brand" }, now))).toEqual(["a", "c"]);
    expect(keys(filterCampaigns(rows, { ...NO_FILTERS, status: "PAUSED" }, now))).toEqual(["b", "c"]);
  });

  it("fails a minimum on an unknown figure rather than passing it", () => {
    expect(keys(filterCampaigns(rows, { ...NO_FILTERS, minSpend: "10" }, now))).toEqual(["a", "b"]);
    expect(keys(filterCampaigns(rows, { ...NO_FILTERS, minRoas: "1" }, now))).toEqual(["a"]);
  });
});

describe("budgetUse", () => {
  it("is good under 90%, warn from 90%, crit at 100% or more", () => {
    expect(budgetUse(campaign({ spend: 50, estimatedAmount: 100 }))?.tone).toBe("good");
    expect(budgetUse(campaign({ spend: 90, estimatedAmount: 100 }))?.tone).toBe("warn");
    expect(budgetUse(campaign({ spend: 100, estimatedAmount: 100 }))?.tone).toBe("crit");
    expect(budgetUse(campaign({ spend: 50, estimatedAmount: null }))).toBeNull();
  });
});
