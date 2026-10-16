import { readSignedText } from "@/lib/signed-text";
import { SocialMediaSetup } from "@/components/agents/social-media-setup";
import { SOCIAL_POST_PLATFORMS, socialDefaultsFromRow } from "@/lib/data/social-media-setup";
import { getAgentSetupRow } from "@/lib/data/agent-setup";
import { isBackendConfigured } from "@/lib/api/config";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentLogo } from "@/components/agents/agent-logo";
import { ClockCounterClockwise } from "@phosphor-icons/react/ssr";
import { SubmitButton } from "@/components/ui/submit-button";
import { PageLoading } from "@/components/ui/page-loading";
import Link from "@/components/ui/app-link";
import { adsAccountChoice } from "@/lib/data/ads-gate-check";
import { adsConnectionFor } from "@/lib/data/agent-ads-gate";
import { checkOAuthStatus, chosenAccountCurrency } from "@/lib/api/oauth-status";
import { checkBusinessDetails, type BusinessDetailsCheck } from "@/lib/data/business-details-check";
import { BusinessDetailsBlock } from "@/components/agents/business-details-block";
import { BlockingErrorCardView } from "@/components/agents/blocking-error-card";
import { decodeBlockingCard } from "@/lib/data/ads-blocking-error";
import { runGateCopy } from "@/lib/data/agent-run-gate";
import { ForgetFormDraft } from "@/components/agents/form-draft";
import { draftKeyFor } from "@/lib/data/form-draft-key";
import { agentLaunched, type AgentBackendId } from "@/lib/data/agent-setup";
import { checkAgentRun } from "@/lib/data/agent-run-check";
import { agentRowStatuses } from "@/lib/data/agent-live-status";
import { ROW_STATUS_LABEL, ROW_STATUS_VARIANT } from "@/lib/data/agent-row-status";
import { PendingLink } from "@/components/ui/pending-link";
import { RefreshButton } from "@/components/ui/refresh-button";
import { notFound } from "next/navigation";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { CampaignSteps } from "@/components/agents/campaign-steps";
import { campaignStepsFor } from "@/lib/data/campaign-steps";
import { AGENT_DEFINITIONS, getAgentRepo } from "@/lib/data/agent-repo";
import { getWriterRepo } from "@/lib/data/writer-repo";
import { getCodingRepo } from "@/lib/data/coding-repo";
import { WriterWorkspace } from "@/components/agents/writer-workspace";
import { GoogleAdsSetup } from "@/components/agents/google-ads-setup";
import { MetaAdsSetup } from "@/components/agents/meta-ads-setup";
import { LinkedInAdsSetup } from "@/components/agents/linkedin-ads-setup";
import { LeadQualificationSetup } from "@/components/agents/lead-qualification-setup";
import { LeadActivityTable } from "@/components/agents/lead-activity-table";
import { getLeadActivity } from "@/lib/data/lead-qualification";
import { currentCampaign } from "@/lib/data/campaign-job";
import { getConnectedMailbox } from "@/lib/data/email-callback";
import { adsLeadsSummary } from "@/lib/data/lead-selection";
import { requiresConnectedEmail } from "@/lib/data/agent-email-gate";
import { requiresSocialConnection } from "@/lib/data/agent-social-gate";
import { ConnectLink } from "@/components/ui/connect-link";
import { FlashNotice } from "@/components/ui/flash-notice";
import {
  connectedSocialAccounts,
  pendingSocialChoices,
} from "@/lib/data/social-connections";
import { OpenAiAdsSetupForm } from "@/components/agents/openai-ads-setup";
import { OpenAiKeyForm } from "@/components/agents/openai-key-form";
import { getOpenAiKey } from "@/lib/data/openai-key";
import { getOpenAiAccount } from "@/lib/data/openai-account";
import { fetchCountryNames } from "@/lib/data/countries";
import { CampaignCreatedDialog } from "@/components/agents/campaign-created-dialog";
import { readLaunchSummary } from "@/lib/data/launch-summary-cookie";
import { getAdsWebsiteDetails } from "@/lib/data/ads-website-details-api";
import { adsPrefillFromRow } from "@/lib/data/ads-prefill";
import { readLinkedInDraft } from "@/lib/data/linkedin-setup-draft";
import { conversionEvents } from "@/lib/data/ads-api";
import { CampaignControls } from "@/components/agents/campaign-controls";
import { getSession } from "@/lib/auth/session";
import { getBusinessProfileRepo } from "@/lib/data/business-profile-repo";
import { BlogPostPanel, type BlogGithub } from "@/components/agents/blog-post-panel";
import { checkBlogPost, writeBlogPost } from "./blog-actions";
import { githubConnectedAction } from "@/app/(app)/intelligence/connections/actions";
import { readGithubConnection } from "@/lib/data/github-connection";
import { blogPublishState } from "@/lib/data/blog-publish";
import { readWordpressStatus } from "@/lib/data/wordpress-repo";
import { ConnectWordpress } from "@/components/connections/connect-wordpress";
import { isFilled } from "@/lib/data/profile-display";
import { CodingWorkspace } from "@/components/agents/coding-workspace";
import { PageContainer } from "@/components/ui/page-container";
import { AdAccountGuideView } from "@/components/agents/ad-account-guide";
import { adAccountGuideFor, wantsAccountGuide } from "@/lib/data/ad-account-guides";

