import {
  TEMPLATE_MODES,
  readGeneratedTemplate,
  readHtmlTemplate,
  templateRequest,
  type TemplateMode,
} from "@/lib/data/email-template";

const CONTEXT = {
  email: "nithin@ntimes.ai",
  websiteUrl: "https://ntimes.ai",
  companyName: "NTimes",
  businessType: "SaaS",
  specialization: "Dental clinics",
};

describe("TEMPLATE_MODES", () => {
  it("is exactly the three the backend accepts", () => {
    // business | instructions | document. This is the same enumeration
    // `emailTemplateMode` is drawn from — inventing a fourth is what sent
    // "custom" on every run.
    expect(TEMPLATE_MODES).toEqual(["business", "instructions", "document"]);
  });
});

describe("templateRequest", () => {
  it("sends the business context for the business mode", () => {
    const body = templateRequest("business", CONTEXT, {});
    expect(body.mode).toBe("business");
    expect(body.email).toBe("nithin@ntimes.ai");
    expect(body.companyName).toBe("NTimes");
    expect(body.specialization).toBe("Dental clinics");
    // Nothing to add: this mode writes from the profile alone.
    expect("instructions" in body).toBe(false);
  });

  it("carries the instructions when there are some", () => {
    const body = templateRequest("instructions", CONTEXT, {
      instructions: "A friendly cold email with a booking CTA.",
    });
    expect(body.instructions).toBe("A friendly cold email with a booking CTA.");
  });

  it("carries the source document url in document mode", () => {
    const body = templateRequest("document", CONTEXT, {
      sourceUrl: "https://s3/brief.pdf",
    });
    expect(body.emailTemplateSourceUrl).toBe("https://s3/brief.pdf");
  });
});

describe("readGeneratedTemplate", () => {
  it("reads the template the backend wrote", () => {
    expect(
      readGeneratedTemplate({
        success: true,
        template: "Subject: Brighten your smile\n\nHi {{name}}, ...",
        source: "instructions",
      }),
    ).toBe("Subject: Brighten your smile\n\nHi {{name}}, ...");
  });

  it("is null when the backend sent nothing usable", () => {
    // An empty template must not overwrite what the customer already typed.
    expect(readGeneratedTemplate({ success: true, template: "" })).toBeNull();
    expect(readGeneratedTemplate({ success: true, template: "   " })).toBeNull();
    expect(readGeneratedTemplate({ success: false })).toBeNull();
    expect(readGeneratedTemplate(null)).toBeNull();
    expect(readGeneratedTemplate("Subject: hi")).toBeNull();
  });
});

describe("readHtmlTemplate", () => {
  it("reads the html body", () => {
    expect(
      readHtmlTemplate({ success: true, html_template: "<html><body>hi</body></html>" }),
    ).toBe("<html><body>hi</body></html>");
  });

  it("is null for an empty or unreadable reply", () => {
    expect(readHtmlTemplate({ success: true, html_template: "" })).toBeNull();
    expect(readHtmlTemplate({})).toBeNull();
  });
});

describe("mode coverage", () => {
  it("builds a request for every declared mode", () => {
    for (const mode of TEMPLATE_MODES as readonly TemplateMode[]) {
      expect(templateRequest(mode, CONTEXT, {}).mode).toBe(mode);
    }
  });
});
