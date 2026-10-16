/**
 * The "Connect Email" chooser: providers, the fields each one collects, and
 * the setup guides they link to.
 *
 * Client-safe by design — this is a plain catalogue, no secrets. The password
 * a form collects never lives here; it goes straight into the `connectEmail`
 * Server Action, which is the only place it reaches the backend.
 *
 * Two paths (see docs the backend team gave us, 2026-09-04):
 *
 *   Gmail   → OAuth. The browser is redirected to `/api/email/gmail`, which
 *             302s onward to the backend's `/api/oauth/gmail`. NO password is
 *             ever typed. n8n saves the tokens server-to-server.
 *   SMTP &  → the user types a mailbox password (and, for a custom server, the
 *   others    host/port). It is posted through our BFF Server Action to
 *             `POST /api/email/connect`, which encrypts and verifies it.
 *
 * `provider` is the exact string the backend expects: smtp | gmail | yahoo |
 * ionos (outlook is defined but dark — "coming soon", like the live app).
 */

export type EmailProviderId = "gmail" | "outlook" | "ionos" | "yahoo" | "smtp";

/** A field the credentials form collects for a manual (SMTP-path) provider. */
export interface EmailFormField {
  name: "host" | "port";
  label: string;
  placeholder: string;
}

/**
 * A manual provider — one that collects a password through the form and posts
 * to `/api/email/connect`. Gmail and Outlook are handled separately (OAuth and
 * disabled respectively) and are not `ManualProvider`s.
 */
export interface ManualProvider {
  /** The `provider` string sent to the backend. */
  id: Exclude<EmailProviderId, "gmail" | "outlook">;
  label: string;
  /** Shown under the label in the SMTP-provider list. */
  subtitle: string;
  /** The blue info banner above the form. */
  hint: string;
  /** External setup-guide link shown in the banner. */
  guideUrl: string;
  /**
   * Extra fields beyond email + password. IONOS and Yahoo need none — the host
   * is known from the provider. "Other" needs the host and port.
   */
  extraFields: EmailFormField[];
}

export const MANUAL_PROVIDERS: ManualProvider[] = [
  {
    id: "ionos",
    label: "IONOS",
    subtitle: "Connect your IONOS mailbox",
    hint: "Use the MAILBOX password, not your IONOS control-panel login.",
    guideUrl: "https://www.ionos.com/help/email/",
    extraFields: [],
  },
  {
    id: "yahoo",
    label: "Yahoo",
    subtitle: "Connect your Yahoo mailbox (app password)",
    hint: "Yahoo needs an app password, not your normal Yahoo password. Generate one in your Yahoo account security settings.",
    guideUrl: "https://help.yahoo.com/kb/SLN15241.html",
    extraFields: [],
  },
  {
    id: "smtp",
    label: "Other (custom IMAP/SMTP)",
    subtitle: "Connect using custom IMAP/SMTP host & port",
    hint: "Enter the SMTP and IMAP host and port from your email provider.",
    guideUrl: "https://drive.google.com/file/d/1FX9ArN43_sImuTTPPnXVfrIbAJWuAODR/view?usp=sharing",
    extraFields: [
      { name: "host", label: "SMTP host", placeholder: "smtp.company.com" },
      { name: "port", label: "Port", placeholder: "587" },
    ],
  },
];

export function findManualProvider(id: string): ManualProvider | undefined {
  return MANUAL_PROVIDERS.find((p) => p.id === id);
}

/**
 * The verdict a connection attempt returns to the UI.
 *
 * `connected` is the real answer and mirrors the backend's own field:
 *   true  → verified, login works
 *   false → password/login wrong (message carries the backend's reason)
 *   null  → saved, but verification couldn't finish on our side. NOT a
 *           failure — show "saved, verifying…", never an error.
 */
export interface EmailConnectResult {
  connected: boolean | null;
  message: string;
  provider?: string;
  loginEmail?: string;
}
