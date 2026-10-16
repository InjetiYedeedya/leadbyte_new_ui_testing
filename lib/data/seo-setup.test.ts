import { agentJobId } from "@/lib/data/agent-payload";
import {
  findSeoService,
  offPageSeoPayload,
  onPageSeoPayload,
  servicesFor,
  SEO_SERVICES,
} from "@/lib/data/seo-setup";

const CTX = {
  jobId: "job_1788534027056_6c9u4pt7e",
  email: "thilak@ntimes.ai",
  userId: "yNGTBxGSJZPkoCWZXDcAOce7oGH2",
  companyName: "ZippyGo",
  websiteUrl: "https://zippygo.ai/",
  businessType: "Travel & Tourism",
  specialization: "AI Powered Voice Based Flight Booking application",
  brandLogoUrl: "https://s3/logo.png",
};

describe("servicesFor", () => {
  it("offers all five bundles to a WordPress site", () => {
    expect(servicesFor(true)).toHaveLength(SEO_SERVICES.length);
  });

  it("drops the Blog Posting bundles when there is no WordPress to post to", () => {
    expect(servicesFor(false).every((s) => !s.hasBlog)).toBe(true);
  });
});

describe("onPageSeoPayload", () => {
  const CHOICE = {
    isWordPress: true,
    serviceId: "competitor-keyword-blog",
    wpUsername: "admin",
    wpPassword: "JNIE Y3T4 erSt gepf mUWR WfM5",
  };

  it("names the agent exactly as the captured body does — no hyphen", () => {
    // "On Page SEO Agent", not "On-Page SEO Agent". The backend switches on
    // the string.
    expect(onPageSeoPayload(CTX, CHOICE).agent_name).toBe("On Page SEO Agent");
    expect(onPageSeoPayload(CTX, CHOICE).agent_type).toBe("ON_PAGE_SEO");
    expect(onPageSeoPayload(CTX, CHOICE).agentType).toBe("on-page-seo");
  });

  it("sends the chosen services as newline-joined labels", () => {
    // Captured 2026-09-04: "Competitor Analysis\nKeyword Analysis\nBlog Posting".
    expect(onPageSeoPayload(CTX, CHOICE).services).toBe(
      "Competitor Analysis\nKeyword Analysis\nBlog Posting",
    );
  });

  it('sends servicesValue "all" for the full bundle', () => {
    expect(onPageSeoPayload(CTX, CHOICE).servicesValue).toBe("all");
  });

  it("sends the WordPress application password as blogApiKey", () => {
    // NOT `wp_password`. The captured body carries `blogApiKey` + `wpUsername`.
    const payload = onPageSeoPayload(CTX, CHOICE);
    expect(payload.blogApiKey).toBe("JNIE Y3T4 erSt gepf mUWR WfM5");
    expect(payload.wpUsername).toBe("admin");
    expect("wp_password" in payload).toBe(false);
  });

  it("sends no credentials at all for a non-WordPress site", () => {
    const payload = onPageSeoPayload(CTX, {
      isWordPress: false,
      serviceId: "keyword",
    });
    expect(payload.blogApiKey).toBe("");
    expect(payload.wpUsername).toBe("");
    expect(payload.isWordPress).toBe(false);
    expect(payload.requiresBlogPosting).toBe(false);
  });

  it("says blog posting is required only when the bundle includes it", () => {
    expect(onPageSeoPayload(CTX, CHOICE).requiresBlogPosting).toBe(true);
    expect(
      onPageSeoPayload(CTX, { isWordPress: true, serviceId: "keyword" }).requiresBlogPosting,
    ).toBe(false);
  });

  it("derives the bare domain from the website URL", () => {
    // The captured body carries `websiteUrl` AND a bare `domain`.
    expect(onPageSeoPayload(CTX, CHOICE).domain).toBe("zippygo.ai");
    expect(onPageSeoPayload({ ...CTX, websiteUrl: "novaflow.io" }, CHOICE).domain).toBe(
      "novaflow.io",
    );
    expect(onPageSeoPayload({ ...CTX, websiteUrl: "" }, CHOICE).domain).toBe("");
  });

  it("reports whether there is a website at all", () => {
    expect(onPageSeoPayload(CTX, CHOICE).hasWebsite).toBe(true);
    expect(onPageSeoPayload({ ...CTX, websiteUrl: "" }, CHOICE).hasWebsite).toBe(false);
  });

  it("carries the location fields the captured body has, blank when unknown", () => {
    // The popup does not ask for these yet; the keys are still sent, because a
    // missing key and a blank one are different messages to a workflow branch.
    const payload = onPageSeoPayload(CTX, CHOICE);
    expect(payload.city).toBe("");
    expect(payload.zipcode).toBe("");
    expect(payload.businessTypeOther).toBe("");
    expect(payload.apiSetupMethod).toBe("");
  });

  it("passes a city and postcode through when they are known", () => {
    const payload = onPageSeoPayload({ ...CTX, city: "new york", zipcode: "07088" }, CHOICE);
    expect(payload.city).toBe("new york");
    expect(payload.zipcode).toBe("07088");
  });
});

