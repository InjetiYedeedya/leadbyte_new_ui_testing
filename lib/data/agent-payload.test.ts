import { agentEnvelope } from "@/lib/data/agent-payload";

describe("agentEnvelope", () => {
  const base = {
    jobId: "job_1787826787617_sj1xgray8",
    email: "gokulamfarmstay@gmail.com",
    userId: "Wxl8yj4q6ba1sIaipWoMOyIMR8z1",
    agentName: "Lead Qualification Agent",
    agentType: "LEAD_QUALIFICATION",
    agentSlug: "lead-qualification",
  };

  it("sends the identity under every spelling the captured bodies carry", () => {
    const envelope = agentEnvelope(base);

    // The same fact under four names. n8n branches read whichever key is in
    // front of them, so dropping the "duplicates" silently starves one.
    expect(envelope.email_address).toBe(base.email);
    expect(envelope.email).toBe(base.email);
    expect(envelope.user_id).toBe(base.userId);
    expect(envelope.userId).toBe(base.userId);
  });

  it("sends both agent discriminators", () => {
    const envelope = agentEnvelope(base);
    expect(envelope.agent_type).toBe("LEAD_QUALIFICATION");
    expect(envelope.agentType).toBe("lead-qualification");
    expect(envelope.agent_name).toBe("Lead Qualification Agent");
  });

  it("marks the row configured and active, as every captured body does", () => {
    const envelope = agentEnvelope(base);
    expect(envelope.configured).toBe(true);
    expect(envelope.status).toBe("active");
  });

  it("omits the uid keys entirely when there is no uid", () => {
    // The lead activity table is keyed on the uid; a blank one writes rows
    // nothing can read back.
    const envelope = agentEnvelope({ ...base, userId: undefined });
    expect("user_id" in envelope).toBe(false);
    expect("userId" in envelope).toBe(false);
  });

  it("stamps updated_at now, and created_at from the stored row when known", () => {
    const envelope = agentEnvelope({
      ...base,
      isUpdate: true,
      createdAt: "2026-08-17T13:16:09.123Z",
    });
    expect(envelope.created_at).toBe("2026-08-17T13:16:09.123Z");
    expect(envelope.isUpdate).toBe(true);
    expect(typeof envelope.updated_at).toBe("string");
    expect(envelope.updated_at).not.toBe(envelope.created_at);
  });

  it("treats a first configure as a creation, not an update", () => {
    const envelope = agentEnvelope(base);
    expect(envelope.isUpdate).toBe(false);
    expect(envelope.created_at).toBe(envelope.updated_at);
  });
});
