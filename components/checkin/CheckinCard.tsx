"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, HeartHandshake, NotebookPen, Pencil, Trash2, X } from "lucide-react";
import { CHECKIN_NEEDS, CHECKIN_STATES, CHECKIN_TOPICS, MAX_NOTE, MAX_TOPICS, cleanCheckin, responseKeys, type CheckinNeed, type CheckinState, type CheckinTopic } from "@/lib/checkin/checkin";
import type { CheckinDTO } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n/client";
import { deleteCheckinAction, saveCheckinAction } from "@/lib/server/actions";
import { crisisSignal } from "@/lib/safety/crisis";
import { SafetyCard, SafetyLink } from "../safety/SafetyCard";
import type { Run } from "../screens/types";

type Draft = { state: CheckinState | null; topics: CheckinTopic[]; note: string; need: CheckinNeed | null };
type Phase = "intro" | 1 | 2 | 3 | "done";

const draftOf = (c: CheckinDTO | null): Draft => ({ state: c?.state ?? null, topics: c?.topics ?? [], note: c?.note ?? "", need: c?.need ?? null });

/**
 * The daily check-in on Today: three skippable steps (how you are, what's on
 * your mind, what would help), then a prepared answer. No AI, no XP, no streak.
 */
export default function CheckinCard({ checkin, run, notify, onJournal }: {
  checkin: CheckinDTO | null;
  run: Run;
  notify: (m: string) => void;
  /** Opens a new journal entry starting with this text. */
  onJournal: (starter: string) => void;
}) {
  const { d, t } = useI18n();
  const c = d.checkin;
  const [phase, setPhase] = useState<Phase>(checkin ? "done" : "intro");
  const [draft, setDraft] = useState<Draft>(() => draftOf(checkin));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft(v => ({ ...v, ...patch }));

  const toggleTopic = (id: CheckinTopic) =>
    set({ topics: draft.topics.includes(id) ? draft.topics.filter(x => x !== id) : draft.topics.length < MAX_TOPICS ? [...draft.topics, id] : draft.topics });

  async function finish(final: Draft) {
    if (!cleanCheckin(final)) {
      notify(c.empty);
      setPhase(checkin ? "done" : "intro");
      return;
    }
    setBusy(true);
    const r = await run(saveCheckinAction(final));
    setBusy(false);
    if (r) setPhase("done");
  }

  async function remove() {
    setBusy(true);
    const r = await run(deleteCheckinAction());
    setBusy(false);
    if (r) {
      setDraft(draftOf(null));
      setPhase("intro");
      notify(c.removed);
    }
  }

  const close = () => { setDraft(draftOf(checkin)); setPhase(checkin ? "done" : "intro"); };
  const forward = (from: 1 | 2 | 3, next: Draft = draft) => (from === 3 ? void finish(next) : setPhase((from + 1) as 2 | 3));

  if (phase === "intro") {
    return (
      <section className="card checkin-card" aria-labelledby="checkin-title">
        <span className="eyebrow"><HeartHandshake size={14} /> {c.eyebrow}</span>
        <h2 id="checkin-title">{c.title}</h2>
        <p className="muted">{c.intro}</p>
        <SafetyLink />
        <button type="button" className="btn btn--primary btn--block" onClick={() => setPhase(1)}>{c.start} <ArrowRight size={18} /></button>
      </section>
    );
  }

  if (phase === "done") {
    const shown = checkin ?? { ...draft, date: "", aiReply: null, updatedAt: "" };
    const keys = responseKeys(shown);
    const summary = [shown.state && c.states[shown.state], shown.topics.map(x => c.topics[x]).join(", ")].filter(Boolean).join(" · ");
    const starter = `${t(c.journalStarter, { summary: summary || c.doneTitle })}${shown.note ? `\n${shown.note}` : ""}\n\n`;
    return (
      <section className="card checkin-card" aria-labelledby="checkin-title">
        <span className="eyebrow"><HeartHandshake size={14} /> {c.doneTitle}</span>
        {summary && <h2 id="checkin-title" className="checkin-summary">{summary}</h2>}
        {shown.note && <p className="checkin-note">{shown.note}</p>}
        {crisisSignal(shown.note) && <SafetyCard />}
        <div className="checkin-response" aria-live="polite">
          <strong>{c.responseTitle}</strong>
          <p>{c.responses.state[keys.state]}</p>
          <p>{c.responses.need[keys.need]}</p>
        </div>
        <button type="button" className="btn btn--primary btn--block" onClick={() => onJournal(starter)}><NotebookPen size={16} /> {c.toJournal}</button>
        <div className="checkin-actions">
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => { setDraft(draftOf(checkin)); setPhase(1); }}><Pencil size={14} /> {c.edit}</button>
          <button type="button" className="btn btn--text btn--sm" disabled={busy} onClick={remove}><Trash2 size={14} /> {c.remove}</button>
        </div>
        <small className="muted checkin-privacy">{c.privacy}</small>
        <SafetyLink />
      </section>
    );
  }

  const step = phase;
  return (
    <section className="card checkin-card" aria-labelledby="checkin-q">
      <div className="checkin-top">
        <span className="eyebrow">{c.eyebrow} · {t(c.step, { n: step })}</span>
        <button type="button" className="icon-btn" aria-label={c.close} onClick={close}><X size={18} /></button>
      </div>

      {step === 1 && (
        <fieldset className="checkin-step">
          <legend id="checkin-q"><h2>{c.stateQuestion}</h2></legend>
          <div className="chip-row" role="radiogroup" aria-labelledby="checkin-q">
            {CHECKIN_STATES.map(id => (
              <button key={id} type="button" role="radio" aria-checked={draft.state === id} className={`chip ${draft.state === id ? "is-active" : ""}`} onClick={() => set({ state: draft.state === id ? null : id })}>{c.states[id]}</button>
            ))}
          </div>
        </fieldset>
      )}

      {step === 2 && (
        <fieldset className="checkin-step">
          <legend id="checkin-q"><h2>{c.topicQuestion}</h2></legend>
          <p className="muted checkin-hint">{c.topicHint}</p>
          <div className="chip-row">
            {CHECKIN_TOPICS.map(id => (
              <button key={id} type="button" aria-pressed={draft.topics.includes(id)} className={`chip ${draft.topics.includes(id) ? "is-active" : ""}`} onClick={() => toggleTopic(id)}>{c.topics[id]}</button>
            ))}
          </div>
          <label className="field-label" htmlFor="checkin-note">{c.noteLabel}</label>
          <textarea id="checkin-note" className="answer-box answer-box--small" rows={2} maxLength={MAX_NOTE} value={draft.note} placeholder={c.notePlaceholder} onChange={e => set({ note: e.target.value })} />
        </fieldset>
      )}

      {step === 3 && (
        <fieldset className="checkin-step">
          <legend id="checkin-q"><h2>{c.needQuestion}</h2></legend>
          <div className="chip-row" role="radiogroup" aria-labelledby="checkin-q">
            {CHECKIN_NEEDS.map(id => (
              <button key={id} type="button" role="radio" aria-checked={draft.need === id} className={`chip ${draft.need === id ? "is-active" : ""}`} onClick={() => set({ need: draft.need === id ? null : id })}>{c.needs[id]}</button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="checkin-nav">
        {step > 1
          ? <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPhase((step - 1) as 1 | 2)}><ArrowLeft size={16} /> {c.back}</button>
          : <span />}
        <span className="checkin-nav-right">
          <button type="button" className="btn btn--text btn--sm" disabled={busy} onClick={() => {
            const skipped: Draft = step === 1 ? { ...draft, state: null } : step === 2 ? { ...draft, topics: [], note: "" } : { ...draft, need: null };
            setDraft(skipped);
            forward(step, skipped);
          }}>{c.skip}</button>
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => forward(step)}>
            {step === 3 ? c.finish : c.next} {step < 3 && <ArrowRight size={16} />}
          </button>
        </span>
      </div>
    </section>
  );
}
