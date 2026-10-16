import { describe, expect, it } from "vitest";
import {
  adsCardNote,
  aggregate,
  hasMetrics,
  mapAdsDays,
  mapAdsDaysByCampaign,
  toCampaignRow,
} from "./ads-insights";

describe("toCampaignRow", () => {
  it("reads Google's field names", () => {
    const row = toCampaignRow({
      campaign_name: "Brand Search",
      impressions: 1000,
      clicks: 50,
      cost: 500,
      conversions: 5,
      conversions_value: 2500,
    });

    expect(row).toMatchObject({
      campaign: "Brand Search",
      impressions: 1000,
      clicks: 50,
      spend: 500,
      conversions: 5,
      conversionValue: 2500,
    });
  });

  it("reads the rest of what Google actually sends", () => {
    // Every one of these is on 100% of the live rows — see the module doc.
    const row = toCampaignRow({
      platform: "google",
      campaign_name: "App Promotions Denvar",
      campaign_id: "24220073485",
      status: "PAUSED",
      channel_type: "MULTI_CHANNEL",
      start_date: "2026-09-04",
      end_date: "2026-09-12",
      daily_budget: 20,
      total_budget: 0,
      avg_cpc: 0.70683,
      cost_per_conversion: 2.221468,
      ios_installs: 0,
      android_installs: 14,
    });

    expect(row).toMatchObject({
      campaignId: "24220073485",
      status: "PAUSED",
      kind: "MULTI_CHANNEL",
      startDate: "2026-09-04",
      endDate: "2026-09-12",
      dailyBudget: 20,
      totalBudget: 0,
      cpc: 0.70683,
      costPerConversion: 2.221468,
      iosInstalls: 0,
      androidInstalls: 14,
    });
  });

  /**
   * Nearly half of Meta's live campaign rows carry name, status, dates and a
   * budget and nothing else. Coerced to 0 they were indistinguishable from a
   * campaign that ran and achieved nothing.
   */
  describe("a campaign the platform reported no metrics for", () => {
    const shell = toCampaignRow({
      campaign_name: "LeadByte OUTCOME_LEADS 2026-09-08_549007",
      effective_status: "PAUSED",
      start_date: "2026-09-08",
      end_date: "2026-10-08",
      total_budget: "22",
    });

    it("has null metrics, not zeros", () => {
      expect(shell.spend).toBeNull();
      expect(shell.impressions).toBeNull();
      expect(shell.clicks).toBeNull();
      expect(shell.conversions).toBeNull();
      expect(shell.ctr).toBeNull();
    });

    it("still carries what the row DOES have", () => {
      expect(shell).toMatchObject({
        campaign: "LeadByte OUTCOME_LEADS 2026-09-08_549007",
        status: "PAUSED",
        startDate: "2026-09-08",
        endDate: "2026-10-08",
      });
    });

    it("parses a budget Meta sent as a string", () => {
      expect(shell.totalBudget).toBe(22);
    });

    it("reports itself as having no metrics", () => {
      expect(hasMetrics(shell)).toBe(false);
    });
  });

  it("counts a campaign with any metric as having metrics", () => {
    expect(hasMetrics(toCampaignRow({ campaign_name: "X", spend: 0 }))).toBe(true);
  });

  describe("click-through rate, which the platforms send in different units", () => {
    /**
     * Google sends a fraction and Meta a percentage, with no flag saying which,
     * so the row's own `platform` field is the discriminator. A magnitude test
     * would be wrong in both directions.
     */
    it("multiplies Google's fraction up to a percentage", () => {
      // The live row rendering as 8.06% in the legacy dashboard.
      const row = toCampaignRow({ platform: "google", ctr: 0.08058608058608059 });

      expect(row.ctr).toBeCloseTo(8.058, 2);
    });

    it("leaves Meta's percentage alone", () => {
      const row = toCampaignRow({ platform: "meta", ctr: 2.098951 });

      expect(row.ctr).toBeCloseTo(2.099, 2);
    });

    it("does not mistake a genuinely low Meta rate for a fraction", () => {
      // 0.08% on Meta must stay 0.08%, not become 8%.
      const row = toCampaignRow({ platform: "meta", ctr: 0.08 });

      expect(row.ctr).toBeCloseTo(0.08);
    });
  });

  it("takes the status from either platform's spelling", () => {
    expect(toCampaignRow({ status: "ACTIVE" }).status).toBe("ACTIVE");
    expect(toCampaignRow({ effective_status: "PAUSED" }).status).toBe("PAUSED");
  });

  it("puts Google's channel type and Meta's objective in one column", () => {
    expect(toCampaignRow({ channel_type: "PERFORMANCE_MAX" }).kind).toBe("PERFORMANCE_MAX");
    expect(toCampaignRow({ objective: "OUTCOME_LEADS" }).kind).toBe("OUTCOME_LEADS");
  });

  it("treats an empty string as absent, which is how currency arrives", () => {
    expect(toCampaignRow({ campaign_name: "X", status: "" }).status).toBeNull();
  });

  it("reads Meta's different field names for the same things", () => {
    const row = toCampaignRow({
      campaign_name: "Retargeting",
      impressions: 2000,
      clicks: 40,
      spend: 300,
      purchases: 4,
      purchase_value: 1200,
    });

    expect(row.spend).toBe(300);
    expect(row.conversions).toBe(4);
    expect(row.conversionValue).toBe(1200);
  });

  it("coerces numbers sent as strings, which DynamoDB often does", () => {
    const row = toCampaignRow({ campaign_name: "X", impressions: "1500", spend: "42.5" });
    expect(row.impressions).toBe(1500);
    expect(row.spend).toBe(42.5);
  });

  it("survives junk rows without producing NaN", () => {
    // Null rather than 0: unparseable and absent both mean "we do not know".
    const row = toCampaignRow({ impressions: "not a number", spend: null });
    expect(row.impressions).toBeNull();
    expect(row.spend).toBeNull();
    expect(row.campaign).toBe("—");
  });

  it("survives a row that is not an object at all", () => {
    expect(toCampaignRow(null).impressions).toBeNull();
    expect(toCampaignRow("nonsense").clicks).toBeNull();
  });
});

