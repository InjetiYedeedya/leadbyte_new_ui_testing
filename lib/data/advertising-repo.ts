import { devGlobal } from "@/lib/dev-global";
import { formatMoney } from "@/lib/format";
import { isBackendConfigured } from "@/lib/api/config";
import { readTables } from "@/lib/api/read-cascade";
import { checkOAuthStatus } from "@/lib/api/oauth-status";
import { aggregate, toCampaignRow, type AdCampaignRow } from "./ads-insights";
import type { AdvertisingData } from "./types";

export interface AdvertisingRepo {
  get(businessId: string): Promise<AdvertisingData | null>;
  connectLinkedIn(businessId: string): Promise<void>;
}

const SEED: Record<string, AdvertisingData> = {
  novaflow: {
    businessId: "novaflow",
    platforms: [
      {
        platform: "google",
        label: "Google Ads",
        connected: true,
        detail: "Account 774-201-9930 · 4 active campaigns · ₹2.4L spend / 30d",
      },
      {
        platform: "meta",
        label: "Meta Ads",
        connected: true,
        detail: "Business acct NovaFlow India · 2 active campaigns · ₹78k / 30d",
      },
      {
        platform: "linkedin",
        label: "LinkedIn Ads",
        connected: false,
        detail: "Your ICP is B2B SaaS decision makers — this is the channel we're most missing.",
      },
    ],
    spend: "₹3.2L",
    impressions: "1.84M",
    clicks: "22,410",
    ctr: "1.22%",
    cpc: "₹14.3",
    conversions: 99,
    cpa: "3,240",
    targetCpa: 2600,
    roas: "2.1x",
  },
};

// LinkedIn connection state is mutable per business, layered over the
// static seed above — mirrors the pattern already used in
// connections-repo.ts for Google Analytics.
const linkedinConnected = devGlobal<Record<string, boolean>>("advertising_linkedin", () => ({}));

class MockAdvertisingRepo implements AdvertisingRepo {
  async get(businessId: string): Promise<AdvertisingData | null> {
    const data = SEED[businessId];
    if (!data) return null;
    if (!linkedinConnected[businessId]) return data;
    return {
      ...data,
      platforms: data.platforms.map((p) =>
        p.platform === "linkedin"
          ? { ...p, connected: true, detail: "Account connected · syncing campaigns" }
          : p,
      ),
    };
  }

  async connectLinkedIn(businessId: string): Promise<void> {
    linkedinConnected[businessId] = true;
  }
}

/**
 * The lifetime-totals tables, one row per campaign, as the bundle names them.
 *
 * These used to be read one at a time through `/api/query/{opaque alias}/
 * {email}` — this app naming production tables and passing the key it wanted
 * rows for. `/api/connected-data/all` returns them keyed off the JWT instead,
 * so the aliases and the email are both the backend's business now.
 *
 * `google_ads_daily` and `meta_ads_daily` arrive in the same bundle and nothing
 * reads them yet; they are what a spend-over-time chart would use.
 */
const FULL_INSIGHTS = {
  google: "google_ads_full_insights",
  meta: "meta_ads_full_insights",
} as const;

/** Formats a money amount without asserting a currency we do not know. */
// `formatMoney` handles the null and the sub-unit cases — see `lib/format.ts`.
const money = formatMoney;

function count(value: number): string {
  return value.toLocaleString("en-IN");
}

