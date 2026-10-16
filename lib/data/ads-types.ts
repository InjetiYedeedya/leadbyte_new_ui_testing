/**
 * The shapes the ChatGPT Ads service sends and accepts.
 *
 * Types only — no runtime code, so this is safe to import from anywhere,
 * including a client island that needs to render an `Advice` it was handed as a
 * prop.
 *
 * ## Why almost everything is optional
 *
 * These are declarations of what we HOPE arrives, not guarantees. Every one was
 * written from a capture in the contract, but a capture is one response from
 * one moment, and the parsers in `ads-*.ts` are what actually enforce shape.
 * Marking a field required here would only move a missing value from a check we
 * wrote to a `TypeError` at render.
 */

export type AdsGoal = "awareness" | "traffic" | "leads" | "app" | "sales";
export type AdsBudgetType = "daily" | "lifetime";
/** `website` is OUR old spelling; the service says `web`. */
/**
 * The three surfaces the platform sells.
 *
 * Briefly five (`android_web`, `desktop_web`, `ios_web` as well), split out of
 * a screenshot of the picker on the theory that an in-app and a mobile-web
 * placement are bought separately. They are not: the service takes one `web`
 * covering every browser, and the two app surfaces. The extra three were ids
 * it does not know, and an unknown id is a silently narrower audience rather
 * than an error — which is why they are gone rather than kept as aliases.
 */
export type AdsPlatform = "android_app" | "ios_app" | "web";
export type AdsAdType = "full" | "semi";
export type AdsStatus = "active" | "paused";

/** Returned, never sent. The service decides these from the goal and tracking. */
export type AdsObjective = "awareness" | "traffic" | "conversions";
export type AdsBidStrategy = "maximize_results" | "max_cpm" | "max_cpc";

/**
 * Three states, not two.
 *
 * `awaiting` is the one people miss: a pixel that EXISTS is not a pixel that
 * works — someone still has to put it on the customer's website. Showing a tick
 * for it means an account that will never optimise for conversions and nobody
 * looking into why.
 */
export type TrackingState = "none" | "awaiting" | "receiving";

export interface WhoAmI {
  authenticated?: boolean;
  caller?: { user_id?: string; scope?: "client" | "service"; via?: string };
  user_id?: string;
}

/** One line of the connect screen's tick-list. */
export interface AdsCheck {
  key?: string;
  ok?: boolean;
  value?: string;
  /**
   * Not a pass/fail — a fact worth stating.
   *
   * The service marks its `tracking` check this way, and its own comment says
   * why: the platform does not report whether conversion tracking exists, so
   * that row echoes what WE told it rather than verifying anything. Rendered as
   * a failure it would look like a broken account, and treated as blocking it
   * would stop a perfectly good campaign that simply optimises for clicks.
   */
  informational?: boolean;
}

export interface AdsAccount {
  account_id?: string;
  name?: string;
  status?: string;
  review_status?: string;
  currency?: string;
  timezone?: string;
}

export interface VerifyResult {
  valid?: boolean;
  /** The one that gates the Next button. */
  usable?: boolean;
  /** Always null — the platform does not expose it. Never render a zero here. */
  balance?: number | null;
  account?: AdsAccount;
  checks?: AdsCheck[];
  /**
   * A two-letter country guessed from the account timezone, which the customer
   * confirms — never applied silently. Used to prefill the setup form's target.
   */
  country_suggested?: string;
}

export interface StoredKey {
  user_id?: string;
  email?: string;
  /** The only part of the key that ever comes back. Show this, never a full key. */
  last_four?: string;
  label?: string;
  added_at?: string;
  last_used_at?: string;
  verified_at?: string;
  has_key?: boolean;
}

export interface SaveKeyResult {
  saved?: boolean;
  key?: StoredKey;
  checks?: AdsCheck[];
  /** id, name, currency, timezone — read while the key was in hand. */
  account?: AdsAccount;
  /**
   * Read on the same trip, so stage 4 does not have to decrypt the key again.
   * Worth keeping on the session for that reason alone.
   */
  conversion_events?: ConversionEvent[];
}

export interface KeysResult {
  user_id?: string;
  backend?: string;
  keys?: StoredKey[];
}

