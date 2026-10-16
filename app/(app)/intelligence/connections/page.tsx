import { readSignedText } from "@/lib/signed-text";
import { BackLink } from "@/components/ui/back-link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { PageLoading } from "@/components/ui/page-loading";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import Link from "@/components/ui/app-link";
import { getConnectionsRepo } from "@/lib/data/connections-repo";
import {
  checkGoogleProduct,
  checkOAuthStatus,
  chosenAccountDetails,
  readConnectionDebug,
  readGoogleTargets,
  type OAuthPlatform,
} from "@/lib/api/oauth-status";
import { meterTally,
  GROUP_LABELS,
  PLATFORMS,
  connectUrl,
  googleFlowUrl,
  statusBadgeVariant,
  statusLabel,
  statusNote,
  type ConnectionGroup,
} from "@/lib/data/connections";
import { ConnectEmail } from "@/components/connections/connect-email";
import {
  ConnectionGroup as ConnectionGroupSection,
  ConnectionLogo,
  ConnectionMeter,
  ConnectionRow,
} from "@/components/connections/connection-list";
import { ChartBar, EnvelopeSimple, Megaphone, ShareNetwork } from "@phosphor-icons/react/ssr";
import { getConnectedMailbox } from "@/lib/data/email-callback";
import { mailboxLabel } from "@/components/agents/mailbox-note";
import { GITHUB_INSTALLATIONS_URL, readGithubConnection } from "@/lib/data/github-connection";
import { SOCIAL_PLATFORMS } from "@/lib/data/agent-social-gate";
import { getSocialOffer, isSocialDeclined } from "@/lib/data/social-accounts";
import { socialAccountName } from "@/lib/data/social-connections";
import { NO_DETAILS, type AccountDetails } from "@/lib/data/account-details";
import { redact } from "@/lib/data/redact";
import { getAdminRole } from "@/lib/admin/access";
import { ConsoleDump } from "@/components/connections/console-dump";
import { SocialAccountDialog } from "@/components/connections/social-account-dialog";
import { ConnectLink } from "@/components/ui/connect-link";
import { ADS_PLATFORMS, slugOf, type AdsPlatform } from "@/lib/data/ads-accounts";
import { FlashNotice } from "@/components/ui/flash-notice";

/** The address values the result banners are made from, wiped once shown. */
const RESULT_PARAMS = ["connected", "state", "declined", "disconnected", "error", "message", "email"] as const;
import {
  abandonSocialAccount,
  githubConnectedAction,
  disconnectGithubAction,
  disconnectWordpressAction,
  selectSocialAccount,
  skipConnections,
} from "./actions";
import { GithubRow } from "@/components/connections/github-row";
import { AGENT_FOR_CONNECTION, RunAgentLink } from "@/components/connections/run-agent-link";
import { WordpressRow } from "@/components/connections/wordpress-row";
import { readWordpressStatus } from "@/lib/data/wordpress-repo";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { disconnectAdsAccount } from "@/app/connections/ads/[platform]/select/actions";
import { PageContainer } from "@/components/ui/page-container";

export const metadata: Metadata = { title: "Connections · LeadByte" };

const GROUP_ORDER: ConnectionGroup[] = ["analytics", "advertising", "social", "email"];

/**
 * Presentation only — each category's line, icon and tint. The labels, the
 * rows in each and every status still come from `lib/data/connections.ts`.
 * Every panel is the same neutral frosted white (`NEUTRAL_PANEL`); the
 * category's colour lives only in its icon.
 */
// One neutral frosted white for every panel: the categories are told apart
// by their names and icons, not by a colour each.
const NEUTRAL_PANEL = "bg-surface/50";

const GROUP_LOOK: Record<ConnectionGroup, { description: string; icon: React.ReactNode; tone: string; iconTone: string }> = {
  analytics: {
    description: "Understand your website traffic, user behavior and conversions.",
    icon: <ChartBar size={22} weight="fill" />,
    tone: NEUTRAL_PANEL,
    iconTone: "bg-surface text-teal",
  },
  advertising: {
    description: "Measure campaign performance and drive more sales.",
    icon: <Megaphone size={22} weight="fill" />,
    tone: NEUTRAL_PANEL,
    iconTone: "bg-surface text-warn",
  },
  social: {
    description: "Track your content performance and audience engagement.",
    icon: <ShareNetwork size={22} weight="fill" />,
    tone: NEUTRAL_PANEL,
    iconTone: "bg-surface text-crit",
  },
  // Email & Publishing (2026-10-13): the mailbox campaigns go out from, and
  // the two places Blog Posting publishes to — one panel, three cards.
  email: {
    description:
      "Send campaigns from your mailbox, and let the Blog Posting and AEO agents publish to your site through GitHub or WordPress.",
    icon: <EnvelopeSimple size={22} weight="fill" />,
    tone: NEUTRAL_PANEL,
    iconTone: "bg-surface text-good",
  },
};

