import { isRedirectError } from "@/lib/auth/session-expired";
import { getBusinessProfileRepo } from "@/lib/data/business-profile-repo";
import { isFilled } from "@/lib/data/profile-display";
import type { BusinessProfile } from "@/lib/data/types";

/**
 * Whether the business profile holds what an ad agent puts in front of the
 * platform, before the setup form asks for a campaign.
 *
 * The legacy Meta Ads page refused to open without company name, website,
 * business type, specialization and brand logo (META_ADS_AGENT_SPEC
 * MA-GRD-02..04): the campaign request carries them as `business_details`, and
 * a campaign built without them is built about nobody.
 *
 * ## Three of the spec's five, on purpose
 *
 * Specialization (`industry`) and the brand logo come only from the website
 * analysis — the Business profile page has no field for either. Requiring them
 * would lock someone out with no way to fix it, which is worse than sending a
 * blank. Only what the customer can actually supply is required.
 *
 * ## Unreadable is not missing
 *
 * The legacy page showed the "missing fields" list, every field in it, when
 * the profile READ failed. That sends someone to fill in a profile that is
 * complete. A failed read is its own state, with a retry.
 */

export type BusinessDetailsCheck =
  | { kind: "ok" }
  | { kind: "missing"; missing: string[] }
  | { kind: "unreadable" };

/** The required fields, in the order the profile page shows them. */
const REQUIRED: ReadonlyArray<readonly [label: string, read: (p: BusinessProfile) => string]> = [
  ["Business name", (p) => p.businessName],
  ["Website", (p) => p.websiteUrl],
  ["Business type", (p) => p.businessType],
];

/** The labels of whatever is unfilled. Pure, so it is tested. */
export function missingBusinessDetails(profile: BusinessProfile | null): string[] {
  return REQUIRED.filter(([, read]) => !profile || !isFilled(read(profile))).map(([label]) => label);
}

/** The read for the agent page and its action. Never throws except a redirect. */
export async function checkBusinessDetails(businessId: string): Promise<BusinessDetailsCheck> {
  let profile: BusinessProfile | null;
  try {
    profile = await getBusinessProfileRepo().get(businessId);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[business-details] the profile could not be read:", error);
    return { kind: "unreadable" };
  }
  const missing = missingBusinessDetails(profile);
  return missing.length === 0 ? { kind: "ok" } : { kind: "missing", missing };
}