class HttpAdvertisingRepo implements AdvertisingRepo {
  async get(businessId: string): Promise<AdvertisingData | null> {
    // Connection status first. There is no point reading campaign tables for a
    // platform the user has never connected — that was three wasted round
    // trips per page load for the common case of nothing connected.
    //
    // The two campaign tables are read in the SAME round as the three
    // checks, not after them: they do not depend on them.
    //
    // Only those two, by email (the account's businessId), NOT the whole
    // `/api/connected-data/all` bundle. That bundle is every connected table
    // with no date limit, and pulling it on /overview — where people land
    // after signing in — to use two tables of it helped push requests past
    // Cloudflare's Worker limits ("Error 1102", 2026-10-05). By email only:
    // the uid route returns ONE record, which would show one campaign.
    const [googleOAuth, metaOAuth, linkedInOAuth, sources] = await Promise.all([
      checkOAuthStatus("googleAds", businessId),
      checkOAuthStatus("metaAds", businessId),
      checkOAuthStatus("linkedInAds", businessId),
      readTables([FULL_INSIGHTS.google, FULL_INSIGHTS.meta], { email: businessId }),
    ]);

    const connectedAny =
      googleOAuth.status === "valid" ||
      metaOAuth.status === "valid" ||
      linkedInOAuth.status === "valid";


    // Both platforms' rows are read whatever the status says; the status
    // decides only what the cards SAY.
    const google = (sources[FULL_INSIGHTS.google]?.rows ?? []).map(toCampaignRow);
    const meta = (sources[FULL_INSIGHTS.meta]?.rows ?? []).map(toCampaignRow);

    // A business with nothing connected and no rows gets a genuine empty state
    // rather than a dashboard of zeroes that reads as real, terrible
    // performance. Rows win over status: if campaign data is actually there,
    // a status check that failed or lagged must not hide it.
    if (!connectedAny && google.length === 0 && meta.length === 0) {
      return null;
    }

    const totals = aggregate([...google, ...meta]);

    // Connected by the check, or by the data itself — unless the check says
    // the token has expired, which is a real answer the rows cannot overrule.
    const isLinked = (status: string, campaigns: number) =>
      status === "valid" || (campaigns > 0 && status !== "expired");

    const describe = (
      status: string,
      campaigns: number,
      notConnectedCopy: string,
    ): string => {
      if (status === "expired") return "Connection expired — reconnect to resume syncing.";
      // Rows win over a check that failed or lagged: campaigns that are here
      // came from a connection. "Not connected." beside them was false
      // (audit, 2026-09-29).
      if (campaigns > 0) return `${campaigns} campaign${campaigns === 1 ? "" : "s"} syncing`;
      if (status === "error") return "Couldn't check this connection just now.";
      if (status !== "valid") return notConnectedCopy;
      return campaigns > 0
        ? `${campaigns} campaign${campaigns === 1 ? "" : "s"} syncing`
        : "Connected · no campaign data yet";
    };

    return {
      businessId,
      platforms: [
        {
          platform: "google",
          label: "Google Ads",
          connected: isLinked(googleOAuth.status, google.length),
          detail: describe(googleOAuth.status, google.length, "Not connected."),
        },
        {
          platform: "meta",
          label: "Meta Ads",
          connected: isLinked(metaOAuth.status, meta.length),
          detail: describe(metaOAuth.status, meta.length, "Not connected."),
        },
        {
          platform: "linkedin",
          label: "LinkedIn Ads",
          connected: linkedInOAuth.status === "valid",
          detail: describe(
            linkedInOAuth.status,
            0,
            "Your ICP is B2B decision makers — this is the channel we're most missing.",
          ),
        },
      ],
      spend: money(totals.spend),
      impressions: count(totals.impressions),
      clicks: count(totals.clicks),
      ctr: totals.ctr === null ? "—" : `${totals.ctr.toFixed(2)}%`,
      cpc: money(totals.cpc),
      conversions: totals.conversions,
      // NOT `?? 0`: no conversions means there is no cost per one, and a
      // printed `0` reads as "free". `formatMoney` says "—" instead.
      cpa: money(totals.cpa),
      // No backend field for a CPA target yet, and nothing to compare against
      // is not the same as a target of zero.
      targetCpa: null,
      roas: totals.roas === null ? "—" : `${totals.roas.toFixed(1)}x`,
    };
  }

  async connectLinkedIn(): Promise<void> {
    throw new Error("LinkedIn connect is not wired yet — it needs the OAuth redirect flow.");
  }
}

let instance: AdvertisingRepo | null = null;

export function getAdvertisingRepo(): AdvertisingRepo {
  if (!instance) {
    instance = isBackendConfigured() ? new HttpAdvertisingRepo() : new MockAdvertisingRepo();
  }
  return instance;
}
