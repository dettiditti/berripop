"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useClerk, useUser } from "@clerk/nextjs";
import { CreditCard, LogOut, Settings, Shield } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

/** Account menu for signed-in pages: settings, subscription, privacy and sign-out (Clerk). */
export default function AccountMenu() {
  const { d } = useI18n();
  const a = d.account;
  const { signOut } = useClerk();
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const initial = (user?.firstName || user?.primaryEmailAddress?.emailAddress || "?").slice(0, 1).toUpperCase();

  return (
    <div className="account-menu" ref={ref}>
      <button type="button" className="account-menu-btn" aria-haspopup="menu" aria-expanded={open} aria-controls="account-menu-list" aria-label={a.menuLabel} onClick={() => setOpen(v => !v)}>
        <span aria-hidden>{initial}</span>
      </button>
      {open && (
        <div id="account-menu-list" className="account-menu-list" role="menu">
          {user?.primaryEmailAddress && <p className="account-menu-email">{user.primaryEmailAddress.emailAddress}</p>}
          <Link role="menuitem" href="/settings" onClick={() => setOpen(false)}><Settings size={16} aria-hidden /> {a.settings}</Link>
          <Link role="menuitem" href="/settings#subscription" onClick={() => setOpen(false)}><CreditCard size={16} aria-hidden /> {a.subscription}</Link>
          <Link role="menuitem" href="/privacy" onClick={() => setOpen(false)}><Shield size={16} aria-hidden /> {a.privacy}</Link>
          <button type="button" role="menuitem" onClick={() => signOut({ redirectUrl: "/" })}><LogOut size={16} aria-hidden /> {a.signOut}</button>
        </div>
      )}
    </div>
  );
}
