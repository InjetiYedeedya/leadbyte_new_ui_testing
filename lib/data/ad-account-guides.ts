/**
 * The two "create an ad account" guides shown on the Google Ads and Meta Ads
 * agent pages when the customer says they do not have an account yet.
 *
 * Pure data, ported verbatim from the legacy app's `GoogleAdAccountGuide.jsx`
 * and `MetaAdAccountGuide.jsx`. Text only: the legacy screenshots were
 * removed on request (2026-09-29).
 */

export type GuideStep = {
  n: number;
  title: string;
  body: string;
  bullets?: string[];
  note?: string;
};

export type AdAccountGuide = {
  /** The platform as the customer knows it, for "Do you have a … account?". */
  platform: string;
  title: string;
  intro: string;
  parts: { heading?: string; steps: GuideStep[] }[];
  /** Closing reminders, repeated from the steps they belong to. */
  notes?: string[];
};

export const GOOGLE_ADS_GUIDE: AdAccountGuide = {
  platform: "Google Ads",
  title: "Create a Google Ads account",
  intro:
    "Follow these steps to create a Google Ads account without setting up a campaign yet. You can always create your first campaign later from the dashboard.",
  parts: [
    {
      steps: [
        {
          n: 1,
          title: "Open Google Ads and create a new account",
          body: 'Go to https://ads.google.com and click "Create a New Google Ads Account."',
        },
        {
          n: 2,
          title: "Complete the basic business information",
          body: "Enter your business name and where people should go after clicking your ad (your website, phone number, or app), then continue.",
        },
        {
          n: 3,
          title: "When prompted to create your first campaign, click Skip",
          body: 'Google walks you into campaign creation automatically — you don\'t need it yet. Use the "Skip" link to move on.',
        },
        {
          n: 4,
          title: "Skip the business profile / connect-accounts setup",
          body: 'On the "Connect accounts" / business profile step (YouTube, Google Business Profile, phone number), click "Skip" if you don\'t want to configure it now.',
        },
        {
          n: 5,
          title: "Skip any additional setup suggestions",
          body: "Keep skipping the remaining campaign-type and setup suggestions until you can exit.",
        },
        {
          n: 6,
          title: 'Click "Leave campaign creation"',
          body: 'In the confirmation dialog, choose "Leave campaign creation" to reach the Google Ads dashboard without creating a campaign.',
        },
        {
          n: 7,
          title: "Confirm your account settings",
          body: "Complete your billing information by selecting your Billing Country, Time Zone, and Currency. Click Continue.",
          note: "Your billing country, time zone, and currency cannot be changed after the account is created — choose carefully.",
        },
        {
          n: 8,
          title: "Add a payment method and submit",
          body: "Add your preferred payment method, review the details, and click Submit to activate your Google Ads account.",
          note: "Choose the correct payment profile before submitting.",
        },
      ],
    },
  ],
  notes: [
    "Your billing country, time zone, and currency cannot be changed after the account is created.",
    "Choose the correct payment profile before submitting.",
    "You can create your first campaign later from the Google Ads dashboard.",
  ],
};

