import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isBackendConfigured } from "@/lib/api/config";
import { STALE_SESSION_PATH, isStaleSession } from "@/lib/auth/stale-session";
import { AppBackground } from "@/components/app-background";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  /**
   * A session minted in mock mode carries no backend tokens. If the backend is
   * later switched on, that cookie is still present and still passes the check
   * above — but every API call then fails with "Authentication required" and
   * the user sees an app that looks broken rather than one asking them to sign
   * in again.
   *
   * So a token-less session is treated as stale the moment a backend exists:
   * clear it and send them to sign in properly.
   *
   * The test itself lives in `lib/auth/stale-session.ts`, because `/` needs
   * the same one and is not in this route group — which is how it came to be
   * the only signed-in page without this guard.
   */
  if (isStaleSession(session, isBackendConfigured())) {
    console.warn(
      `[auth] session for "${session.businessId}" has no access token but a ` +
        "backend is configured — sending the user to sign in again.",
    );
    // NOTE: we cannot clear the cookie here. Cookies are only writable from a
    // Server Action or Route Handler; calling `clearAllAccountCookies()` in a
    // layout throws and turns every page into a 500. The login page skips its
    // "already signed in" redirect when it sees ?stale=1, and signing in
    // overwrites the stale cookie anyway.
    redirect(STALE_SESSION_PATH);
  }

  return (
    <div className="min-h-dvh">
      <AppBackground />
      {children}
    </div>
  );
}