export interface TrackingResult {
  state?: TrackingState;
  usable?: boolean;
  pixel_count?: number;
  event_setting_count?: number;
  /** The ids to send as `conversion_event_setting_ids` on a campaign. */
  event_setting_ids?: string[];
  explanation?: string;
  next_step?: string;
  /**
   * **Read this, not the status code.**
   *
   * A platform refusal is a 200 with `created: false` — an outcome, not an
   * error. Treating the 200 as success would report a conversion that does not
   * exist and then optimise a campaign for it.
   */
  created?: boolean;
  /**
   * What to offer when `created` is false: `retry`,
   * `continue_without_tracking`, `change_goal`. A choice for the customer.
   */
  options?: string[];
  /**
   * The pixel — the data source the events hang off.
   *
   * Reused rather than recreated across calls: two pixels on one site split
   * attribution.
   */
  pixel?: { id?: string; pixel_id?: string; client_type?: string };
  /** What was created this call. */
  event_settings?: {
    id?: string;
    event_type?: string;
    attribution_window_days?: number;
    source_ids?: string[];
  }[];
  /**
   * What the customer has to install. **Always shown when created.**
   *
   * `state` comes back `awaiting`, never `receiving` — created is NOT working,
   * somebody still has to put the code on the site. A tick with no
   * instructions beside it is a conversion nobody will ever fire.
   */
  instructions?: string[];
  /** Why the platform refused. Present with `created: false`. */
  error?: string;
  /** The service's own reassurance, and it is true — we never block on this. */
  campaign_can_still_run?: boolean;
}

/** `conversion_document` — the install document for the site. */
export interface ConversionDocumentResult {
  document?: string;
  url?: string;
  format?: string;
  events?: string[];
}

export interface WebsiteRead {
  url?: string;
  final_url?: string;
  title?: string;
  meta_description?: string;
  headings?: string[];
  text_length?: number;
  excerpt?: string;
  /** The summary written for the copywriter. The best source for a description. */
  brief?: string;
  /** Null when no `user_id` was sent. We always send one, so this should be set. */
  saved?: { user_id?: string; website_url?: string; backend?: string } | null;
}

export interface StoredSite extends WebsiteRead {
  website_url?: string;
  brand_name?: string;
  fetched_at?: string;
  updated_at?: string;
}

export interface WebsiteDataResult {
  user_id?: string;
  backend?: string;
  sites?: StoredSite[];
  /** Present instead of `sites` when one `website_url` was asked for and missed. */
  found?: boolean;
  website_url?: string;
}

/**
 * One targeted place, exactly as the ads service takes it.
 *
 * `country` is always present; the rest appear only at the level the customer
 * actually targeted. Full names only — "United States", never "USA": the
 * service rejects abbreviations with a 422.
 */
export interface ApiLocation {
  country: string;
  state?: string;
  city?: string;
  /** Sent INSTEAD of state and city, not alongside them. */
  postal_code?: string;
}

/** The smaller campaign object `advise` takes — not the full `prepare` request. */
export interface AdviseCampaign {
  goal: AdsGoal;
  budget_type: AdsBudgetType;
  budget_amount: number;
  /**
   * One-line labels, NOT the request's `ApiLocation` objects: this handler
   * joins the list as strings. See `toLocationLabels`.
   */
  locations: string[];
  start_date: string;
  end_date: string;
  /** From `tracking_status`, never guessed — it changes what the goal becomes. */
  tracking_connected: boolean;
}

export interface AdsRecommendation {
  /** Matches one of our form field names, or is reported in `ignored`. */
  field?: string;
  suggested?: unknown;
  current?: unknown;
  why?: string;
  confidence?: string;
}

/**
 * How the customer will actually be charged.
 *
 * `needs_bid_amount` is the field the form reads: `false` means bidding is
 * automatic and a bid input is not merely optional, it is unwanted.
 */
export interface AdsBidding {
  strategy?: AdsBidStrategy;
  label?: string;
  automatic?: boolean;
  needs_bid_amount?: boolean;
  charged_for?: string;
  how_it_works?: string;
  you_control?: string;
  platform_controls?: string;
  good_when?: string;
  watch_out_for?: string;
  alternatives?: AdsBiddingAlternative[];
}