export const META_ADS_GUIDE: AdAccountGuide = {
  platform: "Meta Ads",
  title: "Create a Meta ad account",
  intro:
    "This guide walks through linking your Instagram account to Facebook, and then creating a new Meta ad account through Meta Business Suite — from initial login through final account creation.",
  parts: [
    {
      heading: "Part 1 — Link your Instagram account on Facebook",
      steps: [
        {
          n: 1,
          title: "Open facebook.com",
          body: "Go to facebook.com in your browser and log in with the Facebook profile you use for your business, then switch the profile to your business Page (or the one connected to your Page).",
          bullets: [
            "Use the same Facebook login you use to manage your business Page — this keeps all your linked accounts and permissions in one place.",
            "If you manage the account for a client, make sure you're logged into the correct profile before continuing.",
          ],
        },
        {
          n: 2,
          title: 'Click on "Settings & privacy"',
          body: 'From your Facebook home screen, click your profile icon (top-right corner) to open the account menu, then select "Settings & privacy."',
          bullets: [
            "On desktop this menu is under the down-arrow next to your profile picture.",
            'On mobile, tap the menu icon (☰) and scroll down to "Settings & privacy."',
          ],
        },
        {
          n: 3,
          title: 'Click on "Settings"',
          body: 'The "Settings & privacy" menu expands into a submenu — click "Settings" to open the full Facebook Settings page.',
          bullets: [
            "This takes you to the main Settings dashboard, organized into sections down the left-hand side (General, Security, Permissions, etc.).",
          ],
        },
        {
          n: 4,
          title: 'Under "Permissions," click "Linked accounts" and check Instagram',
          body: 'In the left-hand menu, find the "Permissions" section and click "Linked accounts." Check whether Instagram already shows as linked.',
          bullets: [
            "If Instagram is already listed as linked, no further action is needed here — move on to Part 2.",
            'If it is not linked, click "Link" or "Connect" next to Instagram and log in with your Instagram credentials to complete the connection.',
          ],
          note: "Linking Instagram here ensures your Instagram account can later be added as a business asset inside Meta Business Suite, which is required if you plan to run Instagram ads.",
        },
      ],
    },
    {
      heading: "Part 2 — Create a new Meta ad account",
      steps: [
        {
          n: 5,
          title: "Log in to Meta Business Suite",
          body: "Go to business.facebook.com and log in with the Facebook profile linked to your business. A personal facebook.com login also works — you'll be routed into your Business Portfolio automatically.",
        },
        {
          n: 6,
          title: "Open Meta Business Suite",
          body: "From your Business Portfolio home, select your Page and open Meta Business Suite. This is your central hub for managing Pages, ad accounts, and other business assets.",
        },
        {
          n: 7,
          title: "Open Business Settings",
          body: "Click the profile/portfolio dropdown at the top of Meta Business Suite, then click the gear icon to open Business Settings.",
        },
        {
          n: 8,
          title: "Go to Accounts → Ad accounts",
          body: 'In the left-hand menu, click "Accounts," then select "Ad accounts" from the list.',
        },
        {
          n: 9,
          title: 'Click "+ Add"',
          body: 'In the top-right corner of the Ad accounts panel, click the "+ Add" button.',
        },
        {
          n: 10,
          title: 'Select "Create a new ad account"',
          body: 'A window opens with three options — create a new account, claim an existing one, or request access. Choose "Create a new ad account."',
        },
        {
          n: 11,
          title: "Enter account details",
          body: "Give the account a descriptive name, then set the time zone and currency. Click Next when done.",
          note: "Choose the time zone and currency carefully — these cannot be changed later without creating a brand-new account and losing all historical data.",
        },
        {
          n: 12,
          title: "Choose who the account is for",
          body: 'Select "My business" if you\'ll run ads for your own business, or "A client or another business" if you\'re managing ads on their behalf. This sets the correct permission structure. Click Next.',
        },
        {
          n: 13,
          title: "Review terms and create",
          body: 'Review the account details, read Meta\'s Business Terms, check the box to agree, then click "Create ad account" to finish.',
          note: "After creation, add a payment method under Billing before launching any campaigns — an ad account cannot deliver ads without one.",
        },
      ],
    },
  ],
};

/** Which agents ask the question, and the guide each one shows on "No". */
export function adAccountGuideFor(agentId: string): AdAccountGuide | null {
  if (agentId === "google-ads") return GOOGLE_ADS_GUIDE;
  if (agentId === "meta-ads") return META_ADS_GUIDE;
  return null;
}

/**
 * Whether `?account=no` asked for the "how to create an account" guide.
 *
 * There used to be a "Do you have an account?" question in front of the
 * Connect button, and this read its yes/no. The question went on 2026-09-30
 * (product notes: after paying, Google Ads should go straight to connecting),
 * so Connect is shown at once and the guide sits behind a small link that
 * still uses `?account=no` — old links keep working. Anything else, including
 * the old `?account=yes`, shows the Connect card.
 */
export function wantsAccountGuide(value: string | string[] | undefined): boolean {
  return value === "no";
}
