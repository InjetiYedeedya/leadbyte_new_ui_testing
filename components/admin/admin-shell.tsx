import Link from "@/components/ui/app-link";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { AccountMenu } from "@/components/account-menu";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { accountInitials } from "@/lib/data/profile-display";
import { navFor } from "@/lib/admin/nav";
import type { AdminIdentity } from "@/lib/admin/access";
import { ROLE_LABELS, type RbacMatrix } from "@/lib/admin/rbac";

/**
 * The admin panel's frame: the rail on the left, the working area on the
 * right with its own top bar.
 *
 * It does NOT use `PageShell`. The customer tab bar, the Search Console prompt
 * and the stage logic are about one customer's workspace; none of them means
 * anything in a panel that looks across every customer.
 *
 * The page header sits INSIDE the content pane, not above the whole grid, so
 * the rail spans the full height of the window — the same arrangement the
 * legacy panel settled on. That also means nothing here is a sticky band whose
 * height another element has to match by hand (the `top-[69px]` trap): the
 * rail pins itself at `top-0` and the top bar simply scrolls with the page.
 *
 * The frame paints its own solid `bg-ground`, covering the app's animated
 * photo background. That backdrop suits a customer's overview; behind dense
 * tables and figures it only costs contrast, and the legacy panel was plain.
 */
export function AdminShell({
  admin,
  matrix,
  children,
}: {
  admin: AdminIdentity;
  /** The permissions in force, so the rail lists only what this role may open. */
  matrix: RbacMatrix;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-ground md:flex">
      <AdminSidebar groups={navFor(admin.role, matrix)} />

      <div className="min-w-0 flex-1">
        {/* `relative z-30`: the account menu opens out of this bar and over
            the page, and every page's frosted panel (`FROSTED_PANEL`) is its
            own `relative isolate` layer later in the document — so without a
            z-index here the panel painted OVER the open menu, leaving only the
            email row visible and blurring the rest. */}
        <header className="relative z-30 border-b border-border bg-surface/90 backdrop-blur-sm print:hidden">
          <div className="mx-auto flex w-full max-w-[1440px] items-center justify-end gap-3 px-5 py-2 sm:justify-between sm:px-6">
            {/* Hidden on a phone: the rail above already says "Admin", and the
                account menu names the address, so this row would only wrap. */}
            <div className="hidden min-w-0 items-center gap-2 sm:flex">
              <p className="shrink-0 text-sm font-semibold text-ink">Admin dashboard</p>
              <span className="truncate text-xs text-ink-soft">
                Logged in as {admin.email}
                {` · ${ROLE_LABELS[admin.role]}`}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Link
                href="/overview"
                className="flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-sm text-ink-soft transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                Back to app
              </Link>
              <AccountMenu initials={accountInitials(admin.email)} email={admin.email} />
            </div>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
