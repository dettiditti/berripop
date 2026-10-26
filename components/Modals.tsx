"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Check, Copy, RefreshCw, X } from "lucide-react";
import { categoryTone } from "@/lib/content";
import type { CircleDTO, QuestionRef } from "@/lib/domain/types";
import type { View } from "@/lib/domain/view";
import { useI18n } from "@/lib/i18n/client";
import { createQuestionAction, regenerateInviteAction } from "@/lib/server/actions";
import type { CategoryId } from "@/lib/types";
import BerripopMascot from "./berripop/BerripopMascot";
import type { Run } from "./screens/types";

export function Sheet({ title, kicker, onClose, children }: { title: string; kicker: string; onClose: () => void; children: ReactNode }) {
  const { d } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <span className="eyebrow">{kicker}</span>
            <h2 id="sheet-title">{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={d.common.close}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A button that asks for confirmation inline before running an irreversible action. */
export function Confirm({ label, question, yes, onConfirm, className = "btn btn--text btn--inline", icon, ariaLabel }: { label: string; question: string; yes: string; onConfirm: () => void; className?: string; icon?: ReactNode; ariaLabel?: string }) {
  const { d } = useI18n();
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className={className} aria-label={ariaLabel} onClick={() => setAsking(true)}>{icon}{label}</button>;
  return (
    <span className="confirm" role="alertdialog" aria-label={question}>
      <span>{question}</span>
      <button className="btn btn--coral btn--sm" onClick={() => { setAsking(false); onConfirm(); }}>{yes}</button>
      <button className="btn btn--text btn--sm" onClick={() => setAsking(false)}>{d.common.cancel}</button>
    </span>
  );
}

/** Only opened inside a circle. */
export function InviteModal({ view, run, notify, onClose }: { view: View & { circle: CircleDTO }; run: Run; notify: (m: string) => void; onClose: () => void }) {
  const { d } = useI18n();
  const c = d.circle;
  const [copied, setCopied] = useState(false);
  const link = typeof window === "undefined" ? `/join/${view.circle.inviteCode}` : `${window.location.origin}/join/${view.circle.inviteCode}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard can be blocked; the link stays visible to copy by hand.
    }
    setCopied(true);
    notify(c.copied);
  }

  return (
    <Sheet kicker={view.circle.name} title={c.inviteTitle} onClose={onClose}>
      <div className="invite-art"><BerripopMascot pair mood="happy" size={86} /></div>
      <p className="muted">{c.inviteBody}</p>
      <span className="field-label">{c.linkLabel}</span>
      <div className="invite-link">
        <code>{link}</code>
        <button className="icon-btn" onClick={copy} aria-label={c.copy}>{copied ? <Check size={18} /> : <Copy size={18} />}</button>
      </div>
      <p className="muted invite-code">{c.codeLabel}: <strong>{view.circle.inviteCode}</strong></p>
      <button className="btn btn--primary btn--lg btn--block" onClick={copy}>{copied ? <>{c.copied} <Check size={18} /></> : <>{c.copy} <Copy size={18} /></>}</button>
      {view.circle.role === "owner" && (
        <Confirm
          label={c.regenerate}
          icon={<RefreshCw size={14} />}
          question={c.regenerateConfirm}
          yes={c.regenerateYes}
          onConfirm={async () => {
            if (await run(regenerateInviteAction(view.circle.id))) { setCopied(false); notify(c.regenerated); }
          }}
        />
      )}
    </Sheet>
  );
}

const pickable: CategoryId[] = ["friendship", "communication", "confidence", "playful", "boundaries", "gratitude", "curiosity", "emotions"];
const MIN_QUESTION = 5;

export function QuestionComposer({ circleId, run, onClose, onCreated }: { circleId: string; run: Run; onClose: () => void; onCreated: (ref: QuestionRef) => void }) {
  const { d, plural } = useI18n();
  const c = d.questions.composer;
  const [text, setText] = useState("");
  const [category, setCategory] = useState<CategoryId>("friendship");
  const [toCircle, setToCircle] = useState(true);
  const [busy, setBusy] = useState(false);
  const tooShort = text.trim().length < MIN_QUESTION;

  async function create() {
    setBusy(true);
    const r = await run(createQuestionAction(circleId, text, category, toCircle));
    setBusy(false);
    if (r?.data) onCreated(r.data);
  }

  return (
    <Sheet kicker={c.kicker} title={c.title} onClose={onClose}>
      <p className="muted">{c.intro}</p>
      <label className="field-label" htmlFor="new-question">{c.label}</label>
      <textarea id="new-question" className="answer-box answer-box--small" value={text} onChange={e => setText(e.target.value)} placeholder={c.placeholder} rows={3} maxLength={240} autoFocus aria-describedby="new-question-hint" />
      {tooShort && text.length > 0 && <p className="field-hint" id="new-question-hint" role="status">{plural(d.validation.questionTooShort, MIN_QUESTION)}</p>}
      <span className="field-label">{c.topic}</span>
      <div className="chip-row">
        {pickable.map(id => (
          <button key={id} type="button" className={`chip tone-${categoryTone[id]} ${category === id ? "is-active" : ""}`} aria-pressed={category === id} onClick={() => setCategory(id)}>
            {d.categories[id]}
          </button>
        ))}
      </div>
      <label className="toggle composer-toggle">
        <input type="checkbox" checked={toCircle} onChange={e => setToCircle(e.target.checked)} />
        <span className="toggle-track" aria-hidden><i /></span>
        <span><strong>{d.qa.composerAddToCircle}</strong></span>
      </label>
      <div className="sheet-actions">
        <button className="btn btn--ghost" onClick={onClose}>{d.common.cancel}</button>
        <button className="btn btn--primary" disabled={tooShort || busy} onClick={create}>{c.add} <ArrowRight size={18} /></button>
      </div>
    </Sheet>
  );
}

export function Toast({ message }: { message: string }) {
  return <div className="toast" role="status"><Check size={16} strokeWidth={3} /> {message}</div>;
}