/** Each platform's own mark, from `public/logos/` (official assets). */
const PLATFORM_LOGO: Record<string, string> = {
  googleAnalytics: "/logos/google-analytics.svg",
  googleAds: "/logos/google-ads.svg",
  metaAds: "/logos/meta.svg",
  linkedInAds: "/logos/linkedin.svg",
  facebook: "/logos/facebook.svg",
  instagram: "/logos/instagram.svg",
  youtube: "/logos/youtube.svg",
};

/**
 * Which account a connected row is using: its name, then a quieter line of
 * what else identifies it (id, currency, business, the login). Every
 * connected row carries one, so they all read the same way. A connection made
 * before details were recorded says so rather than showing nothing — a blank
 * there reads as the details failing to load — and never invents any.
 */
/**
 * `account-details.ts` records the connected login — Google's email, Facebook's
 * user name — as a fact worded "Signed in as …". It is the one thing a customer
 * asks of a connected card ("connected as WHO?"), so it gets a line of its own
 * rather than the tail of a small grey list of IDs.
 */
const SIGNED_IN = "Signed in as ";

/** A labelled line, so "who" reads at a glance down a column of cards. */
/**
 * Where each platform's NAME leads (2026-10-13). Analytics accounts feed the
 * Performance page; an ad platform opens its own agent's dashboard; the three
 * social accounts share the Social Media agent's, the one dashboard that
 * reports on them. `?agent=` is the existing route that opens a dashboard
 * beside the agents list. GitHub and WordPress lead nowhere yet.
 */
const PLATFORM_HREF: Partial<Record<OAuthPlatform, string>> = {
  googleAnalytics: "/analytics",
  googleAds: "/agents?agent=google-ads",
  metaAds: "/agents?agent=meta-ads",
  linkedInAds: "/agents?agent=linkedin-ads",
  facebook: "/agents?agent=social-media",
  instagram: "/agents?agent=social-media",
  youtube: "/agents?agent=social-media",
};
const SEARCH_CONSOLE_HREF = "/analytics";
const EMAIL_HREF = "/agents?agent=lead-qualification";

function DetailLine({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <p className="truncate text-sm text-ink" title={title ?? value}>
      <span className="text-ink-soft">{label}: </span>
      <span className="font-medium">{value}</span>
    </p>
  );
}

function AccountDetailsLine({ details, label = "Account" }: { details: AccountDetails; label?: string }) {
  if (!details.name && !details.id) {
    return (
      <p className="mt-0.5 text-xs text-ink-soft">
        Account details not recorded. Reconnect and choose the account to see them here.
      </p>
    );
  }
  const login = details.facts.find((fact) => fact.startsWith(SIGNED_IN))?.slice(SIGNED_IN.length);
  const facts = [
    details.id && `ID ${details.id}`,
    ...details.facts.filter((fact) => !fact.startsWith(SIGNED_IN)),
  ].filter(Boolean);
  // Two lines at most — the card has a fixed height. The IDs and currency
  // ride on the first line's `title`, so they are a hover away, not gone.
  const name = details.name || details.id;
  return (
    <div className="mt-1 min-w-0 space-y-0.5">
      <DetailLine
        label={label}
        value={name}
        title={facts.length > 0 && details.name ? `${name} · ${facts.join(" · ")}` : name}
      />
      {login && <DetailLine label="Signed in as" value={login} />}
    </div>
  );
}

/**
 * The Connect / Reconnect control.
 *
 * Reconnecting is deliberately the quiet variant. On a screen whose job is to
 * show what is still missing, an account that is already done must not compete
 * with one that is not — eight accent-filled buttons is a page with no
 * priority in it.
 */
/**
 * Disconnect, for the three ad platforms — the SAME form the ad-account picker
 * (`/connections/ads/[platform]/select`) has always had: its Server Action,
 * its hidden `platform` field, its confirmation, and its redirect back here
 * with `?disconnected=`, which the notice above already reports. Only the ad
 * platforms have one; nothing in the app or the backend disconnects the
 * others, so their card offers Reconnect instead.
 */
function DisconnectAds({ platform, label }: { platform: AdsPlatform; label: string }) {
  return (
    <form action={disconnectAdsAccount}>
      <input type="hidden" name="platform" value={slugOf(platform)} />
      <ConfirmSubmit
        title={`Disconnect ${label}?`}
        body={`${label} will show as not connected, and its agent will stop until you connect again.`}
        confirmLabel="Disconnect"
        pendingLabel="Disconnecting…"
        className="inline-flex shrink-0 items-center rounded-md border border-crit/40 bg-surface px-3.5 py-1.5 text-sm font-medium text-crit transition-colors hover:bg-crit-soft"
      >
        Disconnect
      </ConfirmSubmit>
    </form>
  );
}

