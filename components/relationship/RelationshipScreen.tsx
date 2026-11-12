"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Crown, HeartHandshake, Languages, Lock, MessageCircleQuestion, Route, ShieldCheck, Sparkles, Waypoints } from "lucide-react";
import type { PremiumFeature } from "@/lib/relationship/copy";
import { dailyQuestionIndex } from "@/lib/relationship/scoring";
import type { RelationshipState } from "@/lib/relationship/types";
import { deleteAllRelationshipAction, getRelationshipStateAction } from "@/lib/server/actions";
import { BerriStill } from "../berripop/BerriVideo";
import type { ScreenProps } from "../screens/types";
import { AttachmentQuiz, LoveLanguageQuiz } from "./Quizzes";
import { AttachmentResultView, LoveLanguageResultView } from "./Results";
import TriggerMap from "./TriggerMap";
import Translator from "./Translator";
import Growth from "./Growth";
import { PremiumBadge, RelContext, RelationshipPaywall, trackOnce, useRel, useRelCopy, type RelCtx } from "./shared";

type View = "home" | "love" | "loveQuiz" | "attach" | "attachQuiz" | "trigger" | "translator" | "growth";

/**
 * Kapcsolati világ: two free self-discovery tests with result cards, a daily
 * question, and the Premium layer (detailed analyses, AI reflection, trigger
 * map, translator) shown with real previews and contextual paywalls.
 */
