import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { ShieldWarning } from "@phosphor-icons/react/ssr";
import { PageContainer } from "@/components/ui/page-container";
import { getSession } from "@/lib/auth/session";
import { neededModuleLabel } from "@/lib/admin/access";

export const metadata: Metadata = { title: "Access denied · LeadByte" };

/**
 * Where a signed-in account lands when it may not open something.
 *
 * Outside the panel's route group on purpose: the panel's layout is the gate
 * that sends people here, and a page behind its own gate would loop.
 *
 * Three cases, said apart: no admin access at all; an admin whose ROLE does
 * not include this section (`?need=<module>`, from `requirePermission`); and
 * the super-admin-only steps (`?need=super`). The last two are the panel
 * telling an admin "not this one", not "you are not an admin" — a sentence
 * that was wrong for them, seen live on 2026-09-29.
 */
export default async function AdminDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ need?: string; write?: string }>;
}) {
  const session = await getSession();
  const { need, write } = await searchParams;
  const superOnly = need === "super";
  const section = neededModuleLabel(need);
  const inPanel = superOnly || section !== null;

  return (
    <PageContainer width="reading">
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 rounded-lg border border-border bg-surface p-8 text-center">
        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-full bg-crit-soft text-crit"
        >
          <ShieldWarning className="size-6" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {superOnly ? "Super admin only" : section ? "Not included in your role" : "Access denied"}
        </h1>
        {superOnly ? (
          <p className="text-sm text-ink-soft">
            Only a super admin can add admins, change roles or edit permissions. You still have
            access to the rest of the admin panel.
          </p>
        ) : section ? (
          <p className="text-sm text-ink-soft">
            Your role doesn&apos;t allow you to {write === "1" ? "make changes in" : "open"}{" "}
            <span className="font-medium text-ink">{section}</span>. Ask a super admin if you
            need it.
          </p>
        ) : (
          <p className="text-sm text-ink-soft">
            {session ? (
              <>
                <span className="font-medium text-ink">{session.businessId}</span> doesn&apos;t
                have admin access.
              </>
            ) : (
              "This account doesn't have admin access."
            )}{" "}
            If you were invited, open the link in your invite email while signed in with the
            address it was sent to.
          </p>
        )}
        <Link
          href={inPanel ? "/admin" : "/overview"}
          className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
        >
          {inPanel ? "Back to the admin panel" : "Back to the app"}
        </Link>
      </div>
    </PageContainer>
  );
}
