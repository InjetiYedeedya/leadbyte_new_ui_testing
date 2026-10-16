import { leadQualificationPayload, mapLeadActivity } from "@/lib/data/lead-qualification";
import { contentTypeOf } from "@/lib/data/uploads";

const RUN = {
  jobId: "job-1",
  email: "a@b.com",
  userId: "uid-1",
  emailTemplate: "Hi {{name}}",
  leadDatabaseUrl: "https://s3/leads.csv",
  attachedDocument: "",
  companyName: "ZippyGo",
  websiteUrl: "zippygo.ai",
  businessType: "Travel",
  specialization: "Voice booking",
  brandLogoUrl: "https://s3/logo.png",
  leadsVersion: 4,
};

describe("leadQualificationPayload", () => {
  it("uses the backend's own field names, mixed casing and all", () => {
    // `lead_database_url` next to `companyName` looks like a mistake and is
    // the contract. Making them consistent breaks them.
    const payload = leadQualificationPayload(RUN);

    expect(payload.lead_database_url).toBe("https://s3/leads.csv");
    expect(payload.companyName).toBe("ZippyGo");
    expect(payload.agent_type).toBe("LEAD_QUALIFICATION");
    expect(payload.agent_name).toBe("Lead Qualification Agent");
  });

  it("never sends an outreach password", () => {
    // The agent sends through its own transport; this app has never asked for
    // an email password and should not start.
    expect(payload_of({ ...RUN }).outreachPassword).toBe("");
    expect(payload_of({ ...RUN }).outreachEmail).toBe("");
  });

  it("carries the lead file and the document under every captured spelling", () => {
    // From the live body, 2026-08-27: the leads URL arrives as BOTH
    // `lead_database_url` and `leadDatabaseUrl`, and the document as
    // `companyDocUrl`, `attachedDocumentUrl` AND `attached_document`.
    const payload = leadQualificationPayload({
      ...RUN,
      attachedDocument: "https://s3/doc.pdf",
    });

    expect(payload.lead_database_url).toBe("https://s3/leads.csv");
    expect(payload.leadDatabaseUrl).toBe("https://s3/leads.csv");
    expect(payload.companyDocUrl).toBe("https://s3/doc.pdf");
    expect(payload.attachedDocumentUrl).toBe("https://s3/doc.pdf");
    expect(payload.attached_document).toBe("https://s3/doc.pdf");
  });

  it("sends the email template under both spellings", () => {
    const payload = leadQualificationPayload(RUN);
    expect(payload.email_template).toBe("Hi {{name}}");
    expect(payload.emailTemplate).toBe("Hi {{name}}");
  });

  it("says the leads file is present, and which version of it", () => {
    const payload = leadQualificationPayload(RUN);
    expect(payload.hasLeadDetails).toBe(true);
    expect(payload.leadsVersion).toBe(4);
    expect(payload.serviceVersion).toBe(0);
  });

  it("reports no lead details when no file was uploaded", () => {
    const payload = leadQualificationPayload({ ...RUN, leadDatabaseUrl: "" });
    expect(payload.hasLeadDetails).toBe(false);
  });

  it("carries the brand logo and the report address", () => {
    const payload = leadQualificationPayload(RUN);
    expect(payload.brandLogoUrl).toBe("https://s3/logo.png");
    expect(payload.reportEmail).toBe("a@b.com");
  });

  it('names the template mode: "custom" for a typed template, "business" otherwise', () => {
    // CONFIRMED against the Lambda source: it recognises business, custom,
    // instructions and document, and `custom` returns the customer's own
    // template rather than writing one. Sending "business" beside a template
    // they typed by hand asks the backend to replace it.
    expect(leadQualificationPayload(RUN).emailTemplateMode).toBe("custom");
    expect(leadQualificationPayload({ ...RUN, emailTemplate: "" }).emailTemplateMode).toBe(
      "business",
    );
    expect(leadQualificationPayload({ ...RUN, emailTemplate: "   " }).emailTemplateMode).toBe(
      "business",
    );
  });

  it("omits user_id rather than sending it blank", () => {
    // The activity table is keyed on it — a blank one writes rows the
    // dashboard can never find again.
    const payload = leadQualificationPayload({ ...RUN, userId: undefined });
    expect("user_id" in payload).toBe(false);
  });
});

function payload_of(run: typeof RUN): Record<string, unknown> {
  return leadQualificationPayload(run);
}

describe("mapLeadActivity", () => {
  it("reads the rows the dashboard shows, newest first", () => {
    const rows = mapLeadActivity({
      data: [
        { lead_email: "old@x.com", status: "sent", updated_at: "2026-09-01" },
        { lead_email: "new@x.com", status: "opened", updated_at: "2026-09-03" },
      ],
    });

    expect(rows.map((row) => row.leadEmail)).toEqual(["new@x.com", "old@x.com"]);
  });

  it("treats a missing failure flag as no failure", () => {
    // Absent means "nothing went wrong", not "unknown" — otherwise the
    // dashboard flags every row it reads.
    expect(mapLeadActivity([{ lead_email: "a@x.com" }])[0]!.failed).toBe(false);
    expect(mapLeadActivity([{ lead_email: "a@x.com", failed_mail: true }])[0]!.failed).toBe(true);
    expect(mapLeadActivity([{ lead_email: "a@x.com", failed_mail: "true" }])[0]!.failed).toBe(true);
  });

  it("drops rows with no lead address, which nothing can be said about", () => {
    expect(mapLeadActivity([{ status: "sent" }])).toEqual([]);
  });

  it("survives an unreadable payload rather than throwing", () => {
    expect(mapLeadActivity(null)).toEqual([]);
    expect(mapLeadActivity({ success: false })).toEqual([]);
  });
});

describe("contentTypeOf", () => {
  it("uses the browser's type when it gives one", () => {
    expect(contentTypeOf(new File([""], "leads.csv", { type: "text/csv" }))).toBe("text/csv");
  });

  it("falls back to the extension, because Windows often reports none", () => {
    // Signing for "" gets a 403 at PUT time that says nothing about the cause.
    expect(contentTypeOf(new File([""], "leads.xlsx"))).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(contentTypeOf(new File([""], "doc.pdf"))).toBe("application/pdf");
  });

  it("has a last resort for anything unrecognised", () => {
    expect(contentTypeOf(new File([""], "notes.weird"))).toBe("application/octet-stream");
  });
});
