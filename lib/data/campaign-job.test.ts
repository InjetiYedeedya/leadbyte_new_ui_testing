import { parseCampaignCookie, serialiseCampaign } from "@/lib/data/campaign-job";

describe("parseCampaignCookie", () => {
  it("reads the id, the start time and the state", () => {
    const record = parseCampaignCookie("job_1787826787617_sj1xgray8|1787826787617|paused");
    expect(record?.jobId).toBe("job_1787826787617_sj1xgray8");
    expect(record?.startedAt).toBe(1787826787617);
    expect(record?.state).toBe("paused");
  });

  it("defaults to running for anything that is not the word paused", () => {
    expect(parseCampaignCookie("job_1|1|running")?.state).toBe("running");
    expect(parseCampaignCookie("job_1|1|")?.state).toBe("running");
    expect(parseCampaignCookie("job_1|1")?.state).toBe("running");
  });

  it("tolerates a cookie written before the timestamp existed", () => {
    const record = parseCampaignCookie("job_1");
    expect(record?.jobId).toBe("job_1");
    expect(record?.startedAt).toBeGreaterThan(0);
  });

  it("is null when there is no campaign", () => {
    expect(parseCampaignCookie(undefined)).toBeNull();
    expect(parseCampaignCookie("")).toBeNull();
    expect(parseCampaignCookie("   ")).toBeNull();
    expect(parseCampaignCookie("|123|running")).toBeNull();
  });

  it("round-trips", () => {
    const record = { jobId: "job_9", startedAt: 42, state: "paused" as const };
    expect(parseCampaignCookie(serialiseCampaign(record))).toEqual(record);
  });
});
