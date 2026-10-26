"use client";

import { useState } from "react";
import { ArrowRight, Check, Clock, Info, Lock, PartyPopper, RefreshCw, Sparkles, Sprout, Users } from "lucide-react";
import { CHAPTERS, chapterNodes, chapterOf, chapterWeeks, journeyNodes } from "@/lib/content";
import type { JourneyStopState } from "@/lib/domain/rules";
import { useI18n } from "@/lib/i18n/client";
import { questionText, weekText } from "@/lib/i18n/content";
import { goalNodes, goalQuestion } from "@/lib/journey/goal";
import JourneyMap, { type JourneyMapDef } from "../JourneyMap";
import { Sheet } from "../Modals";
import type { ScreenProps } from "./types";

/**
 * Utazás: the member's own journey, built from their goals when they have
 * one, otherwise the built-in journey. In a circle, "shared" mode shows the
 * built-in journey the circle walks together.
 */
export default function JourneyScreen({ view, notify, go, startQuest, openQuestion, journeyMode, openJourney, buildJourney, journeyBuilding }: ScreenProps) {
  const { d, t, num } = useI18n();
  const j = d.journey;
  const { circle, goalJourney, goalState } = view;
  const [stop, setStop] = useState<number | null>(null);
  const goalMode = !!goalJourney && !!goalState && !(circle && journeyMode === "shared");
  // The built-in journey comes in chapters; the one with today's stop opens, earlier ones can be revisited.
  const openChapter = chapterOf(view.journey.next?.day ?? journeyNodes.length);
  const [chapter, setChapter] = useState(openChapter);
  const allDone = !view.journey.next;
  const goalDone = goalMode && !goalState.next;

  const def: JourneyMapDef = goalMode
    ? {
        done: goalJourney.done,
        state: goalState,
        title: day => goalJourney.days.find(x => x.day === day)?.title ?? t(j.day, { n: day }),
        week: w => {
          const wk = goalJourney.weeks.find(x => x.week === w);
          return { theme: wk?.theme ?? t(j.weekLabel, { n: w }), tagline: wk?.tagline ?? "", topics: [] };
        },
        shared: false,
      }
    : { done: view.myJourney, state: view.journey, title: day => j.titles[day - 1], week: w => weekText(d, w), shared: !!circle, weeks: chapterWeeks(chapter) };

  const nodes = goalMode ? goalNodes : chapterNodes(chapter);
  const doneCount = nodes.filter(n => def.done[n.day]).length;
  const weeksDone = (goalMode ? [1, 2, 3] : chapterWeeks(chapter)).filter(w => nodes.filter(n => n.week === w).every(n => def.done[n.day])).length;

  function open(day: number, state: JourneyStopState) {
    if (state === "tomorrow") notify(j.toastTomorrow);
    else if (state === "locked") notify(t(j.toastLocked, { day }));
    else setStop(day);
  }

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <span className="eyebrow">{goalMode ? j.eyebrowGoals : circle && circle.members.length > 1 ? j.eyebrowShared : j.eyebrowYours}</span>
          <h1>{j.title}</h1>
          <p>{goalMode ? t(j.goalIntro, { goals: goalJourney.goals.join(" · ") }) : j.intro}</p>
        </div>
      </header>

      {circle && goalJourney && (
        <div className="segmented" role="tablist" aria-label={j.title}>
          {(["own", "shared"] as const).map(m => (
            <button key={m} role="tab" aria-selected={(m === "own") === goalMode} className={`segmented-option ${(m === "own") === goalMode ? "is-active" : ""}`} onClick={() => { setStop(null); openJourney(m); }}>
              {m === "own" ? <Sprout size={15} /> : <Users size={15} />} {m === "own" ? j.modeOwn : j.modeShared}
            </button>
          ))}
        </div>
      )}

      {!goalMode && (
        <div className="segmented" role="tablist" aria-label={j.chaptersAria}>
          {Array.from({ length: CHAPTERS }, (_, i) => i + 1).map(c => (
            <button
              key={c} role="tab" aria-selected={c === chapter} disabled={c > openChapter}
              title={c > openChapter ? t(j.chapterLocked, { n: c }) : undefined}
              className={`segmented-option ${c === chapter ? "is-active" : ""}`}
              onClick={() => { setStop(null); setChapter(c); }}
            >
              {c > openChapter && <Lock size={13} />} {t(j.chapterLabel, { n: c })}
            </button>
          ))}
        </div>
      )}

      {journeyBuilding ? (
        <section className="card journey-nudge stack-sm" aria-live="polite">
          <span className="eyebrow"><Sparkles size={13} /> {j.eyebrowGoals}</span>
          <p>{j.building}</p>
        </section>
      ) : goalDone ? (
        <section className="card journey-nudge stack-sm">
          <span className="eyebrow"><PartyPopper size={13} /> {j.eyebrowGoals}</span>
          <h2>{j.goalNextTitle}</h2>
          <p className="muted">{j.goalNextBody}</p>
          <button className="btn btn--primary btn--sm" onClick={buildJourney}>{j.goalNextCta} <ArrowRight size={16} /></button>
        </section>
      ) : goalMode && goalJourney.outdated ? (
        <section className="card journey-nudge stack-sm">
          <h2>{j.outdatedTitle}</h2>
          <p className="muted">{j.outdatedBody}</p>
          <button className="btn btn--ghost btn--sm" onClick={buildJourney}><RefreshCw size={15} /> {j.outdatedCta}</button>
        </section>
      ) : !goalJourney && journeyMode !== "shared" ? (
        view.snapshot.progress.canBuildJourney ? (
          <section className="card journey-nudge stack-sm">
            <span className="eyebrow"><Sparkles size={13} /> {j.eyebrowGoals}</span>
            <h2>{j.buildTitle}</h2>
            <p className="muted">{circle ? j.buildBodyCircle : j.buildBody}</p>
            <button className="btn btn--primary btn--sm" onClick={buildJourney}>{j.buildCta} <ArrowRight size={16} /></button>
          </section>
        ) : (
          <section className="card journey-nudge stack-sm">
            <h2>{j.noGoalsTitle}</h2>
            <p className="muted">{j.noGoalsBody}</p>
            <button className="btn btn--ghost btn--sm" onClick={() => go("goals")}><Sprout size={15} /> {j.noGoalsCta}</button>
          </section>
        )
      ) : null}

      {!goalMode && allDone && (
        <section className="card journey-nudge stack-sm">
          <span className="eyebrow"><PartyPopper size={13} /> {j.title}</span>
          <h2>{j.allDoneTitle}</h2>
          <p className="muted">{j.allDoneBody}</p>
        </section>
      )}

      {!goalMode && <h2 className="journey-chapter-title">{t(j.chapterLabel, { n: chapter })} · {j.chapters[chapter - 1]}</h2>}
      <div className="card card--tight journey-summary">
        <div><strong className="tabular">{num(doneCount)}</strong><span>{j.stopsDone}</span></div>
        {def.shared && circle ? (
          <div><strong className="tabular">{num(view.facts.sharedDays)}</strong><span>{j.doneTogether}</span></div>
        ) : (
          <div><strong className="tabular">{num(weeksDone)}</strong><span>{j.weeksDone}</span></div>
        )}
        <div><strong className="tabular">{num(nodes.length - doneCount)}</strong><span>{j.toGo}</span></div>
      </div>
      <details className="card journey-rules">
        <summary><Info size={16} /> {j.rulesTitle}</summary>
        <ul>
          <li>{j.rulesIndividual}</li>
          {goalMode ? <li>{j.rulesGoal}</li> : def.shared ? <li>{j.rulesShared}</li> : <li>{j.rulesOwn}</li>}
          <li>{j.rulesPace}</li>
        </ul>
      </details>
      <JourneyMap view={view} def={def} onOpen={open} />

      {stop && (goalMode ? <GoalStop day={stop} {...{ view, startQuest, openQuestion }} onClose={() => setStop(null)} /> : <SharedStop day={stop} {...{ view, startQuest, openQuestion }} onClose={() => setStop(null)} />)}
    </div>
  );
}

