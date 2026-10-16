import { readSignedText } from "@/lib/signed-text";
import { FlashNotice } from "@/components/ui/flash-notice";

/**
 * What happened when someone came back from Google.
 *
 * The callback sets `?google=connected|pending|failed` (plus `message` on
 * failure), and until this existed nothing rendered it — so the entire point of
 * the round trip, telling the person whether it worked, was invisible.
 *
 * Three states, deliberately:
 *
 *   connected  the status row is already written; data follows shortly
 *   pending    consent succeeded but the row has not landed yet. NOT an error —
 *              n8n redirects as soon as it stores the tokens, while the
 *              `Google_website_Frontend_check` row is written downstream, so
 *              this is the normal case for the first few seconds
 *   unselected connected, but no property or site chosen, so nothing will come
 *   failed     n8n said so explicitly, and usually said why
 *
 * The failure text comes from n8n ("No Google Analytics properties found for
 * this account") and is shown as-is. It is written for a person and names the
 * actual cause, which is more use than anything generic we could substitute.
 */

const TONE = {
  connected: {
    wrap: "border-good/30 bg-good-soft",
    label: "text-good",
    title: "Google connected",
    body: "Your Search Console and Analytics data will appear here shortly.",
  },
  pending: {
    wrap: "border-info/30 bg-info-soft",
    label: "text-info",
    title: "Google connected — still syncing",
    body: "Approval went through. The first data usually lands within a minute or two.",
  },
  /**
   * Connected, but no property or site was chosen — "Decide later", or a
   * picker whose list had lapsed. It used to land on `pending`, which
   * promised data "within a minute or two" that could never arrive without a
   * choice (audit, 2026-09-29).
   */
  unselected: {
    wrap: "border-warn/30 bg-warn-soft",
    label: "text-warn",
    title: "Google connected — nothing chosen yet",
    body: "No data will appear until you choose which Analytics property or Search Console site to use. Connect Google again from Connections to choose one.",
  },
  failed: {
    wrap: "border-crit/30 bg-crit-soft",
    label: "text-crit",
    title: "Couldn't connect Google",
    body: "Nothing was changed on your account. You can try again from the banner above.",
  },
} as const;

export type GoogleConnectState = keyof typeof TONE;

/**
 * Where the Google connect flow returns the customer.
 *
 * The dashboard, not the website audit. Connecting Analytics or Search Console
 * is done so their NUMBERS appear, and the dashboard is the only screen that
 * shows them — landing on the audit meant the one thing they had just enabled
 * was on a different page, with nothing saying so.
 *
 * Exported as a constant because four separate places redirect here — the
 * callback route, the picker page, and two branches of the picker's action —
 * and they have to agree. Whoever changes it changes it once.
 */
export const GOOGLE_RESULT_PATH = "/analytics";

export function isGoogleConnectState(value: unknown): value is GoogleConnectState {
  return value === "connected" || value === "pending" || value === "unselected" || value === "failed";
}

export function GoogleConnectResult({
  state,
  message,
}: {
  state: GoogleConnectState;
  message?: string;
}) {
  const tone = TONE[state];

  return (
    <FlashNotice
      role={state === "failed" ? "alert" : "status"}
      clear={["google", "message"]}
      className={`mb-6 rounded-lg border p-4 ${tone.wrap}`}
    >
      <p className={`text-sm font-medium ${tone.label}`}>{tone.title}</p>
      {/* n8n's own words when it gave any, ours otherwise. */}
      <p className="mt-0.5 max-w-prose text-sm text-ink">
        {state === "failed" ? (readSignedText(message) ?? tone.body) : tone.body}
      </p>
    </FlashNotice>
  );
}
