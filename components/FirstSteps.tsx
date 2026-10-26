"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, NotebookPen, Sparkles, Target, Users } from "lucide-react";
import { isPaidPlan, PLAN_LIMITS } from "@/lib/billing/plans";
import type { AccountDTO } from "@/lib/domain/types";
import type { JournalState } from "@/lib/journal/types";
import { useI18n } from "@/lib/i18n/client";
import { createGoalAction } from "@/lib/server/actions";
import UpgradePrompt from "./billing/UpgradePrompt";
import type { Run } from "./screens/types";

const HIDE_KEY = "berripop-first-steps-hidden";

/**
 * Guided start built only on working features: pick a goal, write a short
 * first exercise in the journal, ask for an AI reflection, then see how to
 * continue. Progress is derived from real data (goals, entries, reflections).
 */
export default function FirstSteps({ account, journal, run, notify, onWrite, onFeedback, onTogether }: {
  account: AccountDTO;
  journal: JournalState | null;
  run: Run;
  notify: (m: string) => void;
  onWrite: (prompt: string) => void;
  onFeedback: (entryId: string) => void;
  onTogether: () => void;
}) {
  const { d, t } = useI18n();
  const s = d.personal.steps;
  const g = d.goals;
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(HIDE_KEY) === "1");
    } catch {
      // Storage unavailable: keep showing it.
    }
  }, []);

  const goal = account.goals.find(x => x.status === "active") ?? null;
  const saved = journal?.entries.filter(e => e.status === "saved") ?? [];
  const latest = saved[0] ?? null;
  const reflected = (journal?.reflections.length ?? 0) > 0;
  const steps = [!!goal, saved.length > 0, reflected];
  const done = steps.filter(Boolean).length + (steps.every(Boolean) ? 1 : 0);
  const allDone = steps.every(Boolean);
  const premium = isPaidPlan(account.entitlements.plan);

  async function chooseGoal(title: string) {
    if (title.trim().length < 3) return notify(g.tooShort);
    setBusy(true);
    const r = await run(createGoalAction({ title, details: "", source: "guided" }));
    setBusy(false);
    if (r) notify(g.saved);
  }

  function hide() {
    try {
      window.localStorage.setItem(HIDE_KEY, "1");
    } catch {
      // Not persisted.
    }
    setHidden(true);
  }

  if (hidden && allDone) return null;

  const feedbackBlocked = !!journal && (!journal.aiConfigured || journal.usage.reached);

  return (
    <section className="card first-steps" aria-labelledby="first-steps-title">
      <div className="first-steps-head">
        <span className="eyebrow"><Sparkles size={13} /> {s.eyebrow}</span>
        <h2 id="first-steps-title">{allDone ? s.doneTitle : s.title}</h2>
        <div className="first-steps-progress" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={done} aria-label={t(s.progress, { done })}>
          <span style={{ width: `${(done / 4) * 100}%` }} />
        </div>
        <small className="muted">{t(s.progress, { done })}</small>
      </div>

      <ol className="first-steps-list">
        <li className={goal ? "is-done" : "is-current"}>
          <span className="first-steps-dot" aria-hidden>{goal ? <Check size={14} strokeWidth={3} /> : <Target size={14} />}</span>
          <div>
            <strong>{s.goalTitle}</strong>
            {goal ? <p>{t(s.goalDone, { goal: goal.title })}</p> : (
              <>
                <p>{s.goalBody}</p>
                <div className="chip-row">
                  {g.suggestions.slice(0, 5).map(sug => (
                    <button key={sug} type="button" className="chip" disabled={busy} onClick={() => chooseGoal(sug)}>{sug}</button>
                  ))}
                </div>
                <form className="first-steps-custom" onSubmit={e => { e.preventDefault(); void chooseGoal(custom); }}>
                  <label className="field-label" htmlFor="first-goal">{s.goalCustomLabel}</label>
                  <div className="own-word-row">
                    <input id="first-goal" className="input" value={custom} maxLength={120} placeholder={g.customPlaceholder} onChange={e => setCustom(e.target.value)} />
                    <button type="submit" className="btn btn--ghost btn--sm" disabled={busy || custom.trim().length < 3}>{s.goalCustomCta}</button>
                  </div>
                </form>
              </>
            )}
          </div>
        </li>

        <li className={saved.length ? "is-done" : goal ? "is-current" : ""}>
          <span className="first-steps-dot" aria-hidden>{saved.length ? <Check size={14} strokeWidth={3} /> : <NotebookPen size={14} />}</span>
          <div>
            <strong>{s.exerciseTitle}</strong>
            {saved.length ? <p>{s.exerciseDone}</p> : (
              <>
                <p>{s.exerciseBody}</p>
                {goal && <button type="button" className="btn btn--primary btn--sm" onClick={() => onWrite(t(s.exercisePrompt, { goal: goal.title }))}>{s.exerciseCta} <ArrowRight size={16} /></button>}
              </>
            )}
          </div>
        </li>

        <li className={reflected ? "is-done" : saved.length ? "is-current" : ""}>
          <span className="first-steps-dot" aria-hidden>{reflected ? <Check size={14} strokeWidth={3} /> : <Sparkles size={14} />}</span>
          <div>
            <strong>{s.feedbackTitle}</strong>
            {reflected ? <p>{s.feedbackDone}</p> : (
              <>
                <p>{t(s.feedbackBody, { n: PLAN_LIMITS.free.journalAiPerPeriod })}</p>
                {latest && (feedbackBlocked
                  ? <p className="muted">{s.feedbackUnavailable}</p>
                  : <button type="button" className="btn btn--primary btn--sm" onClick={() => onFeedback(latest.id)}>{s.feedbackCta} <ArrowRight size={16} /></button>)}
              </>
            )}
          </div>
        </li>

        <li className={allDone ? "is-current" : ""}>
          <span className="first-steps-dot" aria-hidden><ArrowRight size={14} /></span>
          <div>
            <strong>{s.nextTitle}</strong>
            <p>{allDone ? s.doneBody : s.nextBody}</p>
            {allDone && (
              <div className="first-steps-next">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => onWrite("")}><NotebookPen size={16} /> {s.nextWrite}</button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={onTogether}><Users size={16} /> {s.nextTogether}</button>
              </div>
            )}
          </div>
        </li>
      </ol>

      {allDone && !premium && <UpgradePrompt kind="start" vars={{ goals: PLAN_LIMITS.premium.activeGoals, journal: PLAN_LIMITS.premium.journalAiPerPeriod }} />}
      {allDone && <button type="button" className="btn btn--text btn--inline first-steps-hide" onClick={hide}>{s.hide}</button>}
    </section>
  );
}
