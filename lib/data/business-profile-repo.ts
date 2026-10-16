import { ApiError, apiGet, apiPut } from "@/lib/api/client";
import { rowsFrom } from "@/lib/api/read-cascade";
import { profileRowBelongsTo } from "@/lib/data/analysis-owner";
import { isBackendConfigured } from "@/lib/api/config";
import { isRedirectError } from "@/lib/auth/session-expired";
import { cache } from "react";
import { devGlobal } from "@/lib/dev-global";
import type { BrandDetails, BusinessProfile } from "./types";
import { fetchLatestAnalysis, mapBrandProfile } from "./website-analysis";
import { firstFilled } from "./profile-display";

export interface BusinessProfileRepo {
  get(businessId: string): Promise<BusinessProfile | null>;
  /**
   * Records the website the user entered on the Stage 01 screen.
   *
   * `userId` is the Firebase uid. Passed in rather than read from the session
   * because the first call happens immediately after `setSession()`, and
   * relying on a same-request cookie read-after-write is a trap.
   */
  saveWebsiteUrl(businessId: string, websiteUrl: string, userId?: string): Promise<void>;
  /**
   * Corrects what the crawler understood — name, type, description.
   *
   * Separate from `saveWebsiteUrl` because the URL is the thing a NEW analysis
   * is keyed on, while these three are the thing an analysis PRODUCES. Writing
   * them through one method would make "fix my description" and "analyse a
   * different site" the same call.
   */
  saveProfileDetails(businessId: string, fields: Record<string, string>): Promise<void>;
  /**
   * Corrections to the brand block, stored as an OVERRIDE.
   *
   * `brand` is read off `/api/website-analyze` and the details table has no
   * equivalent columns, so writing a corrected colour there the way the
   * description is written would save successfully and change nothing on
   * screen. This writes one JSON field the read path merges over the crawl —
   * see `profile-sections.ts`.
   */
  saveBrandDetails(businessId: string, brand: BrandDetails): Promise<void>;
}

const SEED: Record<string, BusinessProfile> = {
  novaflow: {
    businessId: "novaflow",
    businessName: "NovaFlow",
    businessType: "B2B SaaS",
    industry: "Marketing Technology",
    websiteUrl: "novaflow.io",
    description:
      "NovaFlow is an AI marketing automation platform for growing B2B software companies. It combines SEO automation, paid-media management and lead qualification in one workspace, aimed at teams of two to ten marketers.",
    websiteAuditScore: 72,
    geoVisibilityScore: 61,
  },
};

/**
 * URLs captured at runtime in mock mode.
 *
 * Held in devGlobal, not a module-level object: Next dev can compile this
 * module into more than one bundle, so a plain `const` is not guaranteed to be
 * the same object across two Server Actions in different routes.
 */
const mockProfiles = devGlobal<Record<string, BusinessProfile>>("profiles", () => ({}));

class MockBusinessProfileRepo implements BusinessProfileRepo {
  async get(businessId: string): Promise<BusinessProfile | null> {
    return mockProfiles[businessId] ?? SEED[businessId] ?? null;
  }

  async saveProfileDetails(businessId: string, fields: Record<string, string>): Promise<void> {
    const existing = mockProfiles[businessId] ?? SEED[businessId];
    if (!existing) return;
    // `companyName` is the ROW's spelling; the profile object calls it
    // `businessName`. The payload builder speaks the row's language, so the
    // mock has to translate back or an edit would appear to save and change
    // nothing.
    mockProfiles[businessId] = {
      ...existing,
      businessName: fields.companyName ?? existing.businessName,
      businessType: fields.businessType ?? existing.businessType,
      description: fields.description ?? existing.description,
    };
  }

  async saveBrandDetails(businessId: string, brand: BrandDetails): Promise<void> {
    const existing = mockProfiles[businessId] ?? SEED[businessId];
    if (!existing) return;
    mockProfiles[businessId] = { ...existing, brand };
  }

  async saveWebsiteUrl(businessId: string, websiteUrl: string, userId?: string): Promise<void> {
    // `userId` is deliberately ignored: mock mode has no Firebase account, and
    // BusinessProfile does not model it.
    const existing = mockProfiles[businessId] ?? SEED[businessId];
    mockProfiles[businessId] = {
      businessId,
      businessName: existing?.businessName ?? "",
      businessType: existing?.businessType ?? "",
      industry: existing?.industry ?? "",
      description: existing?.description ?? "",
      websiteAuditScore: existing?.websiteAuditScore ?? 0,
      geoVisibilityScore: existing?.geoVisibilityScore ?? 0,
      websiteUrl,
    };
  }
}

