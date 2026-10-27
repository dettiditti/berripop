"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Lock, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import {
  AREAS, BASE_STEPS, FOLLOWUP_STEP, MAX_FOLLOWUPS, OBSTACLES, PLAN_STEP, stepComplete, SUPPORTS, TIMES, TOTAL_STEPS,
  type AssessmentAnswers, type Followup,
} from "@/lib/assessment/model";
import type { AssessmentError, AssessmentResult, AssessmentState } from "@/lib/assessment/types";
import { PLAN_LIMITS } from "@/lib/billing/plans";
import type { AccountDTO } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n/client";
import {
  acceptPathPlanAction, answerAssessmentFollowupAction, generatePathPlanAction, requestAssessmentFollowupAction,
  saveAssessmentAnswersAction, skipAssessmentAction, startAssessmentAction,
} from "@/lib/server/actions";
import BerripopMascot from "../berripop/BerripopMascot";

type Props = {
  state: AssessmentState;
  account: AccountDTO;
  onState: (s: AssessmentState) => void;
  /** Called after the plan is accepted or the assessment is skipped. */
  onFinished: (s: AssessmentState) => void;
};

/**
 * My Path initial assessment: six short base questions, up to two adaptive AI
 * follow-ups, then an editable AI plan. Every step is saved on the server, so
 * leaving, reloading or an AI error never loses answers.
 */