type StopProps = Pick<ScreenProps, "view" | "startQuest" | "openQuestion"> & { day: number; onClose: () => void };

function GoalStop({ view, day, startQuest, openQuestion, onClose }: StopProps) {
  const { d, t } = useI18n();
  const j = d.journey;
  const gj = view.goalJourney!;
  const gd = gj.days.find(x => x.day === day);
  if (!gd) return null;
  const q = goalQuestion(gj.id, gd);
  const done = !!gj.done[day];
  return (
    <Sheet kicker={`${t(j.day, { n: day })} · ${d.themes[gd.theme].name}`} title={gd.title} onClose={onClose}>
      <p className="muted">{gd.kind === "challenge" ? j.instructions.challenge : j.instructions.quest}</p>
      <p className="stop-question">{gd.prompt}</p>
      {done && <p className="tag tag--mint"><Check size={13} strokeWidth={3} /> {d.dashboard.memberDone}</p>}
      <div className="sheet-actions">
        {view.answerFor(q.id) && <button className="btn btn--ghost" onClick={() => { onClose(); openQuestion(q.id); }}>{j.open}</button>}
        <button className="btn btn--primary" onClick={() => { onClose(); startQuest(q.id, { kind: "goal", day }); }}>
          {done ? j.revisit : j.start} <ArrowRight size={16} />
        </button>
      </div>
    </Sheet>
  );
}