/**
 * Opaque alias for `Leadbyte_User_Overall_Details`.
 *
 * The backend resolves aliases → real DynamoDB table names server-side so the
 * real names never appear in a URL. Confirmed from the Lambda's TABLE_ALIASES
 * map (`t36c087b3a`).
 */
const OVERALL_DETAILS_TABLE = "t36c087b3a";

/**
 * Maps a `Leadbyte_User_Overall_Details` record onto our BusinessProfile.
 *
 * CONFIRMED field names (2026-08-27), from the previous app's
 * `fetchBusinessDetails` and its agent payloads: `companyName`, `websiteUrl`,
 * `businessType`, `businessTypeOther`, `specialization`, `brandLogoUrl`,
 * `reportEmail`. Earlier snake_case guesses were wrong and are gone.
 *
 * `description`, `websiteAuditScore` and `geoVisibilityScore` are NOT in this
 * table. The audit and GEO scores come from `/api/website-analyze`; until that
 * is wired they stay 0 rather than being invented.
 */
/**
 * The customer's corrections to the brand block, laid over the crawl.
 *
 * Undefined keys are dropped rather than overwriting, so a section nobody has
 * edited keeps coming from the analysis. A malformed blob is ignored, not
 * thrown: a bad row must not take the profile screen down with it.
 */
function parseBrandOverrides(value: unknown): BrandDetails | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as BrandDetails) : undefined;
  } catch {
    console.error("[business-profile] brandOverrides is not valid JSON; ignoring it");
    return undefined;
  }
}

function mergeBrandOverrides(
  extracted: BrandDetails | undefined,
  override: BrandDetails | undefined,
): BrandDetails | undefined {
  if (!override) return extracted;
  const defined = Object.fromEntries(
    Object.entries(override).filter(([, v]) => v !== undefined),
  ) as BrandDetails;
  return { ...(extracted ?? {}), ...defined };
}

function mapProfile(businessId: string, record: Record<string, unknown>): BusinessProfile {
  // The first filled spelling. The app writes camelCase, but rows written by
  // the legacy app or a workflow use snake_case, and those read as a blank
  // profile — "No website details yet" over details that were there
  // (audit, 2026-09-29).
  const str = (...keys: string[]): string => {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim() !== "") return value;
    }
    return "";
  };

  const businessType = str("businessType", "business_type");
  const other = str("businessTypeOther", "business_type_other");

  return {
    businessId,
    businessName: str("companyName", "company_name", "businessName", "business_name"),
    businessType: businessType === "Other" && other ? other : businessType,
    industry: str("specialization", "industry"),
    websiteUrl: str("websiteUrl", "website_url", "website"),
    description: str("description", "business_description"),
    websiteAuditScore: 0,
    geoVisibilityScore: 0,
    brand: parseBrandOverrides(record["brandOverrides"]),
  };
}

/**
 * Memoised per render: the root page and `computeStageInputs()` (via
 * PageShell) both read the profile on the same request.
 */
const fetchProfile = cache(async function fetchProfile(
  businessId: string,
): Promise<BusinessProfile | null> {
    // This table is keyed by EMAIL, not by user id — the Lambda's
    // getPartitionKeyName() defaults to 'email' for it. `businessId` carries
    // the account email in live mode for exactly this reason.
    //
    // We deliberately do NOT use /api/data-by-uid/... here: that route maps a
    // userId to an email through a separate lookup table, and returns
    // 404 "Could not resolve userId to email" for any account missing a row in
    // it — which is how this first broke.
    const path = `/api/data/${OVERALL_DETAILS_TABLE}/${encodeURIComponent(businessId)}`;
    let payload: { data?: unknown } | null;
    try {
      // One retry for a failure that is not an answer. A failed read and "no
      // profile" both came back as null, so one Lambda cold start sent a set-up
      // customer back to Stage 01 from `/`, and Run analysis told them to "add
      // your website first" (audit, 2026-09-29). A read is safe to repeat.
      payload = await apiGet<{ data?: unknown }>(path).catch((first: unknown) => {
        if (isRedirectError(first)) throw first;
        if (first instanceof ApiError && first.status === 404) throw first;
        console.warn(`[business-profile] fetch failed for ${businessId}, retrying once:`, first);
        return apiGet<{ data?: unknown }>(path);
      });
    } catch (error) {
      // Except a dead session, which is not a profile we cannot fetch — it is
      // a customer who is no longer signed in, and belongs at the login page.
      if (isRedirectError(error)) throw error;
      if (error instanceof ApiError && error.status === 404) return null;
      // A profile we cannot fetch must not take the whole dashboard down with
      // it. Log loudly, render an empty state.
      console.error(`[business-profile] fetch failed for ${businessId}:`, error);
      return null;
    }

  // Any envelope: `data`, `Item`, `data.Item` or a list of one.
  const item = rowsFrom<Record<string, unknown>>(payload)[0];
  if (!item) return null;
  // Never show one account another's business (2026-10-16, `analysis-owner.ts`).
  if (!profileRowBelongsTo(item, businessId)) {
    console.error(
      `[business-profile] the row read for ${businessId} belongs to ${String(item.email)} — refused. ` +
        "This is a backend fault.",
    );
    return null;
  }
  return mapProfile(businessId, item);
});