export default function AssessmentFlow({ state, account, onState, onFinished }: Props) {
  const { d, t } = useI18n();
  const a = d.assessment;
  const saved = state.assessment;
  const [step, setStep] = useState<number>(saved ? saved.step : -1);
  const [answers, setAnswers] = useState<AssessmentAnswers>(saved?.answers ?? {});
  const [followups, setFollowups] = useState<Followup[]>(saved?.followups ?? []);
  const [busy, setBusy] = useState<null | "save" | "followup" | "plan" | "accept">(null);
  const [error, setError] = useState<AssessmentError | null>(null);
  const autoAsked = useRef(false);

  const errorText = (e: AssessmentError) =>
    e === "ai_unavailable" ? a.errors.ai : e === "ai_consent_required" ? d.aiAssist.consentRequired : e === "limit_ai" ? a.errors.limitAi : e === "limit_assessment" ? a.errors.limitAssessment
      : e === "limit_goals" ? a.errors.limitGoals : e === "busy" ? a.errors.busy : a.errors.generic;

  async function call(kind: NonNullable<typeof busy>, p: Promise<AssessmentResult>): Promise<AssessmentState | null> {
    setBusy(kind);
    setError(null);
    try {
      const r = await p;
      if (r.ok) {
        onState(r.state);
        return r.state;
      }
      setError(r.error);
    } catch {
      setError("invalid");
    } finally {
      setBusy(null);
    }
    return null;
  }

  async function start() {
    const s = await call("save", startAssessmentAction());
    if (s) setStep(s.assessment?.step || 0);
  }

  async function go(next: number) {
    const s = await call("save", saveAssessmentAnswersAction(answers, next));
    if (s) setStep(next);
  }

  async function askFollowup() {
    const s = await call("followup", requestAssessmentFollowupAction());
    if (s?.assessment) setFollowups(s.assessment.followups);
  }

  // Entering the follow-up step asks the first question automatically (once).
  useEffect(() => {
    if (step === FOLLOWUP_STEP && followups.length === 0 && !autoAsked.current && (saved?.aiCallsLeft ?? 0) > 1) {
      autoAsked.current = true;
      void askFollowup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function saveFollowupAnswers() {
    for (let i = 0; i < followups.length; i++) {
      if (followups[i].answer !== (saved?.followups[i]?.answer ?? "")) await answerAssessmentFollowupAction(i, followups[i].answer);
    }
  }

  async function makePlan() {
    await saveFollowupAnswers();
    setStep(PLAN_STEP);
    await call("plan", generatePathPlanAction());
  }

  async function skip() {
    const s = await call("save", skipAssessmentAction());
    if (s) onFinished(s);
  }

  const progress = step < 0 ? 0 : Math.min(step + 1, TOTAL_STEPS);
  const baseStep = step >= 0 && step < BASE_STEPS.length ? BASE_STEPS[step] : null;

  return (
    <div className="assessment">
      <header className="assessment-head">
        <BerripopMascot size={56} mood={step === PLAN_STEP ? "proud" : "curious"} motion="none" />
        <div>
          <h1>{a.title}</h1>
          {step >= 0 && (
            <>
              <div className="assessment-progress" role="progressbar" aria-valuemin={0} aria-valuemax={TOTAL_STEPS} aria-valuenow={progress} aria-label={t(a.progress, { n: progress, total: TOTAL_STEPS })}>
                <span style={{ width: `${(progress / TOTAL_STEPS) * 100}%` }} />
              </div>
              <small className="muted">{t(a.progress, { n: progress, total: TOTAL_STEPS })}</small>
            </>
          )}
        </div>
      </header>

      {step < 0 && (
        <section className="card assessment-card">
          <p className="assessment-lead">{a.intro}</p>
          <p className="muted assessment-privacy"><Lock size={14} aria-hidden /> {a.privacy}</p>
          <div className="assessment-actions">
            <button type="button" className="btn btn--primary btn--lg" disabled={!!busy} onClick={start}>{a.start} <ArrowRight size={18} /></button>
            <button type="button" className="btn btn--text btn--inline" disabled={!!busy} onClick={skip}>{a.later}</button>
          </div>
        </section>
      )}

      {baseStep && (
        <BaseQuestion step={baseStep} answers={answers} onChange={patch => setAnswers(prev => ({ ...prev, ...patch }))} />
      )}

      {step === FOLLOWUP_STEP && (
        <section className="card assessment-card" aria-labelledby="as-followups">
          <h2 id="as-followups">{a.followups.title}</h2>
          <p className="muted">{a.followups.hint}</p>
          {followups.map((f, i) => (
            <div key={i} className="assessment-followup">
              <p className="assessment-question"><Sparkles size={16} aria-hidden /> {f.question}</p>
              <label className="sr-only" htmlFor={`fu-${i}`}>{a.followups.answerLabel}</label>
              <textarea id={`fu-${i}`} className="answer-box answer-box--small" rows={3} maxLength={600} value={f.answer}
                onChange={e => setFollowups(prev => prev.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
            </div>
          ))}
          {busy === "followup" && <p className="muted" aria-live="polite">{a.followups.loading}</p>}
          <div className="assessment-actions">
            {followups.length === 0 && busy !== "followup" && (saved?.aiCallsLeft ?? 0) > 1 && (
              <button type="button" className="btn btn--ghost" onClick={askFollowup}>{a.followups.ask}</button>
            )}
            {followups.length > 0 && followups.length < MAX_FOLLOWUPS && (saved?.aiCallsLeft ?? 0) > 1 && followups[followups.length - 1].answer.trim().length > 0 && (
              <button type="button" className="btn btn--ghost" disabled={!!busy} onClick={async () => { await saveFollowupAnswers(); await askFollowup(); }}>{a.followups.more}</button>
            )}
            <button type="button" className="btn btn--primary" disabled={!!busy} onClick={makePlan}>
              {followups.some(f => f.answer.trim()) ? a.followups.toPlan : a.followups.skip} <ArrowRight size={18} />
            </button>
          </div>
        </section>
      )}

      {step === PLAN_STEP && (
        <PlanReview state={state} account={account} busy={busy} onRegenerate={() => call("plan", generatePathPlanAction())}
          onAccept={async plan => { const s = await call("accept", acceptPathPlanAction(plan)); if (s) onFinished(s); }} />
      )}

      {error && (
        <div className="assessment-error" role="alert">
          <p>{errorText(error)}</p>
          {(error === "limit_assessment" || error === "limit_ai") && <button type="button" className="btn btn--text btn--inline" onClick={skip}>{a.errors.manual}</button>}
        </div>
      )}

      {step >= 0 && step < PLAN_STEP && (
        <nav className="assessment-nav">
          <button type="button" className="btn btn--ghost" disabled={step === 0 || !!busy} onClick={() => go(step - 1)}><ArrowLeft size={18} /> {a.back}</button>
          {baseStep && (
            <button type="button" className="btn btn--primary" disabled={!stepComplete(answers, baseStep) || !!busy} onClick={() => go(step + 1)}>
              {busy === "save" ? a.saving : a.next} <ArrowRight size={18} />
            </button>
          )}
        </nav>
      )}
      {step >= 0 && step < PLAN_STEP && <button type="button" className="btn btn--text btn--inline assessment-later" disabled={!!busy} onClick={skip}>{a.later}</button>}
    </div>
  );
}

function BaseQuestion({ step, answers, onChange }: { step: (typeof BASE_STEPS)[number]; answers: AssessmentAnswers; onChange: (p: Partial<AssessmentAnswers>) => void }) {
  const { d } = useI18n();
  const a = d.assessment;
  const q = a.questions[step];
  const id = `as-${step}`;

  const toggle = <T extends string>(list: T[] | undefined, v: T) => (list?.includes(v) ? list.filter(x => x !== v) : [...(list ?? []), v]);

  return (
    <section className="card assessment-card" aria-labelledby={id}>
      <h2 id={id}>{q.title}</h2>
      <p className="muted">{q.hint}</p>

      {step === "area" && (
        <>
          <div className="assessment-options" role="radiogroup" aria-labelledby={id}>
            {AREAS.map(k => (
              <button key={k} type="button" role="radio" aria-checked={answers.area === k} className={`assessment-option ${answers.area === k ? "is-selected" : ""}`} onClick={() => onChange({ area: k })}>
                {answers.area === k && <Check size={16} strokeWidth={3} aria-hidden />} {a.options.area[k]}
              </button>
            ))}
          </div>
          {answers.area === "other" && (
            <>
              <label className="field-label" htmlFor="as-area-other">{a.questions.area.otherLabel}</label>
              <input id="as-area-other" className="input" maxLength={200} value={answers.areaText ?? ""} onChange={e => onChange({ areaText: e.target.value })} />
            </>
          )}
        </>
      )}

      {(step === "situation" || step === "outcome") && (
        <textarea aria-labelledby={id} className="answer-box" rows={5} maxLength={600} placeholder={a.questions[step].placeholder}
          value={answers[step] ?? ""} onChange={e => onChange({ [step]: e.target.value })} />
      )}

      {step === "obstacles" && (
        <>
          <div className="assessment-options" role="group" aria-labelledby={id}>
            {OBSTACLES.map(k => {
              const on = !!answers.obstacles?.includes(k);
              return (
                <button key={k} type="button" aria-pressed={on} className={`assessment-option ${on ? "is-selected" : ""}`} onClick={() => onChange({ obstacles: toggle(answers.obstacles, k) })}>
                  {on && <Check size={16} strokeWidth={3} aria-hidden />} {a.options.obstacles[k]}
                </button>
              );
            })}
          </div>
          <label className="field-label" htmlFor="as-obstacles-text">{a.questions.obstacles.otherLabel}</label>
          <input id="as-obstacles-text" className="input" maxLength={300} value={answers.obstaclesText ?? ""} onChange={e => onChange({ obstaclesText: e.target.value })} />
        </>
      )}

      {step === "time" && (
        <div className="assessment-options assessment-options--stack" role="radiogroup" aria-labelledby={id}>
          {TIMES.map(k => (
            <button key={k} type="button" role="radio" aria-checked={answers.time === k} className={`assessment-option ${answers.time === k ? "is-selected" : ""}`} onClick={() => onChange({ time: k })}>
              {answers.time === k && <Check size={16} strokeWidth={3} aria-hidden />} {a.options.time[k]}
            </button>
          ))}
        </div>
      )}

      {step === "support" && (
        <div className="assessment-options" role="group" aria-labelledby={id}>
          {SUPPORTS.map(k => {
            const on = !!answers.support?.includes(k);
            return (
              <button key={k} type="button" aria-pressed={on} className={`assessment-option ${on ? "is-selected" : ""}`} onClick={() => onChange({ support: toggle(answers.support, k) })}>
                {on && <Check size={16} strokeWidth={3} aria-hidden />} {a.options.support[k]}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PlanReview({ state, account, busy, onRegenerate, onAccept }: {
  state: AssessmentState;
  account: AccountDTO;
  busy: string | null;
  onRegenerate: () => void;
  onAccept: (plan: { goals: string[]; firstStep: string; nextSteps: string[] }) => void;
}) {
  const { d, t } = useI18n();
  const a = d.assessment.plan;
  const plan = state.assessment?.plan ?? null;
  const generating = busy === "plan" || state.assessment?.status === "generating";
  const slots = Math.max(0, account.entitlements.limits.activeGoals - account.goals.filter(g => g.status === "active").length);
  const [goals, setGoals] = useState<{ title: string; on: boolean }[]>([]);
  const [first, setFirst] = useState("");
  const [next, setNext] = useState<string[]>([]);

  useEffect(() => {
    if (!plan) return;
    setGoals(plan.goals.map((g, i) => ({ title: g.title, on: i === 0 || i < slots })));
    setFirst(plan.firstStep.title);
    setNext(plan.nextSteps.map(s => s.title));
  }, [plan, slots]);

  if (generating || !plan) {
    return (
      <section className="card assessment-card assessment-generating" aria-live="polite">
        <BerripopMascot size={88} mood="thinking" motion="subtle" />
        <p>{generating ? a.generating : d.assessment.errors.generic}</p>
        {!generating && <button type="button" className="btn btn--primary" onClick={onRegenerate}><RefreshCw size={16} /> {a.regenerate}</button>}
      </section>
    );
  }

  const chosen = goals.filter(g => g.on && g.title.trim().length >= 3).map(g => g.title.trim());
  const overLimit = chosen.length > slots;
  const left = state.assessment?.aiCallsLeft ?? 0;

  return (
    <section className="card assessment-card assessment-plan" aria-labelledby="as-plan">
      <h2 id="as-plan">{a.title}</h2>
      <div className="assessment-understood">
        <span className="eyebrow">{a.understood}</span>
        <p>{plan.summary}</p>
      </div>

      <div>
        <span className="eyebrow">{a.goals}</span>
        <p className="muted">{a.goalsHint}</p>
        <ul className="assessment-goals">
          {goals.map((g, i) => (
            <li key={i}>
              <input type="checkbox" id={`as-goal-${i}`} checked={g.on} onChange={e => setGoals(prev => prev.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
              <label className="sr-only" htmlFor={`as-goal-${i}`}>{g.title}</label>
              <input className="input" aria-label={a.goalLabel} maxLength={120} value={g.title} onChange={e => setGoals(prev => prev.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            </li>
          ))}
        </ul>
        {overLimit && <p className="muted">{t(a.goalsLimit, { n: account.entitlements.limits.activeGoals, premium: PLAN_LIMITS.premium.activeGoals })}</p>}
      </div>

      <div>
        <span className="eyebrow">{a.firstStep} · {t(a.minutes, { n: plan.firstStep.minutes })}</span>
        <input className="input" aria-label={a.stepLabel} maxLength={200} value={first} onChange={e => setFirst(e.target.value)} />
      </div>

      <div>
        <span className="eyebrow">{a.nextSteps}</span>
        <ol className="assessment-steps">
          {next.map((s, i) => (
            <li key={i}>
              <input className="input" aria-label={a.stepLabel} maxLength={200} value={s} onChange={e => setNext(prev => prev.map((x, j) => (j === i ? e.target.value : x)))} />
              <button type="button" className="icon-btn" aria-label={a.removeStep} onClick={() => setNext(prev => prev.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
            </li>
          ))}
        </ol>
      </div>

      {plan.weeklyRhythm && (
        <div className="assessment-rhythm">
          <span className="eyebrow">{a.rhythm}</span>
          <p>{plan.weeklyRhythm}</p>
        </div>
      )}

      <small className="muted">{a.disclaimer}</small>
      <div className="assessment-actions">
        <button type="button" className="btn btn--primary btn--lg" disabled={!!busy || chosen.length === 0 || first.trim().length < 3}
          onClick={() => onAccept({ goals: chosen, firstStep: first.trim(), nextSteps: next.map(s => s.trim()).filter(s => s.length >= 3) })}>
          <Check size={18} /> {a.accept}
        </button>
        {left > 0 && <button type="button" className="btn btn--ghost" disabled={!!busy} onClick={onRegenerate}><RefreshCw size={16} /> {a.regenerate}</button>}
      </div>
      {left > 0 && <small className="muted">{t(a.aiLeft, { n: left })}</small>}
    </section>
  );
}
