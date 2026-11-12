"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { hapticSuccess } from "@/lib/nativeBridge";
import { ATTACHMENT_ITEMS, GIVE_PAIRS, RECEIVE_PAIRS } from "@/lib/relationship/scoring";
import type { Likert, PairChoice, RelationshipError, RelationshipResult } from "@/lib/relationship/types";
import { relationshipEventAction, saveAttachmentAction, saveLoveLanguageAction } from "@/lib/server/actions";
import { RelError, useRel, useRelCopy } from "./shared";

/** Moves on a moment after a tap, so the member sees their choice land. */
const ADVANCE_MS = 220;

function Progress({ i, n, label }: { i: number; n: number; label: string }) {
  return (
    <div className="rel-quiz-progress">
      <span className="rel-quiz-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={n} aria-valuenow={i} aria-label={label}><i style={{ width: `${(i / n) * 100}%` }} /></span>
      <small>{label}</small>
    </div>
  );
}

function useSave<T>(save: () => Promise<RelationshipResult<T>>, onDone: () => void) {
  const { setState } = useRel();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RelationshipError | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await save();
      if (r.ok) {
        setState(r.state);
        hapticSuccess();
        onDone();
        return;
      }
      setError(r.error);
    } catch {
      setError("ai_failed");
    }
    setBusy(false);
  }
  return { busy, error, run };
}

/** Love languages: ten "receiving" situations, then ten "giving" ones, each a choice between two (or both). */
export function LoveLanguageQuiz({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const c = useRelCopy();
  const l = c.love;
  const total = RECEIVE_PAIRS.length + GIVE_PAIRS.length;
  const [answers, setAnswers] = useState<PairChoice[]>([]);
  const [i, setI] = useState(0);
  const timer = useRef<number | null>(null);
  useEffect(() => { void relationshipEventAction("love_language_test_started"); return () => { if (timer.current) window.clearTimeout(timer.current); }; }, []);
  const giving = i >= RECEIVE_PAIRS.length;
  const pair = giving ? l.give[i - RECEIVE_PAIRS.length] : l.receive[i];
  const complete = answers.length === total && answers.every(Boolean);
  const { busy, error, run } = useSave(() => saveLoveLanguageAction({ receive: answers.slice(0, RECEIVE_PAIRS.length), give: answers.slice(RECEIVE_PAIRS.length) }), onDone);

  function pick(choice: PairChoice) {
    const next = [...answers];
    next[i] = choice;
    setAnswers(next);
    if (i < total - 1) timer.current = window.setTimeout(() => setI(x => Math.min(total - 1, x + 1)), ADVANCE_MS);
  }

  return (
    <section className="card rel-quiz" aria-labelledby="rel-quiz-title">
      <button type="button" className="btn btn--text world-back" onClick={i === 0 ? onBack : () => setI(i - 1)}><ArrowLeft size={16} /> {i === 0 ? c.back : c.prev}</button>
      <Progress i={answers.filter(Boolean).length} n={total} label={c.progress(Math.min(i + 1, total), total)} />
      <span className="eyebrow">{giving ? l.giveTitle : l.receiveTitle}</span>
      <h2 id="rel-quiz-title" className="rel-quiz-q">{pair.q}</h2>
      <p className="muted">{giving ? l.giveHint : l.receiveHint}</p>
      <div className="rel-pair" role="radiogroup" aria-labelledby="rel-quiz-title">
        {(["a", "both", "b"] as const).map(k => (
          <button key={k} type="button" role="radio" aria-checked={answers[i] === k}
            className={`rel-pair-option rel-pair-option--${k} ${answers[i] === k ? "is-on" : ""}`} onClick={() => pick(k)}>
            {k === "both" ? l.both : pair[k]}
          </button>
        ))}
      </div>
      {i === total - 1 && (
        <button type="button" className="btn btn--primary btn--lg btn--block" disabled={!complete || busy} aria-busy={busy} onClick={() => void run()}>{busy ? c.saving : c.finish}</button>
      )}
      {i < total - 1 && answers[i] && <button type="button" className="btn btn--ghost btn--block" onClick={() => setI(i + 1)}>{c.next}</button>}
      <RelError error={error} />
    </section>
  );
}

/** Attachment: 18 statements on a five-step scale. */
export function AttachmentQuiz({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const c = useRelCopy();
  const a = c.attach;
  const total = ATTACHMENT_ITEMS.length;
  const [answers, setAnswers] = useState<Likert[]>([]);
  const [i, setI] = useState(0);
  const timer = useRef<number | null>(null);
  useEffect(() => { void relationshipEventAction("attachment_test_started"); return () => { if (timer.current) window.clearTimeout(timer.current); }; }, []);
  const complete = answers.length === total && answers.every(Boolean);
  const { busy, error, run } = useSave(() => saveAttachmentAction({ answers }), onDone);

  function pick(v: Likert) {
    const next = [...answers];
    next[i] = v;
    setAnswers(next);
    if (i < total - 1) timer.current = window.setTimeout(() => setI(x => Math.min(total - 1, x + 1)), ADVANCE_MS);
  }

  return (
    <section className="card rel-quiz" aria-labelledby="rel-quiz-title">
      <button type="button" className="btn btn--text world-back" onClick={i === 0 ? onBack : () => setI(i - 1)}><ArrowLeft size={16} /> {i === 0 ? c.back : c.prev}</button>
      <Progress i={answers.filter(Boolean).length} n={total} label={c.progress(Math.min(i + 1, total), total)} />
      <span className="eyebrow">{a.name}</span>
      <h2 id="rel-quiz-title" className="rel-quiz-q">{a.items[i]}</h2>
      <div className="rel-likert" role="radiogroup" aria-labelledby="rel-quiz-title">
        {([1, 2, 3, 4, 5] as const).map(v => (
          <button key={v} type="button" role="radio" aria-checked={answers[i] === v} className={`rel-likert-option ${answers[i] === v ? "is-on" : ""}`} onClick={() => pick(v)}>
            <i aria-hidden className={`rel-likert-dot rel-likert-dot--${v}`} />
            <span>{a.scale[v - 1]}</span>
          </button>
        ))}
      </div>
      {i === total - 1 && (
        <button type="button" className="btn btn--primary btn--lg btn--block" disabled={!complete || busy} aria-busy={busy} onClick={() => void run()}>{busy ? c.saving : c.finish}</button>
      )}
      {i < total - 1 && answers[i] && <button type="button" className="btn btn--ghost btn--block" onClick={() => setI(i + 1)}>{c.next}</button>}
      <RelError error={error} />
    </section>
  );
}
