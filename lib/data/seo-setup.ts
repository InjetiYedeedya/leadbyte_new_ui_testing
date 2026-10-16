/**
 * On-Page and Off-Page SEO: the "Select your required services" catalogue and
 * the run payloads.
 *
 * Client-safe — a plain catalogue, no secrets. The popups import the service
 * list; the Server Actions import the payload builders.
 *
 * ## Running them (Option 1, 2026-09-04)
 *
 * Neither agent has a dedicated webhook yet, so both post to the generic
 * `/api/webhook/main` with their own `agent_type` (`ON_PAGE_SEO` /
 * `OFF_PAGE_SEO`), mirroring Lead Qualification.
 *
 * ## The field names come from live captures, not from a guess
 *
 * Both payloads were rewritten against real n8n request bodies (2026-09-04).
 * Four of the differences would each have failed silently:
 *
 * - **`agent_name` has no hyphen.** "On Page SEO Agent" / "Off Page SEO
 *   Agent". The workflow switches on the exact string.
 * - **The WordPress application password is `blogApiKey`**, beside
 *   `wpUsername` — not `wp_password`, and not snake_case.
 * - **Services travel as newline-joined LABELS** in `services`, with a
 *   separate `servicesValue`, rather than an id.
 * - **Off-Page's document is `documentUrl` + `documentName`**, not
 *   `attached_document`.
 */

import { agentEnvelope } from "@/lib/data/agent-payload";
import { absoluteUrl } from "@/lib/data/profile-display";

/**
 * The five service bundles from the design. `hasBlog` marks the two that
 * include Blog Posting — those are offered ONLY when the site is WordPress,
 * because blog posting is a WordPress-only capability.
 */
export interface SeoService {
  id: string;
  label: string;
  hasBlog: boolean;
}

export const SEO_SERVICES: SeoService[] = [
  { id: "competitor", label: "Competitor Analysis", hasBlog: false },
  { id: "keyword", label: "Keyword Analysis", hasBlog: false },
  { id: "competitor-keyword", label: "Competitor Analysis + Keyword Analysis", hasBlog: false },
  { id: "keyword-blog", label: "Keyword Analysis + Blog Posting", hasBlog: true },
  {
    id: "competitor-keyword-blog",
    label: "Competitor Analysis + Keyword Analysis + Blog Posting",
    hasBlog: true,
  },
];

/**
 * The services offered for a given WordPress answer.
 *
 * WordPress sites get all five; a non-WordPress site drops the two Blog Posting
 * bundles, because there is no blog to post to. The customer's WordPress answer
 * is kept either way (the payload carries it) — the backend uses it downstream.
 */
export function servicesFor(isWordPress: boolean): SeoService[] {
  return isWordPress ? SEO_SERVICES : SEO_SERVICES.filter((s) => !s.hasBlog);
}

export function findSeoService(id: string): SeoService | undefined {
  return SEO_SERVICES.find((s) => s.id === id);
}

/** Business fields both SEO agents copy from the profile. */
export interface SeoBusinessContext {
  jobId: string;
  email: string;
  userId?: string;
  companyName: string;
  websiteUrl: string;
  businessType: string;
  specialization: string;
  /** `profile.brand.logo`. Off-Page's captured body carries it. */
  brandLogoUrl?: string;
  /**
   * The mailbox Off-Page SEO sends outreach from.
   *
   * The captured body carries the account's own address here. When a mailbox
   * has been connected (see `email-callback.ts`) that is the honest value;
   * otherwise it falls back to the account email rather than going out blank.
   */
  outreachEmail?: string;
  /**
   * Local-SEO targeting, asked for on the On-Page popup and OPTIONAL.
   *
   * The API forwards both untouched (confirmed by reading the Lambda source),
   * so it is the n8n workflow that decides whether they matter — and for local
   * SEO they almost certainly do. Optional until that is confirmed: making a
   * field required on a guess blocks a customer who has no answer for it.
   */
  city?: string;
  zipcode?: string;
  isUpdate?: boolean;
  createdAt?: string;
}

/**
 * The bare hostname, which the captured On-Page body sends as `domain`
 * alongside the full `websiteUrl`.
 */
function domainOf(websiteUrl: string): string {
  const bare = websiteUrl.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return bare.replace(/^www\./i, "");
}

/**
 * What `servicesValue` should say.
 *
 * Only `"all"` is CONFIRMED — the capture pairs it with the three-service
 * bundle. The narrower bundles send their own id, which is an inference.
 *
 * CONFIRMED 2026-09-07 by reading the Lambda source: `leadbyte-api_v1` does
 * NOT interpret this field. It forwards `body.services` verbatim to the
 * auditor / n8n on one line and validates nothing. So the valid ids are the
 * n8n workflow's to define, not the API's, and nobody on the API side can
 * confirm them — which is exactly why we send the id AND the newline-joined
 * labels in `services`. A workflow that does not recognise the id still has
 * the labels to read. Do not drop one for the other until the n8n owner names
 * the ids.
 */