export default function RelationshipScreen({ go, notify, writeInJournal, view: app }: ScreenProps) {
  const c = useRelCopy();
  const [state, setState] = useState<RelationshipState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    getRelationshipStateAction({ opened: true })
      .then(r => { if (!live) return; if (r.ok) setState(r.state); else setFailed(true); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  if (!state) {
    return (
      <div className="stack">
        <button type="button" className="btn btn--text world-back" onClick={() => go("home")}><ArrowLeft size={16} /> {c.back}</button>
        <div className="card empty"><BerriStill pose={failed ? "care" : "wonder"} className="rel-empty-berri" /><p>{failed ? c.errors.ai_unavailable : "…"}</p></div>
      </div>
    );
  }
  return <RelationshipWorld initial={state} goToday={() => go("home")} notify={notify} writeInJournal={writeInJournal} today={app.today} />;
}

/** The module itself, from a loaded state (also used by the local design preview with sample data). */
export function RelationshipWorld({ initial, goToday, notify, writeInJournal, today }: {
  initial: RelationshipState; goToday: () => void; notify: (m: string) => void; writeInJournal: (s: string) => void; today: string;
}) {
  const [state, setState] = useState(initial);
  const [view, setView] = useState<View>("home");
  const [paywall, setPaywall] = useState<PremiumFeature | null>(null);
  const show = useCallback((v: View) => { setView(v); window.scrollTo({ top: 0 }); }, []);
  const ctx = useMemo<RelCtx>(() => ({ state, setState, paywall: f => setPaywall(f), notify }), [state, notify]);
  const home = () => show("home");
  return (
    <RelContext.Provider value={ctx}>
      <div className="rel-world">
        {view === "home" && <Home onOpen={show} goToday={goToday} writeInJournal={writeInJournal} today={today} />}
        {view === "loveQuiz" && <LoveLanguageQuiz onBack={home} onDone={() => show("love")} />}
        {view === "attachQuiz" && <AttachmentQuiz onBack={home} onDone={() => show("attach")} />}
        {view === "love" && (state.loveLanguage ? <LoveLanguageResultView record={state.loveLanguage} onBack={home} onRetake={() => show("loveQuiz")} /> : <LoveLanguageQuiz onBack={home} onDone={() => show("love")} />)}
        {view === "attach" && (state.attachment ? <AttachmentResultView record={state.attachment} onBack={home} onRetake={() => show("attachQuiz")} /> : <AttachmentQuiz onBack={home} onDone={() => show("attach")} />)}
        {view === "trigger" && <TriggerMap onBack={home} />}
        {view === "translator" && <Translator onBack={home} />}
        {view === "growth" && <Growth onBack={home} writeInJournal={writeInJournal} onTrigger={() => show("trigger")} />}
      </div>
      {paywall && !state.premium && <RelationshipPaywall feature={paywall} onClose={() => setPaywall(null)} />}
    </RelContext.Provider>
  );
}

function Home({ onOpen, goToday, writeInJournal, today }: { onOpen: (v: View) => void; goToday: () => void; writeInJournal: (s: string) => void; today: string }) {
  const c = useRelCopy();
  const { state, setState, notify } = useRel();
  const question = c.daily.questions[dailyQuestionIndex(today, c.daily.questions.length)];
  const love = state.loveLanguage;
  const attach = state.attachment;

  return (
    <div className="stack">
      <button type="button" className="btn btn--text world-back" onClick={goToday}><ArrowLeft size={16} /> {c.back}</button>
      <header className="rel-head">
        <div>
          <span className="eyebrow"><HeartHandshake size={13} /> {c.name}</span>
          <h1>{c.tagline}</h1>
          <p>{c.subtitle}</p>
        </div>
        <BerriStill pose="hi" className="rel-head-berri" />
      </header>

      <section className="rel-tier rel-tier--free" aria-labelledby="rel-free-title">
        <div className="rel-tier-head">
          <h2 id="rel-free-title">{c.freeTitle}</h2>
          <p className="muted">{c.freeBody}</p>
        </div>
        <div className="rel-test-grid">
          <TestCard tone="coral" icon={<HeartHandshake size={20} />} name={c.love.name} short={c.love.short} meta={`${c.questions(20)} · ${c.minutes(4)}`}
            done={love ? c.love.langs[love.result.top[0]].name : null} onStart={() => onOpen(love ? "love" : "loveQuiz")} />
          <TestCard tone="sky" icon={<Waypoints size={20} />} name={c.attach.name} short={c.attach.short} meta={`${c.questions(18)} · ${c.minutes(4)}`}
            done={attach ? (attach.result.main ? c.attach.patterns[attach.result.main].name : c.attach.mixedShort) : null} onStart={() => onOpen(attach ? "attach" : "attachQuiz")} />
        </div>
        <article className="card rel-daily">
          <span className="eyebrow"><MessageCircleQuestion size={13} /> {c.daily.title}</span>
          <p className="rel-daily-q">{question}</p>
          <p className="muted rel-small">{c.daily.body}</p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => writeInJournal(question)}>{c.daily.write}</button>
        </article>
      </section>

      <PremiumSection onOpen={onOpen} />

      <section className="card rel-data stack-sm" aria-labelledby="rel-data-title">
        <h2 id="rel-data-title"><ShieldCheck size={18} aria-hidden /> {c.data.title}</h2>
        <p className="muted">{c.privacy}</p>
        <p className="muted rel-small">{c.data.body}</p>
        <DeleteAll onDeleted={s => { setState(s); notify(c.data.deleted); }} />
      </section>
      <p className="muted rel-small">{c.disclaimer}</p>
    </div>
  );
}

function TestCard({ tone, icon, name, short, meta, done, onStart }: { tone: string; icon: ReactNode; name: string; short: string; meta: string; done: string | null; onStart: () => void }) {
  const c = useRelCopy();
  return (
    <article className={`card rel-test-card tone-${tone}`}>
      <span className="rel-test-icon" aria-hidden>{icon}</span>
      <h3>{name}</h3>
      <p className="muted">{short}</p>
      {done ? <p className="rel-test-done"><Check size={15} strokeWidth={3} aria-hidden /> {done}</p> : <small className="muted">{meta}</small>}
      <button type="button" className={`btn ${done ? "btn--ghost" : "btn--primary"} btn--sm`} onClick={onStart}>{done ? c.seeResult : c.start} <ArrowRight size={15} /></button>
    </article>
  );
}

/** The Premium layer: clearly its own, richer surface, with what each feature gives and a way in. */
function PremiumSection({ onOpen }: { onOpen: (v: View) => void }) {
  const c = useRelCopy();
  const { state, paywall } = useRel();
  useEffect(() => { if (!state.premium) trackOnce("premium_feature_previewed", "relationship"); }, [state.premium]);
  const tiles: { id: PremiumFeature; icon: ReactNode; name: string; short: string; view?: View }[] = [
    { id: "trigger", icon: <Route size={20} />, name: c.trigger.name, short: c.trigger.lead, view: "trigger" },
    { id: "translator", icon: <Languages size={20} />, name: c.translator.name, short: c.translator.short, view: "translator" },
    { id: "reflection", icon: <Sparkles size={20} />, name: c.reflection.title, short: c.reflection.body, view: state.loveLanguage ? "love" : state.attachment ? "attach" : undefined },
    { id: "growth", icon: <Crown size={20} />, name: c.growth.name, short: c.growth.lead, view: "growth" },
  ];
  const peekable = (v?: View) => v === "trigger" || v === "translator" || v === "growth";
  return (
    <section className="rel-tier rel-tier--premium" aria-labelledby="rel-premium-title">
      <div className="rel-premium-glow" aria-hidden />
      <div className="rel-tier-head">
        <PremiumBadge label={state.premium ? c.premiumIncluded : c.premiumBadge} />
        <h2 id="rel-premium-title">{c.premiumTitle}</h2>
        <p>{c.premiumLead}</p>
      </div>
      <ul className="rel-premium-tiles">
        {tiles.map(t => (
          <li key={t.id} className="rel-premium-tile">
            <span className="rel-premium-tile-icon" aria-hidden>{t.icon}</span>
            <div>
              <h3>{t.name}</h3>
              <p>{t.short}</p>
              {state.premium || (t.id === "translator" && state.freeTranslationLeft) ? (
                t.view ? <button type="button" className="btn btn--white btn--sm" onClick={() => onOpen(t.view!)}>{c.open} <ArrowRight size={15} /></button>
                  : <small className="rel-soon">{c.reflection.needTest}</small>
              ) : (
                <button type="button" className="btn btn--white btn--sm" onClick={() => (peekable(t.view) ? onOpen(t.view!) : paywall(t.id))}>
                  <Lock size={14} aria-hidden /> {peekable(t.view) ? c.peek : c.unlock}
                </button>
              )}
              {!state.premium && t.id === "translator" && state.freeTranslationLeft && <small className="rel-soon">{c.translator.freeOnce}</small>}
            </div>
          </li>
        ))}
      </ul>
      <div className="rel-compare">
        <div>
          <h3>{c.freeTitle}</h3>
          <ul>{c.compare.free.map(x => <li key={x}><Check size={15} strokeWidth={3} aria-hidden /> {x}</li>)}</ul>
        </div>
        <div className="rel-compare-premium">
          <h3>{c.premiumTitle}</h3>
          <ul>{c.compare.premium.map(x => <li key={x}><Sparkles size={15} aria-hidden /> {x}</li>)}</ul>
        </div>
      </div>
      <blockquote className="rel-premium-quote">{c.premiumQuote}</blockquote>
      {!state.premium && <button type="button" className="btn btn--white btn--lg btn--block" onClick={() => paywall("relationship")}><Crown size={17} aria-hidden /> {c.premiumCta}</button>}
    </section>
  );
}

function DeleteAll({ onDeleted }: { onDeleted: (s: RelationshipState) => void }) {
  const c = useRelCopy();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    const r = await deleteAllRelationshipAction().catch(() => null);
    setBusy(false);
    setConfirm(false);
    if (r?.ok) onDeleted(r.state);
  }
  if (!confirm) return <button type="button" className="btn btn--text btn--inline rel-delete" onClick={() => setConfirm(true)}>{c.data.deleteAll}</button>;
  return (
    <div className="rel-confirm-box" role="alertdialog" aria-label={c.data.deleteAll}>
      <p>{c.data.deleteConfirm}</p>
      <div className="rel-compose-actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirm(false)}>{c.data.cancel}</button>
        <button type="button" className="btn btn--coral btn--sm" disabled={busy} onClick={() => void run()}>{c.data.deleteYes}</button>
      </div>
    </div>
  );
}
