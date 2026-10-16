import type { Metadata } from "next";
import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { PageLoading } from "@/components/ui/page-loading";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { ActionResult, AdminPanel, ReadFailed, param } from "@/components/admin/admin-ui";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { CopyLinkButton } from "@/components/admin/copy-link-button";
import { getRbacMatrix, requirePermission } from "@/lib/admin/access";
import { ASSIGNABLE_ROLES, DEFAULT_ROLE, ROLE_LABELS } from "@/lib/admin/rbac";
import { RbacMatrixEditor } from "@/components/admin/rbac-matrix-editor";
import { RoleSelect } from "@/components/admin/role-select";
import { scanTable } from "@/lib/admin/data";
import { ADMIN_TABLES } from "@/lib/admin/tables";
import { buildRoster } from "@/lib/admin/roles";
import { claimUrl } from "@/lib/admin/invites";
import { formatDateTime } from "@/lib/admin/fields";
import { APP_URL } from "@/lib/api/config";
import { inviteAdmin, removeAdmin, resendInvite, saveRbacPermissions, updateAdminRole } from "../actions";

export const metadata: Metadata = { title: "Roles & responsibilities · Admin · LeadByte" };

type Params = Promise<Record<string, string | string[] | undefined>>;

export default function AdminRolesPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<PageLoading title="Roles & responsibilities" />}>
      <RolesBody searchParams={searchParams} />
    </Suspense>
  );
}

const TH = "border-b border-border px-4 py-2 text-left text-xs font-medium text-ink-soft";
const TD = "px-4 py-2 text-sm text-ink";
/** A role that can't be changed here, the same size as `RoleSelect`'s field so rows line up. */
const ROLE_BOX = "inline-block w-40 rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm text-ink-soft";
const SMALL =
  "inline-flex items-center rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-raised";

