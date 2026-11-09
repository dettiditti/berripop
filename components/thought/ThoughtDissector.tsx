"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, BookmarkPlus, Check, CheckCircle2, Gem, History, ListChecks, Lock, Map as MapIcon, Pause, RotateCcw, Send, SkipForward, Sparkles, Trash2, X,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { THOUGHT_COPY } from "@/lib/thought/copy";
import { VIEWPOINT_IDS, type ThoughtError, type ThoughtResult, type ThoughtSessionDTO, type ThoughtState } from "@/lib/thought/types";
import {
  continueThoughtAction, deleteThoughtAction, getThoughtAction, getThoughtStateAction, replyThoughtAction, saveThoughtToJournalAction,
  startThoughtAction, summarizeThoughtAction, thoughtEventAction, thoughtPatternsAction,
} from "@/lib/server/actions";
import { useAiConsent } from "../AiConsent";
import BerripopMascot from "../berripop/BerripopMascot";
import { Confirm } from "../Modals";
import { SafetyCard } from "../safety/SafetyCard";
import { useNativeApp } from "../useNativeApp";

/**
 * Gondolatboncoló: a guided, one-question-at-a-time look at a problem from
 * several viewpoints, ending in a summary and a thought map. Every limit is
 * decided by the server; the screen only shows what the server sends.
 * Nothing goes to the AI until the member presses start, and nothing is
 * written to the journal unless they choose it.
 */

