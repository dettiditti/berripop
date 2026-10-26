"use client";

import { useState } from "react";
import { ArrowRight, Check, Compass } from "lucide-react";
import type { AssessmentResult, AssessmentState } from "@/lib/assessment/types";
import { PLAN_LIMITS } from "@/lib/billing/plans";
import type { AccountDTO } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n/client";
import { setPathStepDoneAction } from "@/lib/server/actions";
import UpgradePrompt from "../billing/UpgradePrompt";

/** My Path: the accepted plan's steps (tickable) and weekly rhythm, or a way back into the assessment. */
export default function PathCard({ state, account, onState, onResume, notify }: {
  state: AssessmentState;
  account: AccountDTO;
  onState: (s: AssessmentState) => void;
  onResume: () => void;
  notify: (m: string) => void;
}) {
  const { d, t } = useI18n();
  const a = d.assessment;
  const [pending, setPending] = useState<string | null>(null);
  const status = state.assessment?.status;

  if (status !== "accepted") {
    return (
      <section className="card path-card path-card--resume" aria-labelledby="path-resume">
        <span className="eyebrow"><Compass size={13} /> {a.path.eyebrow}</span>
        <h2 id="path-resume">{a.path.resumeTitle}</h2>
        <p className="muted">{a.path.resumeBody}</p>
        <button type="button" className="btn btn--primary btn--sm" onClick={onResume}>
          {state.assessment && Object.keys(state.assessment.answers).length ? a.path.resumeCta : a.path.startCta} <ArrowRight size={16} />
        </button>
      </section>
    );
  }

  const plan = state.assessment?.plan;
  const done = state.steps.filter(s => s.done).length;

  async function toggle(id: string, next: boolean) {
    setPending(id);
    try {
      const r: AssessmentResult = await setPathStepDoneAction(id, next);
      if (r.ok) onState(r.state);
      else notify(a.errors.generic);
    } catch {
      notify(a.errors.generic);
    }
    setPending(null);
  }

  const hiddenGoals = (plan?.goals.length ?? 0) > account.entitlements.limits.activeGoals;

  return (
    <section className="card path-card" aria-labelledby="path-title">
      <span className="eyebrow"><Compass size={13} /> {a.path.eyebrow}</span>
      <h2 id="path-title">{a.plan.title}</h2>
      {plan?.summary && <p className="muted">{plan.summary}</p>}

      {state.steps.length > 0 && (
        <>
          <div className="path-progress-row">
            <span className="eyebrow">{a.path.steps}</span>
            <small className="muted">{t(a.path.stepsDone, { done, total: state.steps.length })}</small>
          </div>
          <ul className="path-steps">
            {state.steps.map(s => (
              <li key={s.id} className={s.done ? "is-done" : ""}>
                <button type="button" className="path-check" aria-pressed={s.done} aria-label={t(a.path.markDone, { step: s.title })} disabled={pending === s.id} onClick={() => toggle(s.id, !s.done)}>
                  {s.done && <Check size={14} strokeWidth={3} aria-hidden />}
                </button>
                <span>{s.title}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {plan?.weeklyRhythm && (
        <div className="path-rhythm">
          <span className="eyebrow">{a.path.rhythm}</span>
          <p>{plan.weeklyRhythm}</p>
        </div>
      )}

      {account.entitlements.plan === "free" && hiddenGoals && (
        <UpgradePrompt kind="path" vars={{ goals: PLAN_LIMITS.premium.activeGoals, journal: PLAN_LIMITS.premium.journalAiPerPeriod }} />
      )}
    </section>
  );
}
