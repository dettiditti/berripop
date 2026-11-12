"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Plus, Sparkles, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { FEELINGS, REACTIONS, type Feeling, type Need, type Reaction, type RelationshipError, type TriggerRecordDTO } from "@/lib/relationship/types";
import { analyzeTriggerAction, deleteRelationshipRecordAction } from "@/lib/server/actions";
import { LockedPreview, PremiumBadge, QuotaNote, RelError, useRel, useRelCopy } from "./shared";

/** The five steps of one moment, as a small chain: situation → feeling → thought → reaction → need. */
export function TriggerChain({ situation, feelings, thought, reactions, needs }: { situation: string; feelings: Feeling[]; thought: string; reactions: Reaction[]; needs: Need[] }) {
  const c = useRelCopy();
  const t = c.trigger;
  const steps = [
    situation,
    feelings.map(f => c.feelings[f]).join(", "),
    thought || "–",
    reactions.map(r => c.reactions[r]).join(", ") || "–",
    needs.map(n => c.needs[n]).join(", ") || "–",
  ];
  return (
    <ol className="rel-chain">
      {steps.map((s, i) => (
        <li key={t.steps[i]} className={`rel-chain-step rel-chain-step--${i}`}>
          <small>{t.steps[i]}</small>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

function Toggles<T extends string>({ ids, labels, value, onChange, max = 4 }: { ids: readonly T[]; labels: Record<T, string>; value: T[]; onChange: (v: T[]) => void; max?: number }) {
  return (
    <div className="chip-row">
      {ids.map(id => {
        const on = value.includes(id);
        return (
          <button key={id} type="button" className={`chip ${on ? "is-active" : ""}`} aria-pressed={on} disabled={!on && value.length >= max}
            onClick={() => onChange(on ? value.filter(x => x !== id) : [...value, id])}>{labels[id]}</button>
        );
      })}
    </div>
  );
}

function Entry({ entry }: { entry: TriggerRecordDTO }) {
  const c = useRelCopy();
  const t = c.trigger;
  const { date } = useI18n();
  const { setState } = useRel();
  const [confirm, setConfirm] = useState(false);
  async function remove() {
    const r = await deleteRelationshipRecordAction(entry.id);
    if (r.ok) setState(r.state);
  }
  return (
    <li className="card rel-trigger-entry">
      <div className="rel-trigger-entry-head">
        <small className="muted">{date(entry.createdAt.slice(0, 10), "long")}</small>
        {confirm ? (
          <span className="rel-confirm">
            <button type="button" className="btn btn--text btn--inline" onClick={() => setConfirm(false)}>{c.data.cancel}</button>
            <button type="button" className="btn btn--coral btn--sm" onClick={() => void remove()}>{t.delete}</button>
          </span>
        ) : (
          <button type="button" className="icon-btn" aria-label={t.delete} onClick={() => setConfirm(true)}><Trash2 size={16} /></button>
        )}
      </div>
      <TriggerChain situation={entry.input.situation} feelings={entry.input.feelings} thought={entry.input.thought} reactions={entry.input.reactions} needs={entry.insight?.needs ?? []} />
      {entry.insight && (
        <div className="rel-trigger-insight">
          <p>{entry.insight.reflection}</p>
          <p className="rel-quote"><strong>{t.alternativeTitle}:</strong> {entry.insight.alternative}</p>
        </div>
      )}
    </li>
  );
}

function Patterns() {
  const c = useRelCopy();
  const t = c.trigger;
  const { state } = useRel();
  const p = state.patterns;
  // A pattern needs at least two entries; before that the card would only say so.
  if (!p || p.entries < 2) return null;
  const any = p.feelings.length + p.reactions.length + p.needs.length > 0;
  return (
    <section className="card rel-premium-card stack-sm" aria-labelledby="rel-patterns">
      <div className="rel-premium-head"><PremiumBadge label={c.premiumBadge} /><h2 id="rel-patterns">{t.patternsTitle}</h2></div>
      {!any ? <p className="muted">{t.patternsEmpty}</p> : (
        <div className="rel-pattern-cols">
          {p.feelings.length > 0 && <div><h3>{t.steps[1]}</h3><ul>{p.feelings.map(x => <li key={x.id}>{c.feelings[x.id]} <span className="muted">× {x.count}</span></li>)}</ul></div>}
          {p.reactions.length > 0 && <div><h3>{t.steps[3]}</h3><ul>{p.reactions.map(x => <li key={x.id}>{c.reactions[x.id]} <span className="muted">× {x.count}</span></li>)}</ul></div>}
          {p.needs.length > 0 && <div><h3>{t.steps[4]}</h3><ul>{p.needs.map(x => <li key={x.id}>{c.needs[x.id]} <span className="muted">× {x.count}</span></li>)}</ul></div>}
        </div>
      )}
      <p className="muted rel-small">{t.patternsNote(p.entries)}</p>
    </section>
  );
}

/** A new entry, step by step; the last step asks Berri for the need behind it and saves the entry. */
function Compose({ onDone }: { onDone: () => void }) {
  const c = useRelCopy();
  const t = c.trigger;
  const { state, setState, paywall } = useRel();
  const [step, setStep] = useState(0);
  const [situation, setSituation] = useState("");
  const [feelings, setFeelings] = useState<Feeling[]>([]);
  const [thought, setThought] = useState("");
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [reactionNote, setReactionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RelationshipError | null>(null);
  const canNext = step === 0 ? situation.trim().length >= 3 : step === 1 ? feelings.length > 0 : true;

  async function analyze() {
    setBusy(true);
    setError(null);
    try {
      const r = await analyzeTriggerAction({ situation, feelings, thought, reactions, reactionNote });
      if (r.ok) {
        setState(r.state);
        onDone();
        return;
      }
      if (r.error === "premium_required") paywall("trigger");
      else setError(r.error);
    } catch {
      setError("ai_failed");
    }
    setBusy(false);
  }

  return (
    <section className="card rel-compose stack-sm" aria-labelledby="rel-compose-title">
      <ol className="rel-steps" aria-hidden>{t.steps.map((s, i) => <li key={s} className={i === step ? "is-on" : i < step ? "is-done" : ""}>{s}</li>)}</ol>
      {step === 0 && (
        <>
          <label id="rel-compose-title" className="field-label" htmlFor="rel-situation">{t.situation}</label>
          <p className="muted rel-small">{t.situationHint}</p>
          <textarea id="rel-situation" className="answer-box answer-box--small" rows={3} maxLength={800} value={situation} placeholder={t.situationPlaceholder} onChange={e => setSituation(e.target.value)} />
        </>
      )}
      {step === 1 && (<><h2 id="rel-compose-title" className="field-label">{t.feelings}</h2><Toggles ids={FEELINGS} labels={c.feelings} value={feelings} onChange={setFeelings} /></>)}
      {step === 2 && (
        <>
          <label id="rel-compose-title" className="field-label" htmlFor="rel-thought">{t.thought}</label>
          <textarea id="rel-thought" className="answer-box answer-box--small" rows={2} maxLength={500} value={thought} placeholder={t.thoughtPlaceholder} onChange={e => setThought(e.target.value)} />
        </>
      )}
      {step === 3 && (
        <>
          <h2 id="rel-compose-title" className="field-label">{t.reactions}</h2>
          <Toggles ids={REACTIONS} labels={c.reactions} value={reactions} onChange={setReactions} />
          <label className="field-label" htmlFor="rel-reaction-note">{t.reactionNote}</label>
          <textarea id="rel-reaction-note" className="answer-box answer-box--small" rows={2} maxLength={300} value={reactionNote} onChange={e => setReactionNote(e.target.value)} />
        </>
      )}
      <div className="rel-compose-actions">
        {step > 0 && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setStep(step - 1)}><ArrowLeft size={15} /> {c.prev}</button>}
        {step < 3 ? (
          <button type="button" className="btn btn--primary btn--sm" disabled={!canNext} onClick={() => setStep(step + 1)}>{c.next} <ArrowRight size={15} /></button>
        ) : (
          <button type="button" className="btn btn--premium" disabled={busy || state.quota.remaining <= 0} aria-busy={busy} onClick={() => void analyze()}><Sparkles size={16} aria-hidden /> {busy ? t.analyzing : t.analyze}</button>
        )}
      </div>
      {step === 3 && <QuotaNote />}
      <RelError error={error} />
    </section>
  );
}

function Sample() {
  const c = useRelCopy();
  const s = c.trigger.sample;
  return (
    <>
      <TriggerChain situation={s.situation} feelings={s.feelings} thought={s.thought} reactions={s.reactions} needs={s.needs} />
      <p className="rel-quote">{s.alternative}</p>
    </>
  );
}

export default function TriggerMap({ onBack }: { onBack: () => void }) {
  const c = useRelCopy();
  const t = c.trigger;
  const { state } = useRel();
  const [composing, setComposing] = useState(state.premium && state.triggers.length === 0);
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
      {!state.premium ? (
        <section className="card rel-premium-card"><LockedPreview feature="trigger"><Sample /></LockedPreview></section>
      ) : composing ? (
        <Compose onDone={() => setComposing(false)} />
      ) : (
        <button type="button" className="btn btn--premium btn--block" onClick={() => setComposing(true)}><Plus size={16} /> {t.newEntry}</button>
      )}
      {state.premium && <Patterns />}
      {state.triggers.length > 0 && (
        <section className="stack-sm" aria-labelledby="rel-map-title">
          <h2 id="rel-map-title">{t.mapTitle}</h2>
          <ul className="rel-trigger-list">{state.triggers.map(e => <Entry key={e.id} entry={e} />)}</ul>
        </section>
      )}
      {state.premium && state.triggers.length === 0 && !composing && <p className="muted">{t.empty}</p>}
      <p className="muted rel-small">{c.disclaimer}</p>
    </div>
  );
}
