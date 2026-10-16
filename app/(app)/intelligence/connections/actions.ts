"use server";

import { saveFacebookPage } from "@/lib/data/facebook-pages";
import { signText } from "@/lib/signed-text";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentBusinessId } from "@/components/page-shell";
import { recordOAuthConnection } from "@/lib/api/oauth-connect";
import { SOCIAL_PLATFORMS } from "@/lib/data/agent-social-gate";
import {
  SOCIAL_ACCOUNTS_MAX_AGE,
  getSocialOffer,
  socialAccountsCookie,
  socialDeclinedCookie,
  socialOfferCookie,
} from "@/lib/data/social-accounts";
import { getConnectionsRepo } from "@/lib/data/connections-repo";
import { getSession } from "@/lib/auth/session";
import { apiPost, ApiError } from "@/lib/api/client";
import { refusalOf } from "@/lib/api/refusal";
import { isBackendConfigured } from "@/lib/api/config";
import { findManualProvider, type EmailConnectResult } from "@/lib/data/email-providers";
import { businessDomain, readGithubConnection } from "@/lib/data/github-connection";
import { disconnectGithub } from "@/lib/data/aeo-deploy";
import { isRedirectError } from "@/lib/auth/session-expired";
import { readWordpressInput } from "@/lib/data/wordpress-connection";
import { disconnectWordpress, saveWordpressCredentials, type WordpressSaveResult } from "@/lib/data/wordpress-repo";
import {
  EMAIL_COOKIE,
  EMAIL_COOKIE_OPTIONS,
  saveMailboxRecord,
  serialiseMailbox,
} from "@/lib/data/email-callback";

/**
 * Connecting an OAuth platform is no longer a Server Action.
 *
 * The OAuth flow is a 302 chain the browser has to follow itself, so the
 * Connections page renders a plain link to `/api/oauth/{platform}` instead.
 * The action that used to live here threw "not wired yet" and replaced the
 * whole app with an error screen when clicked.
 */

/**
 * Saves the social account the customer picked in the dialog.
 *
 * ## Why the id is checked against the offer rather than trusted
 *
 * The form carries an id and nothing else, so a tampered post cannot select a
 * page this consent never granted — the same rule the ads picker follows, and
 * the reason the offered list is re-read here instead of being reconstructed
 * from the submission.
 *
 * ## Why the connection is recorded a second time
 *
 * The callback already wrote the Frontend Check row, without an account. This
 * writes it again WITH the chosen page: the row is keyed on
 * `numericRowId(email)`, so it is the same row updated, not a duplicate, and
 * the backend then knows which page the agent posts to rather than only that
 * Facebook is connected.
 */
export async function selectSocialAccount(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const raw = String(formData.get("platform") ?? "");
  const platform = SOCIAL_PLATFORMS.find((id) => id === raw);
  if (!platform) {
    console.error(`[social-select] unknown platform: ${raw || "none"}`);
    redirect("/intelligence/connections?error=unknown-platform");
  }

  const accountId = String(formData.get("accountId") ?? "");
  const store = await cookies();
  const offered = await getSocialOffer(platform);
  const chosen = offered.find((account) => account.id === accountId);

  if (!chosen) {
    // Two different faults, named apart because they need different remedies:
    // the offer has lapsed (nothing to choose from), or the posted id was not
    // among the offers — a stale tab, or a tampered post.
    console.error(
      offered.length === 0
        ? `[social-select] ${platform}: no accounts offered — the hour-long offer may have lapsed`
        : `[social-select] ${platform}: submitted ${accountId || "none"} is not among ` +
          `${offered.length} offered accounts`,
    );
    redirect("/intelligence/connections?error=expired-choice");
  }

  // Facebook needs the page itself saved with the backend, token and all
  // (`facebook-pages.ts`) — without it the backend reads Facebook as not
  // connected and n8n has nothing to post with (2026-10-01). It goes FIRST:
  // nothing below may mark the page as chosen until n8n has it, or the row
  // says connected about a page that cannot post. On failure the callback's
  // `awaitingChoice` row stays, so the account reads "Finish setup".
  if (platform === "facebook") {
    const result = await saveFacebookPage(session.businessId, session.userId, chosen);
    if (!result.saved) {
      revalidatePath("/intelligence/connections");
      redirect(`/intelligence/connections?error=facebook-page&message=${encodeURIComponent(signText(result.reason))}`);
    }
  }

  // The record. One account, because one is what the agent posts as.
  store.set(socialAccountsCookie(platform), JSON.stringify([chosen]), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SOCIAL_ACCOUNTS_MAX_AGE,
  });

  // Spent: keeping it would re-open the dialog on the next page load, asking a
  // question that has been answered.
  store.delete(socialOfferCookie(platform));
  // A choice supersedes a previous refusal. Left behind, the platform would
  // read "Not connected" with a page named under it.
  store.delete(socialDeclinedCookie(platform));

  await recordOAuthConnection(platform, session.businessId, session.userId, chosen);

  revalidatePath("/intelligence/connections");
  redirect(`/intelligence/connections?connected=${platform}&state=done`);
}

