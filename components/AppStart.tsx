"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Lock } from "lucide-react";
import { AREAS, areasOf, MAX_AREAS, OBSTACLES, SUPPORTS, TIMES, toggleArea } from "@/lib/assessment/model";
import { useI18n } from "@/lib/i18n/client";
import { hapticSuccess, hapticTap } from "@/lib/nativeBridge";
import { readStart, saveStart, type StartAnswers } from "@/lib/onboarding/start";
import { Confetti } from "./berripop/BerripopCelebration";
import BerriVideo, { type BerriClip } from "./berripop/BerriVideo";

type Question = "name" | "area" | "obstacles" | "time" | "support";
type Step = "hello" | Question | "ready";
const QUESTIONS: readonly Question[] = ["name", "area", "obstacles", "time", "support"];
const ORDER: readonly Step[] = ["hello", ...QUESTIONS, "ready"];
const CLIP: Record<Step, BerriClip> = { hello: "wave", name: "wonder", area: "joy2", obstacles: "care", time: "wonder", support: "joy2", ready: "joy" };
const MAX_NAME = 40;

/**
 * The phone app's first screen, before any account: Berri says hello, asks
 * your name and four tap-only questions (what you want to work on, what gets
 * in the way, how much time you have, what kind of help you like), then asks
 * you to create an account to keep your path. The answers stay on this phone
 * (lib/onboarding/start) until sign-up moves them into the account. Nothing
 * here is sent anywhere or counted in analytics.
 */
