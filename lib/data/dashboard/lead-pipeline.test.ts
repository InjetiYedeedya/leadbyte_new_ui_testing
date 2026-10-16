import {
  NO_FILTERS,
  agentStateOf,
  anyFilter,
  buildPipeline,
  entryCount,
  extraFilterCount,
  filterLeads,
  hasReplied,
  isContacted,
  isSentToSales,
  leadsToCsv,
  mapLead,
  mapLeadRuns,
  mapLeadSettings,
  mapLeads,
  scoreGroupOf,
  statusLabel,
  statusTone,
  timeAgo,
  toEpoch,
  type Lead,
} from "./lead-pipeline";
import { flatten } from "./fields";

function lead(row: Record<string, unknown>): Lead {
  const mapped = mapLead({ lead_email: "a@x.com", ...row });
  if (!mapped) throw new Error("row did not map");
  return mapped;
}

describe("mails is a list of sent emails, not a number", () => {
  it("counts an array's entries", () => {
    expect(lead({ mails: [{ body: "hi" }, { body: "again" }] }).emailsSent).toBe(2);
  });

  it("counts an object's keys", () => {
    expect(lead({ mails: { m1: "hi", m2: "x", m3: "y" } }).emailsSent).toBe(3);
  });

  it("counts a list that arrived as JSON text", () => {
    expect(entryCount('[{"body":"hi"},{"body":"yo"}]')).toBe(2);
  });

  it("reads a number, a blank or a missing field as no entries", () => {
    expect(entryCount(5)).toBe(0);
    expect(entryCount("")).toBe(0);
    expect(lead({}).emailsSent).toBe(0);
  });

  it("never carries the bodies onto the lead", () => {
    const mapped = lead({ mails: [{ body: "SECRET BODY" }] });
    expect(JSON.stringify(mapped)).not.toContain("SECRET BODY");
    expect(leadsToCsv([mapped])).not.toContain("SECRET BODY");
  });
});

describe("contacted", () => {
  it.each([
    [true, true],
    ["yes", true],
    ["YES", true],
    [1, true],
    [3, true],
    ["2", true],
    [0, false],
    [false, false],
    ["no", false],
    ["", false],
    [undefined, false],
    [null, false],
  ])("send_mail %j → %s", (value, expected) => {
    expect(isContacted(value)).toBe(expected);
  });
});

describe("sent to sales is sales_contact exactly 1 or true", () => {
  it.each([
    [1, true],
    [true, true],
    ["1", false],
    ["yes", false],
    ["true", false],
    [2, false],
    [0, false],
    [undefined, false],
  ])("sales_contact %j → %s", (value, expected) => {
    expect(isSentToSales(value)).toBe(expected);
  });
});

describe("replied", () => {
  it("is a value in lead_reply", () => {
    expect(hasReplied(flatten({ lead_reply: "Sounds good" }))).toBe(true);
    expect(hasReplied(flatten({ lead_reply: true }))).toBe(true);
  });

  it("is a value in last_reply_at", () => {
    expect(hasReplied(flatten({ last_reply_at: "2026-09-10T10:00:00Z" }))).toBe(true);
  });

  it("is not zero, false or blank", () => {
    expect(hasReplied(flatten({ lead_reply: 0, last_reply_at: "" }))).toBe(false);
    expect(hasReplied(flatten({ lead_reply: false }))).toBe(false);
    expect(hasReplied(flatten({ lead_reply: "0" }))).toBe(false);
    expect(hasReplied(flatten({}))).toBe(false);
  });
});

describe("score groups", () => {
  it.each([
    [100, "hot"],
    [70, "hot"],
    [69, "warm"],
    [40, "warm"],
    [39, "cold"],
    [0, "cold"],
    [null, "unscored"],
  ] as const)("%s → %s", (score, group) => {
    expect(scoreGroupOf(score)).toBe(group);
  });

  it("reads a missing or unreadable score as unscored, never as cold", () => {
    expect(lead({}).scoreGroup).toBe("unscored");
    expect(lead({ score: "n/a" }).scoreGroup).toBe("unscored");
    expect(lead({ score: "82" }).score).toBe(82);
  });
});