function SharedStop({ view, day, startQuest, openQuestion, onClose }: StopProps) {
  const { d, t } = useI18n();
  const j = d.journey;
  const { circle } = view;
  const node = journeyNodes.find(n => n.day === day);
  const question = node ? view.question(node.questionId) : null;
  if (!node || !question) return null;
  return (
    <Sheet kicker={`${t(j.day, { n: node.day })} · ${d.themes[question.theme].name}`} title={j.titles[node.day - 1]} onClose={onClose}>
      <p className="muted">{node.kind === "challenge" ? j.instructions.challenge : j.instructions.quest}</p>
      <p className="stop-question">{questionText(question, d)}</p>
      {circle && <div className="stop-members">
        <span className="field-label">{j.whoDone}</span>
        <ul>
          {circle.members.map(m => {
            const done = !!circle.participation.journey[m.id]?.[node.day];
            return (
              <li key={m.id} className={done ? "is-done" : ""}>
                {done ? <Check size={14} strokeWidth={3} /> : <Clock size={14} />}
                <span>{m.name || d.common.you}{m.isMe ? ` (${d.common.you})` : ""}</span>
                <small>{done ? d.dashboard.memberDone : d.dashboard.memberNotYet}</small>
              </li>
            );
          })}
        </ul>
        {circle.sharedJourney[node.day] ? (
          <p className="tag tag--sun"><Users size={13} /> {j.doneTogether}</p>
        ) : circle.members.length < 2 ? <p className="muted">{j.soloShared}</p> : null}
      </div>}
      {!circle && view.myJourney[node.day] && <p className="tag tag--mint"><Check size={13} strokeWidth={3} /> {d.dashboard.memberDone}</p>}
      <div className="sheet-actions">
        <button className="btn btn--ghost" onClick={() => { onClose(); openQuestion(node.questionId); }}>{j.open}</button>
        <button className="btn btn--primary" onClick={() => { onClose(); startQuest(node.questionId, { kind: "journey", day: node.day }); }}>
          {view.myJourney[node.day] ? j.revisit : j.start} <ArrowRight size={16} />
        </button>
      </div>
    </Sheet>
  );
}