function ConnectButton({ href, connected }: { href: string; connected: boolean }) {
  return (
    // A plain link, never a Server Action: the OAuth flow is a 302 chain the
    // browser has to walk itself. `ConnectLink` keeps it one and adds the ring
    // — eight of these sit on this page and each was inert for the whole
    // round trip to n8n and then to the provider.
    <ConnectLink
      href={href}
      pendingLabel="Opening…"
      className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
        connected
          ? "border border-border text-ink hover:bg-surface-raised"
          : "bg-accent text-surface hover:bg-accent-ink"
      }`}
    >
      {connected ? "Reconnect" : "Connect"}
    </ConnectLink>
  );
}

async function ConnectionsPageBody({
  searchParams,
}: {
  searchParams: Promise<{
    connected?: string;
    choose?: string;
    declined?: string;
    disconnected?: string;
    email?: string;
    error?: string;
    message?: string;
    state?: string;
    debug?: string;
  }>;
}) {
  // `state` (done/pending) is no longer read: whether to announce a connection
  // is decided by the row itself. `emailResult` is what
  // `/connections/email/callback` reports.
  const {
    choose,
    connected,
    declined,
    disconnected,
    email: emailResult,
    error,
    message,
    debug,
  } = await searchParams;
  const businessId = await currentBusinessId();

  // `?debug=1` prints what the backend holds behind every row to the browser
  // console — ADMINS only, redacted. Anyone else adding the parameter gets
  // the ordinary page.
  const debugDump =
    debug === "1" && (await getAdminRole(businessId)) !== null
      ? redact({
          account: businessId,
          platforms: Object.fromEntries(
            await Promise.all(
              PLATFORMS.map(async (platform) => [platform.id, await readConnectionDebug(platform.id, businessId)] as const),
            ),
          ),
        })
      : null;

  const [state, statuses, mailboxRecord, github, wordpress] = await Promise.all([
    getConnectionsRepo().get(businessId),
    Promise.all(
      PLATFORMS.map(async (platform) => ({
        platform,
        // The Google row is two grants; this one reports Analytics alone
        // (`lib/data/google-products.ts`).
        result:
          platform.id === "googleAnalytics"
            ? await checkGoogleProduct("analytics", businessId)
            : await checkOAuthStatus(platform.id, businessId),
      })),
    ),
    getConnectedMailbox(),
    // A different service (AEO), so it runs beside the checks above rather
    // than after them. Never throws.
    readGithubConnection(businessId),
    // leadbyte-api_v1's own WordPress login check. Never throws.
    readWordpressStatus(),
  ]);

  // Same rule as every other row: a mailbox we cannot name is not shown as
  // connected.
  const mailbox = mailboxRecord && mailboxLabel(mailboxRecord) !== null ? mailboxRecord : null;

  // The named account per platform, for every connected row — not only the
  // social ones. "Connected" alone leaves the obvious question unanswered:
  // which of your ad accounts, which property, which page. Read below once the
  // rows are known, and only for a CONNECTED platform: a stale name beside
  // "Not connected" read as a contradiction (the Facebook report).
  const accountDetails: Partial<Record<OAuthPlatform, AccountDetails>> = {};
  // Which platforms still have a list waiting to be picked from. Drives both
  // the dialog and the row's "Choose account" link, so the two cannot disagree
  // about whether there is anything left to choose.
  const socialOffers: Partial<Record<OAuthPlatform, boolean>> = {};
  // And which were refused. `socialPlatformConnected` applies the same rule for
  // the agent's gate; this page cannot call it without re-running the status
  // checks it has already done, so it reads the same marker instead.
  const socialDeclined: Partial<Record<OAuthPlatform, boolean>> = {};
  for (const platform of SOCIAL_PLATFORMS) {
    socialOffers[platform] = (await getSocialOffer(platform)).length > 0;
    socialDeclined[platform] = await isSocialDeclined(platform);
  }

  // What the rows actually show. A refused platform reads Not connected
  // however the check table answers — that is the promise the confirmation
  // made, and the check table cannot be unwritten (see `social-accounts.ts`).
  //
  // A platform with a choice still outstanding is held here too, and for the
  // same reason the agent's gate holds it: Facebook returns every page a login
  // administers and the agent posts to one, so consent with the page unpicked
  // is a connection that cannot publish. It gets its own wording below rather
  // than a bare "Not connected", because "you have not connected Facebook" is
  // the wrong thing to tell someone who just did.
  const checked = statuses.map(({ platform, result }) =>
    socialDeclined[platform.id] || socialOffers[platform.id]
      ? { platform, result: { status: "not-connected", expiryDate: null } as const }
      : { platform, result },
  );

  // Google's names are the property and site the picker saved; the others
  // come from the account saved with the row (ads pickers and social
  // callbacks), or the backend's one-call status once it is live. Social
  // platforms also try this browser's cookie first (`socialAccountName`).
  const googleTargets = await readGoogleTargets(businessId);
  await Promise.all(
    checked.map(async ({ platform, result }) => {
      if (result.status !== "valid") return;
      const details = await chosenAccountDetails(platform.id, businessId);
      if (platform.id === "googleAnalytics") {
        // The Analytics row is about the PROPERTY; the site belongs to the
        // Search Console row below.
        accountDetails[platform.id] = {
          name: googleTargets.property,
          id: googleTargets.propertyId,
          facts: details.facts.filter((fact) => !fact.startsWith("Site: ")),
        };
        return;
      }
      if ((SOCIAL_PLATFORMS as readonly OAuthPlatform[]).includes(platform.id)) {
        // This browser's cookie can name a page the row does not.
        const name = (await socialAccountName(platform.id, businessId)) || details.name;
        accountDetails[platform.id] = { ...details, name };
        return;
      }
      accountDetails[platform.id] = details;
    }),
  );
  const searchConsoleDetails: AccountDetails = googleTargets.site
    ? { name: googleTargets.site, id: "", facts: [] }
    : NO_DETAILS;

  // One rule for the whole page (product owner, 2026-10-06): a row is
  // Connected only when we can say WHICH account it is. A "Done" check row
  // with no account behind it — written by a consent nobody finished choosing
  // from, or by an older flow — reads Not connected with a Connect button,
  // because a connection nobody can name is not one the customer can use or
  // check. The agents' own gates are unchanged; this is what the page shows.
  const named = (details: AccountDetails | undefined) => Boolean(details && (details.name || details.id));
  const rows = checked.map((row) =>
    row.result.status === "valid" && !named(accountDetails[row.platform.id])
      ? { ...row, result: { status: "not-connected", expiryDate: null } as const }
      : row,
  );

  // The dialog's own list. Read only when `?choose=` names a platform that
  // genuinely has an offer — a hand-typed or stale parameter opens nothing
  // rather than an empty picker.
  const choosePlatform = SOCIAL_PLATFORMS.find((id) => id === choose && socialOffers[id]);
  const chooseAccounts = choosePlatform ? await getSocialOffer(choosePlatform) : [];

  // Named only when the marker agrees, so a hand-typed `?declined=` cannot
  // announce something that did not happen.
  const declinedPlatform = PLATFORMS.find((p) => p.id === declined && socialDeclined[p.id]);
  const disconnectedPlatform = PLATFORMS.find(
    (p) => p.id in ADS_PLATFORMS && slugOf(p.id as AdsPlatform) === disconnected,
  );


  // The shared Google row, read once above — Search Console renders from it.
  // Search Console's own grant, from the same row (read once, memoised).
  const searchConsoleCheck = await checkGoogleProduct("search_console", businessId);
  // Same rule: Search Console is Connected only with a site on record.
  const googleStatus =
    searchConsoleCheck.status === "valid" && !named(searchConsoleDetails)
      ? ({ status: "not-connected", expiryDate: null } as const)
      : searchConsoleCheck;
  // Google is connected, but for Analytics only — said, so the Search Console
  // row reading "Not connected" beside a connected Analytics does not look
  // like a contradiction.
  const analyticsOnly =
    searchConsoleCheck.status === "not-connected" &&
    rows.find((s) => s.platform.id === "googleAnalytics")?.result.status === "valid";
  // Ads return our own slug (`google-ads`), the older flows return the platform
  // id (`googleAnalytics`). Both name the same rows.
  const justConnected = PLATFORMS.find(
    (p) =>
      !socialDeclined[p.id] &&
      !socialOffers[p.id] &&
      (p.id === connected || (p.id in ADS_PLATFORMS && slugOf(p.id as AdsPlatform) === connected)),
  );
  // "Saved, it can take a minute" is only true until the row lands. When this
  // render already reads the platform as connected, say that instead — the
  // pending note sat beside a CONNECTED badge otherwise.
  //
  // And only a row that reads connected is announced as connected. The banner
  // used to follow the address bar alone, so `?connected=metaAds` said "Meta
  // Ads connected." over a row reading Not connected.
  const stillPending = rows.find((s) => s.platform.id === justConnected?.id)?.result.status !== "valid";

  // Every card on the page, not just the seven platforms (`meterTally`).
  const meter = meterTally([
    ...rows.map((s) => s.result.status === "valid"),
    googleStatus.status === "valid",
    mailbox !== null,
    // Left out when not offered here, or when the check could not be made —
    // an unanswered check is not "not connected".
    github.kind === "unavailable" || github.kind === "unknown" ? null : github.kind === "connected",
    wordpress.kind === "unavailable" || wordpress.kind === "unknown" ? null : wordpress.kind === "connected",
  ]);

  return (
    <PageContainer fit="fill">
      {/* One child now, so no `justify-between` row around it.

          There was a "Click to next step" Google chooser on the right.
          It was added because the Google chooser lived only in the app-wide
          Search Console prompt, which hides itself once the shared Google row
          reads `valid` — so once Analytics connected there was no way left to
          authorise Search Console or redo either one. This page now carries a
          row for Analytics AND one for Search Console, each with its own
          Connect/Reconnect, so every path the chooser offered is on the page
          already, one click closer. The reason it existed is gone with it.

          The chooser itself is untouched and still used where it is still the
          way in: the GEO analysis "Next" button and the Search Console
          prompt. */}
      {/* Reached from Settings, Analytics and the agents, so Back returns to
          whichever it was; Settings when there is no history (2026-10-01). */}
      <BackLink fallbackHref="/settings" />
      {/* The heading on the left, the count on the right: the one thing anyone
          wants at a glance, level with the page's name rather than a row of
          its own under it. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Connections</h1>
        <p className="mt-0.5 max-w-prose text-sm text-ink-soft">
          {/* The count moved out of this sentence and into the meter below.
              Buried mid-paragraph it was the one thing on the page anyone
              wanted at a glance, and the hardest to find. */}
          We know how your website reads. Connecting your accounts tells us how it actually
          performs.
        </p>
      </div>
      <ConnectionMeter connected={meter.connected} total={meter.total} />
      </div>

      {debugDump !== null && (
        <ConsoleDump
          label="Connections: what the backend holds"
          data={{
            ...(debugDump as Record<string, unknown>),
            mailbox: redact(mailboxRecord),
            github: redact(github),
            shownOnPage: Object.fromEntries(
              rows.map((row) => [
                row.platform.id,
                { status: row.result.status, details: accountDetails[row.platform.id] ?? null },
              ]),
            ),
          }}
        />
      )}


      {justConnected && !stillPending && (
        <FlashNotice clear={RESULT_PARAMS} className="rounded-lg bg-good-soft px-4 py-3 text-sm text-good">
          <span className="font-medium">{justConnected.label} connected.</span> Data usually
          appears within a few minutes.
        </FlashNotice>
      )}

      {/* Saved, but the status row has not appeared yet. NOT a failure: the row
          is written downstream of the save, so an immediate check loses that
          race routinely. Saying "didn't complete" here would send someone back
          through consent for a connection that worked. */}
      {justConnected && stillPending && (
        <FlashNotice clear={RESULT_PARAMS} className="rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
          <span className="font-medium">{justConnected.label} account saved.</span> It can take a
          minute to show as connected. Nothing else to do.
        </FlashNotice>
      )}

      {/* The mailbox is named on its row below, so this only confirms. Gated on
          the cookie actually being there, so a hand-typed `?email=connected`
          announces nothing. */}
      {emailResult === "connected" && mailbox && (
        <FlashNotice clear={RESULT_PARAMS} className="rounded-lg bg-good-soft px-4 py-3 text-sm text-good">
          <span className="font-medium">Email account connected.</span> Campaigns will be sent from
          this mailbox.
        </FlashNotice>
      )}

      {/* Google lets people untick single permissions on its consent screen,
          and the backend refuses a Gmail token without both: one cannot send,
          the other cannot read replies. Says exactly what to do differently,
          which the generic line below does not. */}
      {emailResult === "missing-scope" && (
        <FlashNotice role="alert" clear={RESULT_PARAMS} className="rounded-lg bg-crit-soft px-4 py-3 text-sm text-crit">
          LeadByte needs both permissions: send email and read/organise email. Please connect again
          and allow all requested access.
        </FlashNotice>
      )}

      {emailResult === "failed" && (
        <FlashNotice role="alert" clear={RESULT_PARAMS} className="rounded-lg bg-crit-soft px-4 py-3 text-sm text-crit">
          Your email account didn&rsquo;t connect. Nothing was changed, so you can try again.
        </FlashNotice>
      )}

      {/* Named only for a platform we know, so a hand-typed value renders nothing. */}
      {disconnectedPlatform && (
        <FlashNotice clear={RESULT_PARAMS} className="rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
          <span className="font-medium">{disconnectedPlatform.label} disconnected.</span> Connect
          it again whenever you want to use it.
        </FlashNotice>
      )}

      {disconnected === "github" && (
        <FlashNotice clear={RESULT_PARAMS} className="rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
          <span className="font-medium">GitHub disconnected.</span> The LeadByte app is still
          installed on your GitHub account. To remove it completely, uninstall it under{" "}
          <a href={GITHUB_INSTALLATIONS_URL} target="_blank" rel="noopener noreferrer" className="underline">
            GitHub&rsquo;s settings
          </a>
          .
        </FlashNotice>
      )}

      {error === "facebook-page" && (
        <FlashNotice role="alert" clear={RESULT_PARAMS} className="rounded-lg bg-crit-soft px-4 py-3 text-sm text-crit">
          {/* Not "connected": the page was not saved with our backend, and
              without it nothing can be posted to Facebook. */}
          We couldn&rsquo;t finish setting up your Facebook page, so nothing can be posted to it
          yet. Reconnect Facebook to try again.
          {readSignedText(message) && (
            <span className="mt-1 block">Reason: {readSignedText(message)}</span>
          )}
        </FlashNotice>
      )}

      {disconnected === "wordpress" && (
        <FlashNotice clear={RESULT_PARAMS} className="rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
          <span className="font-medium">WordPress disconnected.</span> To cut access completely, also
          revoke the Application Password in WordPress under Users → Profile.
        </FlashNotice>
      )}

      {error === "wordpress-disconnect" && (
        <FlashNotice role="alert" clear={RESULT_PARAMS} className="rounded-lg bg-crit-soft px-4 py-3 text-sm text-crit">
          We couldn&rsquo;t disconnect WordPress just now. Nothing changed. Please try again in a minute.
        </FlashNotice>
      )}

      {error === "github-disconnect" && (
        <FlashNotice role="alert" clear={RESULT_PARAMS} className="rounded-lg bg-crit-soft px-4 py-3 text-sm text-crit">
          We couldn&rsquo;t disconnect GitHub just now. Nothing changed. Please try again in a minute.
        </FlashNotice>
      )}

      {/* A choice is outstanding. Rendered here, at the top of the page, rather
          than inside the row it belongs to: a `<dialog>` in the top layer does
          not care where it sits in the tree, and a modal opening from
          three-quarters of the way down a list is harder to follow in the
          DOM than it is on screen. */}
      {choosePlatform && (
        <SocialAccountDialog
          platform={choosePlatform}
          label={PLATFORMS.find((p) => p.id === choosePlatform)?.label ?? choosePlatform}
          accounts={chooseAccounts}
          action={selectSocialAccount}
          abandonAction={abandonSocialAccount}
        />
      )}

      {/* Says back what was just done, because the row it changed is one of
          eight and the change is an absence — no page name, a badge reading
          Not connected. Without this, leaving the picker looks like the
          connection failed rather than like the choice they made. */}
      {declinedPlatform && (
        <FlashNotice clear={RESULT_PARAMS} className="rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
          <span className="font-medium">No {declinedPlatform.label} account connected.</span> You
          left without choosing one. Connect again whenever you want to pick a page.
        </FlashNotice>
      )}

      {error === "expired-choice" && (
        <FlashNotice role="alert" clear={RESULT_PARAMS} className="rounded-lg bg-crit-soft px-4 py-3 text-sm text-crit">
          {/* Not a failed connection — the connection is fine. Only the list of
              accounts has lapsed, and saying "try again" about the wrong thing
              sends someone back through consent they have already given. */}
          That account list has expired. Connect again to choose which account to post as.
          Nothing else is affected.
        </FlashNotice>
      )}

      {error && error !== "expired-choice" && error !== "facebook-page" && (
        <FlashNotice role="alert" clear={RESULT_PARAMS} className="rounded-lg bg-crit-soft px-4 py-3 text-sm text-crit">
          {/* The backend's own words when it gave any: they name the actual
              cause, which is more use than anything generic. */}
          {/* Only a sentence our own code signed — anything else in the
              address bar is shown as the generic line (lib/signed-text.ts). */}
          {readSignedText(message) ?? "That connection didn't complete. Nothing was changed, so you can try again."}
        </FlashNotice>
      )}

      {/* One grid for every group, each a full-width panel. */}
      <div className="grid gap-3 xl:grid-cols-2">
      {GROUP_ORDER.map((group) => {
        const inGroup = rows.filter((s) => s.platform.group === group);
        // Email carries no OAuthPlatform of its own — its whole UI is the
        // "Connect Email" chooser below — so it renders even when empty. Every
        // other group with no platforms is genuinely absent.
        if (inGroup.length === 0 && group !== "email") return null;

        return (
          <ConnectionGroupSection
            key={group}
            title={group === "email" ? "Email & Publishing" : GROUP_LABELS[group]}
            description={GROUP_LOOK[group].description}
            icon={GROUP_LOOK[group].icon}
            tone={GROUP_LOOK[group].tone}
            iconTone={GROUP_LOOK[group].iconTone}
          >
            {inGroup.map(({ platform, result }) => {
              const startUrl = connectUrl(platform.id);
              const isConnected = result.status === "valid";
              // Connected, but the page to post as is still unpicked. Its own
              // state rather than one of the two: "Connected" would be a
              // connection that cannot post, and "Not connected" would deny
              // consent the customer has already given.
              const awaitingChoice = socialOffers[platform.id] === true || result.status === "pending";

              return (
                <ConnectionRow
                  key={platform.id}
                  logo={
                    PLATFORM_LOGO[platform.id] ? <ConnectionLogo src={PLATFORM_LOGO[platform.id]!} /> : undefined
                  }
                  label={platform.label}
                  href={PLATFORM_HREF[platform.id]}
                  purpose={platform.purpose}
                  status={awaitingChoice ? "connection-analysing" : statusBadgeVariant(result.status)}
                  statusLabel={awaitingChoice ? "Finish setup" : statusLabel(result.status)}
                  note={
                    awaitingChoice
                      ? platform.id === "googleAnalytics"
                        ? "Choose which Analytics property to use."
                        : platform.group === "social"
                          ? "Choose the page to post as."
                          : "Choose which account to use."
                      : (statusNote(result.status, result.expiryDate) ?? undefined)
                  }
                  // The account this landed on, when we know it. "Connected"
                  // alone leaves the obvious question unanswered — one Google
                  // login owns several YouTube channels — and the mailbox row
                  // below names its address for the same reason. Absent for a
                  // connection made before the name was captured, or after the
                  // cookie lapses; the row is still correctly "Connected".
                  detail={
                    isConnected ? (
                      <AccountDetailsLine
                        details={accountDetails[platform.id] ?? NO_DETAILS}
                        label={
                          platform.id === "googleAnalytics"
                            ? "Property"
                            : platform.id === "youtube"
                              ? "Channel"
                              : platform.id === "facebook"
                                ? "Page"
                                : platform.id === "instagram"
                                  ? "Account"
                                  : "Ad account"
                        }
                      />
                    ) : undefined
                  }
                  // Consent and account selection are two steps, and people
                  // stop between them — a closed tab, a second thought. Without
                  // this the only way back into the picker was to redo consent,
                  // which is both slower and looks like the first attempt
                  // failed. Offered only where a picker exists.
                  //
                  // For the social platforms the offer is a cookie rather than
                  // a page, so the link re-opens the dialog instead — and it
                  // shows whether or not the row reads connected, because a
                  // connected Facebook with no page chosen is exactly the
                  // state this rescues.
                  secondaryAction={
                    socialOffers[platform.id] ? (
                      <Link
                        href={`/intelligence/connections?choose=${platform.id}`}
                        className="whitespace-nowrap text-xs text-ink-soft underline hover:text-ink"
                      >
                        Choose account
                      </Link>
                    ) : platform.id === "googleAnalytics" && result.status === "pending" ? (
                      <Link
                        href="/connections/google/select"
                        className="whitespace-nowrap text-xs text-ink-soft underline hover:text-ink"
                      >
                        Choose property
                      </Link>
                    ) : undefined
                  }
                  action={
                    startUrl ? (
                      <>
                        {/* The next step once connected: the agent that uses
                            this account (LBS-1254). Not while a page or
                            account is still to be chosen — the agent would
                            stop at that. */}
                        {isConnected && !awaitingChoice && platform.id in AGENT_FOR_CONNECTION && (
                          <RunAgentLink {...AGENT_FOR_CONNECTION[platform.id as keyof typeof AGENT_FOR_CONNECTION]} />
                        )}
                        <ConnectButton href={startUrl} connected={isConnected} />
                        {/* Connected ad platforms can be let go of here too —
                            the others have no disconnect to offer. */}
                        {isConnected && platform.id in ADS_PLATFORMS && (
                          <DisconnectAds platform={platform.id as AdsPlatform} label={platform.label} />
                        )}
                      </>
                    ) : (
                      <span className="shrink-0 text-xs text-ink-soft">Backend not configured</span>
                    )
                  }
                />
              );
            })}

            {/* Search Console is not an `OAuthPlatform` — it has no
                Frontend_check table of its own and shares the ANALYTICS row.
                It is its own GRANT, though (a different Google scope), so its
                state is `checkGoogleProduct("search_console")`, not the row's.

                It is deliberately left out of the meter's count: one backend
                row cannot honestly be counted twice. */}
            {group === "analytics" && (
              <ConnectionRow
                logo={<ConnectionLogo src="/logos/google.svg" />}
                label="Search Console"
                href={SEARCH_CONSOLE_HREF}
                purpose="The queries you already rank for, with clicks and average position."
                status={statusBadgeVariant(googleStatus.status)}
                statusLabel={statusLabel(googleStatus.status)}
                note={
                  analyticsOnly
                    ? "Google is connected for Analytics only. Connect to give Search Console access too."
                    : googleStatus.status === "pending"
                      ? "Choose which Search Console site to use."
                      : (statusNote(googleStatus.status, googleStatus.expiryDate) ??
                        "Uses your Google sign-in, with its own permission.")
                }
                detail={
                  googleStatus.status === "valid" ? (
                    <AccountDetailsLine details={searchConsoleDetails} label="Site" />
                  ) : undefined
                }
                action={
                  <ConnectButton
                    href={googleFlowUrl("search-console")}
                    connected={googleStatus.status === "valid"}
                  />
                }
              />
            )}

            {/* Email has no OAuthPlatform row — connecting a mailbox is a
                multi-provider flow (Gmail OAuth, or SMTP/IONOS/Yahoo/custom
                credentials), so the whole group is this one chooser. */}
            {group === "email" && (
              <ConnectionRow
                // Gmail's mark: the first and main way in through the
                // provider chooser. IONOS, Yahoo and custom IMAP/SMTP connect
                // through the same card, and are named there.
                logo={<ConnectionLogo src="/logos/gmail.svg" />}
                label="Email account"
                href={EMAIL_HREF}
                purpose={
                  mailbox
                    ? "The mailbox campaigns are sent from."
                    : "Connect the mailbox we send campaigns from."
                }
                status={mailbox ? "connection-connected" : "connection-not-connected"}
                statusLabel={mailbox ? "Connected" : "Not connected"}
                detail={
                  mailbox ? (
                    /* The mailbox, named. "Connected" on its own leaves the
                       obvious question unanswered — which account? — and an
                       account with several mailboxes cannot tell which one
                       campaigns will come from. */
                    <div className="mt-1 min-w-0 space-y-0.5">
                      {mailbox.address !== "" && <DetailLine label="Email" value={mailbox.address} />}
                      {mailbox.name !== "" && <DetailLine label="Name" value={mailbox.name} />}
                      {/* The record names neither: a plain statement rather
                          than a blank line. */}
                      {mailbox.address === "" && mailbox.name === "" && (
                        <p className="text-sm text-ink-soft">Address not on record</p>
                      )}
                    </div>
                  ) : undefined
                }
                note={
                  mailbox
                    ? mailboxLabel(mailbox) === null
                      ? "Connect again to show which mailbox it is."
                      : "Connecting again replaces this mailbox."
                    : "Gmail via Google, or IONOS, Yahoo and custom IMAP/SMTP with a mailbox password."
                }
                action={
                  <>
                    {mailbox && <RunAgentLink {...AGENT_FOR_CONNECTION.email} />}
                    <ConnectEmail connected={Boolean(mailbox)} />
                  </>
                }
              />
            )}

            {/* Where the Blog Posting agent publishes — GitHub or WordPress,
                either is enough — and where the AEO agent sends its fixes.
                Cards of their own, the size of every other card. Outside the
                meter: it counts ad, analytics and social accounts, and these
                are destinations, not sources of numbers. */}
            {group === "email" && (
              <>
                <GithubRow connection={github} check={githubConnectedAction} disconnect={disconnectGithubAction} />
                <WordpressRow status={wordpress} disconnect={disconnectWordpressAction} />
              </>
            )}
          </ConnectionGroupSection>
        );
      })}

      </div>

      {!state.googleAnalyticsConnected && !state.skipped && (
        <form action={skipConnections}>
          <SubmitButton pendingLabel="Skipping…" className="text-sm text-ink-soft underline">
            Skip for now
          </SubmitButton>
        </form>
      )}

      {state.skipped && (
        <p className="max-w-prose text-sm text-warn">
          Skipped. Strategy will run on website intelligence alone and some recommendations will be
          marked low confidence. You can connect anytime.
        </p>
      )}
    </PageContainer>
  );
}

/**
 * The page's own reads sit behind a boundary so the frame does not wait on
 * them. Without it the whole screen — header, tabs, rail — was held back until
 * the slowest backend read landed, and a click showed the previous page for
 * the entire wait. See the note on `PageShell`; this is NOT a route-level
 * `loading.tsx` (rule 0).
 */
export default function ConnectionsPage(props: Parameters<typeof ConnectionsPageBody>[0]) {
  return (
    // No Search Console banner here: this page carries its own Google rows,
    // and the banner's reads landed on the page that already fans out the most.
    <PageShell activeTab="/intelligence/connections" currentStageId="connections" showConnectPrompt={false}>
      <Suspense fallback={<PageLoading title="Connections" />}>
        <ConnectionsPageBody {...props} />
      </Suspense>
    </PageShell>
  );
}