describe("mapLead", () => {
  it("strips the #uuid from the address but keeps the raw key as the id", () => {
    const mapped = lead({ lead_email: "harish@ntimes.ai#d8433b99" });
    expect(mapped.email).toBe("harish@ntimes.ai");
    expect(mapped.id).toBe("harish@ntimes.ai#d8433b99");
  });

  it("drops a row with neither a name nor an address", () => {
    expect(mapLead({ score: 50 })).toBeNull();
  });

  it("keeps a missing opens or clicks as null, not 0", () => {
    const mapped = lead({});
    expect(mapped.opens).toBeNull();
    expect(mapped.clicks).toBeNull();
    expect(mapped.messages).toBeNull();
  });

  it("counts threads as messages", () => {
    expect(lead({ thread_ids: ["t1", "t2"] }).messages).toBe(2);
  });

  it("formats times in UTC with a three-letter month", () => {
    const mapped = lead({ last_sent_at: "2026-09-14T23:30:00Z" });
    expect(mapped.lastSentLabel).toBe("14 Sep 2026");
    expect(mapped.day).toBe("2026-09-14");
  });

  it("uses the reply flag as the reply text when it is text", () => {
    expect(lead({ lead_reply: "Call me Monday" }).lastReplyText).toBe("Call me Monday");
    expect(lead({ lead_reply: true }).lastReplyText).toBe("");
  });
});

describe("mapLeads", () => {
  it("makes duplicate keys unique", () => {
    const leads = mapLeads([{ lead_email: "a@x.com" }, { lead_email: "a@x.com" }]);
    expect(new Set(leads.map((l) => l.id)).size).toBe(2);
  });

  it("puts the newest send first", () => {
    const leads = mapLeads([
      { lead_email: "old@x.com", last_sent_at: "2026-09-01T00:00:00Z" },
      { lead_email: "new@x.com", last_sent_at: "2026-09-20T00:00:00Z" },
    ]);
    expect(leads.map((l) => l.email)).toEqual(["new@x.com", "old@x.com"]);
  });
});

describe("mapLeadSettings", () => {
  it("never carries the outreach password", () => {
    const settings = mapLeadSettings([
      { outreachEmail: "me@acme.com", outreachPassword: "hunter2", companyName: "Acme" },
    ]);
    expect(settings?.outreachEmail).toBe("me@acme.com");
    expect(JSON.stringify(settings)).not.toContain("hunter2");
    expect(JSON.stringify(settings).toLowerCase()).not.toContain("password");
  });

  it("is null with no record", () => {
    expect(mapLeadSettings([])).toBeNull();
  });

  it("takes the latest record when there are two", () => {
    const settings = mapLeadSettings([
      { companyName: "Old", updated_at: "2026-01-01T00:00:00Z" },
      { companyName: "New", updated_at: "2026-09-01T00:00:00Z" },
    ]);
    expect(settings?.companyName).toBe("New");
  });

  it("reads the leads version", () => {
    expect(mapLeadSettings([{ leadsVersion: "3" }])?.leadsVersion).toBe(3);
  });
});

describe("agentStateOf", () => {
  const base = mapLeadSettings([{}])!;
  it("is not configured with no record", () => {
    expect(agentStateOf(null)).toBe("not-configured");
  });
  it("is active by status or by the configured flag", () => {
    expect(agentStateOf({ ...base, status: "Active" })).toBe("active");
    expect(agentStateOf({ ...base, configured: true })).toBe("active");
  });
  it("is inactive when the status names something else", () => {
    expect(agentStateOf({ ...base, status: "paused", configured: true })).toBe("inactive");
  });
});

describe("mapLeadRuns", () => {
  it("keeps only this agent's open runs", () => {
    const runs = mapLeadRuns([
      { agent_type: "LEAD_QUALIFICATION", status: "running", pending: 4 },
      { name: "lead-qualification", status: "in_progress", pending: 2 },
      { agent_name: "Lead Qualification Agent", status: "QUEUED", pending: 1 },
      { agent_type: "LEAD_QUALIFICATION", status: "completed", pending: 9 },
      { agent_type: "ON_PAGE_SEO", status: "running", pending: 9 },
      { status: "running", pending: 9 },
    ]);
    expect(runs.map((r) => r.incoming)).toEqual([4, 2, 1]);
  });

  it("falls back to total minus sent when pending is missing", () => {
    const [run] = mapLeadRuns([{ agent_type: "LEAD_QUALIFICATION", status: "processing", total: 50, sent: 12 }]);
    expect(run?.incoming).toBe(38);
  });

  it("never goes below zero, and is zero with nothing to count", () => {
    const runs = mapLeadRuns([
      { agent_type: "LEAD_QUALIFICATION", status: "pending", total: 5, sent: 9 },
      { agent_type: "LEAD_QUALIFICATION", status: "pending" },
    ]);
    expect(runs.map((r) => r.incoming)).toEqual([0, 0]);
  });

  it("treats a pending of 0 as a real zero, not as missing", () => {
    const [run] = mapLeadRuns([{ agent_type: "LEAD_QUALIFICATION", status: "running", pending: 0, total: 9 }]);
    expect(run?.incoming).toBe(0);
  });
});