export default function AppStart() {
  const { d, t } = useI18n();
  const s = d.appStart;
  const a = d.assessment;
  const [step, setStep] = useState<Step>("hello");
  const [name, setName] = useState("");
  const [answers, setAnswers] = useState<StartAnswers>({});

  // Coming back to the app before signing up picks up the answers already given.
  useEffect(() => {
    const saved = readStart();
    if (!saved) return;
    setName(saved.name);
    setAnswers(saved.answers);
  }, []);

  const clean = name.trim().slice(0, MAX_NAME);
  const index = QUESTIONS.indexOf(step as Question);
  const left = QUESTIONS.length - index - 1;
  const done = (q: Question) =>
    q === "name" ? !!clean : q === "area" ? areasOf(answers).length > 0 : q === "obstacles" ? !!answers.obstacles?.length : q === "time" ? !!answers.time : !!answers.support?.length;

  function move(to: Step) {
    saveStart({ name: clean, answers });
    if (to === "ready") hapticSuccess();
    else hapticTap();
    setStep(to);
    window.scrollTo({ top: 0 });
  }
  const next = () => move(ORDER[ORDER.indexOf(step) + 1]);
  const back = () => move(ORDER[ORDER.indexOf(step) - 1]);

  function pick(patch: StartAnswers) {
    hapticTap();
    setAnswers(prev => ({ ...prev, ...patch }));
  }
  const toggle = <T extends string>(list: T[] | undefined, v: T) => (list?.includes(v) ? list.filter(x => x !== v) : [...(list ?? []), v]);

  function submitName(e: FormEvent) {
    e.preventDefault();
    if (clean) next();
  }

  if (step === "hello") {
    return (
      <main className="berri-stage app-welcome">
        <BerriVideo clip="wave" className="app-welcome-berri" />
        <div className="app-welcome-copy">
          <h1>{d.appWelcome.title}</h1>
          <p>{d.appWelcome.body}</p>
        </div>
        <div className="app-welcome-actions">
          <button type="button" className="btn btn--primary btn--lg btn--block" onClick={next}>{d.appWelcome.start}</button>
          <Link className="btn btn--ghost btn--lg btn--block" href="/sign-in">{d.appWelcome.signIn}</Link>
        </div>
      </main>
    );
  }

  if (step === "ready") {
    return (
      <main className="berri-stage app-start app-start--ready">
        <Confetti pieces={40} />
        <BerriVideo clip={CLIP.ready} className="app-start-berri" />
        <section className="berri-intro-card" aria-labelledby="as-ready">
          <div className="app-start-progress is-full" aria-hidden><span style={{ width: "100%" }} /></div>
          <h1 id="as-ready">{t(s.readyTitle, { name: clean })}</h1>
          <p>{s.readyBody}</p>
          <Link className="btn btn--primary btn--lg btn--block" href="/sign-up">{s.readyCta} <ArrowRight size={18} aria-hidden /></Link>
          <Link className="btn btn--ghost btn--block" href="/sign-in">{s.signIn}</Link>
          <p className="muted app-start-privacy"><Lock size={14} aria-hidden /> {s.privacy}</p>
        </section>
        <button type="button" className="btn btn--text btn--inline app-start-back-low" onClick={back}><ArrowLeft size={16} aria-hidden /> {s.back}</button>
      </main>
    );
  }

  const q = step as Question;
  const title = q === "name" ? s.nameTitle : a.questions[q].title;
  const hint = q === "name" ? s.nameHint : a.questions[q].hint;
  const cheer = q === "name" ? null : t(s.cheer[q], { name: clean });

  return (
    <main className="berri-stage app-start">
      <BerriVideo clip={CLIP[q]} className="app-start-berri" />
      <form className="berri-intro-card app-start-card" aria-labelledby="as-title" onSubmit={e => { e.preventDefault(); if (q === "name") submitName(e); else if (done(q)) next(); }}>
        <div className="app-start-top">
          <button type="button" className="app-start-back" onClick={back} aria-label={s.back}><ArrowLeft size={20} aria-hidden /></button>
          <div
            className="app-start-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={QUESTIONS.length}
            aria-valuenow={index + 1}
            aria-label={t(s.progress, { n: index + 1, total: QUESTIONS.length })}
          >
            <span style={{ width: `${((index + 1) / QUESTIONS.length) * 100}%` }} />
          </div>
          <span className="app-start-count" aria-hidden>{index + 1}/{QUESTIONS.length}</span>
        </div>
        <p className="app-start-left">{left === 0 ? s.lastOne : t(s.left, { n: left })}</p>

        {cheer && <span className="app-start-cheer">{cheer}</span>}
        <h1 id="as-title">{title}</h1>
        <p className="muted berri-intro-hint">{hint}</p>

        {q === "name" && (
          <>
            <label className="sr-only" htmlFor="as-name">{d.onboarding.intro.nameLabel}</label>
            <input
              id="as-name"
              className="input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={d.onboarding.intro.namePlaceholder}
              maxLength={MAX_NAME}
              autoComplete="given-name"
              autoCapitalize="words"
              enterKeyHint="next"
            />
          </>
        )}

        {q === "area" && (
          <div className="app-start-options" role="group" aria-labelledby="as-title">
            {AREAS.map(k => {
              const at = areasOf(answers).indexOf(k);
              const on = at >= 0;
              const full = !on && areasOf(answers).length >= MAX_AREAS;
              return (
                <button key={k} type="button" aria-pressed={on} disabled={full} className={`assessment-option ${on ? "is-selected" : ""}`} onClick={() => { const patch = toggleArea(answers, k); if (patch) pick(patch); }}>
                  {on && <span className="assessment-option-rank" aria-hidden>{at + 1}</span>} {a.options.area[k]}
                </button>
              );
            })}
          </div>
        )}

        {q === "obstacles" && (
          <div className="app-start-options" role="group" aria-labelledby="as-title">
            {OBSTACLES.map(k => {
              const on = !!answers.obstacles?.includes(k);
              return (
                <button key={k} type="button" aria-pressed={on} className={`assessment-option ${on ? "is-selected" : ""}`} onClick={() => pick({ obstacles: toggle(answers.obstacles, k) })}>
                  {on && <Check size={16} strokeWidth={3} aria-hidden />} {a.options.obstacles[k]}
                </button>
              );
            })}
          </div>
        )}

        {q === "time" && (
          <div className="app-start-options" role="radiogroup" aria-labelledby="as-title">
            {TIMES.map(k => (
              <button key={k} type="button" role="radio" aria-checked={answers.time === k} className={`assessment-option ${answers.time === k ? "is-selected" : ""}`} onClick={() => pick({ time: k })}>
                {answers.time === k && <Check size={16} strokeWidth={3} aria-hidden />} {a.options.time[k]}
              </button>
            ))}
          </div>
        )}

        {q === "support" && (
          <div className="app-start-options" role="group" aria-labelledby="as-title">
            {SUPPORTS.map(k => {
              const on = !!answers.support?.includes(k);
              return (
                <button key={k} type="button" aria-pressed={on} className={`assessment-option ${on ? "is-selected" : ""}`} onClick={() => pick({ support: toggle(answers.support, k) })}>
                  {on && <Check size={16} strokeWidth={3} aria-hidden />} {a.options.support[k]}
                </button>
              );
            })}
          </div>
        )}

        <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={!done(q)}>
          {s.next} <ArrowRight size={18} aria-hidden />
        </button>
      </form>
    </main>
  );
}
