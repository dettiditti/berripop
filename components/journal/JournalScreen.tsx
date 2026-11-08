"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarHeart, Download, Lock, Network, PenLine, Sparkles, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";
import { PLAN_LIMITS } from "@/lib/billing/plans";
import { SUPPORT_MODES, type SupportMode } from "@/lib/journal/reflection";
import type { JournalEntryDTO, JournalError, JournalReflectionDTO, JournalResult, JournalState, WeeklyJournalDTO } from "@/lib/journal/types";
import { useI18n } from "@/lib/i18n/client";
import { addDays, parseKey } from "@/lib/dates";
import { MOOD_COPY, MOOD_LABELS, weekMoods } from "@/lib/journal/moods";
import { useAiConsent } from "../AiConsent";
import {
  deleteAllJournalAction, deleteJournalEntryAction, exportJournalAction, getJournalAction,
  reflectionFeedbackAction, reflectOnEntryAction, saveInsightAction, trackAction, weeklyJournalAction,
} from "@/lib/server/actions";
import BerripopMascot from "../berripop/BerripopMascot";
import BerripopReaction from "../berripop/BerripopReaction";
import UpgradePrompt from "../billing/UpgradePrompt";
import { Confirm } from "../Modals";
import type { AccountDTO } from "@/lib/domain/types";
import InsightsSection from "./InsightsSection";
import JournalEditor from "./JournalEditor";
import { SafetyCard, SafetyLink } from "../safety/SafetyCard";
import { crisisSignal } from "@/lib/safety/crisis";
import { THOUGHT_COPY } from "@/lib/thought/copy";
import ThoughtDissector from "../thought/ThoughtDissector";
import { MoodSticker } from "./MoodSticker";