export const metadata: Metadata = { title: "Agent workspace · LeadByte" };
import {
  activateAgent,
  runSocialMedia,
  approveAndShipPr,
  approveWriterDraft,
  launchGoogleAds,
  launchLinkedInAds,
  launchMetaAds,
  launchOpenAiAds,
  saveOpenAiKey,
  forgetOpenAiKey,
  controlLeadCampaign,
  runLeadQualification,
  stopLeadRecipients,
} from "./actions";

const TAG_VARIANT: Record<string, BadgeVariant> = {
  SHIPPED: "verdict-scale",
  MERGED: "verdict-scale",
  PUBLISHED: "verdict-scale",
  SCORED: "verdict-scale",
  ROUTED: "verdict-scale",
  RECOVERED: "verdict-scale",
  SUPPRESSED: "verdict-keep",
  OK: "verdict-keep",
  PAUSED: "verdict-pause",
  BLOCKED: "verdict-pause",
  "NEEDS APPROVAL": "verdict-rescale",
  "AWAITING REVIEW": "verdict-rescale",
};

async function AgentWorkspacePageBody({
  params,
  searchParams,
}: {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{
    problems?: string;
    launched?: string;
    unsaved?: string;
    new?: string;
    account?: string;
    /** Set by the ad-account picker when it returns here (`ads-return.ts`). */
    connected?: string;
    /** Social Media: a run was sent (`full` | `semi`), and whether YouTube activation was requested. */
    sent?: string;
    youtube?: string;
    /** A signed workflow refusal with its fix (`BlockingErrorCardView`). */
    blocked?: string;
    /** Lead Qualification: what the mail service flagged about the run just sent. */
    warn?: string | string[];
  }>;
}) {
  const { agentId } = await params;
  const {
    problems: rawProblems,
    blocked: rawBlocked,
    warn: rawWarn,
    launched,
    unsaved,
    new: startNew,
    account,
    connected,
    sent,
    youtube,
  } = await searchParams;
  const runWarnings = (Array.isArray(rawWarn) ? rawWarn : rawWarn ? [rawWarn] : [])
    .slice(0, 3)
    .map((line) => readSignedText(line)?.trim() ?? "")
    .filter((line) => line !== "");
  // Signed by the action that redirected here; a link carrying any other text
  // shows nothing rather than words someone else chose (audit, 2026-09-29).
  const problems = readSignedText(rawProblems) ?? undefined;
  const blockedCard = decodeBlockingCard(rawBlocked);
  const definition = AGENT_DEFINITIONS.find((d) => d.id === agentId);
  if (!definition) notFound();
  // Writer and Coding are hidden from the product and have demo data only;
  // on a live site their pages pretended to activate and did nothing.
  if (isBackendConfigured() && (agentId === "writer" || agentId === "coding")) notFound();

  const businessId = await currentBusinessId();
  const [state, rowStatuses] = await Promise.all([
    getAgentRepo().getState(businessId, agentId),
    agentRowStatuses(businessId),
  ]);
  const rowStatus = rowStatuses.get(agentId) ?? "needs-setup";

  // All three ad agents ask for their campaign before they can run. The form
  // stands in for the activity timeline until the agent has launched once — an
  // empty timeline with an Activate button asked people to start an agent that
  // had been told nothing about what to advertise.
  const AD_AGENTS = ["google-ads", "meta-ads", "linkedin-ads", "openai-ads"];
  // Whether a campaign has already been SUBMITTED, read from the backend row
  // `launchCampaign` marks. The mock runs this used to rely on are always
  // empty against a live backend, so the setup form came back right after a
  // launch and a second submit created a second paid campaign. OpenAI Ads
  // launches through its own flow and keeps no such row.
  const LAUNCH_TRACKED = ["google-ads", "meta-ads", "linkedin-ads"];
  const submitted = LAUNCH_TRACKED.includes(agentId)
    ? await agentLaunched(agentId as AgentBackendId, businessId)
    : { launched: false, launchedAt: null };
  const campaignSubmitted = submitted.launched && startNew !== "1";
  // The campaign that just went out, by name — read once, only on arrival.
  const launchSummary = launched && AD_AGENTS.includes(agentId) ? await readLaunchSummary(agentId) : [];
  // Purchase first, then the connection this agent works through
  // (`agent-run-gate.ts`). The actions refuse otherwise, so the page says
  // which step is missing instead of showing a form that will be refused.
  const runGate = await checkAgentRun(
    agentId,
    (await getSession())?.businessId ?? businessId,
    definition.name,
  );
  const connectionLocked = !runGate.ok && runGate.step === "connection";
  // Where Blog Posting can publish: GitHub or WordPress, read together and
  // only for that agent (`blog-publish.ts`).
  const blogTargets =
    agentId === "blog-posting" && runGate.ok
      ? await Promise.all([readGithubConnection(businessId), readWordpressStatus()])
      : null;
  // Google Ads and Meta Ads go straight to Connect (product notes,
  // 2026-09-30); someone with no ad account yet follows a small link to the
  // guide on creating one (`?account=no`, `ad-account-guides.ts`).
  const accountGuide = connectionLocked ? adAccountGuideFor(agentId) : null;
  const showAccountGuide = accountGuide !== null && wantsAccountGuide(account);
  const agentPath = `/agents/${agentId}`;
  // Where this browser keeps the setup form's unsent answers (`form-draft.tsx`).
  const draftKey = draftKeyFor(agentId, (await getSession())?.businessId ?? businessId);
  const needsAdSetup =
    AD_AGENTS.includes(agentId) && state.runs.length === 0 && !campaignSubmitted && runGate.ok;
  // No ad-account pick on record: said, never blocked — the record cannot
  // prove there is none (`accountChoice`). Only asked while the form is up.
  const accountPick = needsAdSetup
    ? await adsAccountChoice(agentId, (await getSession())?.businessId ?? businessId)
    : null;
  const choosePickHref = runGateCopy(agentId, definition.name, "account").fixHref;
  // The budget box names the chosen account's currency when it is on record
  // (the same read `launchAdAgent` sends as `budget_currency`).
  const setupPlatform = adsConnectionFor(agentId);
  const setupCurrency =
    needsAdSetup && setupPlatform && (agentId === "google-ads" || agentId === "meta-ads")
      ? await chosenAccountCurrency(setupPlatform, (await getSession())?.businessId ?? businessId)
      : "";

  // OpenAI Ads only, and only while its setup is up. The key decides which of
  // two things the page shows, so it is read before rendering (a cookie).
  const isOpenAiSetup = needsAdSetup && agentId === "openai-ads";
  const openAiKey = isOpenAiSetup ? await getOpenAiKey() : null;
  const openAiReady = isOpenAiSetup && openAiKey !== null;
  const isLead = agentId === "lead-qualification";
  const isSocial = requiresSocialConnection(agentId);
  // The earliest a campaign may start. Computed on the server so the floor
  // does not depend on the visitor's clock.
  const today = new Date().toISOString().slice(0, 10);
  // A cookie read with no network in it; the ad-details row needs the uid.
  const session = await getSession();

  // Every backend read this page makes, AT ONCE. They were awaited one after
  // another — roughly a dozen in a row for an ad agent, 5-15s of body time —
  // although only one pair depends on the other (the ad-details row needs the
  // profile's website). Each read is still guarded by the agent it belongs
  // to, so an agent's page asks only for its own data. The leads summary is
  // fetched alongside the lead activity rather than after it; it is used only
  // when there is no activity yet, and one small read is cheaper than a
  // second round trip.
  const [
    writerState,
    codingState,
    countries,
    openAiAccount,
    conversions,
    leadActivity,
    leadAdsSummary,
    campaign,
    mailbox,
    connectedAccounts,
    pendingChoices,
    adSetup,
  ] = await Promise.all([
    // Writer and Coding have purpose-built workspaces (draft review, PR
    // review) rather than the shared activity timeline every other agent uses.
    agentId === "writer" ? getWriterRepo().get(businessId) : null,
    agentId === "coding" ? getCodingRepo().get(businessId) : null,
    // A third-party call that returns [] on failure and falls back to a text
    // box. Only OpenAI Ads asks for locations on its setup form; Google asks
    // on the campaign-details form instead (2026-10-09).
    openAiReady ? fetchCountryNames() : [],
    // What `verify` reported — currency drives the budget.
    openAiReady ? getOpenAiAccount() : null,
    // The conversions this account can optimise for. A leads campaign sent
    // without these RUNS — as a clicks campaign — so an empty list is a real
    // answer, not a failure.
    openAiReady ? conversionEvents() : null,
    // Lead Qualification is the one agent whose activity has a real source,
    // read on arrival so a returning account sees its history immediately.
    isLead ? getLeadActivity(businessId) : [],
    isLead ? adsLeadsSummary(businessId) : { total: 0, selected: 0 },
    // The running campaign, from the cookie the launch wrote.
    isLead ? currentCampaign() : null,
    // The five gated agents cannot run without a mailbox (`agent-email-gate.ts`).
    requiresConnectedEmail(agentId) ? getConnectedMailbox() : null,
    // The Social Media agent names where it posts.
    isSocial ? connectedSocialAccounts(businessId) : [],
    // Connected, but the page to post as not yet picked. Named here so the
    // platform does not vanish from the screen for someone who just connected.
    isSocial ? pendingSocialChoices() : [],
    // What the backend already knows about this account's advertising, read
    // BEFORE the setup form asks for any of it — the one dependent pair.
    needsAdSetup
      ? (async () => {
          const profile = await getBusinessProfileRepo().get(businessId);
          // The account email as well as the uid: the row's key is
          // unconfirmed. See the note on `getAdsWebsiteDetails`.
          const details = await getAdsWebsiteDetails(
            session?.userId,
            profile?.websiteUrl ?? "",
            session?.businessId,
          );
          return { profile, details };
        })()
      : { profile: null, details: null },
  ]);

  const needsLeadSetup = isLead && leadActivity.length === 0 && runGate.ok;
  const adsSummary = needsLeadSetup ? leadAdsSummary : { total: 0, selected: 0 };
  const emailConnected = requiresConnectedEmail(agentId) ? mailbox !== null : true;
  const socialGateBlocks = isSocial && connectionLocked;
  const socialAccounts = isSocial && !socialGateBlocks ? connectedAccounts : [];
  const profile = adSetup.profile;
  const adsDetails = adSetup.details;
  // Social Media's form names the business its posts are written for.
  const setupProfile = agentId === "social-media" ? await getBusinessProfileRepo().get(businessId) : null;
  // The same row, mapped onto the setup form's own fields. Defaults only —
  // every one stays editable, which is why this is `prefill` and not a set of
  // values the form cannot argue with.
  const adsPrefill = adsPrefillFromRow(adsDetails?.row ?? null);
  // Fetched on the server and handed down as a prop — the location control is a
  // client island and never fetches for itself. Only Meta asks for it, and only
  // while the setup form is what this page shows.
  const setupBusinessName = isFilled(profile?.businessName) ? profile!.businessName : "";
  // A refusal card says the same failure with its fix; the list would repeat it.
  const setupProblems = problems && !blockedCard ? problems.split("|") : [];
  // LinkedIn's last posted setup, so a form sent back comes back filled in
  // (`linkedin-setup-draft.ts`) — Google and Meta keep theirs in the browser.
  const linkedInDraft = agentId === "linkedin-ads" ? await readLinkedInDraft() : null;
  // Meta Ads asks for a complete business profile before a campaign
  // (`business-details-check.ts`), and says when it could not check its own
  // connection rather than saying nothing (META_ADS_AGENT_SPEC MA-GRD-11).
  // Meta and Google Ads (both specs, MA-GRD / GA-GRD).
  const metaSetup = needsAdSetup && (agentId === "meta-ads" || agentId === "google-ads");
  const businessCheck: BusinessDetailsCheck = metaSetup
    ? await checkBusinessDetails(businessId)
    : { kind: "ok" };
  const connectionUnchecked =
    metaSetup && setupPlatform !== null
      ? (await checkOAuthStatus(setupPlatform, session?.businessId ?? businessId)).status === "error"
      : false;


  return (
    <>
      {/* Centred and measured for the ad agents, which are step one of a
          four-screen launch — see `CampaignFrame` for why a narrow column
          pinned left reads as a fault on a wide screen. The other agents keep
          the full-width dashboard layout: they are one screen, not a flow. */}
      <PageContainer>
        {/* The ad agents are step one of a four-screen launch, so they keep a
            measured column — see `CampaignFrame`. Either way the gap between
            blocks is this wrapper's, not each block's own margin. */}
        <div
          className={
            needsAdSetup
              ? "mx-auto flex w-full max-w-5xl flex-col gap-4"
              : "flex flex-col gap-4"
          }
        >
        <div className="flex items-center gap-2">
          <Link href="/agents" className="text-sm text-ink-soft transition-colors hover:text-ink">
            ← Agents
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Only agents with a mark render one (`agent-logo.tsx`). */}
            <AgentLogo agentId={agentId} />
            <h1 className="text-lg font-bold text-ink">{definition.name} agent</h1>
            {/* The SAME status the Agents list shows (`agent-live-status.ts`).
                This printed the mock repo's raw value ("needs-setup") and so
                contradicted a list that had just said Ready. No badge for
                "needs setup", as on the list — the setup form says it. */}
            {rowStatus !== "needs-setup" && (
              <Badge variant={ROW_STATUS_VARIANT[rowStatus]}>{ROW_STATUS_LABEL[rowStatus]}</Badge>
            )}
          </div>
          {/* Hidden while the setup form is up. Otherwise it would start the
              agent having told it nothing about what to advertise — the same
              bypass the ad-accounts gate had, where closing the dialog left a
              working start button behind it. The form's own submit is the only
              way to launch. */}
          {/* Hidden while the social gate is unmet: the action refuses it, so
              a button here would be a control whose only outcome is a refusal.
              The notice below the heading says what to do instead. */}
          {/* Social Media starts from its posting form below (2026-10-01); the
              bare "Activate" that stood here sent only an activation call and
              never created a post. */}
        </div>
        <p className="max-w-2xl text-sm text-ink-soft">{definition.description}</p>

        {/* The one thing standing between this account and a run, above "Why
            this agent" because it is the next thing to do. Purchase first, then
            the connection — never both at once (`agent-run-gate.ts`). */}
        {!runGate.ok && accountGuide && showAccountGuide && (
          <AdAccountGuideView
            guide={accountGuide}
            pathname={agentPath}
            connectHref={runGate.fixHref}
          />
        )}
        {!runGate.ok && !showAccountGuide && (
          <div
            className={`max-w-2xl rounded-lg border p-4 ${
              runGate.step === "purchase" ? "border-border bg-surface" : "border-warn/30 bg-warn-soft"
            }`}
          >
            <p
              className={`text-sm font-semibold ${runGate.step === "purchase" ? "text-ink" : "text-warn"}`}
            >
              {runGate.title}
            </p>
            <p className={`mt-1 text-sm ${runGate.step === "purchase" ? "text-ink-soft" : "text-ink"}`}>
              {runGate.message}
            </p>
            {runGate.fixHref.startsWith("/api/") ? (
              /* A consent start that 302s off-site, so a raw anchor. */
              <ConnectLink
                href={runGate.fixHref}
                pendingLabel="Opening…"
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
              >
                {runGate.fixLabel}
              </ConnectLink>
            ) : (
              <PendingLink
                href={runGate.fixHref}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
              >
                {runGate.fixLabel}
              </PendingLink>
            )}
            {/* The guide, for the few who have no ad account yet. A quiet link
                rather than a question in front of everyone: someone who just
                paid for this agent almost always has the account already. */}
            {accountGuide && (
              <p className="mt-3 text-sm text-ink-soft">
                Don&apos;t have a {accountGuide.platform} account yet?{" "}
                <Link
                  href={{ pathname: agentPath, query: { account: "no" } }}
                  className="font-medium text-ink underline underline-offset-2 transition-colors hover:text-accent-ink"
                >
                  See how to create one
                </Link>
              </p>
            )}
          </div>
        )}

        {(socialAccounts.length > 0 || pendingChoices.length > 0) && (
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Posting to
            </div>
            <ul className="space-y-1.5">
              {socialAccounts.map(({ platform, label, account }) => (
                <li key={platform} className="flex items-baseline gap-2 text-sm">
                  <span className="font-medium text-ink">{label}</span>
                  {/* The account name when the connect flow told us it, and
                      nothing when it did not — a connection made before names
                      were captured is still a real connection. */}
                  {account && <span className="truncate text-ink-soft">{account}</span>}
                </li>
              ))}
              {/* Unfinished, and said so in place rather than in a banner of
                  its own: the question is "where does this post?", and a
                  platform that cannot answer it yet belongs in the same list as
                  the ones that can. The link goes straight back to the picker,
                  not to Connections — the page chooser is the single thing left
                  to do. */}
              {pendingChoices.map(({ platform, label, count }) => (
                <li key={platform} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium text-ink">{label}</span>
                  <span className="text-warn">No page chosen</span>
                  <Link
                    href={`/intelligence/connections?choose=${platform}`}
                    className="text-xs text-accent-ink underline transition-colors hover:text-ink"
                  >
                    Choose from {count} {count === 1 ? "page" : "pages"}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/intelligence/connections"
              className="mt-3 inline-block text-xs text-accent-ink transition-colors hover:text-ink"
            >
              Manage connections →
            </Link>
          </div>
        )}

        {/* Skipped when it only restates the description above it. */}
        {definition.whyThisAgent.split(" ").slice(0, 3).join(" ").toLowerCase() !==
          definition.description.split(" ").slice(0, 3).join(" ").toLowerCase() && (
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-1 text-sm font-semibold text-ink-soft">Why this agent</div>
            <p className="text-sm text-ink">{definition.whyThisAgent}</p>
            {/* What it does for you, under the reason (LBS-1255). Hairline
                above, not a box inside the box. */}
            {definition.benefits && definition.benefits.length > 0 && (
              <ul className="mt-3 space-y-2 border-t border-border pt-3">
                {definition.benefits.map((benefit) => (
                  <li key={benefit.title}>
                    <p className="text-sm font-semibold text-ink">{benefit.title}</p>
                    <p className="mt-0.5 text-sm text-ink-soft">{benefit.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Social Media: the posting form (2026-10-01). Hidden while the
            social gate is unmet — the notice above says what to do instead. */}
        {agentId === "social-media" && sent && (
          <FlashNotice clear={["sent", "youtube"]} className="rounded-lg bg-good-soft px-4 py-3 text-sm text-good">
            <span className="font-medium">Sent to the Social Media agent.</span>{" "}
            {sent === "semi"
              ? "It writes the posts around your media and publishes them."
              : "It writes and publishes your posts on the schedule you chose."}{" "}
            New posts appear in the dashboard&apos;s Social tab once they are published.
            {youtube === "1" && " Our team will contact you about activating YouTube."}
          </FlashNotice>
        )}
        {agentId === "social-media" && runGate.ok && !socialGateBlocks && (
          <SocialMediaSetup
            action={runSocialMedia}
            business={{
              name: isFilled(setupProfile?.businessName) ? setupProfile.businessName : null,
              website: isFilled(setupProfile?.websiteUrl) ? setupProfile.websiteUrl : null,
            }}
            platforms={SOCIAL_POST_PLATFORMS.map((platform) => {
              const account = connectedAccounts.find((entry) => entry.platform === platform);
              return { platform, connected: account !== undefined, account: account?.account ?? null };
            })}
            defaults={socialDefaultsFromRow(
              await getAgentSetupRow("social-media", (await getSession())?.businessId ?? businessId),
            )}
          />
        )}

        {/* The AEO agent's way in.
            It is a link rather than a form because the next screen asks two
            questions — which site, and whether to look for subdomains first —
            and the subdomain answer changes what happens before any audit
            starts. Its flow lives under `agents/aeo/`, not in the shared
            `suggestion`/`semi`/`creative` pages: those all `notFound()`
            without an n8n chat webhook, and this agent talks to a different
            service entirely. */}
        {/* Blog Posting: one run writes a post and publishes it to the
            customer's site — only the website on the account, shown and not
            editable (the action reads it again on the server). */}
        {agentId === "blog-posting" && runGate.ok && (
          <BlogPostPanel
            // Keyed on the business: switching business re-renders this page
            // without remounting it, and a finished post from the previous
            // business must not stay on screen (2026-10-09).
            key={businessId}
            website={(await getBusinessProfileRepo().get(businessId))?.websiteUrl ?? ""}
            write={writeBlogPost}
            check={checkBlogPost}
            // GitHub or WordPress; either is enough (`blog-publish.ts`).
            github={blogTargets ? blogPublishState(...blogTargets) : undefined}
            checkGithub={githubConnectedAction}
            // Offered only where WordPress is switched on.
            connectWordpress={
              blogTargets && blogTargets[1].kind !== "unavailable" ? <ConnectWordpress variant="quiet" /> : undefined
            }
          />
        )}

        {agentId === "aeo" && runGate.ok && (
          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-base font-semibold text-ink">Run an AEO audit</h2>
            <p className="mt-1 max-w-prose text-sm text-ink-soft">
              We fetch your pages the way ChatGPT, Perplexity and Google&apos;s AI results do, then
              score what they can read, trust and quote — and rank what to fix first. You can
              include your subdomains.
            </p>
            <Link
              href="/agents/aeo/audit"
              className="mt-3 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-ground transition hover:bg-accent-ink motion-reduce:transition-none"
            >
              Start an audit
            </Link>
          </div>
        )}

        {/* The campaign has actually gone to the executor by the time this
            page is reached with `?launched=1` — the end of the flow, after the
            plan, the automation-mode dialog and the details form. The banners
            below stay on the page; this says it once, in front. */}
        {/* Ad agents only: Lead Qualification also lands on `?launched=1`, and
            "your Lead Qualification portal" is not a thing. */}
        {launched && AD_AGENTS.includes(agentId) && <CampaignCreatedDialog platform={definition.name} summary={launchSummary} />}
        {/* The campaign launched: its setup draft has done its job. */}
        {launched && <ForgetFormDraft draftKey={draftKey} />}

        {launched && !unsaved && (
          <FlashNotice clear={["unsaved"]} className="rounded-lg bg-good-soft px-4 py-3 text-sm text-good">
            <span className="font-medium">Agent launched.</span> It reports what it does here as it
            goes.
          </FlashNotice>
        )}

        {/* What the mail service flagged about the run (a lead list cut short,
            say) — carried here by `runLeadQualification` from the send reply. */}
        {launched && runWarnings.length > 0 && (
          <FlashNotice clear={["warn"]} className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-ink">
            <p className="font-medium text-warn">Worth checking</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-soft">
              {runWarnings.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </FlashNotice>
        )}

        {/* Launched, but the setup could not be stored. Said plainly and in
            that order: the campaign is running, and the only cost is that the
            form will not remember these answers. Reporting this as a failure
            was the bug — it told people a live campaign had not started. */}
        {launched && unsaved && (
          <FlashNotice clear={["unsaved"]} className="rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
            <span className="font-medium">Agent launched.</span> We couldn&apos;t save these
            settings for next time, so you may need to fill the form in again. The campaign itself
            is running.
          </FlashNotice>
        )}

        {/* Problems are split back out of the URL: the action redirects with
            them so the customer sees every problem at once, on the form they
            just filled in. */}
        {/* Step one of four. The rail is what tells someone that the button
            under this form does not spend money yet — three screens still
            stand between here and a charge. */}
        {campaignSubmitted && !launched && (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg border border-border bg-surface p-4">
            <div className="min-w-0 max-w-2xl">
              <p className="text-sm font-semibold text-ink">Sent to {definition.name}</p>
              <p className="mt-1 text-sm text-ink-soft">
                {submitted.launchedAt
                  ? `Your last campaign went out on ${new Date(submitted.launchedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}.`
                  : "Your last campaign has been sent."}{" "}
                It will show in your ad account once the platform has created it.
              </p>
            </div>
            <PendingLink
              href={`/agents/${agentId}?new=1`}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-ground transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
            >
              Set up another campaign
            </PendingLink>
          </div>
        )}

        {/* Ready means the setup is saved; the form here starts a CAMPAIGN.
            Said, so a Ready agent opening onto a form does not read as the
            setup having been lost. */}
        {/* Back from the ad-account picker. Said here, on the page they
            connected FOR, rather than on the Connections page they used to be
            dropped on. Only once the gate agrees, so a hand-typed
            `?connected=1` announces nothing. */}
        {connected === "1" && runGate.ok && needsAdSetup && agentId !== "openai-ads" && (
          <FlashNotice clear={["connected"]} className="rounded-lg bg-good-soft px-4 py-3 text-sm text-good">
            <span className="font-medium">{definition.name} account connected.</span> Set up your
            first campaign below.
          </FlashNotice>
        )}
        {accountPick === "unknown" && choosePickHref !== "" && (
          <p className="max-w-2xl rounded-lg bg-info-soft px-4 py-3 text-sm text-ink">
            We can&apos;t see which {definition.name} account your campaigns go to.
            You can carry on — if a campaign doesn&apos;t appear in your ad account,{" "}
            {choosePickHref.startsWith("/api/") ? (
              <a href={choosePickHref} className="font-medium underline underline-offset-2 hover:text-accent-ink">
                choose the account again
              </a>
            ) : (
              <Link href={choosePickHref} className="font-medium underline underline-offset-2 hover:text-accent-ink">
                choose the account again
              </Link>
            )}
            .
          </p>
        )}
        {/* The check could not be made. Not a block — an unanswered question
            is not a "no" (`agent-ads-gate.ts`) — but said, with a way to ask
            again, so a campaign that later fails is not a mystery. */}
        {connectionUnchecked && (
          <p className="max-w-2xl rounded-lg bg-info-soft px-4 py-3 text-sm text-ink">
            We couldn&apos;t check your {definition.name} connection just now. You can carry on, or{" "}
            {/* A refresh, not a link to this same page — the router would
                answer that from its 30s cache and the check would not run. */}
            <RefreshButton className="font-medium underline underline-offset-2 hover:text-accent-ink">
              check again
            </RefreshButton>
            .
          </p>
        )}
        {needsAdSetup && rowStatus === "ready" && (
          <p className="max-w-2xl rounded-lg bg-good-soft px-4 py-3 text-sm text-good">
            Your setup is saved. Start a new campaign below whenever you&apos;re ready.
          </p>
        )}
        {needsAdSetup && <CampaignSteps current="setup" steps={campaignStepsFor(agentId)} />}
        {/* The agent refused the setup (Instagram not linked, say). Said with
            its fix above the form, which still holds the answers. */}
        {needsAdSetup && blockedCard && <BlockingErrorCardView card={blockedCard} />}

        {needsAdSetup && agentId === "google-ads" && businessCheck.kind !== "ok" ? (
          <BusinessDetailsBlock check={businessCheck} />
        ) : needsAdSetup && agentId === "google-ads" ? (
          <GoogleAdsSetup
            action={launchGoogleAds}
            businessName={setupBusinessName}
            prefill={adsPrefill}
            problems={setupProblems}
            emailConnected={emailConnected}
            draftKey={draftKey}
            currency={setupCurrency}
          />
        ) : needsAdSetup && agentId === "meta-ads" && businessCheck.kind !== "ok" ? (
          <BusinessDetailsBlock check={businessCheck} />
        ) : needsAdSetup && agentId === "meta-ads" ? (
          <MetaAdsSetup
            action={launchMetaAds}
            businessName={setupBusinessName}
            prefill={adsPrefill}
            problems={setupProblems}
            emailConnected={emailConnected}
            draftKey={draftKey}
            currency={setupCurrency}
          />
        ) : needsAdSetup && agentId === "linkedin-ads" ? (
          <LinkedInAdsSetup
            action={launchLinkedInAds}
            businessName={setupBusinessName}
            problems={setupProblems}
            initial={linkedInDraft}
          />
        ) : needsAdSetup && agentId === "openai-ads" ? (
          // The key first, and INSTEAD of the form. Unlike the other three,
          // this agent has no OAuth grant behind it — without a key there is
          // nothing to plan a campaign with, so collecting a budget and a date
          // range first would be seven fields taken on false pretences.
          openAiKey === null ? (
            <OpenAiKeyForm action={saveOpenAiKey} problems={setupProblems} />
          ) : (
            <>

              <OpenAiKeyForm
                action={saveOpenAiKey}
                problems={[]}
                keySaved
                forgetAction={forgetOpenAiKey}
                account={openAiAccount}
                // The live read when it answered, else what the key save said.
                conversionEventCount={
                  conversions?.events ? conversions.events.length : (openAiAccount?.conversionEventCount ?? 0)
                }
              />
              {/* Prefilled from what the app already knows, and editable.
                  The service requires all three, and a description nobody read
                  produces an advert about a business they do not recognise. */}
              <OpenAiAdsSetupForm
                action={launchOpenAiAds}
                problems={setupProblems}
                countries={countries}
                today={today}
                brandName={adsPrefill.businessName ?? profile?.businessName ?? ""}
                businessDescription={adsPrefill.service ?? ""}
                destinationUrl={profile?.websiteUrl ?? ""}
                // `null` when the read FAILED, `[]` when the account genuinely
                // has none. Collapsing the two told an account with eight
                // conversions it had none.
                conversionEvents={conversions === null ? null : (conversions.events ?? [])}
                currency={openAiAccount?.currency}
                // Leads and App installs need a conversion event to optimise
                // for: offered only when the account has one, by either read.
                conversionGoals={
                  (conversions?.events?.length ?? 0) > 0 ||
                  (openAiAccount?.conversionEventCount ?? 0) > 0
                }
                emailConnected={emailConnected}
              />
            </>
          )
        ) : needsLeadSetup ? (
          <LeadQualificationSetup
            action={runLeadQualification}
            emailTemplate=""
            problems={setupProblems}
            adsSummary={adsSummary}
          />
        ) : agentId === "lead-qualification" ? (
          <>
            {/* Only while a campaign exists to control. A pause button over
                nothing invites someone to stop a run that already finished. */}
            {campaign && (
              <div className="mb-4">
                <CampaignControls
                  state={campaign.state}
                  startedAt={campaign.startedAt}
                  onControl={controlLeadCampaign}
                />
              </div>
            )}
            {/* Real rows, from the agent's own table — this page used to show
                the demo business's fixture activity instead. */}
            <LeadActivityTable
              rows={leadActivity}
              // Only offered while a campaign is running — see the note on the
              // table.
              onStopRecipient={campaign ? stopLeadRecipients : undefined}
            />
          </>
        ) : writerState ? (
          <WriterWorkspace state={writerState} approveDraft={approveWriterDraft} />
        ) : codingState ? (
          <CodingWorkspace state={codingState} approveAndShip={approveAndShipPr} />
        ) : (
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold text-ink-soft">
            Activity — every action this agent took, newest first
          </div>
          {state.runs.length === 0 ? (
            <div className="flex items-center gap-3 p-4 text-sm text-ink-soft">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft/60 text-accent-vivid">
                <ClockCounterClockwise aria-hidden="true" className="size-5" />
              </span>
              <span>
              {/* Three different silences, and they are not the same thing to
                  someone waiting: blocked on a connection, never started, or
                  started with nothing reported back yet. The last one used to
                  be filled with the demo business's fixture activity, which
                  showed a real customer someone else's work as their own. */}
              {state.blockedReason ??
                (state.status === "ready"
                  ? "Activated. Activity appears here once this agent's automation reports back."
                  : "No activity yet.")}
              </span>
            </div>
          ) : (
            state.runs.map((run) => (
              <div key={run.runId} className="border-b border-border p-4 last:border-b-0">
                <div className="mb-3 text-xs font-mono text-ink-soft">
                  {run.runId.toUpperCase()} · {run.date}
                </div>
                <div className="space-y-3">
                  {run.entries.map((entry, i) => (
                    <div key={i} className="flex items-start justify-between gap-4 text-sm">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 font-mono text-xs text-ink-soft">
                          {entry.time}
                        </span>
                        <div>
                          <div className="font-medium text-ink">{entry.title}</div>
                          <div className="text-ink-soft">{entry.detail}</div>
                        </div>
                      </div>
                      <Badge variant={TAG_VARIANT[entry.tag] ?? "verdict-keep"}>
                        {entry.tag}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
        )}
        </div>
      </PageContainer>
    </>
  );
}

/**
 * The page's own reads sit behind a boundary so the frame does not wait on
 * them. Without it the whole screen — header, tabs, rail — was held back until
 * the slowest backend read landed, and a click showed the previous page for
 * the entire wait. See the note on `PageShell`; this is NOT a route-level
 * `loading.tsx` (rule 0).
 */
export default function AgentWorkspacePage(props: Parameters<typeof AgentWorkspacePageBody>[0]) {
  return (
    <PageShell activeTab="/agents" currentStageId="agents">
      <Suspense fallback={<PageLoading title="Agent workspace" />}>
        <AgentWorkspacePageBody {...props} />
      </Suspense>
    </PageShell>
  );
}
