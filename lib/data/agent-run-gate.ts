import type { OAuthPlatform } from "@/lib/api/oauth-status";
import { UNLOCK_MESSAGE } from "@/lib/entitlements/messages";
import { EMAIL_GATE_MESSAGE } from "./agent-email-gate";
import { SOCIAL_GATE_MESSAGE } from "./agent-social-gate";

/**
 * What an agent needs before it may run, and in what order.
 *
 * The product owner's rule (2026-09-25), the same for every agent: when Run
 * is pressed, check first that the agent was BOUGHT, and only then that the
 * account it works through is CONNECTED. Purchase comes first on purpose — a
 * customer who has not bought an agent should be pointed at Pricing, not
 * asked to connect an account for something they cannot use.
 *
 * Before this table the rules lived in four modules and a dozen call sites,
 * and they had drifted: Google and Meta Ads never checked their ad account,
 * Off-Page SEO never checked its purchase (the check had been pasted into
 * On-Page's action instead), and On-Page demanded a mailbox it does not use.
 * This is now the one place that says which agent needs what.
 *
 * Pure: `agent-run-check.ts` reads the live facts and asks `firstUnmetStep`.
 */

export type AgentConnection = "googleAds" | "metaAds" | "linkedInAds" | "mailbox" | "social";

export interface AgentRunRule {
  /** Must be bought (or granted) first. */
  purchase: boolean;
  /** Then this must be connected. Null when nothing is needed. */
  connection: AgentConnection | null;
}

export const AGENT_RUN_RULES: Record<string, AgentRunRule> = {
  "google-ads": { purchase: true, connection: "googleAds" },
  "meta-ads": { purchase: true, connection: "metaAds" },
  "linkedin-ads": { purchase: true, connection: "linkedInAds" },
  // Its own OpenAI key is asked for on the page; the gate is the purchase.
  "openai-ads": { purchase: true, connection: null },
  "lead-qualification": { purchase: true, connection: "mailbox" },
  "off-page-seo": { purchase: true, connection: "mailbox" },
  // Publishes through WordPress credentials asked for in its own form, not
  // through a connected account — so nothing to connect first.
  "on-page-seo": { purchase: true, connection: null },
  aeo: { purchase: true, connection: null },
  // Any one of Facebook, Instagram or YouTube.
  "social-media": { purchase: true, connection: "social" },
};

/** An agent not in the table is not sold and needs nothing. */
export function runRuleFor(agentId: string): AgentRunRule {
  return AGENT_RUN_RULES[agentId] ?? { purchase: false, connection: null };
}

export function connectionFor(agentId: string): AgentConnection | null {
  return runRuleFor(agentId).connection;
}

export type RunStep = "purchase" | "connection" | "account";

/** The connections where one login owns several accounts and one must be picked. */
export function needsChosenAccount(connection: AgentConnection | null): boolean {
  return connection === "googleAds" || connection === "metaAds" || connection === "linkedInAds";
}

/**
 * The first thing standing between this account and a run, or null.
 *
 * Purchase, then connection, then — for the ad platforms — WHICH ad account.
 * The last step is new (2026-09-30): the backend found a chosen account saved
 * on 1 of 10 Google Ads connections and 2 of 14 Meta ones, and a workflow with
 * no account to build in creates nothing while the screen says "we are
 * creating your campaign". `accountChosen` defaults to true so callers that do
 * not know it never block on it.
 */
export function firstUnmetStep(
  agentId: string,
  facts: { purchased: boolean; connected: boolean; accountChosen?: boolean },
): RunStep | null {
  const rule = runRuleFor(agentId);
  if (rule.purchase && !facts.purchased) return "purchase";
  if (rule.connection !== null && !facts.connected) return "connection";
  if (needsChosenAccount(rule.connection) && facts.accountChosen === false) return "account";
  return null;
}

/** Which OAuth platform an ad connection is checked against. */
export const AD_CONNECTION_PLATFORM: Record<"googleAds" | "metaAds" | "linkedInAds", OAuthPlatform> = {
  googleAds: "googleAds",
  metaAds: "metaAds",
  linkedInAds: "linkedInAds",
};

const AD_ACCOUNT_NAME = {
  googleAds: "Google Ads",
  metaAds: "Meta Ads",
  linkedInAds: "LinkedIn Ads",
} as const;

export interface RunGateCopy {
  title: string;
  message: string;
  fixHref: string;
  fixLabel: string;
}

/**
 * What the customer is told, and where the fix is, for one unmet step.
 *
 * `fixHref` for Google and Meta Ads is our own `/api/ads/connect` Route
 * Handler, which adds the email and user id the consent start needs. It 302s
 * off-site, so it is rendered as a raw anchor. LinkedIn's is a page of ours.
 */
/** LinkedIn Ads' own connection page (`app/(app)/agents/[agentId]/connect`). */
export const LINKEDIN_CONNECT_PAGE = "/agents/linkedin-ads/connect";

/** The consent start that page's button uses — returns to the agent after. */
export const LINKEDIN_CONNECT_START = "/api/ads/connect?platform=linkedin-ads&from=agent";

export function runGateCopy(agentId: string, agentName: string, step: RunStep): RunGateCopy {
  if (step === "purchase") {
    return {
      title: `Unlock ${agentName}`,
      message: UNLOCK_MESSAGE,
      fixHref: "/pricing",
      fixLabel: "See plans",
    };
  }
  const connection = connectionFor(agentId);
  switch (connection) {
    case "googleAds":
    case "metaAds":
    case "linkedInAds": {
      const name = AD_ACCOUNT_NAME[connection];
      const slug = { googleAds: "google-ads", metaAds: "meta-ads", linkedInAds: "linkedin-ads" }[connection];
      const fixHref =
        connection === "linkedInAds"
          ? LINKEDIN_CONNECT_PAGE
          : `/api/ads/connect?platform=${slug}&from=agent`;
      if (step === "account") {
        // Connected, but no ad account picked. The list to pick from only
        // arrives with a fresh consent, so the fix is the same trip — it ends
        // on the picker and comes back here.
        return {
          title: `Choose your ${name} ad account`,
          message: `Your ${name} login is connected, but no ad account has been chosen, so there is nowhere to create the campaign. Connect again and pick the account to use.`,
          fixHref,
          fixLabel: "Choose ad account",
        };
      }
      return {
        title: `Connect your ${name} account`,
        message: `This agent creates the campaign inside your ${name} account, so it needs one connected first.`,
        // LinkedIn has its own connect page (product notes, 2026-09-30); the
        // other two start consent straight from the agent. `from=agent` brings
        // the picker back to the agent afterwards (`lib/data/ads-return.ts`).
        fixHref,
        fixLabel: `Connect ${name}`,
      };
    }
    case "mailbox":
      return {
        title: "Connect your email",
        message: EMAIL_GATE_MESSAGE,
        fixHref: "/intelligence/connections",
        fixLabel: "Connect email",
      };
    case "social":
      return {
        title: "Connect a social account",
        message: SOCIAL_GATE_MESSAGE,
        fixHref: "/intelligence/connections",
        fixLabel: "Manage connections",
      };
    default:
      return { title: "", message: "", fixHref: "", fixLabel: "" };
  }
}