describe("buildPipeline", () => {
  it("adds queued leads to the total and counts each stage", () => {
    const leads = mapLeads([
      { lead_email: "a@x.com", send_mail: true, opens: 2, lead_reply: "yes", sales_contact: 1, score: 80, mails: [1, 2] },
      { lead_email: "b@x.com", send_mail: "yes", opens: 0, score: 50, mails: [1] },
      { lead_email: "c@x.com", score: 10 },
      { lead_email: "d@x.com" },
    ]);
    const runs = mapLeadRuns([{ agent_type: "LEAD_QUALIFICATION", status: "running", pending: 6 }]);
    const pipeline = buildPipeline(leads, runs);
    expect(pipeline).toMatchObject({
      total: 10,
      queued: 6,
      runsInProgress: 1,
      contacted: 2,
      opened: 1,
      replied: 1,
      sales: 1,
      emailsSent: 3,
      score: { hot: 1, warm: 1, cold: 1, unscored: 1 },
    });
  });
});

describe("filterLeads", () => {
  const leads = mapLeads([
    { lead_email: "a@x.com", lead_name: "Ann", send_mail: true, lead_status: "Qualified", score: 90, template: "intro", date: "2026-09-10" },
    { lead_email: "b@x.com", lead_name: "Bo", lead_status: "New", score: 20, last_reply_text: "Not interested", last_reply_at: "2026-09-21T09:00:00Z", date: "2026-09-20" },
    { lead_email: "c@x.com", lead_name: "Cy", sales_contact: true, score: 55 },
  ]);
  const names = (list: Lead[]) => list.map((l) => l.name).sort();

  it("passes everything with no filters", () => {
    expect(filterLeads(leads, NO_FILTERS)).toHaveLength(3);
    expect(anyFilter(NO_FILTERS)).toBe(false);
  });

  it("filters by stage and by score group", () => {
    expect(names(filterLeads(leads, { ...NO_FILTERS, stage: "contacted" }))).toEqual(["Ann"]);
    expect(names(filterLeads(leads, { ...NO_FILTERS, stage: "sales" }))).toEqual(["Cy"]);
    expect(names(filterLeads(leads, { ...NO_FILTERS, score: "warm" }))).toEqual(["Cy"]);
  });

  it("searches reply text and status", () => {
    expect(names(filterLeads(leads, { ...NO_FILTERS, query: "interested" }))).toEqual(["Bo"]);
    expect(names(filterLeads(leads, { ...NO_FILTERS, query: "qualif" }))).toEqual(["Ann"]);
  });

  it("bounds by date, leaving out leads with no day", () => {
    const filters = { ...NO_FILTERS, from: "2026-09-15" };
    expect(names(filterLeads(leads, filters))).toEqual(["Bo"]);
    expect(extraFilterCount(filters)).toBe(1);
  });

  it("filters by reply and sales", () => {
    expect(names(filterLeads(leads, { ...NO_FILTERS, reply: "replied" }))).toEqual(["Bo"]);
    expect(names(filterLeads(leads, { ...NO_FILTERS, sales: "no" }))).toEqual(["Ann", "Bo"]);
  });
});

describe("CSV", () => {
  it("quotes commas and neutralises formulas", () => {
    const csv = leadsToCsv([lead({ lead_name: "Smith, Jo", last_reply_text: "=HYPERLINK(1)" })]);
    const [, row] = csv.split("\r\n");
    expect(row).toContain('"Smith, Jo"');
    expect(row).toContain("'=HYPERLINK(1)");
  });
});

describe("helpers", () => {
  it("reads epoch seconds and milliseconds alike", () => {
    expect(toEpoch(1_757_000_000)).toBe(1_757_000_000_000);
    expect(toEpoch(1_757_000_000_000)).toBe(1_757_000_000_000);
    expect(toEpoch("")).toBeNull();
    expect(toEpoch("not a date")).toBeNull();
  });

  it("says how long ago", () => {
    const now = Date.parse("2026-09-30T12:00:00Z");
    expect(timeAgo(Date.parse("2026-09-28T12:00:00Z"), now)).toBe("2d ago");
    expect(timeAgo(Date.parse("2026-09-30T11:30:00Z"), now)).toBe("30m ago");
    expect(timeAgo(null, now)).toBe("");
  });

  it("gives the same status the same colour", () => {
    expect(statusTone("Qualified")).toBe(statusTone(" qualified "));
    expect(statusLabel("in_progress")).toBe("In progress");
  });
});