export interface AdsBiddingAlternative {
  strategy?: AdsBidStrategy;
  label?: string;
  automatic?: boolean;
  needs_bid_amount?: boolean;
  instead?: string;
  trade_off?: string;
  recommended?: boolean;
}

export interface AdviseResult {
  headline?: string;
  objective_rationale?: string;
  recommendations?: AdsRecommendation[];
  risks?: string[];
  questions?: string[];
  /** Empty on round 1; on a follow-up it answers what the customer typed. */
  reply?: string;
  /** Suggestions dropped for naming fields we do not have. */
  ignored?: string[];
  round?: number;

  objective?: AdsObjective;
  bid_strategy?: AdsBidStrategy;
  billing_basis?: string;
  /**
   * The goal could not be delivered and something safer was chosen.
   * Say so plainly — this is money.
   */
  downgraded?: boolean;

  bidding?: AdsBidding;
  /** Opaque. Send it back unchanged or the model starts over and repeats itself. */
  history?: unknown[];
}

export interface GenerateBrief {
  brand_name: string;
  website_url?: string;
  goal: AdsGoal;
  /** One-line labels, for the same reason as `AdviseCampaign.locations`. */
  locations?: string[];
  /**
   * The surfaces this campaign buys, as picked on the setup form.
   *
   * The same array `prepare` and `create` take. Sent because an advert that
   * only ever runs in a phone app is written differently from one on desktop
   * web, and the brief carried no hint of which — the copy was written for an
   * unspecified surface and then run on whichever three were ticked. Omitted
   * rather than sent empty when nothing was chosen.
   */
  platforms?: AdsPlatform[];
  /**
   * Destinations, supplied only when `generate` came back asking for them.
   *
   * These spellings are the contract twice over: they are what the brief takes
   * AND what `destination.missing` names, so a missing entry maps straight onto
   * the field that answers it with no translation table in between.
   */
  app_store_url?: string;
  play_store_url?: string;
  destination_url?: string;
  /** Semi only: the copy is written to match the picture. */
  image_url?: string;
}

export interface GenerateResult {
  title?: string;
  title_length?: number;
  description?: string;
  description_length?: number;
  /** The only targeting this platform has. */
  topics?: string[];
  campaign_name?: string;
  ad_group_name?: string;
  ad_name?: string;
  /** 2 means the first draft was too long. Worth showing; never blocking. */
  attempts?: number;
  notes?: string[];
  brief_source?: "stored" | "fetched" | "supplied";
  matched_to_image?: boolean;
  /** Where the advert sends people — see `GenerateDestination`. */
  destination?: GenerateDestination;
}

/**
 * Where the advert sends people, worked out from the platforms it runs on.
 *
 * One platform needs one URL and the campaign uses it directly (`kind:
 * "single"`). Two or more need one link per surface, and the service mints a
 * `smart_link` that sends each visitor to the right one.
 *
 * Two rules from the contract, and both are about not stranding a platform:
 *
 * - **No `dynamic_url` is issued while anything is `missing`.** A link built
 *   from two destinations when three were meant silently drops a surface, and
 *   nothing downstream would report it.
 * - **The link is minted once**, stored against its three destinations, so
 *   redrafting the copy ten times returns the same link (`reused: true`) and
 *   `create` reuses it rather than splitting the campaign's reporting across
 *   two.
 *
 * Store URLs are looked up from `brand_profile.app_stats`, so `missing` is
 * empty for a business we already know — it appears only when we do not.
 */
export interface GenerateDestination {
  kind?: "smart_link" | "single";
  /** False means `missing` names what to collect before anything can be built. */
  ready?: boolean;
  /**
   * Field names from `GenerateBrief`, verbatim — `app_store_url`,
   * `play_store_url`, `destination_url`. Send them back in the brief.
   */
  missing?: string[];
  /** True when more than one surface is targeted and a smart link is required. */
  needs_dynamic_url?: boolean;
  /** The minted smart link. Absent while anything is `missing`. */
  dynamic_url?: string;
  /** What the campaign will actually use: the smart link, or the single URL. */
  url?: string;
  ios_url?: string;
  android_url?: string;
  web_url?: string;
  /** True when this link already existed and was not minted again. */
  reused?: boolean;
  /** The surfaces the link has to cover — `ios`, `android`, `web`. */
  platforms_need?: string[];
  /** Advisory. Shown, never blocking. */
  warnings?: string[];
  /**
   * Why a device-aware link could not be made. Present only on failure.
   *
   * Dropped silently until 2026-09-22 — the field was not on this type, so the
   * one sentence explaining a failed mint never reached the screen or the log,
   * and a failure was indistinguishable from a success that happened to point
   * at the website.
   */
  error?: string;
}

