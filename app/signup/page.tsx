import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Create your account · LeadByte" };

export default async function SignupPage() {
  if (await getSession()) redirect("/overview");

  return (
    <AuthShell>
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
