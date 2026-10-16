import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { FlashNotice } from "@/components/ui/flash-notice";

export const metadata: Metadata = { title: "Sign in · LeadByte" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ stale?: string; why?: string }>;
}) {
  const { stale, why } = await searchParams;
  // A stale session still exists as a cookie, so the usual "already signed in"
  // redirect would bounce straight back into the app and loop. Signing in
  // replaces the cookie, which is what actually clears it.
  if (stale !== "1" && (await getSession())) redirect("/overview");

  return (
    <AuthShell>
      <AuthForm
        mode="signin"
        notice={
          // Shown once: `FlashNotice` wipes `why` from the address and lets the
          // message leave on its own. `stale=1` stays — it is what stops the
          // redirect above from bouncing a refresh back into the app.
          stale === "1" &&
          (why === "elsewhere" || why === "expired") && (
            <FlashNotice clear={["why"]} duration={10_000} className="mb-6 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
              {why === "elsewhere"
                ? "You were signed out because your account signed in on another device or browser. Sign in again to continue here."
                : "Your session expired. Please sign in again."}
            </FlashNotice>
          )
        }
      />
    </AuthShell>
  );
}