export interface ImageRequest {
  product_description: string;
  business_name: string;
  business_type?: string;
  logo_url?: string;
  email?: string;
  goal?: AdsGoal;
  ratio?: "1:1" | "4:5" | "16:9" | "9:16";
  s3_folder_link?: string;
  /** Leave empty and the pipeline writes its own. */
  selected_prompt?: string;
}

export interface ImageJob {
  job_id?: string;
  output_filename?: string;
  bucket?: string;
  /** Load-bearing: both how status is checked and what `create` needs. */
  output_key?: string;
  business_name?: string;
  ratio?: string;
  started_at?: string;
  state?: string;
  next_step?: string;
}

export interface ImageStatus {
  state?: string;
  bucket?: string;
  key?: string;
  job_id?: string | null;
  size_bytes?: number;
  content_type?: string;
  last_modified?: string;
}

/**
 * The campaign, exactly as `prepare` and `create` take it.
 *
 * The only place in this file where fields are REQUIRED, because this one we
 * send: the compiler is the cheapest place to find a missing `destination_url`,
 * and the alternative is a 422 round trip.
 */
export interface AdsCampaignRequest {
  goal: AdsGoal;
  budget_type: AdsBudgetType;
  budget_amount: number;
  locations: ApiLocation[];
  exclude_locations: ApiLocation[];
  platforms: AdsPlatform[];
  brand_name: string;
  /** 40+ characters of prose. Keywords alone produce weak topics and copy. */
  business_description: string;
  destination_url: string;
  start_date: string;
  end_date: string;
  ad_type: AdsAdType;
  /** Semi only. Omitted entirely for full — the contract forbids it there. */
  image_url?: string;
  /**
   * The other destinations, and the link `generate` already minted.
   *
   * These were MISSING until 2026-09-21, and their absence is why every stored
   * campaign had `dynamic_url: ''`. `destination_url` alone describes one
   * surface; a three-platform campaign arrived with the website and nothing
   * else, so the service re-resolved the destination, found one usable link,
   * set `needs_smart_link` false and never called 1link.
   *
   * `smart_link_url` matters as much as the two store links: the service mints
   * a link ONCE and keys it on its destinations, so sending the one `generate`
   * already returned is what keeps a campaign's reporting in one place instead
   * of minting a second for the same three destinations.
   */
  app_store_url?: string;
  play_store_url?: string;
  smart_link_url?: string;
  /**
   * Which conversions this campaign reports against. Offered on every goal.
   *
   * **Always sent, empty array included.** Without it a leads/sales/app
   * campaign RUNS — as a clicks campaign — because the service warns rather
   * than failing, which is exactly why its absence went unnoticed. An empty
   * array says "none apply"; an absent key would be indistinguishable from a
   * campaign built before the picker existed.
   */
  conversion_event_setting_ids: string[];
  /**
   * The strategy the customer picked, in the service's own vocabulary.
   *
   * Sent because it was missing: a Traffic campaign bid at "Maximum CPC"
   * arrived with no strategy AND no amount, so the service had nothing to
   * distinguish it from automatic bidding (2026-09-17). Omitted for a strategy
   * the service has no published name for — Conversions' manual bid — where
   * `bid_amount` alone is what separates manual from automatic.
   */
  bid_strategy?: AdsBidStrategy;
  /** Required by every manual strategy. Null, never 0 — a zero bid is a bid. */
  bid_amount: number | null;
  headline: string;
  description: string;
  context_hints: string[];
  /** Default false. Without it the campaign is created PAUSED. */
  launch_immediately: boolean;
}

