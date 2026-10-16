"use client";

/**
 * The account avatar, and the menu under it.
 *
 * ## Why this earns `"use client"`
 *
 * A menu is open or closed, and that is state no `<form action={serverAction}>`
 * can hold. It also has to close on Escape, on a click elsewhere, and after a
 * choice — three event handlers. Settings and Sign out were plain text links in
 * the header until now precisely because a Server Component could express
 * them; collapsing them under an avatar is what makes an island necessary.
 *
 * The Sign out control is still a `<form action={logout}>`. A Server Action
 * imported into a client component works exactly as it does on the server, so
 * signing out keeps its httpOnly cookie clearing and its redirect — this
 * island holds the menu's state, not the mutation.
 *
 * ## The rules it follows
 *
 * - **Escape closes it, and focus returns to the avatar.** Otherwise a keyboard
 *   user who opens the menu has to tab through the whole page to get back.
 * - **A click anywhere else closes it**, listened for on `pointerdown` rather
 *   than `click`, so it closes on press instead of waiting for the release.
 * - **The avatar is 44px**, the smallest reliable touch target, even though the
 *   circle inside it is drawn smaller.
 * - **`aria-expanded` and `aria-haspopup` are on the button**, and the menu is
 *   a real `role="menu"`, so a screen reader announces it as a menu that opens
 *   rather than a mystery button.
 */

import Link from "@/components/ui/app-link";
import { SubmitButton } from "@/components/ui/submit-button";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/logout/actions";

const ITEM =
  "flex w-full min-h-11 items-center px-3 text-left text-sm text-ink transition-colors duration-150 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:-outline-offset-2 motion-reduce:transition-none";

export function AccountMenu({
  initials,
  email,
  adminHref,
}: {
  initials: string;
  email: string;
  /**
   * Set only for admins, by the server, after the role check — so the link to
   * the admin panel never appears for a customer. The panel checks again
   * itself; hiding the link is courtesy, not security.
   */
  adminHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Back to where they were, not to the top of the document.
      trigger.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${email}`}
        suppressHydrationWarning
        className="flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised text-xs font-semibold text-ink-soft transition-colors duration-150 hover:bg-border motion-reduce:transition-none"
        >
          {initials}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
        >
          {/* Whose account this is. The initials alone are ambiguous once
              someone has more than one address. */}
          <p className="truncate border-b border-border px-3 py-2 text-xs text-ink-soft">{email}</p>

          <Link href="/settings" role="menuitem" className={ITEM} onClick={() => setOpen(false)}>
            Settings
          </Link>

          {adminHref && (
            <Link href={adminHref} role="menuitem" className={ITEM} onClick={() => setOpen(false)}>
              Admin panel
            </Link>
          )}

          <form action={logout} className="border-t border-border">
            <SubmitButton pendingLabel="Signing out…" role="menuitem" className={ITEM}>
              Sign out
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
