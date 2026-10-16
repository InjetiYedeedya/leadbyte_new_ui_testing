"use client";

/**
 * An admin's role, saved the moment it is chosen.
 *
 * ## Why this earns `"use client"`
 *
 * It replaced a select plus a separate "Change" button (2026-10-13): picking a
 * role and then having to press a second control to keep it read as though
 * the pick had done nothing. Saving on choice needs an `onChange` handler, and
 * the one change that hands over — or takes away — the power to manage admins
 * (to or from Super admin) asks first in a dialog, which is open/closed state.
 *
 * The save itself is the same Server Action as before: the form's
 * `requestSubmit()` runs React's submit path, as `ConfirmSubmit` does. The
 * page keys this on the saved role, so after the action redirects it remounts
 * showing what was actually stored — a refused change does not leave the new
 * value sitting in the box.
 */

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { Spinner } from "@/components/ui/spinner";
import { ASSIGNABLE_ROLES, ROLE_LABELS, type AdminRole } from "@/lib/admin/rbac";

/** The page's read-only role box (`ROLE_BOX`) is the same size, so rows line up. */
const ROLE_FIELD =
  "w-40 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink outline-none transition-colors focus:border-accent disabled:opacity-60";

export function RoleSelect({
  email,
  role,
  action,
}: {
  email: string;
  role: AdminRole;
  action: (form: FormData) => void | Promise<void>;
}) {
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="email" value={email} />
      <RoleField email={email} saved={role} />
    </form>
  );
}

function RoleField({ email, saved }: { email: string; saved: AdminRole }) {
  const [value, setValue] = useState<AdminRole>(saved);
  const [asking, setAsking] = useState(false);
  const select = useRef<HTMLSelectElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const { pending } = useFormStatus();
  const id = useId();

  useScrollLock(asking);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (asking && !element.open) element.showModal();
    if (!asking && element.open) element.close();
  }, [asking]);

  function choose(next: AdminRole) {
    setValue(next);
    if (next === saved) return;
    if (next === "super_admin" || saved === "super_admin") setAsking(true);
    // After React has written the new value into the select.
    else queueMicrotask(() => select.current?.form?.requestSubmit());
  }

  function cancel() {
    setAsking(false);
    setValue(saved);
  }

  const promoting = value === "super_admin";

  return (
    <>
      <label htmlFor={`${id}-role`} className="sr-only">
        Role for {email}
      </label>
      <select
        ref={select}
        id={`${id}-role`}
        name="role"
        value={value}
        onChange={(event) => choose(event.target.value as AdminRole)}
        disabled={pending}
        suppressHydrationWarning
        className={ROLE_FIELD}
      >
        {ASSIGNABLE_ROLES.map((option) => (
          <option key={option} value={option}>
            {ROLE_LABELS[option]}
          </option>
        ))}
      </select>
      {pending && (
        <span role="status" className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
          <Spinner /> Saving…
        </span>
      )}

      <dialog
        ref={dialog}
        onClose={() => {
          if (asking) cancel();
          select.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === dialog.current) cancel();
        }}
        aria-labelledby={`${id}-title`}
        className="w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-ground p-0 text-ink shadow-lg backdrop:bg-ink/50"
      >
        <div className="p-4 text-left">
          <h2 id={`${id}-title`} className="text-base font-bold text-ink">
            {promoting ? `Make ${email} a super admin?` : `Change ${email} to ${ROLE_LABELS[value]}?`}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {promoting
              ? "Super admins can do everything here, including inviting, changing and revoking other admins — super admins too. It applies on their next click."
              : "They will no longer be a super admin, so they can't manage admins or permissions. It applies on their next click."}
          </p>
          <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={cancel}
              autoFocus
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-raised"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setAsking(false);
                select.current?.form?.requestSubmit();
              }}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
            >
              {promoting ? "Make super admin" : `Change to ${ROLE_LABELS[value]}`}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