describe("aggregate", () => {
  const rows = [
    toCampaignRow({
      campaign_name: "A",
      impressions: 1000,
      clicks: 100,
      cost: 500,
      conversions: 10,
      conversions_value: 2000,
    }),
    toCampaignRow({
      campaign_name: "B",
      impressions: 3000,
      clicks: 100,
      cost: 500,
      conversions: 10,
      conversions_value: 1000,
    }),
  ];

  it("sums the raw totals", () => {
    const t = aggregate(rows);
    expect(t.impressions).toBe(4000);
    expect(t.clicks).toBe(200);
    expect(t.spend).toBe(1000);
    expect(t.conversions).toBe(20);
  });

  it("derives CTR from totals, not by averaging per-campaign rates", () => {
    // Averaging the two campaign CTRs (10% and 3.33%) gives 6.67%, which is
    // wrong. The true figure is 200/4000 = 5%.
    expect(aggregate(rows).ctr).toBeCloseTo(5);
  });

  it("derives cpc, cpa and roas from totals", () => {
    const t = aggregate(rows);
    expect(t.cpc).toBe(5);
    expect(t.cpa).toBe(50);
    expect(t.roas).toBe(3);
  });

  it("returns null, not zero, for undefined rates", () => {
    // "No conversions yet" must not render as "CPA of 0" — they mean opposite
    // things to someone deciding where to spend.
    const t = aggregate([
      { campaign: "New", impressions: 0, clicks: 0, spend: 0, conversions: 0, conversionValue: 0 },
    ] as unknown as Parameters<typeof aggregate>[0]);
    expect(t.ctr).toBeNull();
    expect(t.cpc).toBeNull();
    expect(t.cpa).toBeNull();
    expect(t.roas).toBeNull();
  });

  it("handles spend with no conversions", () => {
    const t = aggregate([
      { campaign: "Burning", impressions: 500, clicks: 10, spend: 250, conversions: 0, conversionValue: 0 },
    ] as unknown as Parameters<typeof aggregate>[0]);
    expect(t.cpa).toBeNull();
    expect(t.roas).toBe(0);
    expect(t.cpc).toBe(25);
  });

  it("returns zeroed totals for no campaigns", () => {
    const t = aggregate([]);
    expect(t.spend).toBe(0);
    expect(t.ctr).toBeNull();
  });
});

