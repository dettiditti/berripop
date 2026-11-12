"use client";

import { useState } from "react";
import { ArrowLeft, Copy, Languages, Trash2 } from "lucide-react";
import { TRANSLATE_WHO, type RelationshipError, type TranslateWho, type TranslationRecordDTO } from "@/lib/relationship/types";
import { deleteRelationshipRecordAction, translateSentenceAction } from "@/lib/server/actions";
import { LockedPreview, PremiumBadge, QuotaNote, RelError, useCopied, useRel, useRelCopy } from "./shared";

function Result({ item, onDelete }: { item: TranslationRecordDTO; onDelete?: () => void }) {
  const c = useRelCopy();
  const t = c.translator;
  const [copied, copy] = useCopied();
  return (
    <article className="card rel-translation">
      <div className="rel-translation-original">
        <small>{t.original}</small>
        <p>„{item.original}”</p>
        {onDelete && <button type="button" className="icon-btn" aria-label={c.trigger.delete} onClick={onDelete}><Trash2 size={16} /></button>}
      </div>
      <dl className="rel-translation-meta">
        <div><dt>{t.feeling}</dt><dd>{item.result.feeling}</dd></div>
        <div><dt>{t.need}</dt><dd>{item.result.need}</dd></div>
      </dl>
      {([["calm", item.result.calm], ["direct", item.result.direct]] as const).map(([k, text]) => (
        <div key={k} className={`rel-translation-version rel-translation-version--${k}`}>
          <small>{t[k]}</small>
          <p>{text}</p>
          <button type="button" className="btn btn--text btn--inline" onClick={() => copy(text)}><Copy size={14} /> {copied ? t.copied : t.copy}</button>
        </div>
      ))}
      <p className="muted rel-small"><strong>{t.why}:</strong> {item.result.why}</p>
    </article>
  );
}

export default function Translator({ onBack }: { onBack: () => void }) {
  const c = useRelCopy();
  const t = c.translator;
  const { state, setState, paywall } = useRel();
  const [text, setText] = useState("");
  const [who, setWho] = useState<TranslateWho | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RelationshipError | null>(null);
  const canUse = state.premium || state.freeTranslationLeft;
  const left = state.premium ? state.quota.remaining > 0 : state.freeTranslationLeft;

  async function translate() {
    if (!canUse) return paywall("translator");
    setBusy(true);
    setError(null);
    try {
      const r = await translateSentenceAction({ original: text, who });
      if (r.ok) {
        setState(r.state);
        setText("");
        return setBusy(false);
      }
      if (r.error === "premium_required") paywall("translator");
      else setError(r.error);
    } catch {
      setError("ai_failed");
    }
    setBusy(false);
  }

  async function remove(id: string) {
    const r = await deleteRelationshipRecordAction(id);
    if (r.ok) setState(r.state);
  }

  const [latest, ...older] = state.translations;

  return (
    <div className="stack rel-feature">
      <button type="button" className="btn btn--text world-back" onClick={onBack}><ArrowLeft size={16} /> {c.back}</button>
      <header className="page-head">
        <div>
          <span className="eyebrow"><PremiumBadge label={c.premiumBadge} /></span>
          <h1>{t.name}</h1>
          <p>{t.lead}</p>
        </div>
      </header>

      {canUse ? (
        <section className="card stack-sm rel-translator-form">
          <label className="field-label" htmlFor="rel-original">{t.input}</label>
          <textarea id="rel-original" className="answer-box answer-box--small" rows={3} maxLength={600} value={text} placeholder={t.placeholder} onChange={e => setText(e.target.value)} />
          <p className="field-label">{t.examplesTitle}</p>
          <div className="chip-row">{t.examples.map(x => <button key={x} type="button" className="chip" onClick={() => setText(x)}>{x}</button>)}</div>
          <p className="field-label">{t.who}</p>
          <div className="chip-row">
            {TRANSLATE_WHO.map(w => <button key={w} type="button" className={`chip ${who === w ? "is-active" : ""}`} aria-pressed={who === w} onClick={() => setWho(who === w ? null : w)}>{t.whoOptions[w]}</button>)}
          </div>
          <button type="button" className="btn btn--premium btn--lg btn--block" disabled={busy || text.trim().length < 3 || !left || !state.aiConfigured} aria-busy={busy} onClick={() => void translate()}>
            <Languages size={17} aria-hidden /> {busy ? t.thinking : t.cta}
          </button>
          {state.premium ? <QuotaNote /> : <p className="rel-quota">{t.freeOnce}</p>}
          <RelError error={error} />
        </section>
      ) : (
        <section className="card rel-premium-card stack-sm">
          <p className="muted">{t.freeUsed}</p>
          <LockedPreview feature="translator">
            <div className="rel-translation-original"><small>{t.original}</small><p>„{t.sampleOriginal}”</p></div>
            <div className="rel-translation-version rel-translation-version--calm"><small>{t.calm}</small><p>{t.sampleCalm}</p></div>
            <p className="muted rel-small"><strong>{t.need}:</strong> {t.sampleNeed}</p>
          </LockedPreview>
        </section>
      )}

      {latest && <Result item={latest} onDelete={() => void remove(latest.id)} />}
      {older.length > 0 && (
        <details className="card rel-history">
          <summary>{t.history} ({older.length})</summary>
          <div className="stack-sm">{older.map(x => <Result key={x.id} item={x} onDelete={() => void remove(x.id)} />)}</div>
        </details>
      )}
      <p className="muted rel-small">{c.disclaimer}</p>
    </div>
  );
}