function servicesValueOf(serviceId: string): string {
  return serviceId === "competitor-keyword-blog" ? "all" : serviceId;
}

/** The service bundle as the workflow reads it: labels, one per line. */
function serviceLabels(serviceId: string): string {
  const service = findSeoService(serviceId);
  if (!service) return "";
  return service.label
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join("\n");
}

/**
 * The On-Page SEO run payload.
 *
 * A WordPress site carries the username and the APPLICATION PASSWORD the agent
 * publishes through — sent as `wpUsername` and `blogApiKey`, which is what the
 * live body calls them. A non-WordPress site sends both keys empty rather than
 * omitting them: a missing key and a blank one are different messages to a
 * workflow branch, and the capture always has them present.
 *
 * `city` and `zipcode` are asked for and optional. CONFIRMED 2026-09-07: the
 * API does not read them at all — they pass through to n8n untouched, where
 * they matter for LOCAL SEO (targeting a city or area). Blank almost certainly
 * produces weaker, location-less results, which is why the popup now asks;
 * they stay optional until the n8n owner confirms the workflow requires them.
 *
 * `businessTypeOther` and `apiSetupMethod` are still sent blank: they are in
 * the captured body, nothing in our UI produces them, and inventing a value
 * would be worse than an honest empty string.
 */
export function onPageSeoPayload(
  ctx: SeoBusinessContext,
  choice: {
    isWordPress: boolean;
    serviceId: string;
    wpUsername?: string;
    wpPassword?: string;
  },
): Record<string, unknown> {
  const service = findSeoService(choice.serviceId);

  return {
    ...agentEnvelope({
      jobId: ctx.jobId,
      email: ctx.email,
      userId: ctx.userId,
      agentName: "On Page SEO Agent",
      agentType: "ON_PAGE_SEO",
      agentSlug: "on-page-seo",
      isUpdate: ctx.isUpdate,
      createdAt: ctx.createdAt,
    }),
    companyName: ctx.companyName,
    // With its scheme: the profile keeps what Stage 01 accepted, which can be
    // a bare host, and the webhook refuses one ("Invalid website_url (must be
    // a full http(s) URL)", live 2026-09-30).
    websiteUrl: absoluteUrl(ctx.websiteUrl),
    domain: domainOf(ctx.websiteUrl),
    hasWebsite: ctx.websiteUrl.trim() !== "",
    businessType: ctx.businessType,
    businessTypeOther: "",
    city: ctx.city ?? "",
    zipcode: ctx.zipcode ?? "",

    services: serviceLabels(choice.serviceId),
    servicesValue: servicesValueOf(choice.serviceId),
    requiresBlogPosting: choice.isWordPress && service?.hasBlog === true,

    isWordPress: choice.isWordPress,
    wpUsername: choice.isWordPress ? (choice.wpUsername ?? "") : "",
    blogApiKey: choice.isWordPress ? (choice.wpPassword ?? "") : "",
    apiSetupMethod: "",
  };
}

/**
 * The Off-Page SEO run payload: an outreach mailbox and an optional document.
 *
 * `outreachPassword` is always empty. The captured body has it empty too, and
 * this app has never asked a customer for a mailbox password — the connected
 * Gmail authorisation is how sending is authorised.
 */
export function offPageSeoPayload(
  ctx: SeoBusinessContext,
  choice: { attachedDocument: string; documentName: string },
): Record<string, unknown> {
  return {
    ...agentEnvelope({
      jobId: ctx.jobId,
      email: ctx.email,
      userId: ctx.userId,
      agentName: "Off Page SEO Agent",
      agentType: "OFF_PAGE_SEO",
      agentSlug: "off-page-seo",
      isUpdate: ctx.isUpdate,
      createdAt: ctx.createdAt,
    }),
    companyName: ctx.companyName,
    websiteUrl: absoluteUrl(ctx.websiteUrl),
    businessType: ctx.businessType,
    businessTypeOther: "",
    specialization: ctx.specialization,
    brandLogoUrl: ctx.brandLogoUrl ?? "",
    reportEmail: ctx.email,

    services: "Email Outreach",
    outreachEmail: ctx.outreachEmail ?? ctx.email,
    outreachPassword: "",

    documentUrl: choice.attachedDocument,
    documentName: choice.documentName,
  };
}
