import { offPageSeoPayload, onPageSeoPayload } from "@/lib/data/seo-setup";
import { leadQualificationPayload } from "@/lib/data/lead-qualification";
import { templateRequest } from "@/lib/data/email-template";
import { businessDetailsOf } from "@/lib/data/ads-launch-payload";
import type { BusinessProfile } from "@/lib/data/types";

/**
 * Stage 01 accepts a bare host ("leadbyte.ai"), and the profile stores what was
 * typed. The agent webhooks refuse that — live on 2026-09-30, On-Page SEO
 * answered "Invalid website_url (must be a full http(s) URL)" — so every body
 * an agent sends carries the site with its scheme, built in the payload
 * module rather than trusted from each caller.
 */
const BARE = "leadbyte.ai";
const FULL = "https://leadbyte.ai";

const SEO_CTX = {
  jobId: "job-1",
  email: "a@leadbyte.ai",
  companyName: "LeadByte",
  websiteUrl: BARE,
  businessType: "SaaS",
  specialization: "Marketing agents",
};

describe("every agent body sends the website with its scheme", () => {
  it("On-Page SEO", () => {
    const body = onPageSeoPayload(SEO_CTX, { isWordPress: false, serviceId: "competitor" });
    expect(body.websiteUrl).toBe(FULL);
    expect(body.domain).toBe("leadbyte.ai");
  });

  it("Off-Page SEO", () => {
    const body = offPageSeoPayload(SEO_CTX, { attachedDocument: "", documentName: "" });
    expect(body.websiteUrl).toBe(FULL);
  });

  it("Lead Qualification", () => {
    const body = leadQualificationPayload({
      ...SEO_CTX,
      emailTemplate: "Hi {{name}}",
      leadDatabaseUrl: "https://files.example/leads.csv",
      attachedDocument: "",
    });
    expect(body.websiteUrl).toBe(FULL);
  });

  it("the outreach template writer", () => {
    const body = templateRequest("business", { ...SEO_CTX, websiteUrl: BARE }, {});
    expect(body.websiteUrl).toBe(FULL);
  });

  it("including the ad business details, now that n8n confirmed it adds no scheme itself", () => {
    // Was the one exception (bare host) until 2026-10-02; see businessDetailsOf.
    const profile = { businessName: "LeadByte", websiteUrl: BARE } as BusinessProfile;
    expect(businessDetailsOf(profile, "a@leadbyte.ai").websiteUrl).toBe(`https://${BARE}`);
  });

  it("leaves a full URL alone and a missing one empty", () => {
    const withPath = onPageSeoPayload(
      { ...SEO_CTX, websiteUrl: "http://leadbyte.ai/about" },
      { isWordPress: false, serviceId: "competitor" },
    );
    expect(withPath.websiteUrl).toBe("http://leadbyte.ai/about");
    const none = onPageSeoPayload({ ...SEO_CTX, websiteUrl: "" }, { isWordPress: false, serviceId: "competitor" });
    expect(none.websiteUrl).toBe("");
    expect(none.hasWebsite).toBe(false);
  });
});