/**
 * Leaving the picker without choosing, confirmed.
 *
 * ## Why this is an action and not just closing a dialog
 *
 * The confirmation tells the customer no account will be connected. That has
 * to be true, and closing a dialog cannot make it true on its own — consent
 * has already happened and the check table already says so. What makes it true
 * is the declined marker this writes, which `socialPlatformConnected` honours
 * everywhere the app asks (see `social-accounts.ts` for why the backend row
 * cannot be unwritten).
 *
 * Nothing is destroyed: connecting again clears the marker and offers the list
 * afresh.
 */
export async function abandonSocialAccount(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const raw = String(formData.get("platform") ?? "");
  const platform = SOCIAL_PLATFORMS.find((id) => id === raw);
  if (!platform) {
    console.error(`[social-select] unknown platform declined: ${raw || "none"}`);
    redirect("/intelligence/connections?error=unknown-platform");
  }

  const store = await cookies();
  store.set(socialDeclinedCookie(platform), "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SOCIAL_ACCOUNTS_MAX_AGE,
  });

  // Both spent. The offer was refused, and any name from an earlier connection
  // would otherwise be displayed beside a row that now reads Not connected.
  store.delete(socialOfferCookie(platform));
  store.delete(socialAccountsCookie(platform));

  console.log(`[social-select] ${platform}: left without choosing an account`);

  revalidatePath("/intelligence/connections");
  redirect("/intelligence/connections?declined=" + platform);
}

export async function skipConnections(): Promise<void> {
  const businessId = await currentBusinessId();
  await getConnectionsRepo().skip(businessId);
  revalidatePath("/", "layout");
}

/**
 * Has GitHub landed yet? Asked on a timer by `ConnectGithub` while GitHub's
 * install screen is open in another tab — its callback lands on the AEO
 * service, not on us, so there is nothing to redirect back here.
 *
 * Takes no arguments on purpose: the account and the site are both read on the
 * server, so a tampered call cannot ask about anyone else's site.
 */
export async function githubConnectedAction(): Promise<{ connected: boolean }> {
  const connection = await readGithubConnection(await currentBusinessId());
  return { connected: connection.kind === "connected" };
}

/**
 * Disconnect GitHub for this account's site.
 *
 * Takes no arguments, like `githubConnectedAction`: the account and the domain
 * are read on the server, so a tampered post cannot disconnect anyone else's
 * site. The service clears only its saved link; the GitHub App stays installed
 * until the customer removes it on GitHub, which the confirmation says.
 */
export async function disconnectGithubAction(): Promise<void> {
  const businessId = await currentBusinessId();
  const domain = await businessDomain(businessId);
  if (domain === "") redirect("/intelligence/connections");

  try {
    await disconnectGithub(businessId, domain);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[github] disconnect failed:", error);
    redirect("/intelligence/connections?error=github-disconnect");
  }

  // The Blog Posting agent's page reads the same connection.
  revalidatePath("/", "layout");
  redirect("/intelligence/connections?disconnected=github");
}

/**
 * Connect WordPress: check and save the login in one call (the backend tests
 * it against the site before storing anything).
 *
 * Takes the three fields as plain values from the form island. The
 * Application Password goes straight on to the backend and is not kept, logged
 * or returned; the account comes from the login token, never from the form.
 * Used by the Connections page and the Blog Posting agent alike.
 */
export async function saveWordpressAction(raw: {
  wpUrl: string;
  userName: string;
  appPassword: string;
}): Promise<WordpressSaveResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Your session expired. Please sign in again." };

  const read = readWordpressInput({
    wpUrl: String(raw.wpUrl ?? ""),
    userName: String(raw.userName ?? ""),
    appPassword: String(raw.appPassword ?? ""),
  });
  if (!read.ok) return { ok: false, message: read.problems.join(" ") };

  const result = await saveWordpressCredentials(read.input);
  // Both screens that show the connection read it fresh.
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Forget the saved WordPress login (the backend deletes the row). */
export async function disconnectWordpressAction(): Promise<void> {
  try {
    await disconnectWordpress();
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[wordpress] disconnect failed:", error instanceof Error ? error.message : error);
    redirect("/intelligence/connections?error=wordpress-disconnect");
  }
  revalidatePath("/", "layout");
  redirect("/intelligence/connections?disconnected=wordpress");
}

/** Raw fields the credentials form hands us. Password never leaves the server. */
export interface ConnectEmailInput {
  provider: string;
  loginEmail: string;
  password: string;
  /** Only the custom "Other" provider sends these. */
  host?: string;
  port?: string;
}

