import type { Metadata } from "next";
import { getRbacMatrix, requireAdmin } from "@/lib/admin/access";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata: Metadata = { title: "Admin · LeadByte" };

/**
 * The admin gate, for the chrome. It is NOT the only check: every page body
 * and every admin Server Action calls `requireAdmin()` again, because a layout
 * does not protect a POST to an action (see `lib/admin/access.ts`).
 *
 * Awaited before anything renders, unlike `PageShell`'s streamed header: the
 * admin frame must never paint for someone who is about to be turned away.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const matrix = await getRbacMatrix();
  return (
    <AdminShell admin={admin} matrix={matrix}>
      {children}
    </AdminShell>
  );
}