/** How Berripop should help with this entry: listen, think it through together, or a practical idea (per request). */
export function SupportModePicker({ value, onChange }: { value: SupportMode; onChange: (m: SupportMode) => void }) {
  const { d } = useI18n();
  const m = d.journal.supportMode;
  return (
    <fieldset className="support-mode">
      <legend className="field-label">{m.label}</legend>
      <div className="chip-row" role="radiogroup">
        {SUPPORT_MODES.map(id => (
          <button key={id} type="button" role="radio" aria-checked={value === id} className={`chip ${value === id ? "is-active" : ""}`} onClick={() => onChange(id)}>
            {m.options[id]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Opt-in checkbox shown next to AI requests when the plan allows insight context and there are insights. */
export function UseInsightsToggle({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  const { d } = useI18n();
  return (
    <label className="insight-optin" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} aria-describedby={`${id}-hint`} />
      <span>
        <strong>{d.journal.useInsights}</strong>
        <small id={`${id}-hint`} className="muted">{d.journal.useInsightsHint}</small>
      </span>
    </label>
  );
}

/** One AI reflection, with explicit, confirmed saving of any suggestion and feedback/correction. */
function ReflectionCard({ r, goals, onResult, notify }: { r: JournalReflectionDTO; goals: { id: string; title: string }[]; onResult: (res: JournalResult) => void; notify: (m: string) => void }) {
  const { d, t } = useI18n();
  const j = d.journal;
  const [correction, setCorrection] = useState(r.correction ?? "");
  const [dismissed, setDismissed] = useState(false);
  const goal = r.suggestion?.goalId ? goals.find(g => g.id === r.suggestion!.goalId) : undefined;

  async function feedback(value: "helpful" | "not_helpful", note?: string) {
    const res = await reflectionFeedbackAction(r.id, value, note);
    onResult(res);
    if (res.ok) notify(j.reflection.feedbackThanks);
  }

  return (
    <section className="card reflection-card" aria-label={j.reflection.title}>
      <div className="reflection-head">
        <BerripopMascot mood="comforting" size={40} motion="none" />
        <strong>{j.reflection.title}</strong>
      </div>
      <div className="reflection-part"><span>{j.reflection.noticed}</span><p>{r.noticed}</p></div>
      {r.strength && <div className="reflection-part"><span>{j.reflection.strength}</span><p>{r.strength}</p></div>}
      <div className="reflection-part"><span>{j.reflection.explore}</span><p>{r.explore}</p></div>
      {r.alternatives.length > 0 && (
        <div className="reflection-part"><span>{j.reflection.alternatives}</span><ul className="reflection-list">{r.alternatives.map(a => <li key={a}>{a}</li>)}</ul></div>
      )}
      {r.nextStep && <div className="reflection-part"><span>{j.reflection.nextStep}</span><p>{r.nextStep}</p></div>}

      {r.suggestion && !dismissed && (
        <div className="suggestion">
          <span className="shared-progress-label">{j.suggestion.title} · {j.suggestion.kinds[r.suggestion.kind]}</span>
          <p>{r.suggestion.text}</p>
          {goal && <small className="muted">{t(j.suggestion.forGoal, { goal: goal.title })}</small>}
          <div className="row-gap">
            <Confirm
              label={j.suggestion.save}
              className="btn btn--ghost btn--sm"
              question={j.suggestion.confirm}
              yes={j.suggestion.confirmYes}
              onConfirm={async () => {
                const res = await saveInsightAction({ kind: r.suggestion!.kind, text: r.suggestion!.text, goalId: r.suggestion!.goalId, sourceEntryId: r.entryId, origin: "ai_suggested" });
                onResult(res);
                if (res.ok) { notify(j.suggestion.saved); setDismissed(true); }
              }}
            />
            <button className="btn btn--text btn--inline" onClick={() => setDismissed(true)}>{j.suggestion.dismiss}</button>
          </div>
        </div>
      )}

      <small className="muted">{j.reflection.disclaimer}</small>
      <div className="row-gap">
        <button className={`btn btn--ghost btn--sm ${r.feedback === "helpful" ? "is-active" : ""}`} aria-pressed={r.feedback === "helpful"} onClick={() => feedback("helpful")}><ThumbsUp size={14} /> {j.reflection.helpful}</button>
        <button className={`btn btn--ghost btn--sm ${r.feedback === "not_helpful" ? "is-active" : ""}`} aria-pressed={r.feedback === "not_helpful"} onClick={() => feedback("not_helpful", correction)}><ThumbsDown size={14} /> {j.reflection.notHelpful}</button>
      </div>
      {r.feedback === "not_helpful" && (
        <div className="stack-sm">
          <label className="field-label" htmlFor={`corr-${r.id}`}>{j.reflection.correctionLabel}</label>
          <textarea id={`corr-${r.id}`} className="answer-box answer-box--small" rows={2} maxLength={1000} value={correction} onChange={e => setCorrection(e.target.value)} />
          <button className="btn btn--text btn--inline" onClick={() => feedback("not_helpful", correction)}>{j.reflection.correctionSave}</button>
        </div>
      )}
    </section>
  );
}

/** The journal needs only the account (goals, plan) and today's date, so it works with or without a circle. */
export default function JournalScreen({ account, today, notify, starter, onJournalState, reflectRequest }: {
  account: AccountDTO;
  today: string;
  notify: (m: string) => void;
  /** Opens a new entry pre-filled with this question (changing `id` opens it again). */
  starter?: { prompt: string; id: number } | null;
  /** Reports the loaded journal state, e.g. for first-steps progress. */
  onJournalState?: (s: JournalState) => void;
  /** Asks for a reflection on this entry, as if its "ask Berripop" button was pressed (changing `id` asks again). */
  reflectRequest?: { entryId: string; id: number } | null;
}) {
  const { d, t, plural, relativeDay, date, locale } = useI18n();
  const withAiConsent = useAiConsent();
  const j = d.journal;
  const [state, setState] = useState<JournalState | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<JournalEntryDTO | null | "new">(null);
  const [starterBody, setStarterBody] = useState<string | undefined>(undefined);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [reflecting, setReflecting] = useState<string | null>(null);
  const [weekly, setWeekly] = useState<WeeklyJournalDTO | null>(null);
  const [weeklyBusy, setWeeklyBusy] = useState(false);
  const [hiddenProposals, setHiddenProposals] = useState<string[]>([]);
  // Per-request opt-in for sending saved insights to the AI; always starts off.
  const [useInsights, setUseInsights] = useState(false);
  const [mode, setMode] = useState<SupportMode>("reflect");
  // Entries the AI flagged as a possible crisis in this session (never stored).
  const [aiSafety, setAiSafety] = useState<string[]>([]);
  // The Gondolatboncoló overlay; `source` when it starts from an entry.
  const [dissect, setDissect] = useState<{ source: { entryId: string; body: string } | null } | null>(null);
  const goals = account.goals.filter(g => g.status === "active");

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const r = await getJournalAction();
      if (r.ok) setState(r.state);
      else setFailed(true);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!starter) return;
    setStarterBody(starter.prompt);
    setEditing("new");
  }, [starter]);

  useEffect(() => {
    if (state) onJournalState?.(state);
  }, [state, onJournalState]);

  const handledReflect = useRef<number | null>(null);
  useEffect(() => {
    if (!reflectRequest || !state || handledReflect.current === reflectRequest.id) return;
    handledReflect.current = reflectRequest.id;
    void reflect(reflectRequest.entryId);
    // Only a new request should trigger a (metered) reflection, not later state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reflectRequest, !!state]);

  const canUseInsights = !!state?.insightContext && state.insights.length > 0;

  const errorText = (e: JournalError) =>
    e === "limit_ai" ? t(j.limitReached, { date: state ? date(state.usage.resets) : "" }) : e === "ai_unavailable" ? j.aiUnavailable : e === "ai_consent_required" ? d.aiAssist.consentRequired : e === "invalid" ? j.tooShort : d.auth.error;

  const apply = (res: JournalResult<unknown>) => {
    if (res.ok) setState(res.state);
    else notify(errorText(res.error));
    return res.ok;
  };

  async function reflect(entryId: string, withInsights = useInsights) {
    setEditing(null);
    setStarterBody(undefined);
    setOpenEntry(entryId);
    setReflecting(entryId);
    void trackAction("journal_ai_reflection_requested");
    const res = await withAiConsent(() => reflectOnEntryAction(entryId, withInsights && canUseInsights, mode)).catch(() => undefined);
    setUseInsights(false);
    setReflecting(null);
    if (res === undefined) notify(d.auth.error);
    else if (res) {
      apply(res);
      if (res.ok && res.data?.safety) setAiSafety(v => [...v, entryId]);
    }
  }

  async function runWeekly() {
    setWeeklyBusy(true);
    const res = await withAiConsent(() => weeklyJournalAction(useInsights && canUseInsights)).catch(() => undefined);
    setUseInsights(false);
    setWeeklyBusy(false);
    if (res === undefined) notify(d.auth.error);
    else if (!res) return;
    else if (res.ok) { setState(res.state); setWeekly(res.weekly); setHiddenProposals([]); }
    else notify(res.error === "invalid" ? j.weekly.empty : errorText(res.error));
  }

  async function download() {
    const data = await exportJournalAction();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${j.data.exportName}-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (failed) {
    return (
      <div className="card empty">
        <BerripopMascot mood="comforting" size={72} />
        <p>{d.auth.loadError}</p>
        <button className="btn btn--primary btn--sm" onClick={load}>{d.auth.retry}</button>
      </div>
    );
  }
  if (!state) return <p className="muted" aria-busy="true">{d.common.loading}</p>;

  const draft = state.entries.find(e => e.status === "draft");
  const loc = locale === "hu" ? "hu-HU" : "en-GB";
  const thisMonth = today.slice(0, 7);
  const open = openEntry ? state.entries.find(e => e.id === openEntry) : undefined;
  const openReflections = open ? state.reflections.filter(r => r.entryId === open.id) : [];
  const isSunday = parseKey(today).getDay() === 0;
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const week = state.moodsEnabled ? weekMoods(state.entries, weekDays) : [];

  return (
    <div className="stack journal">
      <header className="page-head">
        <div>
          <span className="eyebrow"><Lock size={13} /> {j.eyebrow} · {j.privateBadge}</span>
          <h1>{j.title}</h1>
          <p>{j.intro}</p>
          <SafetyLink />
        </div>
      </header>

      <section className="card journal-write">
        <BerripopReaction mood="encouraging" message={j.placeholder} size={56} motion="none" />
        <div className="row-gap">
          <button className="btn btn--primary" onClick={() => setEditing("new")}><PenLine size={18} /> {j.write}</button>
          {draft && <button className="btn btn--ghost" onClick={() => setEditing(draft)}>{j.continueDraft}</button>}
        </div>
      </section>

      {state.weeklyJournal && isSunday && !weekly && (
        <section className="card weekly-tile" aria-label={j.weekly.title}>
          <span className="weekly-tile-icon" aria-hidden><CalendarHeart size={22} /></span>
          <span className="weekly-tile-text"><strong>{j.weekly.title}</strong><small>{j.weekly.body}</small></span>
          <button className="btn btn--primary btn--sm" disabled={weeklyBusy || !state.aiConfigured || state.usage.reached} onClick={() => { void runWeekly(); document.getElementById("journal-weekly")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
            {weeklyBusy ? j.weekly.working : j.weekly.cta}
          </button>
        </section>
      )}

      {state.thoughtEnabled && (
        <button type="button" className="card thought-entry" onClick={() => setDissect({ source: null })}>
          <BerripopMascot mood="thinking" size={46} motion="none" />
          <span><strong>{THOUGHT_COPY[locale].name}</strong><small>{THOUGHT_COPY[locale].short}</small></span>
          <ArrowRight size={18} aria-hidden />
        </button>
      )}

      {open && (
        <section className="card journal-open" aria-label={relativeDay(open.entryDate, today)}>
          <div className="section-head">
            <span className="eyebrow">{relativeDay(open.entryDate, today)}{open.status === "draft" ? ` · ${j.draftTag}` : ""}</span>
            <button className="icon-btn" onClick={() => setOpenEntry(null)} aria-label={j.close}><X size={18} /></button>
          </div>
          <p className="journal-body-text">{open.body}</p>
          {open.mood && <span className="journal-open-mood"><MoodSticker mood={open.mood} size={40} label /></span>}
          {(crisisSignal(open.body) || aiSafety.includes(open.id)) && <SafetyCard />}
          <div className="row-gap">
            <button className="btn btn--ghost btn--sm" onClick={() => setEditing(open)}><PenLine size={14} /> {j.edit}</button>
            {open.status === "saved" && state.aiConfigured && !state.usage.reached && (
              <button className="btn btn--ghost btn--sm" disabled={reflecting === open.id} onClick={() => reflect(open.id)}><Sparkles size={14} /> {reflecting === open.id ? j.reflecting : j.askReflection}</button>
            )}
            {open.status === "saved" && state.thoughtEnabled && (
              <button className="btn btn--ghost btn--sm" onClick={() => setDissect({ source: { entryId: open.id, body: open.body } })}><Network size={14} /> {THOUGHT_COPY[locale].entryCta}</button>
            )}
            <Confirm label={j.delete} icon={<Trash2 size={13} />} question={j.deleteConfirm} yes={j.deleteYes} onConfirm={async () => { if (apply(await deleteJournalEntryAction(open.id))) { setOpenEntry(null); notify(j.deleted); } }} />
          </div>
          {open.status === "saved" && state.aiConfigured && !state.usage.reached && <SupportModePicker value={mode} onChange={setMode} />}
          {open.status === "saved" && state.aiConfigured && !state.usage.reached && canUseInsights && (
            <UseInsightsToggle id={`use-insights-${open.id}`} checked={useInsights} onChange={setUseInsights} />
          )}
          {open.status === "saved" && state.aiConfigured && !state.usage.reached && <small className="muted">{plural(j.reflectRemaining, state.usage.remaining)} · {j.reflectDisclosure}</small>}
          {state.usage.reached && <small className="muted">{t(j.limitReached, { date: date(state.usage.resets) })}</small>}
          {reflecting === open.id && <p className="muted" aria-live="polite">{j.reflecting}</p>}
          {openReflections.map(r => <ReflectionCard key={r.id} r={r} goals={goals} onResult={apply} notify={notify} />)}
          {state.usage.reached && account.entitlements.plan === "free" && <UpgradePrompt kind="journal" vars={{ n: PLAN_LIMITS.premium.journalAiPerPeriod }} atLimit />}
        </section>
      )}

      {week.some(Boolean) && (
        <section className="card journal-week-moods" aria-labelledby="journal-week-moods">
          <h2 id="journal-week-moods">{MOOD_COPY[locale].week}</h2>
          <ol>
            {week.map((m, i) => {
              const day = parseKey(weekDays[i]);
              const name = day.toLocaleDateString(loc, { weekday: "short" }).replace(".", "");
              return (
                <li key={weekDays[i]} aria-label={`${name}: ${m ? MOOD_LABELS[locale][m] : MOOD_COPY[locale].noMood}`}>
                  {m ? <MoodSticker mood={m} size={38} tilt={i % 2 ? 6 : -6} /> : <span className="journal-week-empty" aria-hidden />}
                  <small aria-hidden>{name}</small>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="stack-sm">
        <h2>{j.historyTitle}</h2>
        {state.entries.length === 0 ? <p className="muted">{j.historyEmpty}</p> : (
          <ul className="journal-list">
            {state.entries.map(e => {
              const hasReflection = state.reflections.some(r => r.entryId === e.id);
              const day = parseKey(e.entryDate);
              const words = e.body.trim() ? e.body.trim().split(/\s+/).length : 0;
              return (
                <li key={e.id}>
                  <button className={`journal-item ${openEntry === e.id ? "is-open" : ""}`} onClick={() => setOpenEntry(e.id)}>
                    <span className="journal-date" aria-hidden>
                      <small>{locale === "hu" ? day.toLocaleDateString(loc, { weekday: "long" }).slice(0, 3) : day.toLocaleDateString(loc, { weekday: "short" })}</small>
                      <strong>{day.getDate()}</strong>
                      {e.entryDate.slice(0, 7) !== thisMonth && <small>{day.toLocaleDateString(loc, { month: "short" }).replace(".", "")}</small>}
                      {e.mood && <span className="journal-date-mood"><MoodSticker mood={e.mood} size={30} tilt={-6} /></span>}
                    </span>
                    <span className="journal-item-main">
                      <span className="sr-only">{relativeDay(e.entryDate, today)}: </span>
                      <span className="journal-preview">{e.body.slice(0, 220) || "…"}</span>
                      <span className="journal-item-foot">
                        {e.status === "draft" && <span className="journal-tag is-draft">{j.draftTag}</span>}
                        {hasReflection && <span className="journal-tag"><Sparkles size={11} aria-hidden /> {j.reflectedTag}</span>}
                        <small className="journal-words">{plural(j.words, words)}</small>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {state.weeklyJournal ? (
        <section className="card summary-card" id="journal-weekly">
          <h2><Sparkles size={18} /> {j.weekly.title}</h2>
          <p className="muted">{j.weekly.body}</p>
          {!weekly && canUseInsights && <UseInsightsToggle id="use-insights-weekly" checked={useInsights} onChange={setUseInsights} />}
          {!weekly && <button className="btn btn--primary btn--sm" disabled={weeklyBusy || !state.aiConfigured || state.usage.reached} onClick={runWeekly}>{weeklyBusy ? j.weekly.working : j.weekly.cta}</button>}
          {weekly && (
            <div className="weekly-result">
              {weekly.youSaid.length > 0 && <div><span className="shared-progress-label">{j.weekly.youSaid}</span><ul>{weekly.youSaid.map(x => <li key={x}>{x}</li>)}</ul></div>}
              {weekly.maybe.length > 0 && <div><span className="shared-progress-label">{j.weekly.maybe}</span><ul className="is-tentative">{weekly.maybe.map(x => <li key={x}>{x}</li>)}</ul></div>}
              {weekly.questions.length > 0 && <div><span className="shared-progress-label">{j.weekly.questions}</span><ul>{weekly.questions.map(x => <li key={x}>{x}</li>)}</ul></div>}
              {weekly.proposals.filter(p => !hiddenProposals.includes(p.text)).length > 0 && (
                <div>
                  <span className="shared-progress-label">{j.weekly.proposals}</span>
                  <ul className="proposal-list">
                    {weekly.proposals.filter(p => !hiddenProposals.includes(p.text)).map(p => (
                      <li key={p.text}>
                        <span><small>{j.suggestion.kinds[p.kind]}</small>{p.text}</span>
                        <Confirm label={j.suggestion.save} className="btn btn--ghost btn--sm" question={j.suggestion.confirm} yes={j.suggestion.confirmYes} onConfirm={async () => { if (apply(await saveInsightAction({ kind: p.kind, text: p.text, origin: "ai_suggested" }))) { notify(j.suggestion.saved); setHiddenProposals(h => [...h, p.text]); } }} />
                        <button className="btn btn--text btn--inline" onClick={() => setHiddenProposals(h => [...h, p.text])}>{j.suggestion.dismiss}</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <small className="muted">{j.weekly.disclaimer}</small>
            </div>
          )}
        </section>
      ) : (
        <UpgradePrompt kind="journal" vars={{ n: PLAN_LIMITS.premium.journalAiPerPeriod }} />
      )}

      <InsightsSection insights={state.insights} onState={setState} notify={notify} />

      <section className="card journal-data">
        <h2>{j.data.title}</h2>
        <p className="muted">{j.data.body}</p>
        <div className="row-gap">
          <button className="btn btn--ghost btn--sm" onClick={download}><Download size={15} /> {j.data.export}</button>
          <Confirm label={j.data.deleteAll} icon={<Trash2 size={13} />} question={j.data.deleteAllConfirm} yes={j.data.deleteAllYes} onConfirm={async () => { if (apply(await deleteAllJournalAction())) { setOpenEntry(null); setWeekly(null); notify(j.data.deletedAll); } }} />
        </div>
        <small className="muted">{j.data.retention}</small>
      </section>

      {dissect && (
        <ThoughtDissector source={dissect.source} notify={notify} onClose={() => setDissect(null)} onJournalChanged={() => void load()} />
      )}

      {editing && (
        <JournalEditor
          entry={editing === "new" ? null : editing}
          initialBody={editing === "new" ? starterBody : undefined}
          state={state}
          onState={setState}
          onClose={keptDraft => { setEditing(null); setStarterBody(undefined); if (keptDraft) notify(j.draftKept); }}
          onReflect={entryId => reflect(entryId)}
          insightToggle={<><SupportModePicker value={mode} onChange={setMode} />{canUseInsights && <UseInsightsToggle id="use-insights-editor" checked={useInsights} onChange={setUseInsights} />}</>}
        />
      )}
    </div>
  );
}