/**
 * The subset of `/api/email/connect`'s response we read. The backend also
 * returns `mailbox_id`, `checks`, `testTriggered` — kept off the type because
 * the UI doesn't use them.
 */
interface EmailConnectPayload {
  success?: boolean;
  connected?: boolean | null;
  message?: string;
  error?: string;
  provider?: string;
  login_email?: string;
}

/**
 * Connects a manual (SMTP-path) mailbox: IONOS, Yahoo, or a custom IMAP/SMTP
 * server. Gmail does NOT come through here — it is the OAuth redirect at
 * `/api/email/gmail`, and never types a password.
 *
 * The password reaches the backend only via this action — collected in the
 * browser form, posted to our server, forwarded to `/api/email/connect` over
 * HTTPS. The backend encrypts it (AES-256-GCM) and never returns or logs it;
 * we store nothing here.
 *
 * `connected` in the return is the real verdict — see `EmailConnectResult`.
 */
export async function connectEmail(input: ConnectEmailInput): Promise<EmailConnectResult> {
  const provider = findManualProvider(input.provider);
  if (!provider) {
    return { connected: false, message: "Unknown email provider." };
  }

  const loginEmail = input.loginEmail.trim();
  const password = input.password;
  if (!loginEmail || !password) {
    return { connected: false, message: "Email and password are both required." };
  }

  // The custom-server path is the only one that needs a host and port; IONOS
  // and Yahoo are fixed servers the backend already knows.
  const needsHost = provider.extraFields.some((f) => f.name === "host");
  const host = input.host?.trim();
  const port = input.port?.trim();
  if (needsHost && (!host || !port)) {
    return { connected: false, message: "SMTP host and port are required for a custom server." };
  }

  if (!isBackendConfigured()) {
    return { connected: false, message: "Backend not configured — cannot connect a mailbox." };
  }

  const session = await getSession();
  if (!session) {
    return { connected: false, message: "Your session has expired — please sign in again." };
  }
  if (!session.userId) {
    // The backend keys the mailbox on user_id (body). Without it the row would
    // look attributed and not be — the same rule the ads flow follows.
    return {
      connected: false,
      message: "We couldn't identify your account. Sign out and back in, then try again.",
    };
  }

  // Nested `credentials` is the documented shape; host/port only for a custom
  // server. The verification test-logs-in on the backend, so this call can be
  // slow — give it a longer deadline than a data read.
  const credentials: Record<string, string> = { password };
  if (needsHost && host && port) {
    credentials.host = host;
    credentials.port = port;
  }

  const body = {
    user_id: session.userId,
    login_email: loginEmail,
    provider: provider.id,
    credentials,
  };

  try {
    const res = await apiPost<EmailConnectPayload>("/api/email/connect", body);
    // `connected` is the field to trust, not `success`. Absent means the
    // backend saved but couldn't confirm — treat as "verifying", not failure.
    // EXCEPT an explicit refusal: `{ success: false, error }` with no
    // `connected` was shown as "Saved — we're still verifying" (audit,
    // 2026-09-29).
    const refused = refusalOf(res) !== null;
    const connected = refused ? false : res.connected === undefined ? null : res.connected;
    // Verified: record it, exactly as the Gmail callback does. Without this a
    // mailbox connected with a password was never stored on our side, and
    // every screen went on saying "Not connected". Only on a confirmed login —
    // "still verifying" is not a mailbox anyone can send from yet.
    if (connected === true) {
      const mailbox = { address: res.login_email ?? loginEmail, name: "" };
      await saveMailboxRecord(session.businessId, session.userId, mailbox);
      (await cookies()).set(EMAIL_COOKIE, serialiseMailbox(mailbox), EMAIL_COOKIE_OPTIONS);
    }
    revalidatePath("/intelligence/connections");
    return {
      connected,
      message:
        res.message ??
        (connected === true
          ? "Email account connected and verified."
          : connected === false
            ? res.error ?? "That mailbox rejected the login. Check the email and password."
            : "Saved — we're still verifying the mailbox."),
      provider: res.provider ?? provider.id,
      loginEmail: res.login_email ?? loginEmail,
    };
  } catch (caught) {
    if (caught instanceof ApiError) {
      // A fixed sentence, not the backend's text: with a custom server and
      // port, the raw SMTP error ("connection refused", "timed out") told
      // anyone what was listening on an internal address.
      console.error("[connect-email] the backend refused the mailbox:", caught.message);
      return {
        connected: false,
        message: "We couldn't connect that mailbox. Check the address, password and server settings.",
      };
    }
    // A network/timeout fault on a write is genuinely unknown: the backend may
    // have saved and be verifying. Say so rather than claiming failure.
    return {
      connected: null,
      message: "We couldn't confirm the connection just now. It may still complete — check back shortly.",
    };
  }
}
