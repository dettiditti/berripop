"use client";

import { useState } from "react";
import { ArrowRight, KeyRound, Plus } from "lucide-react";
import type { Snapshot } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n/client";
import { createCircleAction, joinCircleAction } from "@/lib/server/actions";

/** "Create a shared circle" / "Join with an invite code", each opening its form. Server actions do the validation. */
export default function CircleSetup({ onSnapshot }: { onSnapshot: (s: Snapshot) => void }) {
  const { d } = useI18n();
  const o = d.onboarding;
  const [mode, setMode] = useState<"create" | "join" | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (name.trim().length < 2) return setError(o.nameTooShort);
    setBusy(true);
    const r = await createCircleAction(name);
    setBusy(false);
    if (r.ok) onSnapshot(r.snapshot);
    else setError(r.error === "limit_circles" ? d.billing.prompts.circles.title : d.auth.error);
  }

  async function join() {
    setBusy(true);
    const r = await joinCircleAction(code);
    setBusy(false);
    if (r.ok) onSnapshot(r.snapshot);
    else setError(r.error === "not_found" ? o.invalidCode : d.auth.error);
  }

  const choose = (m: "create" | "join") => { setMode(m); setError(null); };

  return (
    <div className="circle-setup">
      <div className="circle-setup-actions">
        <button type="button" className={`btn btn--ghost btn--block ${mode === "create" ? "is-active" : ""}`} aria-expanded={mode === "create"} aria-controls="circle-create" onClick={() => choose("create")}>
          <Plus size={18} /> {o.createAction}
        </button>
        <button type="button" className={`btn btn--ghost btn--block ${mode === "join" ? "is-active" : ""}`} aria-expanded={mode === "join"} aria-controls="circle-join" onClick={() => choose("join")}>
          <KeyRound size={18} /> {o.joinAction}
        </button>
      </div>

      {mode === "create" && (
        <form id="circle-create" className="circle-setup-form" onSubmit={e => { e.preventDefault(); void create(); }}>
          <label className="field-label" htmlFor="circle-name">{o.nameLabel}</label>
          <input id="circle-name" className="input" value={name} maxLength={60} placeholder={o.namePlaceholder} autoFocus onChange={e => { setName(e.target.value); setError(null); }} />
          <button type="submit" className="btn btn--primary btn--block" disabled={busy}><Plus size={18} /> {o.create}</button>
        </form>
      )}

      {mode === "join" && (
        <form id="circle-join" className="circle-setup-form" onSubmit={e => { e.preventDefault(); void join(); }}>
          <label className="field-label" htmlFor="invite-code">{o.codeLabel}</label>
          <input id="invite-code" className="input input--code" value={code} maxLength={12} placeholder={o.codePlaceholder} autoCapitalize="characters" autoFocus onChange={e => { setCode(e.target.value.toUpperCase()); setError(null); }} />
          <button type="submit" className="btn btn--primary btn--block" disabled={busy || code.trim().length < 6}>{o.join} <ArrowRight size={18} /></button>
        </form>
      )}

      {error && <p className="field-hint" role="alert">{error}</p>}
    </div>
  );
}