type View = "home" | "compose" | "session";
type Source = { entryId: string; body: string } | null;

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `${Date.now()}${Math.random().toString(36).slice(2)}`);
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export default function ThoughtDissector({ source, onClose, notify, onJournalChanged }: {
  /** Started from a journal entry: its text is offered as the problem. */
  source: Source;
  onClose: () => void;
  notify: (m: string) => void;
  /** Called after the result was saved into the journal. */
  onJournalChanged: () => void;
}) {
  const { locale, date } = useI18n();
  const c = THOUGHT_COPY[locale];
  const withAiConsent = useAiConsent();
  const inApp = useNativeApp();

  const [state, setState] = useState<ThoughtState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [view, setView] = useState<View>(source ? "compose" : "home");
  const [problem, setProblem] = useState(source?.body ?? "");
  const [session, setSession] = useState<ThoughtSessionDTO | null>(null);
  const [busy, setBusy] = useState<null | "start" | "reply" | "summary" | "other">(null);
  const [failed, setFailed] = useState<ThoughtError | null>(null);
  const [safety, setSafety] = useState(false);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"summary" | "map">("summary");
  const [step, setStep] = useState<number | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const startKey = useRef<{ key: string; text: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [keyboard, setKeyboard] = useState(false);

  const error = (e: ThoughtError) => c.errors[e] ?? c.errors.generic;

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const r = await getThoughtStateAction();
      if (r.ok) setState(r.state);
      else setLoadFailed(true);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const opened = useRef(false);
  useEffect(() => { if (!opened.current) { opened.current = true; void thoughtEventAction("thought_dissector_opened"); } }, []);

  // Fit to the visible viewport so the on-screen keyboard never covers the answer box (as in the journal editor).
  useEffect(() => {
    const vv = window.visualViewport;
    const el = rootRef.current;
    if (!vv || !el) return;
    const fit = () => {
      el.style.setProperty("--editor-height", `${vv.height}px`);
      el.style.setProperty("--editor-top", `${vv.offsetTop}px`);
      setKeyboard(window.innerHeight - vv.height > 120);
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => { vv.removeEventListener("resize", fit); vv.removeEventListener("scroll", fit); };
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [session?.messages.length, busy, failed, safety]);

  /** Applies a server result to the open session. Returns true on success. */
  const apply = (r: ThoughtResult<ThoughtSessionDTO> | null | undefined) => {
    if (r === null) return false; // consent declined: nothing was sent
    if (!r) { setFailed("ai_unavailable"); return false; }
    if (r.safety) setSafety(true);
    if (r.ok) { setSession(r.data); setFailed(null); return true; }
    if (r.error === "quota_exhausted") { setPaywall(true); void load(); return false; }
    setFailed(r.error);
    return false;
  };

  const quotaLeft = !state ? 0 : state.quota.remaining;

  function openCompose() {
    if (state && quotaLeft <= 0) { setPaywall(true); return; }
    setProblem(""); setSession(null); setSafety(false); setFailed(null); setView("compose");
  }

  async function start() {
    if (busy) return;
    const text = problem.trim();
    if (text.length < 3) { setFailed("invalid"); return; }
    // The same text keeps the same key, so a retry or double click never starts (or charges) twice.
    if (!startKey.current || startKey.current.text !== text) startKey.current = { key: newKey(), text };
    setBusy("start"); setFailed(null); setSafety(false);
    try {
      for (let i = 0; i < 6; i++) {
        const r = await withAiConsent(() => startThoughtAction({ startKey: startKey.current!.key, problem: text, journalEntryId: source?.entryId ?? null }));
        if (r && !r.ok && r.error === "busy") { await wait(1500); continue; }
        if (r && !r.ok && r.safety) { setSafety(true); setView("session"); setSession(null); return; }
        if (apply(r)) { setView("session"); startKey.current = null; void load(); }
        return;
      }
      setFailed("busy");
    } catch {
      setFailed("ai_unavailable");
    } finally {
      setBusy(null);
    }
  }

  async function reply(input: { answer?: string; skip?: boolean }) {
    if (!session || busy) return;
    setBusy("reply"); setFailed(null);
    // Show the answer at once; the server stores it before asking the AI.
    if (input.answer) setSession(s => s && { ...s, messages: [...s.messages, { role: "user", text: input.answer!, viewpoint: s.current, at: new Date().toISOString() }] });
    try {
      const r = await withAiConsent(() => replyThoughtAction(session.id, input));
      if (apply(r) && input.answer) setDraft("");
      else if (input.answer) {
        // Reload what the server stored (the answer is kept there when the AI failed).
        const fresh = await getThoughtAction(session.id).catch(() => null);
        if (fresh?.ok) setSession(fresh.data);
        setDraft("");
      }
    } catch {
      setFailed("ai_unavailable");
    } finally {
      setBusy(null);
    }
  }

  async function summarize() {
    if (!session || busy) return;
    setBusy("summary"); setFailed(null);
    try {
      if (apply(await withAiConsent(() => summarizeThoughtAction(session.id)))) { setTab("summary"); void load(); }
    } catch {
      setFailed("ai_unavailable");
    } finally {
      setBusy(null);
    }
  }

  async function openSession(id: string) {
    setBusy("other");
    try {
      const r = await getThoughtAction(id);
      if (r.ok) { setSession(r.data); setSafety(r.data.status === "safety_stop"); setFailed(null); setView("session"); }
      else notify(error(r.error));
    } finally {
      setBusy(null);
    }
  }

  function pause() {
    if (session?.status === "active") void thoughtEventAction("thought_dissector_abandoned");
    setSession(null); setView("home"); void load();
  }

  function premium() {
    void thoughtEventAction("thought_dissector_premium_clicked");
  }

  const lastIsUser = session?.messages.at(-1)?.role === "user";
  const vpLabel = (id: string | null) => (id && (VIEWPOINT_IDS as readonly string[]).includes(id) ? c.viewpoints[id as keyof typeof c.viewpoints].label : null);
  const result = session?.status === "completed" && session.summary && session.map ? session : null;

  return (
    <div ref={rootRef} className="overlay thought" data-keyboard={keyboard || undefined} role="dialog" aria-modal="true" aria-label={c.name}>
      <header className="quest-flow-top thought-top">
        {view === "home" ? (
          <button className="icon-btn" onClick={onClose} aria-label={c.close}><X size={22} /></button>
        ) : (
          <button className="icon-btn" onClick={view === "session" ? pause : () => setView("home")} aria-label={c.result.back}><ArrowLeft size={22} /></button>
        )}
        <span className="thought-top-title">{c.name}</span>
        <span className="tag"><Lock size={12} /> {c.privateBadge}</span>
      </header>

      <div className="thought-body">
        {!state && !loadFailed && <p className="muted" aria-busy="true">…</p>}
        {loadFailed && (
          <div className="card empty">
            <p>{c.errors.generic}</p>
            <button className="btn btn--primary btn--sm" onClick={load}>{c.chat.retry}</button>
          </div>
        )}

        {state && view === "home" && (
          <>
            <section className="card thought-hero">
              <BerripopMascot mood="encouraging" size={88} />
              <h1>{c.name}</h1>
              <p className="thought-short">{c.short}</p>
              <p className="thought-intro">{c.intro}</p>
              <p className="muted">{c.explain}</p>
              <Quota state={state} c={c} />
              <button className="btn btn--primary btn--lg btn--block" disabled={!state.aiConfigured} onClick={openCompose}>{c.cta}</button>
            </section>

            <section className="card stack-sm">
              <h2>{c.viewpointsTitle}</h2>
              <ol className="thought-vplist">
                {VIEWPOINT_IDS.map((id, i) => (
                  <li key={id}><span className="thought-num">{i + 1}</span>{c.viewpoints[id].label}</li>
                ))}
              </ol>
              {!state.deep && <small className="muted">{c.freeViewpointsNote}</small>}
            </section>

            <section className="card stack-sm">
              <h2><History size={18} aria-hidden /> {c.past.title}</h2>
              {state.sessions.length === 0 ? <p className="muted">{c.past.empty}</p> : (
                <ul className="thought-past">
                  {state.sessions.map(s => (
                    <li key={s.id}>
                      <button type="button" disabled={!!busy} onClick={() => openSession(s.id)}>
                        <span className="thought-past-main"><strong>{s.title}</strong><small>{date(s.updatedAt.slice(0, 10))}{s.fromEntry ? ` · ${c.past.fromEntry}` : ""}</small></span>
                        {s.status === "completed" ? <span className="tag tag--mint"><Check size={11} /> {c.past.done}</span>
                          : s.status === "safety_stop" ? <span className="tag">{c.past.safety}</span>
                          : <span className="tag tag--coral">{c.past.resume(s.done, s.total)}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <Patterns state={state} c={c} onPremium={premium} inApp={inApp} />
          </>
        )}

        {state && view === "compose" && (
          <section className="thought-compose stack-sm">
            <h1>{c.compose.title}</h1>
            <p className="muted">{c.compose.hint}</p>
            {source && <p className="thought-from">{c.compose.fromEntry}</p>}
            <label className="sr-only" htmlFor="thought-problem">{c.compose.title}</label>
            <textarea id="thought-problem" className="answer-box" rows={6} maxLength={4000} value={problem} placeholder={c.compose.placeholder} onChange={e => setProblem(e.target.value)} />
            {failed && <p className="field-hint" role="alert">{error(failed)}</p>}
            <Quota state={state} c={c} />
            <button className="btn btn--primary btn--lg btn--block" disabled={problem.trim().length < 3 || !!busy || quotaLeft <= 0} aria-busy={busy === "start"} onClick={start}>
              <Sparkles size={18} /> {busy === "start" ? c.chat.thinking : c.compose.start}
            </button>
            <small className="muted">{c.compose.note}</small>
          </section>
        )}

        {view === "session" && (
          <section className="thought-session">
            {session && !result && (
              <div className="thought-progress">
                <ol aria-label={c.viewpointsTitle}>
                  {session.viewpoints.map((id, i) => {
                    const done = session.done.includes(id);
                    const now = session.current === id && session.status === "active";
                    return (
                      <li key={id} className={`${done ? "is-done" : ""} ${now ? "is-now" : ""}`} aria-current={now ? "step" : undefined}>
                        <span>{done ? <Check size={12} /> : i + 1}</span>{c.viewpoints[id].short}
                      </li>
                    );
                  })}
                </ol>
                <small className="muted">{c.chat.progress(session.done.length, session.viewpoints.length)}{state && !state.deep ? ` · ${c.chat.morePremium}` : ""}</small>
              </div>
            )}

            {session && !result && (
              <div className="thought-thread" aria-live="polite">
                {session.messages.map((m, i) => (
                  <div key={i} className={`thought-msg thought-msg--${m.role}`}>
                    {m.role === "berri" && <BerripopMascot mood="comforting" size={34} motion="none" />}
                    <div>
                      {m.role === "berri" && vpLabel(m.viewpoint) && <span className="thought-vp">{vpLabel(m.viewpoint)}</span>}
                      {m.skipped ? <p className="muted">{c.save.labels.skipped}</p> : m.text.split("\n\n").map((p, k) => <p key={k} className={k > 0 ? "thought-q" : undefined}>{p}</p>)}
                    </div>
                  </div>
                ))}
                {(busy === "reply" || busy === "summary") && (
                  <div className="thought-msg thought-msg--berri" role="status">
                    <BerripopMascot mood="thinking" size={34} motion="none" />
                    <div><p className="muted">{busy === "summary" ? c.chat.summarizing : `${c.chat.thinking}…`}</p></div>
                  </div>
                )}
                {failed && !busy && (
                  <div className="thought-error" role="alert">
                    <div><strong>{failed === "ai_unavailable" ? c.chat.failedTitle : error(failed)}</strong>{failed === "ai_unavailable" && <p>{c.chat.failedBody}</p>}</div>
                    {failed !== "turn_limit" && session.status === "active" && (lastIsUser
                      ? <button className="btn btn--ghost btn--sm" onClick={() => reply({})}><RotateCcw size={15} /> {c.chat.retry}</button>
                      : session.readyForSummary && <button className="btn btn--ghost btn--sm" onClick={summarize}><RotateCcw size={15} /> {c.chat.retry}</button>)}
                  </div>
                )}
                {session.status === "active" && (session.readyForSummary || failed === "turn_limit") && !busy && (
                  <div className="thought-finish">
                    <button className="btn btn--primary" onClick={summarize}><ListChecks size={18} /> {c.chat.toSummary}</button>
                  </div>
                )}
                <div ref={endRef} className="thought-end" />
              </div>
            )}

            {safety && (
              <div className="stack-sm">
                <SafetyCard />
                <button className="btn btn--ghost btn--block" onClick={pause}>{c.safety.back}</button>
              </div>
            )}

            {result && (
              <Result session={result} c={c} deep={!!state?.deep} tab={tab} setTab={setTab} step={step} setStep={setStep} inApp={inApp}
                onSave={() => setSaveOpen(true)} onPremium={premium}
                onContinue={async () => { setBusy("other"); try { apply(await continueThoughtAction(result.id)); } finally { setBusy(null); } }}
                onDelete={async () => { const r = await deleteThoughtAction(result.id); if (r.ok) { setSession(null); setView("home"); void load(); } else notify(error(r.error)); }} />
            )}
          </section>
        )}
      </div>

      {view === "session" && session?.status === "active" && !safety && !session.readyForSummary && !lastIsUser && (
        <div className="thought-composer">
          <form className="thought-input" onSubmit={e => { e.preventDefault(); if (draft.trim()) void reply({ answer: draft.trim() }); }}>
            <label className="sr-only" htmlFor="thought-answer">{c.chat.placeholder}</label>
            <textarea id="thought-answer" rows={2} maxLength={2000} value={draft} placeholder={c.chat.placeholder} disabled={!!busy}
              onChange={e => setDraft(e.target.value)} />
            <button type="submit" className="btn btn--primary thought-send" aria-label={c.chat.send} disabled={!!busy || !draft.trim()}><Send size={18} /></button>
          </form>
          <div className="thought-composer-row">
            <button type="button" className="btn btn--text btn--sm" disabled={!!busy} onClick={() => reply({ skip: true })}><SkipForward size={14} /> {c.chat.skip}</button>
            <button type="button" className="btn btn--text btn--sm" onClick={pause}><Pause size={14} /> {c.chat.pause}</button>
          </div>
        </div>
      )}

      {saveOpen && result && (
        <SaveSheet c={c} onClose={() => setSaveOpen(false)} onSave={async parts => {
          const r = await saveThoughtToJournalAction(result.id, parts);
          if (r.ok) { setSaveOpen(false); setSession({ ...result, savedEntryId: r.data.entryId }); notify(c.save.done); onJournalChanged(); }
          else notify(error(r.error));
        }} />
      )}

      {paywall && state && (
        <div className="sheet-backdrop" onClick={e => { if (e.target === e.currentTarget) setPaywall(false); }}>
          <div className="sheet thought-paywall" role="dialog" aria-modal="true" aria-labelledby="thought-pay-title">
            <BerripopMascot mood="happy" size={90} />
            <h2 id="thought-pay-title">{c.paywall.title}</h2>
            <p>{c.paywall.body}</p>
            <p className="muted">{state.quota.resets ? c.paywall.resets(date(state.quota.resets)) : c.paywall.once}</p>
            {!inApp && <Link className="btn btn--primary btn--block" href="/pricing?from=thought" onClick={premium}><Gem size={17} /> {c.paywall.cta}</Link>}
            <button className="btn btn--ghost btn--block" onClick={() => setPaywall(false)}>{c.paywall.later}</button>
          </div>
        </div>
      )}
    </div>
  );
}

type C = (typeof THOUGHT_COPY)["hu"];

function Quota({ state, c }: { state: ThoughtState; c: C }) {
  if (state.plan !== "free") return null;
  const once = state.quota.resets === null;
  return (
    <span className={`thought-quota ${state.quota.remaining === 0 ? "is-empty" : ""}`}>
      <Sparkles size={15} aria-hidden /> {state.quota.remaining > 0 ? (once ? c.quotaOnce : c.quota)(state.quota.remaining) : once ? c.quotaOnceEmpty : c.quotaEmpty}
    </span>
  );
}

function Patterns({ state, c, onPremium, inApp }: { state: ThoughtState; c: C; onPremium: () => void; inApp: boolean }) {
  const withAiConsent = useAiConsent();
  const [optIn, setOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!state.deep) {
    return (
      <section className="card stack-sm thought-patterns is-locked">
        <h2>{c.patterns.title} <span className="tag"><Gem size={11} /> {c.premiumBadge}</span></h2>
        <p className="muted">{c.patterns.lockedBody}</p>
        {!inApp && <Link className="btn btn--ghost btn--block" href="/pricing?from=thought" onClick={onPremium}>{c.paywall.cta}</Link>}
      </section>
    );
  }

  async function run() {
    setBusy(true); setNote(null);
    try {
      const r = await withAiConsent(() => thoughtPatternsAction(optIn));
      if (r === null) return;
      if (r.ok) setItems(r.data);
      else setNote(r.error === "not_ready" ? c.patterns.notEnough : c.errors[r.error] ?? c.errors.generic);
    } finally {
      setBusy(false);
      setOptIn(false);
    }
  }

  return (
    <section className="card stack-sm thought-patterns">
      <h2>{c.patterns.title}</h2>
      <label className="insight-optin" htmlFor="thought-patterns-optin">
        <input id="thought-patterns-optin" type="checkbox" checked={optIn} onChange={e => setOptIn(e.target.checked)} />
        <span><strong>{c.patterns.optIn}</strong><small className="muted">{c.patterns.optInHint}</small></span>
      </label>
      <button className="btn btn--ghost btn--block" disabled={!optIn || busy} onClick={run}>{busy ? c.patterns.running : c.patterns.run}</button>
      {note && <p className="muted">{note}</p>}
      {items && <><ul className="thought-patlist">{items.map(i => <li key={i}>{i}</li>)}</ul><small className="muted">{c.patterns.disclaimer}</small></>}
    </section>
  );
}

const SECTION_ORDER = ["known", "feel", "assume", "alternatives", "consider", "nextSteps", "open"] as const;

function Result({ session, c, deep, tab, setTab, step, setStep, inApp, onSave, onPremium, onContinue, onDelete }: {
  session: ThoughtSessionDTO; c: C; deep: boolean; tab: "summary" | "map"; setTab: (t: "summary" | "map") => void; step: number | null; setStep: (n: number | null) => void;
  inApp: boolean; onSave: () => void; onPremium: () => void; onContinue: () => void; onDelete: () => void;
}) {
  const s = session.summary!;
  const map = session.map!;
  return (
    <div className="stack-sm thought-result">
      <span className="eyebrow">{c.result.done}</span>
      <h1>{map.center}</h1>
      <button className="btn btn--primary btn--block" disabled={!!session.savedEntryId} onClick={onSave}>
        {session.savedEntryId ? <><CheckCircle2 size={17} /> {c.save.saved}</> : <><BookmarkPlus size={17} /> {c.save.button}</>}
      </button>

      <div className="chip-row" role="tablist">
        <button role="tab" aria-selected={tab === "summary"} className={`chip ${tab === "summary" ? "is-active" : ""}`} onClick={() => setTab("summary")}><ListChecks size={14} /> {c.result.summaryTab}</button>
        <button role="tab" aria-selected={tab === "map"} className={`chip ${tab === "map" ? "is-active" : ""}`} onClick={() => setTab("map")}><MapIcon size={14} /> {c.result.mapTab}</button>
      </div>

      {tab === "summary" ? (
        <div className="thought-summary">
          {SECTION_ORDER.filter(k => s[k].length).map(k => (
            <section key={k} className={`card thought-sec thought-sec--${k}`}>
              <h2>{c.sections[k]}</h2>
              {k === "nextSteps" ? (
                <div className="thought-steps" role="radiogroup" aria-label={c.sections.nextSteps}>
                  {s.nextSteps.map((t, i) => (
                    <button key={t} type="button" role="radio" aria-checked={step === i} onClick={() => setStep(step === i ? null : i)}>
                      <span aria-hidden className="thought-radio" /> {t}
                    </button>
                  ))}
                  <small className="muted">{c.result.stepNote}</small>
                </div>
              ) : k === "feel" ? (
                <div className="chip-row">{s.feel.map(f => <span key={f} className="chip">{f}</span>)}</div>
              ) : (
                <ul>{s[k].map(t => <li key={t}>{t}</li>)}</ul>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="thought-map" role="list" aria-label={c.result.mapTab}>
          <div className="thought-center" role="listitem"><span className="eyebrow">{c.result.problem}</span><strong>{map.center}</strong></div>
          {map.branches.map((b, i) => (
            <div key={b.id} role="listitem" className={`thought-node thought-node--${b.id} thought-pos-${i + 1}`}>
              <h3>{c.branches[b.id]}</h3>
              {b.items.length ? <ul>{b.items.map(t => <li key={t}>{t}</li>)}</ul> : <p className="muted">–</p>}
            </div>
          ))}
          {!deep && !inApp && (
            <Link className="thought-node thought-node--locked" role="listitem" href="/pricing?from=thought" onClick={onPremium}><Lock size={13} /> {c.result.mapLocked}</Link>
          )}
        </div>
      )}

      {deep ? (
        <button className="btn btn--ghost btn--block" onClick={onContinue}>{c.result.continue}</button>
      ) : !inApp && (
        <section className="card thought-upsell">
          <h2>{c.paywall.title}</h2>
          <p>{c.paywall.body}</p>
          <Link className="btn btn--ghost" href="/pricing?from=thought" onClick={onPremium}><Gem size={16} /> {c.paywall.cta}</Link>
        </section>
      )}
      <small className="muted">{c.result.disclaimer}</small>
      <Confirm label={c.result.delete} icon={<Trash2 size={13} />} question={c.result.deleteConfirm} yes={c.result.deleteYes} onConfirm={onDelete} />
    </div>
  );
}

function SaveSheet({ c, onClose, onSave }: { c: C; onClose: () => void; onSave: (p: { summary: boolean; map: boolean; transcript: boolean }) => Promise<void> }) {
  const [pick, setPick] = useState({ summary: true, map: true, transcript: false });
  const [busy, setBusy] = useState(false);
  const opts = [["summary", c.save.summary], ["map", c.save.map], ["transcript", c.save.transcript]] as const;
  return (
    <div className="sheet-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="thought-save-title">
        <h2 id="thought-save-title">{c.save.title}</h2>
        <p className="muted">{c.save.body}</p>
        <div className="thought-checks">
          {opts.map(([k, label]) => (
            <label key={k}><input type="checkbox" checked={pick[k]} onChange={e => setPick(p => ({ ...p, [k]: e.target.checked }))} /> {label}</label>
          ))}
        </div>
        <div className="sheet-actions">
          <button className="btn btn--ghost" onClick={onClose}>{c.save.cancel}</button>
          <button className="btn btn--primary" disabled={busy || (!pick.summary && !pick.map && !pick.transcript)} onClick={async () => { setBusy(true); try { await onSave(pick); } finally { setBusy(false); } }}>
            <BookmarkPlus size={16} /> {c.save.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