describe("mapAdsDays · rolling accounts up", () => {
  /**
   * The ad tables are one row per ACCOUNT per day. Two accounts on one platform
   * reporting the same date gave the spend chart two points at one x and the
   * daily table two rows with the same key.
   */
  it("sums two accounts reporting the same day into one row", () => {
    const out = mapAdsDays([
      { date: "2026-09-01", spend: 300, clicks: 10, impressions: 900, conversions: 1 },
      { date: "2026-09-01", spend: 700, clicks: 25, impressions: 2100, conversions: 3 },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      date: "2026-09-01",
      spend: 1000,
      clicks: 35,
      impressions: 3000,
      conversions: 4,
    });
  });

  it("gives every row a date the table can key on", () => {
    const dates = mapAdsDays([
      { date: "2026-09-01", spend: 1 },
      { date: "2026-09-01", spend: 2 },
      { date: "2026-09-02", spend: 3 },
    ]).map((day) => day.date);

    expect(new Set(dates).size).toBe(dates.length);
  });
});

describe("mapAdsDays", () => {
  it("reads Google's `cost` and Meta's `spend` as the same thing", () => {
    const google = mapAdsDays([{ date: "2026-08-01", cost: 1200, clicks: 40 }]);
    const meta = mapAdsDays([{ date_start: "2026-08-01", spend: "1200", clicks: 40 }]);

    expect(google[0]!.spend).toBe(1200);
    // Meta sends numbers as strings, and dates under `date_start`.
    expect(meta[0]!.spend).toBe(1200);
    expect(meta[0]!.date).toBe("2026-08-01");
  });

  it("counts Meta's `purchases` as conversions", () => {
    expect(mapAdsDays([{ date: "d", purchases: 7 }])[0]!.conversions).toBe(7);
  });

  it("sorts oldest first, so a chart reads left-to-right in time", () => {
    const days = mapAdsDays([{ date: "2026-08-03" }, { date: "2026-08-01" }]);
    expect(days.map((d) => d.date)).toEqual(["2026-08-01", "2026-08-03"]);
  });

  it("drops rows with no date rather than charting them at the epoch", () => {
    expect(mapAdsDays([{ spend: 500 }])).toEqual([]);
  });

  it("returns empty for anything that is not a list", () => {
    expect(mapAdsDays(null)).toEqual([]);
    expect(mapAdsDays({ data: [] })).toEqual([]);
  });
});

describe("mapAdsDaysByCampaign", () => {
  const ROWS = [
    { campaign_name: "Brand", date: "2026-09-01", spend: 10, clicks: 2 },
    { campaign_name: "Brand", date: "2026-09-02", spend: 20, clicks: 4 },
    { campaign_name: "Display", date: "2026-09-01", spend: 5, clicks: 1 },
  ];

  it("keeps each campaign's own series instead of summing them together", () => {
    const out = mapAdsDaysByCampaign(ROWS);

    expect(Object.keys(out).sort()).toEqual(["Brand", "Display"]);
    expect(out.Brand?.map((day) => day.spend)).toEqual([10, 20]);
    expect(out.Display?.map((day) => day.spend)).toEqual([5]);
  });

  it("still rolls a campaign's duplicate dates up", () => {
    // One campaign can appear twice on a day when two accounts report it.
    const out = mapAdsDaysByCampaign([
      { campaign_name: "Brand", date: "2026-09-01", spend: 10 },
      { campaign_name: "Brand", date: "2026-09-01", spend: 15 },
    ]);

    expect(out.Brand).toHaveLength(1);
    expect(out.Brand?.[0]?.spend).toBe(25);
  });

  it("drops rows with no campaign name rather than bucketing them together", () => {
    const out = mapAdsDaysByCampaign([{ date: "2026-09-01", spend: 10 }]);

    expect(out).toEqual({});
  });

  it("survives a non-array", () => {
    expect(mapAdsDaysByCampaign(null)).toEqual({});
  });
});

describe("adsCardNote", () => {
  it("says campaigns and conversions under a platform's spend", () => {
    expect(adsCardNote(135, 40)).toBe("135 campaigns · 40 conversions");
    expect(adsCardNote(1, 1)).toBe("1 campaign · 1 conversion");
  });

  it("says 'none yet' rather than a bare zero", () => {
    expect(adsCardNote(6, 0)).toBe("6 campaigns · no conversions yet");
  });
});
