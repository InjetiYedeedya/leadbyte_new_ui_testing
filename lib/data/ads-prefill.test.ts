import { adsPrefillFromRow } from "./ads-prefill";

/**
 * The row here is the real one, copied field for field from the DynamoDB
 * console on 2026-09-08 (`ads-website_details`, user `5wNBN2eC1bOQ…`).
 */
const ROW: Record<string, unknown> = {
  user_id: "5wNBN2eC1bOQbTWRGtKMHpoh4aY2",
  website_url: "https://leadbyte.ai",
  ad_schedule_days: [],
  ad_schedule_end: "23:59",
  ad_schedule_reason: "As a SaaS platform, LeadByte's services are relevant at any time.",
  ad_schedule_start: "00:00",
  ad_schedule_type: "all_day",
  app_id: "",
  app_store: "",
  app_url: "",
  audience_age_ranges: [],
  audience_gender: "All",
  audience_interests: [],
  business_name: "LeadByte",
  business_type: "SaaS",
  email: "",
  greeting_message: "Hi there! Welcome to LeadByte.",
  input_url: "https://leadbyte.ai",
  offer: "",
  phone_number: "+1 914 473 1849",
  privacy_policy_url: "https://leadbyte.ai/privacy-policy",
  product_description: "LeadByte offers AI-powered automation solutions.",
  render_engine: "cloakbrowser",
  scrape_notes: [],
  targeting_people: "Target business owners and decision-makers.",
  updated_at: "2026-09-08T05:55:22.960154+00:00",
};

describe("adsPrefillFromRow", () => {
  it("fills the business name", () => {
    expect(adsPrefillFromRow(ROW).businessName).toBe("LeadByte");
  });

  it("answers 'what, and to whom' from both fields", () => {
    expect(adsPrefillFromRow(ROW).service).toBe(
      "LeadByte offers AI-powered automation solutions.\n\n" +
        "Target business owners and decision-makers.",
    );
  });

  it("keeps whichever half of that is present", () => {
    expect(adsPrefillFromRow({ product_description: "Only this" }).service).toBe("Only this");
    expect(adsPrefillFromRow({ targeting_people: "Only them" }).service).toBe("Only them");
  });

  it("matches the row's 'All' to the radio's 'all'", () => {
    // The row says "All", the option is "all". A defaultChecked that never
    // matches fails silently, which is the bug this test exists for.
    expect(adsPrefillFromRow(ROW).gender).toBe("all");
  });

  it("does not invent a gender the form has no option for", () => {
    expect(adsPrefillFromRow({ audience_gender: "nonbinary" }).gender).toBeUndefined();
  });

  it("leaves empty lists alone rather than sending empty selections", () => {
    const prefill = adsPrefillFromRow(ROW);
    expect(prefill.ages).toBeUndefined();
    expect(prefill.interests).toBeUndefined();
  });

  it("reads age ranges, and lets 'All' win over a band", () => {
    // The form's own rule: both would ask the backend to target everyone AND
    // 25-34 at once.
    expect(adsPrefillFromRow({ audience_age_ranges: ["25-34", "35-44"] }).ages).toEqual([
      "25-34",
      "35-44",
    ]);
    expect(adsPrefillFromRow({ audience_age_ranges: ["All", "25-34"] }).ages).toEqual(["All"]);
  });

  it("accepts a comma-joined list as well as an array", () => {
    // DynamoDB lists arrive as arrays; a string is what a hand-written row or
    // a flattened export looks like.
    expect(adsPrefillFromRow({ audience_age_ranges: "25-34, 35-44" }).ages).toEqual([
      "25-34",
      "35-44",
    ]);
  });

  it("puts an unknown interest in the Other box instead of dropping it", () => {
    const prefill = adsPrefillFromRow({
      audience_interests: ["Technology", "restaurant owners"],
    });
    expect(prefill.interests).toEqual(["Technology", "Other"]);
    expect(prefill.customInterest).toBe("restaurant owners");
  });

  it("ignores the schedule, which was explicitly not wanted", () => {
    const prefill = adsPrefillFromRow(ROW) as Record<string, unknown>;
    for (const key of ["days", "scheduleStart", "scheduleEnd", "adScheduleType"]) {
      expect(prefill[key]).toBeUndefined();
    }
  });

  it("ignores plumbing and fields with no input to fill", () => {
    const prefill = adsPrefillFromRow(ROW);
    const values = JSON.stringify(prefill);
    for (const leak of [
      "cloakbrowser",
      "privacy-policy",
      "+1 914 473 1849",
      "Welcome to LeadByte",
      "5wNBN2eC1bOQ",
      "2026-09-08",
    ]) {
      expect(values).not.toContain(leak);
    }
  });

  it("returns nothing at all for a missing row", () => {
    expect(adsPrefillFromRow(null)).toEqual({});
  });
});