class HttpBusinessProfileRepo implements BusinessProfileRepo {
  /**
   * Two sources, merged.
   *
   * `Leadbyte_User_Overall_Details` is what the customer has typed (and what
   * the legacy app writes), so it wins. `/api/website-analyze` supplies what
   * was extracted from the site, and fills the gaps.
   *
   * Reading only the stored row — which is what this did originally — meant a
   * brand-new account whose analysis had completed still showed "No website
   * details yet", because the analysis does not write that table.
   *
   * `firstFilled` rather than `??`: `mapProfile` coerces missing fields to ""
   * and `??` does not catch an empty string. See profile-display.ts.
   */
  async get(businessId: string): Promise<BusinessProfile | null> {
    const [stored, payload] = await Promise.all([
      fetchProfile(businessId),
      fetchLatestAnalysis(businessId),
    ]);

    const extracted = payload
      ? mapBrandProfile(businessId, payload.brand_profile, payload.seo)
      : null;

    if (!stored) return extracted;
    if (!extracted) return stored;

    return {
      businessId,
      businessName: firstFilled(stored.businessName, extracted.businessName) ?? "",
      businessType: firstFilled(stored.businessType, extracted.businessType) ?? "",
      industry: firstFilled(stored.industry, extracted.industry) ?? "",
      websiteUrl: firstFilled(stored.websiteUrl, extracted.websiteUrl) ?? "",
      description: firstFilled(stored.description, extracted.description) ?? "",
      websiteAuditScore: stored.websiteAuditScore,
      geoVisibilityScore: stored.geoVisibilityScore,
      // Brand identity comes from the analysis, with anything the customer has
      // corrected laid over the top. Partial on purpose: an untouched field
      // keeps coming from the crawl, so a later analysis still improves the
      // parts nobody has edited.
      brand: mergeBrandOverrides(extracted.brand, stored.brand),
    };
  }

  async saveProfileDetails(businessId: string, fields: Record<string, string>): Promise<void> {
    // Same rules as `saveWebsiteUrl` below, and the same reason: a partial
    // update, with the partition key ONLY in the URL. `fields` comes from
    // `profileEditPayload`, which speaks the row's spellings (`companyName`,
    // not `businessName`) and deliberately cannot produce an `email` key.
    await apiPut(`/api/data/${OVERALL_DETAILS_TABLE}/${encodeURIComponent(businessId)}`, fields);
  }

  async saveBrandDetails(businessId: string, brand: BrandDetails): Promise<void> {
    // One field, holding the whole corrected block as JSON. `email` is this
    // table's partition key and travels in the URL only — same rule as every
    // other write here.
    await apiPut(`/api/data/${OVERALL_DETAILS_TABLE}/${encodeURIComponent(businessId)}`, {
      brandOverrides: JSON.stringify(brand),
    });
  }

  async saveWebsiteUrl(businessId: string, websiteUrl: string, userId?: string): Promise<void> {
    // PUT /api/data/{table}/{keyValue} takes a partial record and updates only
    // the fields present, so this does not clobber the rest of the profile.
    //
    // The body carries ONLY the fields being changed. `email` is the partition
    // key of this table and already travels in the URL — sending it again in
    // the body asks DynamoDB to SET a key attribute, which it rejects with a
    // ValidationException. The older Lambda skipped the key explicitly
    // (`if (key === keyName) return`); leadbyte-api_v1 is a different codebase
    // and cannot be assumed to.
    //
    // `userId` is spelled camelCase to match what the legacy app writes to this
    // table (`userId: user.uid`). The backend's uid lookup tries
    // ['userId', 'user_id'] in that order, so rows from both apps resolve
    // identically. It is NOT this table's partition key (that is `email`), so
    // sending it in the body is safe.
    await apiPut(`/api/data/${OVERALL_DETAILS_TABLE}/${encodeURIComponent(businessId)}`, {
      websiteUrl,
      ...(userId ? { userId } : {}),
    });
  }
}

let instance: BusinessProfileRepo | null = null;

export function getBusinessProfileRepo(): BusinessProfileRepo {
  if (!instance) {
    instance = isBackendConfigured()
      ? new HttpBusinessProfileRepo()
      : new MockBusinessProfileRepo();
  }
  return instance;
}
