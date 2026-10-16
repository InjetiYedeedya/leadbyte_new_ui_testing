import { missingBusinessDetails } from "@/lib/data/business-details-check";
import type { BusinessProfile } from "@/lib/data/types";

const COMPLETE: BusinessProfile = {
  businessId: "owner@example.com",
  businessName: "Smile Dental",
  businessType: "Healthcare",
  industry: "",
  websiteUrl: "smile.example",
  description: "",
  websiteAuditScore: 0,
  geoVisibilityScore: 0,
};

describe("missingBusinessDetails", () => {
  it("passes a profile with name, website and type", () => {
    expect(missingBusinessDetails(COMPLETE)).toEqual([]);
  });

  it("names every blank field, treating whitespace as blank", () => {
    expect(
      missingBusinessDetails({ ...COMPLETE, businessName: "  ", websiteUrl: "", businessType: "" }),
    ).toEqual(["Business name", "Website", "Business type"]);
  });

  it("does not require specialization or a logo, which the profile page cannot edit", () => {
    expect(missingBusinessDetails({ ...COMPLETE, industry: "", brand: undefined })).toEqual([]);
  });

  it("treats no profile at all as everything missing", () => {
    expect(missingBusinessDetails(null)).toEqual(["Business name", "Website", "Business type"]);
  });
});