export interface PrepareResult {
  objective?: AdsObjective;
  bid_strategy?: AdsBidStrategy;
  billing_basis?: string;
  downgraded?: boolean;
  bidding?: AdsBidding;
  title?: string;
  title_length?: number;
  description?: string;
  description_length?: number;
  topics?: string[];
  locations_resolved?: number;
  platforms?: AdsPlatform[];
  /**
   * Plain currency, the same units we sent. `500` means 500.
   *
   * This carried a "MILLIONTHS — `500000000` is $500, never render this"
   * warning until 2026-09-21, which was simply wrong: a live run sent
   * `budget_amount: 500` and got `lifetime_budget: 500` back. Nothing read
   * these fields, so the error never reached a screen — but the next person to
   * render one would have divided by a million and printed $0.0005.
   */
  lifetime_budget?: number | null;
  /** Plain currency, same as above. */
  daily_budget?: number | null;
  bid_amount?: number | null;
  target_url?: string;
  warnings?: string[];
  notes?: string[];
}

export interface CreateResult {
  campaign_id?: string;
  ad_group_id?: string;
  ad_id?: string;
  file_id?: string;
  /**
   * The human names the platform assigned — what the customer should see, since
   * the ids are opaque. `campaign_name` is the one worth showing.
   */
  campaign_name?: string;
  ad_group_name?: string;
  ad_name?: string;
  title?: string;
  description?: string;
  /** Where the advert sends people — the one URL in the reply worth linking. */
  target_url?: string;
  /** Read this. Do not assume — it is `paused` unless `launch_immediately`. */
  status?: string;
  review_status?: string;
  warnings?: string[];
  saved?: { user_id?: string; campaign_id?: string };
}

export interface StoredCampaign {
  campaign_id?: string;
  ad_group_id?: string;
  ad_id?: string;
  name?: string;
  goal?: AdsGoal;
  objective?: AdsObjective;
  status?: string;
  budget_type?: AdsBudgetType;
  budget_amount?: number;
  website_url?: string;
  title?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  created_at?: string;
}

export interface CampaignsResult {
  user_id?: string;
  backend?: string;
  campaigns?: StoredCampaign[];
}

export interface ReportRow {
  date?: string;
  impressions?: number;
  clicks?: number;
  spend?: number;
  /** Worked out for us, not from the platform. */
  ctr?: number;
  cpc?: number;
  cpm?: number;
}

/* ── Stage 2: the goal / objective / bidding lookup ──────────────────── */

/**
 * One bid strategy, as `campaign_options` describes it.
 *
 * Read defensively and rendered from the ANSWER, never from a table of our
 * own. A hardcoded copy was written first (2026-09-15) and is exactly the kind
 * of thing that silently drifts: the service owns which strategies an
 * objective offers, which one is recommended, and what the amount is called.
 */
export interface BidStrategyOption {
  id?: string;
  label?: string;
  /** Whether to show the amount input at all. */
  needs_bid_amount?: boolean;
  /** The label for that input, in the service's own words. */
  bid_prompt?: string;
  /** Preselect this one. */
  recommended?: boolean;
}

export interface GoalOption {
  id?: string;
  label?: string;
  /**
   * What the goal becomes — `reach`, `clicks`, `conversions`.
   *
   * A string, not `AdsObjective`: that union is the older
   * awareness/traffic/conversions spelling, and forcing this into it would
   * rename the answer on the way in. The screen shows what the service said.
   */
  objective?: string;
  /**
   * True when the objective was reduced because tracking is not connected —
   * "runs as clicks until tracking is connected". Say so on the card; a goal
   * that quietly does something else is the complaint this field prevents.
   */
  downgraded?: boolean;
  bid_strategies?: BidStrategyOption[];
}

export interface CampaignOptionsResult {
  goals?: GoalOption[];
}

/* ── Stage 4: conversion events ──────────────────────────────────────── */

export interface ConversionEvent {
  id?: string;
  event_type?: string;
  name?: string;
}

export interface ConversionEventsResult {
  events?: ConversionEvent[];
  /** False means a conversions campaign cannot be created at all. */
  has_events?: boolean;
}

/* ── Stage 5: the customer's own image ───────────────────────────────── */

export interface UploadImageResult {
  /** A link that works for SIX HOURS. Not a permanent home for the image. */
  image_url?: string;
  /** Carried all the way to `create`. */
  output_key?: string;
}
