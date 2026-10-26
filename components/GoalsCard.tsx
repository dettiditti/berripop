"use client";

import { useState } from "react";
import { Pause, Play, Plus, Target, Trash2 } from "lucide-react";
import { PLAN_LIMITS } from "@/lib/billing/plans";
import type { AccountDTO } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n/client";
import { createGoalAction, deleteGoalAction, setGoalStatusAction } from "@/lib/server/actions";
import UpgradePrompt from "./billing/UpgradePrompt";
import { Confirm, Sheet } from "./Modals";
import type { Run } from "./screens/types";

type Source = "guided" | "reflection" | "custom";

/** Growth goals: three ways to start, one active goal on Free, more on Premium. Own goals are never locked. */
export default function GoalsCard({ account, run, notify }: { account: AccountDTO; run: Run; notify: (m: string) => void }) {
  const { d, t } = useI18n();
  const g = d.goals;
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Source>("guided");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [limitHit, setLimitHit] = useState(false);
  const limit = account.entitlements.limits.activeGoals;
  const active = account.goals.filter(x => x.status === "active").length;

  function reset() {
    setTitle("");
    setDetails("");
    setSource("guided");
  }

  async function save() {
    if (title.trim().length < 3) return notify(g.tooShort);
    const r = await run(createGoalAction({ title, details, source }));
    if (r) {
      notify(g.saved);
      setOpen(false);
      reset();
      setLimitHit(false);
    } else if (active >= limit) {
      setOpen(false);
      setLimitHit(true);
    }
  }

  async function setStatus(id: string, status: "active" | "paused") {
    const r = await run(setGoalStatusAction(id, status));
    if (!r && status === "active" && active >= limit) setLimitHit(true);
  }

  return (
    <section className="card goals-card" aria-labelledby="goals-title">
      <div className="section-head">
        <div>
          <span className="eyebrow"><Target size={13} /> {g.eyebrow}</span>
          <h2 id="goals-title">{g.title}</h2>
        </div>
        <span className="pill tabular">{t(g.limit, { active, limit })}</span>
      </div>

      {account.goals.length === 0 ? <p className="muted">{g.empty}</p> : (
        <ul className="goal-list">
          {account.goals.map(goal => (
            <li key={goal.id} className={goal.status === "paused" ? "is-paused" : ""}>
              <div className="goal-text">
                <strong>{goal.title}</strong>
                <small>{g.sources[goal.source]} · {goal.status === "active" ? g.active : g.paused}</small>
                {goal.details && <p>{goal.details}</p>}
              </div>
              <div className="goal-actions">
                {goal.status === "active" ? (
                  <button className="icon-btn" aria-label={g.pause} title={g.pause} onClick={() => setStatus(goal.id, "paused")}><Pause size={16} /></button>
                ) : (
                  <button className="icon-btn" aria-label={g.resume} title={g.resume} onClick={() => setStatus(goal.id, "active")}><Play size={16} /></button>
                )}
                <Confirm label="" icon={<Trash2 size={16} />} className="icon-btn" question={g.deleteConfirm} yes={g.delete} onConfirm={async () => { if (await run(deleteGoalAction(goal.id))) notify(g.deleted); }} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {limitHit && account.entitlements.plan === "free" && <UpgradePrompt kind="goals" vars={{ n: PLAN_LIMITS.premium.activeGoals }} force />}
      <button className="btn btn--ghost btn--sm" onClick={() => setOpen(true)}><Plus size={16} /> {g.add}</button>

      {open && (
        <Sheet kicker={g.eyebrow} title={g.add} onClose={() => setOpen(false)}>
          <div className="segmented segmented--3" role="tablist">
            {(["guided", "reflection", "custom"] as const).map(s => (
              <button key={s} role="tab" aria-selected={source === s} className={`segmented-option ${source === s ? "is-active" : ""}`} onClick={() => { setSource(s); setTitle(""); setDetails(""); }}>
                {g.tabs[s]}
              </button>
            ))}
          </div>
          {source === "guided" && (
            <>
              <p className="muted">{g.guidedIntro}</p>
              <div className="chip-row">
                {g.suggestions.map(sug => (
                  <button key={sug} type="button" className={`chip ${title === sug ? "is-active" : ""}`} aria-pressed={title === sug} onClick={() => setTitle(sug)}>{sug}</button>
                ))}
              </div>
            </>
          )}
          {source === "reflection" && (
            <>
              <p className="muted">{g.reflectionIntro}</p>
              <textarea className="answer-box answer-box--small" aria-label={g.reflectionIntro} value={details} onChange={e => setDetails(e.target.value)} placeholder={g.reflectionPlaceholder} rows={4} maxLength={2000} />
              <label className="field-label" htmlFor="goal-title">{g.reflectionTitleLabel}</label>
              <input id="goal-title" className="input" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} />
            </>
          )}
          {source === "custom" && (
            <>
              <label className="field-label" htmlFor="goal-own">{g.customLabel}</label>
              <input id="goal-own" className="input" value={title} maxLength={120} placeholder={g.customPlaceholder} onChange={e => setTitle(e.target.value)} />
              <label className="field-label" htmlFor="goal-notes">{g.detailsLabel}</label>
              <textarea id="goal-notes" className="answer-box answer-box--small" value={details} onChange={e => setDetails(e.target.value)} rows={3} maxLength={2000} />
            </>
          )}
          <div className="sheet-actions">
            <button className="btn btn--ghost" onClick={() => setOpen(false)}>{d.common.cancel}</button>
            <button className="btn btn--primary" disabled={title.trim().length < 3} onClick={save}>{g.save}</button>
          </div>
        </Sheet>
      )}
    </section>
  );
}
