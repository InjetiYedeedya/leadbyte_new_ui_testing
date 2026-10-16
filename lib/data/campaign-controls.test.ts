import {
  mapLiveCampaigns,
  readCancelActiveResult,
  readControlResult,
  type CampaignAction,
} from "@/lib/data/campaign-controls";

describe("readControlResult", () => {
  const action: CampaignAction = "cancel";

  it("reports success from the backend's own message", () => {
    const result = readControlResult(action, {
      success: true,
      message: "Campaign cancel ok.",
      detail: "",
    });
    expect(result.ok).toBe(true);
    expect(result.message).toBe("Campaign cancel ok.");
  });

  it("explains an unknown job instead of quoting the raw detail", () => {
    // The live failure detail is a JSON string containing the tenant id and an
    // internal remediation note. Neither belongs on a customer's screen.
    const result = readControlResult(action, {
      success: false,
      message: "Campaign cancel failed.",
      detail: '{"error": "no job \'job_1\' for tenant \'uid_1\'", "remediation": "..."}',
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("no longer running");
    expect(result.message).not.toContain("tenant");
    expect(result.message).not.toContain("remediation");
  });

  it("keeps a failure message that is already readable", () => {
    const result = readControlResult(action, {
      success: false,
      message: "Campaign is already finished.",
      detail: "",
    });
    expect(result.message).toBe("Campaign is already finished.");
  });

  it("never reports success for an unreadable reply", () => {
    // A body we cannot parse is not a confirmation. Saying "paused" when we do
    // not know is the one answer that cannot be recovered from.
    expect(readControlResult(action, null).ok).toBe(false);
    expect(readControlResult(action, "ok").ok).toBe(false);
    expect(readControlResult(action, {}).ok).toBe(false);
  });

  it("names the action in its fallback message", () => {
    expect(readControlResult("pause", {}).message.toLowerCase()).toContain("pause");
    expect(readControlResult("resume", {}).message.toLowerCase()).toContain("resume");
  });
});

describe("mapLiveCampaigns", () => {
  it("maps the live list and keeps unknown counts as null", () => {
    const jobs = mapLiveCampaigns({
      count: 2,
      jobs: [
        { job_id: "j1", name: "Spring leads", status: "RUNNING", total: 40, sent: 12, pending: 28, failed: 0, created_at: "2026-10-14T09:00:00Z" },
        { job_id: "j2", status: "paused" },
      ],
    });
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ jobId: "j1", name: "Spring leads", status: "running", sent: 12, failed: 0 });
    expect(jobs[1]).toMatchObject({ jobId: "j2", name: null, status: "paused", total: null, sent: null });
  });

  it("drops a row with no job id, and reads nothing from an unreadable body", () => {
    expect(mapLiveCampaigns({ jobs: [{ name: "no id" }] })).toEqual([]);
    expect(mapLiveCampaigns(null)).toEqual([]);
    expect(mapLiveCampaigns({ success: false })).toEqual([]);
  });
});

describe("readCancelActiveResult", () => {
  it("treats nothing_to_cancel as success", () => {
    const result = readCancelActiveResult({ cancelled: [], cancelled_count: 0, nothing_to_cancel: true });
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/already finished/);
  });

  it("counts what was stopped", () => {
    expect(readCancelActiveResult({ cancelled: ["a", "b"], cancelled_count: 2 }).message).toBe("Stopped 2 campaigns.");
    expect(readCancelActiveResult({ cancelled: ["a"] }).message).toBe("Stopped 1 campaign.");
  });

  it("is a failure when the reply says nothing", () => {
    expect(readCancelActiveResult({}).ok).toBe(false);
    expect(readCancelActiveResult({ success: false, cancelled_count: 0 }).ok).toBe(false);
  });
});
