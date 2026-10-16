import { readCampaignReply } from "@/lib/data/campaign-reply";

describe("readCampaignReply", () => {
  it("reads the mail service's own job id from n8n's array reply", () => {
    const reply = readCampaignReply([
      { job_id: "mail_77", status: "queued", total: 50, sent: 0, pending: 50, failed: 0, created_at: "2026-10-14" },
    ]);
    expect(reply.jobId).toBe("mail_77");
    expect(reply.job).toMatchObject({ status: "queued", total: 50, pending: 50 });
    expect(reply.warnings).toEqual([]);
  });

  it("reads a bare object, a { data } wrapper and the camelCase spelling", () => {
    expect(readCampaignReply({ jobId: "a" }).jobId).toBe("a");
    expect(readCampaignReply({ success: true, data: { job_id: "b" } }).jobId).toBe("b");
    expect(readCampaignReply({ data: [{ job_id: "c" }] }).jobId).toBe("c");
  });

  it("never invents an id when the reply has none", () => {
    expect(readCampaignReply({ success: true }).jobId).toBeNull();
    expect(readCampaignReply(null).jobId).toBeNull();
    expect(readCampaignReply([]).jobId).toBeNull();
  });

  it("collects warnings from the reply and from its data, once each", () => {
    const reply = readCampaignReply({
      warnings: ["Lead list truncated to 500 rows.", 42],
      data: { job_id: "d", warnings: ["Lead list truncated to 500 rows.", { message: "3 addresses were invalid." }] },
    });
    expect(reply.warnings).toEqual(["Lead list truncated to 500 rows.", "3 addresses were invalid."]);
  });
});