async function RolesBody({ searchParams }: { searchParams: Params }) {
  const me = await requirePermission("rbac", "read");
  const params = await searchParams;
  const read = await scanTable(ADMIN_TABLES.adminUsers);
  const roster = buildRoster(read.rows);
  const matrix = await getRbacMatrix();
  // The controls are super admins' alone — the actions enforce the same
  // two locks (`rbac` write AND super admin). Anyone else who may read this
  // screen sees it read-only, so a role can see what it is allowed.
  const manage = me.role === "super_admin";
  // You first, then super admins, then everyone else (`buildRoster` order).
  const myEmail = me.email.trim().toLowerCase();
  const activeAdmins = [
    ...roster.active.filter((admin) => admin.email === myEmail),
    ...roster.active.filter((admin) => admin.email !== myEmail),
  ];

  return (
    <PageContainer>
      <PageHeader title="Roles & responsibilities" description="Who can open this panel, what each role may do, and invites waiting to be claimed." />
      <ActionResult notice={param(params, "notice")} error={param(params, "error")} />
      {!read.ok && <ReadFailed what="the admin list" />}

      {manage && (
      <AdminPanel
        title="Invite a new admin"
        hint="They get an email with a claim link. Access starts only when they open it while signed in with that address."
      >
        <form action={inviteAdmin} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="invite-email" className="sr-only">
            Email to invite
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="colleague@ntimes.ai"
            autoComplete="off"
            suppressHydrationWarning
            className="w-full max-w-md rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent"
          />
          <label htmlFor="invite-role" className="sr-only">
            Role
          </label>
          <select
            id="invite-role"
            name="role"
            defaultValue={DEFAULT_ROLE}
            suppressHydrationWarning
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent"
          >
            {ASSIGNABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <SubmitButton
            pendingLabel="Sending…"
            className="justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink"
          >
            Send invite
          </SubmitButton>
        </form>
      </AdminPanel>
      )}

      {roster.pending.length > 0 && (
        <AdminPanel title="Pending invites" hint={`${roster.pending.length} waiting to be claimed`}>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={TH}>Email</th>
                  <th scope="col" className={TH}>Role</th>
                  <th scope="col" className={`${TH} hidden sm:table-cell`}>Invited by</th>
                  <th scope="col" className={`${TH} hidden sm:table-cell`}>Invited (IST)</th>
                  {manage && <th scope="col" className={`${TH} text-right`}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {roster.pending.map((invite) => (
                  <tr key={invite.email} className="border-b border-border/60 last:border-b-0">
                    <td className={`${TD} [overflow-wrap:anywhere]`}>{invite.email}</td>
                    <td className={TD}>
                      <Badge variant="admin-role">{ROLE_LABELS[invite.role]}</Badge>
                    </td>
                    <td className={`${TD} hidden text-ink-soft sm:table-cell`}>{invite.invitedBy || "—"}</td>
                    <td className={`${TD} hidden whitespace-nowrap text-ink-soft sm:table-cell`}>{formatDateTime(invite.invitedAt)}</td>
                    {manage && (
                    <td className={`${TD} text-right`}>
                      <span className="flex flex-wrap justify-end gap-1.5">
                        {invite.token && <CopyLinkButton url={claimUrl(APP_URL, invite.token)} email={invite.email} />}
                        <form action={resendInvite}>
                          <input type="hidden" name="email" value={invite.email} />
                          <SubmitButton pendingLabel="Sending…" className={SMALL}>Resend</SubmitButton>
                        </form>
                        <form action={removeAdmin}>
                          <input type="hidden" name="email" value={invite.email} />
                          <input type="hidden" name="kind" value="invite" />
                          <ConfirmSubmit
                            title={`Cancel the invite for ${invite.email}?`}
                            body="Their claim link stops working. You can invite them again later."
                            confirmLabel="Cancel invite"
                            pendingLabel="Cancelling…"
                            className="rounded-md border border-crit/40 px-2.5 py-1 text-xs font-medium text-crit hover:bg-crit-soft"
                          >
                            Cancel
                          </ConfirmSubmit>
                        </form>
                      </span>
                    </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminPanel>
      )}

      <AdminPanel
        title="Active admins"
        hint={
          manage
            ? `${roster.active.length} with access. Pick a role and it saves straight away; it applies on their next click.`
            : `${roster.active.length} with access.`
        }
      >
        <ul className="divide-y divide-border/60 rounded-md border border-border">
          {activeAdmins.map((admin) => {
            // Everyone but yourself can be changed or revoked — super admins
            // included (the zippy-admin rule).
            const isMe = admin.email === myEmail;
            const joined = [
              admin.invitedBy && `Invited by ${admin.invitedBy}`,
              admin.since && `since ${formatDateTime(admin.since)} IST`,
            ].filter(Boolean);
            return (
              <li key={admin.email} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold uppercase ${
                      admin.role === "super_admin" ? "bg-accent-soft text-accent-ink" : "bg-surface-raised text-ink-soft"
                    }`}
                  >
                    {admin.email.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink [overflow-wrap:anywhere]">
                      {admin.email}
                      {isMe && (
                        <span className="ml-2 rounded-full bg-surface-raised px-2 py-0.5 text-xs font-medium text-ink-soft">You</span>
                      )}
                    </p>
                    {joined.length > 0 && (
                      <p className="mt-0.5 text-xs text-ink-soft">{joined.join(" · ")}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {manage && !isMe ? (
                    // Keyed on the saved role: after the action redirects it
                    // remounts showing what was stored, not what was picked.
                    <RoleSelect key={admin.role} email={admin.email} role={admin.role} action={updateAdminRole} />
                  ) : (
                    <div className="flex flex-col items-start">
                      <span className={ROLE_BOX}>{ROLE_LABELS[admin.role]}</span>
                      {isMe && manage && <span className="mt-0.5 text-xs text-ink-soft">You can&apos;t change your own role</span>}
                    </div>
                  )}

                  {manage && (
                    <div className="w-20 text-right">
                      {!isMe && (
                        <form action={removeAdmin} className="inline">
                          <input type="hidden" name="email" value={admin.email} />
                          <ConfirmSubmit
                            title={`Revoke admin access for ${admin.email}?`}
                            body="They lose access to this panel straight away. Their customer account is not affected."
                            confirmLabel="Revoke access"
                            pendingLabel="Revoking…"
                            className="rounded-md border border-crit/40 px-2.5 py-1.5 text-xs font-medium text-crit hover:bg-crit-soft"
                          >
                            Revoke
                          </ConfirmSubmit>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </AdminPanel>

      <AdminPanel
        title="Permissions by role"
        hint={
          manage
            ? "What each role may open (read) and change (write). Super admins always have full access. Changes apply on each admin's next click."
            : "What each role may open (read) and change (write). Only a super admin can change this."
        }
      >
        <RbacMatrixEditor matrix={matrix} editable={manage} action={saveRbacPermissions} />
      </AdminPanel>
    </PageContainer>
  );
}