describe("offPageSeoPayload", () => {
  it("names the agent exactly as the captured body does — no hyphen", () => {
    const payload = offPageSeoPayload(CTX, { attachedDocument: "", documentName: "" });
    expect(payload.agent_name).toBe("Off Page SEO Agent");
    expect(payload.agent_type).toBe("OFF_PAGE_SEO");
    expect(payload.agentType).toBe("off-page-seo");
  });

  it("sends the document as documentUrl plus its filename", () => {
    // Captured 2026-09-04: `documentUrl` + `documentName`, not
    // `attached_document`.
    const payload = offPageSeoPayload(CTX, {
      attachedDocument: "https://s3/Doc.pdf",
      documentName: "Doc.pdf",
    });
    expect(payload.documentUrl).toBe("https://s3/Doc.pdf");
    expect(payload.documentName).toBe("Doc.pdf");
  });

  it('declares its one service, "Email Outreach"', () => {
    expect(offPageSeoPayload(CTX, { attachedDocument: "", documentName: "" }).services).toBe(
      "Email Outreach",
    );
  });

  it("sends the outreach mailbox, and never a password", () => {
    // Off-Page SEO DOES carry an outreach address — the captured body has the
    // account's own. The password stays empty: we do not hold one.
    const payload = offPageSeoPayload(
      { ...CTX, outreachEmail: "sales@zippygo.ai" },
      { attachedDocument: "", documentName: "" },
    );
    expect(payload.outreachEmail).toBe("sales@zippygo.ai");
    expect(payload.outreachPassword).toBe("");
  });

  it("falls back to the account email when no mailbox is connected", () => {
    const payload = offPageSeoPayload(CTX, { attachedDocument: "", documentName: "" });
    expect(payload.outreachEmail).toBe("thilak@ntimes.ai");
  });

  it("carries the brand logo and the report address", () => {
    const payload = offPageSeoPayload(CTX, { attachedDocument: "", documentName: "" });
    expect(payload.brandLogoUrl).toBe("https://s3/logo.png");
    expect(payload.reportEmail).toBe("thilak@ntimes.ai");
  });
});

describe("findSeoService", () => {
  it("returns nothing for an unknown id", () => {
    expect(findSeoService("nope")).toBeUndefined();
  });
});

describe("the payload matches the captured On-Page body field for field", () => {
  // Compared against two live n8n bodies (the target capture 2026-09-04 and
  // our own send 2026-09-07). Pinned as a set, so adding or dropping a key is
  // a failing test rather than something discovered in an n8n execution log.
  const EXPECTED_KEYS = [
    "agentType",
    "agent_name",
    "agent_type",
    "apiSetupMethod",
    "blogApiKey",
    "businessType",
    "businessTypeOther",
    "city",
    "companyName",
    "configured",
    "created_at",
    "domain",
    "email",
    "email_address",
    "hasWebsite",
    "isUpdate",
    "isWordPress",
    "job_id",
    "requiresBlogPosting",
    "services",
    "servicesValue",
    "status",
    "timestamp",
    "updated_at",
    "userId",
    "user_id",
    "websiteUrl",
    "wpUsername",
    "zipcode",
  ];

  it("sends exactly those 29 keys, no more and no fewer", () => {
    const payload = onPageSeoPayload(
      { ...CTX, city: "new york", zipcode: "07080" },
      { isWordPress: true, serviceId: "competitor", wpUsername: "admin", wpPassword: "12345" },
    );
    expect(Object.keys(payload).sort()).toEqual(EXPECTED_KEYS);
  });

  it("uses the backend's job id shape, not a UUID", () => {
    // `job_<epoch ms>_<random>`. A UUID is a different shape and cannot be
    // correlated with the workflow's own logs.
    const payload = onPageSeoPayload(
      { ...CTX, jobId: agentJobId(1788534027056) },
      { isWordPress: false, serviceId: "competitor" },
    );
    expect(payload.job_id).toMatch(/^job_1788534027056_[a-z0-9]{9}$/);
  });
});
