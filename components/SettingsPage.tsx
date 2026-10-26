"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useClerk, useUser } from "@clerk/nextjs";
import { ArrowLeft, Download, FileText, LogOut, Mail, Trash2 } from "lucide-react";
import { deletionBlock } from "@/lib/account/policy";
import type { Snapshot } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n/client";
import { deleteAccountAction, exportAccountAction, getSnapshotAction, setDisplayNameAction } from "@/lib/server/actions";
import BerripopMascot from "./berripop/BerripopMascot";
import SubscriptionCard from "./billing/SubscriptionCard";
import LanguageSelector from "./LanguageSelector";
import { Toast } from "./Modals";

/** Signed-in settings: account, language, subscription (Stripe portal), legal links, data export and account deletion. */
export default function SettingsPage() {
  const { d, t, date } = useI18n();
  const a = d.account;
  const { user } = useUser();
  const { signOut } = useClerk();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  const notify = useCallback((message: string) => {
    const id = Date.now();
    setToast({ id, message });
    window.setTimeout(() => setToast(cur => (cur?.id === id ? null : cur)), 2600);
  }, []);

  useEffect(() => {
    getSnapshotAction().then(r => {
      if (r.ok) { setSnapshot(r.snapshot); setName(r.snapshot.me.name); }
      else setFailed(true);
    }).catch(() => setFailed(true));
  }, []);

  // Jump to #subscription once the content is there.
  useEffect(() => {
    if (snapshot && window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView();
  }, [snapshot]);

  async function saveName() {
    const r = await setDisplayNameAction(name);
    if (r.ok) { setSnapshot(r.snapshot); notify(a.nameSaved); } else notify(d.auth.error);
  }

  async function download() {
    const data = await exportAccountAction();
    if (!data) return notify(d.auth.error);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${a.exportName}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function remove() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const r = await deleteAccountAction(confirm);
      if (r.ok) {
        if (!r.loginDeleted) window.alert(a.deleteLoginFail);
        await signOut({ redirectUrl: "/" });
        return;
      }
      setDeleteError(r.error === "active_subscription" ? a.deleteSubBlock : a.deleteError);
    } catch {
      setDeleteError(a.deleteError);
    }
    setDeleting(false);
  }

  const account = snapshot?.account;
  const blocked = account ? deletionBlock(account.entitlements) : null;
  const legal = [
    { href: "/privacy", label: a.legal.privacy },
    { href: "/terms", label: a.legal.terms },
    { href: "/cookies", label: a.legal.cookies },
    { href: "/contact", label: a.legal.contact },
  ];

  return (
    <div className="settings-page">
      <header className="settings-top">
        <Link className="btn btn--text btn--inline" href="/"><ArrowLeft size={16} aria-hidden /> {a.back}</Link>
        <span className="personal-brand"><BerripopMascot size={32} motion="none" /> berripop</span>
      </header>
      <main className="screen settings-main">
        <h1>{a.title}</h1>
        {failed && <p className="field-hint" role="alert">{a.loadError}</p>}
        {!snapshot && !failed && <p className="muted" aria-busy="true">{a.loading}</p>}

        {snapshot && account && (
          <>
            <section className="card stack-sm" aria-labelledby="set-profile">
              <h2 id="set-profile">{a.profileTitle}</h2>
              <div className="settings-field">
                <span className="field-label">{a.email}</span>
                <strong>{user?.primaryEmailAddress?.emailAddress ?? "—"}</strong>
                <small className="muted">{a.emailHint}</small>
              </div>
              <label className="field-label" htmlFor="set-name">{a.name}</label>
              <div className="own-word-row">
                <input id="set-name" className="input" value={name} maxLength={40} onChange={e => setName(e.target.value)} />
                <button type="button" className="btn btn--ghost btn--sm" disabled={name.trim().length < 1 || name === snapshot.me.name} onClick={saveName}>{a.nameSave}</button>
              </div>
              {user?.createdAt && <small className="muted">{t(a.memberSince, { date: date(user.createdAt.toISOString().slice(0, 10)) })}</small>}
            </section>

            <LanguageSelector persist onChanged={notify} />

            <div id="subscription" className="settings-anchor">
              <SubscriptionCard account={account} notify={notify} />
            </div>

            <section className="card stack-sm" aria-labelledby="set-legal">
              <h2 id="set-legal">{a.legalTitle}</h2>
              <ul className="settings-links">
                {legal.map(l => <li key={l.href}><Link href={l.href}><FileText size={16} aria-hidden /> {l.label}</Link></li>)}
              </ul>
            </section>

            <section className="card stack-sm" aria-labelledby="set-contact">
              <h2 id="set-contact">{a.contactTitle}</h2>
              <p className="muted">{a.contactBody}</p>
              <Link className="btn btn--ghost btn--sm settings-inline-btn" href="/contact"><Mail size={16} aria-hidden /> {a.legal.contact}</Link>
            </section>

            <section className="card stack-sm" aria-labelledby="set-data">
              <h2 id="set-data">{a.dataTitle}</h2>
              <p className="muted">{a.dataBody}</p>
              <button type="button" className="btn btn--ghost btn--sm settings-inline-btn" onClick={download}><Download size={16} aria-hidden /> {a.export}</button>
            </section>

            <button type="button" className="btn btn--ghost btn--block" onClick={() => signOut({ redirectUrl: "/" })}><LogOut size={18} aria-hidden /> {a.signOut}</button>

            <section className="card stack-sm settings-danger" aria-labelledby="set-delete">
              <h2 id="set-delete">{a.deleteTitle}</h2>
              <p>{a.deleteBody}</p>
              {blocked ? <p className="field-hint">{a.deleteSubBlock}</p> : (
                <form className="stack-sm" onSubmit={e => { e.preventDefault(); void remove(); }}>
                  <label className="field-label" htmlFor="set-delete-confirm">{t(a.deleteConfirmLabel, { word: a.deleteWord })}</label>
                  <input id="set-delete-confirm" className="input" value={confirm} autoComplete="off" onChange={e => setConfirm(e.target.value)} />
                  <button type="submit" className="btn btn--coral btn--block" disabled={deleting || confirm.trim().toLocaleUpperCase("hu-HU") !== a.deleteWord}>
                    <Trash2 size={18} aria-hidden /> {deleting ? a.deleting : a.deleteCta}
                  </button>
                </form>
              )}
              {deleteError && <p className="field-hint" role="alert">{deleteError}</p>}
            </section>
          </>
        )}
      </main>
      {toast && <Toast key={toast.id} message={toast.message} />}
    </div>
  );
}
