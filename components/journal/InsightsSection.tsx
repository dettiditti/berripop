"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CalendarCheck, Check, Footprints, Heart, Lock, MessageCircle, PenLine, Trash2, type LucideIcon } from "lucide-react";
import { INSIGHT_KINDS, type InsightKind } from "@/lib/journal/reflection";
import type { InsightDTO, JournalResult, JournalState } from "@/lib/journal/types";
import { useI18n } from "@/lib/i18n/client";
import { deleteInsightAction, saveInsightAction, updateInsightAction } from "@/lib/server/actions";
import { Confirm } from "../Modals";

const KIND_ICON: Record<InsightKind, LucideIcon> = { theme: Heart, question: MessageCircle, exercise: Footprints, quest: CalendarCheck };
const MAX = 300;

type Status = { kind: "saved" | "error"; at: number } | null;

/**
 * "What I want to remember": private notes the owner saves by category.
 * Never shown to circle members and never sent to AI unless the owner opts in
 * on a specific reflection request.
 */
export default function InsightsSection({ insights, onState, notify }: { insights: InsightDTO[]; onState: (s: JournalState) => void; notify: (m: string) => void }) {
  const { d } = useI18n();
  const j = d.journal;
  const [kind, setKind] = useState<InsightKind | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  // The success message fades after a few seconds; errors stay until the next attempt.
  useEffect(() => {
    if (status?.kind !== "saved") return;
    const timer = window.setTimeout(() => setStatus(s => (s?.at === status.at ? null : s)), 4000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const canSave = !!kind && text.trim().length > 0 && !busy;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!canSave || !kind) return;
    setBusy(true);
    let res: JournalResult | null = null;
    try {
      res = await saveInsightAction({ kind, text, origin: "user" });
    } catch {
      res = null;
    }
    setBusy(false);
    if (res?.ok) {
      onState(res.state);
      setText("");
      setKind(null);
      setStatus({ kind: "saved", at: Date.now() });
    } else {
      setStatus({ kind: "error", at: Date.now() });
    }
  }

  return (
    <section className="card insights-card" aria-labelledby="insights-title">
      <div className="insights-head">
        <h2 id="insights-title">{j.insightsTitle}</h2>
        <span className="tag"><Lock size={12} /> {j.privateBadge}</span>
      </div>
      <p className="muted">{j.insightsIntro}</p>

      <form className="insight-form" onSubmit={save}>
        <fieldset className="insight-options">
          <legend className="insight-legend">{j.insightPick}</legend>
          <div className="insight-grid">
            {INSIGHT_KINDS.map(k => {
              const Icon = KIND_ICON[k];
              const selected = kind === k;
              return (
                <label key={k} className={`insight-option insight-option--${k} ${selected ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="insight-kind"
                    value={k}
                    checked={selected}
                    onChange={() => { setKind(k); setStatus(null); }}
                    aria-describedby={`insight-kind-${k}-desc`}
                  />
                  <span className="insight-option-icon" aria-hidden><Icon size={20} strokeWidth={2.25} /></span>
                  <span className="insight-option-copy">
                    <strong>{j.insightKinds[k].title}</strong>
                    <small id={`insight-kind-${k}-desc`}>{j.insightKinds[k].description}</small>
                  </span>
                  <span className="insight-option-check" aria-hidden>{selected && <Check size={14} strokeWidth={3} />}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {kind && (
          <div className="insight-compose">
            <label className="field-label" htmlFor="new-insight">{j.insightInputLabel} · {j.insightKinds[kind].title}</label>
            <textarea
              id="new-insight"
              className="answer-box answer-box--small"
              rows={3}
              maxLength={MAX}
              value={text}
              placeholder={j.insightPlaceholder}
              onChange={e => { setText(e.target.value); if (status?.kind === "error") setStatus(null); }}
            />
            <div className="insight-compose-foot">
              <small className="muted">{j.insightHelper}</small>
              <small className="muted tabular" aria-hidden>{text.length}/{MAX}</small>
            </div>
            <button type="submit" className="btn btn--primary" disabled={!canSave}>{busy ? d.common.loading : j.insightSave}</button>
          </div>
        )}

        <div className="insight-status" role="status" aria-live="polite">
          {status?.kind === "saved" && <span className="insight-status--ok"><Check size={15} strokeWidth={3} /> {j.insightSaved}</span>}
        </div>
        {status?.kind === "error" && <p className="field-hint" role="alert">{j.insightSaveError}</p>}
      </form>

      <div className="insight-saved">
        <h3>{j.savedListTitle}</h3>
        {insights.length === 0 ? (
          <p className="muted insight-empty">{j.insightsEmpty}</p>
        ) : (
          <ul className="insight-list">
            {insights.map(i => <InsightItem key={i.id} insight={i} onState={onState} notify={notify} />)}
          </ul>
        )}
        {!kind && insights.length > 0 && <small className="muted">{j.insightHelper}</small>}
      </div>
    </section>
  );
}

function InsightItem({ insight, onState, notify }: { insight: InsightDTO; onState: (s: JournalState) => void; notify: (m: string) => void }) {
  const { d } = useI18n();
  const j = d.journal;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(insight.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const Icon = KIND_ICON[insight.kind];
  const editId = `insight-edit-${insight.id}`;

  async function saveEdit() {
    if (!draft.trim() || busy) return;
    setBusy(true);
    let res: JournalResult | null = null;
    try {
      res = await updateInsightAction(insight.id, draft);
    } catch {
      res = null;
    }
    setBusy(false);
    if (res?.ok) {
      onState(res.state);
      setEditing(false);
      setError(false);
      notify(j.insightUpdated);
    } else {
      setError(true);
    }
  }

  async function remove() {
    try {
      const res = await deleteInsightAction(insight.id);
      if (res.ok) {
        onState(res.state);
        notify(j.insightDeleted);
        return;
      }
    } catch {
      // Falls through to the generic error below.
    }
    notify(d.auth.error);
  }

  return (
    <li className={`insight-item insight-item--${insight.kind}`}>
      <span className="insight-item-icon" aria-hidden><Icon size={16} strokeWidth={2.25} /></span>
      <div className="insight-item-body">
        <small className="insight-item-meta">{j.suggestion.kinds[insight.kind]} · {insight.origin === "ai_suggested" ? j.insightFromAi : j.insightFromYou}</small>
        {editing ? (
          <div className="stack-sm">
            <label className="sr-only" htmlFor={editId}>{j.insightEdit}</label>
            <textarea
              id={editId}
              className="answer-box answer-box--small"
              rows={2}
              maxLength={MAX}
              value={draft}
              autoFocus
              onChange={e => { setDraft(e.target.value); setError(false); }}
              onKeyDown={e => { if (e.key === "Escape") { setEditing(false); setDraft(insight.text); setError(false); } }}
            />
            {error && <p className="field-hint" role="alert">{j.insightSaveError}</p>}
            <div className="row-gap">
              <button type="button" className="btn btn--primary btn--sm" disabled={!draft.trim() || busy} onClick={saveEdit}>{j.insightSave}</button>
              <button type="button" className="btn btn--text btn--sm" onClick={() => { setEditing(false); setDraft(insight.text); setError(false); }}>{j.insightCancel}</button>
            </div>
          </div>
        ) : (
          <p className="insight-item-text">{insight.text}</p>
        )}
      </div>
      {!editing && (
        <div className="insight-item-actions">
          <button type="button" className="icon-btn" aria-label={`${j.insightEdit}: ${insight.text.slice(0, 40)}`} onClick={() => { setDraft(insight.text); setEditing(true); }}><PenLine size={15} /></button>
          <Confirm label="" ariaLabel={`${j.insightDelete}: ${insight.text.slice(0, 40)}`} icon={<Trash2 size={15} />} className="icon-btn" question={j.insightDeleteConfirm} yes={j.insightDelete} onConfirm={remove} />
        </div>
      )}
    </li>
  );
}
