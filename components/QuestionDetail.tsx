"use client";

import { useEffect } from "react";
import { Bookmark, Lock, Pencil, Plus, Send, Trash2, Users, X } from "lucide-react";
import { categoryTone } from "@/lib/content";
import { dateOf, journeyDayOf } from "@/lib/domain/rules";
import { parseGoalRef } from "@/lib/journey/goal";
import { REACTIONS, type AnswerContext, type QuestionRef, type Reaction, type ReactionSummary } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n/client";
import { questionPrompts, questionText } from "@/lib/i18n/content";
import { addQuestionToCircleAction, deleteAnswerAction, shareAnswerAction, toggleReactionAction, toggleSavedAction } from "@/lib/server/actions";
import ThemeGlyph from "./world/ThemeGlyph";
import { Confirm } from "./Modals";
import type { ScreenProps } from "./screens/types";

const EMOJI: Record<Reaction, string> = { heart: "💜", hug: "🤗", spark: "✨", laugh: "😊" };

function Reactions({ summary, onToggle, label }: { summary: ReactionSummary; onToggle?: (r: Reaction) => void; label?: (r: Reaction) => string }) {
  return (
    <div className="reactions">
      {REACTIONS.map(r => {
        const n = summary.counts[r] ?? 0;
        const mine = summary.mine.includes(r);
        if (!onToggle && !n) return null;
        return onToggle ? (
          <button key={r} type="button" className={`reaction ${mine ? "is-mine" : ""}`} aria-pressed={mine} aria-label={label?.(r)} onClick={() => onToggle(r)}>
            <span aria-hidden>{EMOJI[r]}</span>{n > 0 && <small>{n}</small>}
          </button>
        ) : (
          <span key={r} className="reaction is-static"><span aria-hidden>{EMOJI[r]}</span><small>{n}</small></span>
        );
      })}
    </div>
  );
}

/** Context for answering: today's question, an open journey stop, or a bonus question. */
export function contextFor(ref: QuestionRef, view: ScreenProps["view"]): AnswerContext {
  if (ref === view.dailyRef) return { kind: "daily" };
  const goal = parseGoalRef(ref);
  if (goal) return { kind: "goal", day: goal.day };
  const day = journeyDayOf(ref);
  if (day && view.journey.canStart(day)) return { kind: "journey", day };
  return { kind: "bonus" };
}

export default function QuestionDetail({ view, run, notify, startQuest, questionRef, onClose }: ScreenProps & { questionRef: QuestionRef; onClose: () => void }) {
  const { d, t, plural, relativeDay } = useI18n();
  const q = d.qa;
  const question = view.question(questionRef);
  const mine = view.answerFor(questionRef);
  const shared = view.sharedFor(questionRef);
  const { circle } = view;
  const inCircle = !!circle?.circleQuestions.some(c => c.ref === questionRef);
  const saved = view.isSaved(questionRef);
  const day = journeyDayOf(questionRef);
  const goal = parseGoalRef(questionRef);
  const lockedJourney = goal ? !view.goalState?.canStart(goal.day) : day !== null && !view.journey.canStart(day);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!question) return null;
  const tone = categoryTone[question.category];

  return (
    <div className={`overlay question-detail tone-${tone}`} role="dialog" aria-modal="true" aria-labelledby="qd-title">
      <header className="quest-flow-top">
        <button className="icon-btn" onClick={onClose} aria-label={d.common.close}><X size={22} /></button>
        <span className="eyebrow"><ThemeGlyph theme={question.theme} size={14} /> {d.themes[question.theme].name}</span>
        <button className={`icon-btn bookmark ${saved ? "is-saved" : ""}`} aria-pressed={saved} aria-label={saved ? d.questions.explore.unsaveQuestion : d.questions.explore.saveQuestion} onClick={() => run(toggleSavedAction(circle?.id ?? null, questionRef))}>
          <Bookmark size={20} fill={saved ? "currentColor" : "none"} />
        </button>
      </header>

      <div className="quest-flow-body qd-body">
        <h1 id="qd-title" className="quest-write-question">{questionText(question, d)}</h1>
        {circle && !inCircle && (
          <button className="btn btn--ghost btn--sm qd-add" onClick={async () => { if (await run(addQuestionToCircleAction(circle.id, questionRef))) notify(q.added); }}>
            <Plus size={16} /> {q.addToCircle}
          </button>
        )}
        {inCircle && <span className="tag"><Users size={13} /> {q.inCircle}</span>}

        <section className="card qd-mine">
          <div className="section-head">
            <h2>{q.myAnswer}</h2>
            {mine && (mine.shared ? <span className="tag tag--coral"><Users size={13} /> {q.sharedTag}</span> : <span className="tag"><Lock size={13} /> {q.privateTag}</span>)}
          </div>
          {mine ? (
            <>
              <p className="qd-text">{mine.text}</p>
              {mine.reflection && <p className="qd-reflection"><em>{mine.reflectionPrompt}</em> {mine.reflection}</p>}
              <small className="muted">{relativeDay(mine.date, view.today)}</small>
              {mine.shared && <Reactions summary={mine.reactions} />}
              <div className="row-gap qd-actions">
                <button className="btn btn--ghost btn--sm" onClick={() => startQuest(questionRef, contextFor(questionRef, view))}><Pencil size={14} /> {q.edit}</button>
                {view.otherNames.length > 0 && circle?.myAnswers.some(a => a.id === mine.id) && (mine.shared ? (
                  <Confirm label={q.unshare} question={q.unshareConfirm} yes={q.unshareYes} onConfirm={async () => { if (await run(shareAnswerAction(mine.id, false))) notify(q.madePrivate); }} />
                ) : (
                  <Confirm label={q.share} icon={<Send size={13} />} question={q.shareConfirm} yes={q.shareYes} onConfirm={async () => { if (await run(shareAnswerAction(mine.id, true))) notify(d.common.sharedToast); }} />
                ))}
                <Confirm label={q.delete} icon={<Trash2 size={13} />} question={q.deleteConfirm} yes={q.deleteYes} onConfirm={async () => { if (await run(deleteAnswerAction(mine.id))) notify(q.deleted); }} />
              </div>
            </>
          ) : (
            <>
              <p className="muted">{lockedJourney ? d.auth.locked : q.notAnswered}</p>
              {!lockedJourney && <button className="btn btn--primary btn--block" onClick={() => startQuest(questionRef, contextFor(questionRef, view))}>{q.answer}</button>}
            </>
          )}
        </section>

        {circle && <section className="stack-sm">
          <h2>{q.sharedTitle}</h2>
          {shared.length === 0 ? (
            <p className="muted">{q.noneShared}</p>
          ) : (
            <ul className="shared-list">
              {shared.map(a => {
                const name = view.memberName(a.authorId);
                return (
                  <li key={a.id} className="card shared-item">
                    <div className="shared-answer">
                      <span className="avatar avatar--sm tone-coral">{name[0]?.toUpperCase() ?? "?"}</span>
                      <div className="shared-body">
                        <strong>{name}</strong>
                        <p>{a.text}</p>
                        {a.reflection && <p className="qd-reflection"><em>{a.reflectionPrompt}</em> {a.reflection}</p>}
                        <small className="muted">{relativeDay(dateOf(a.sharedAt), view.today)}</small>
                      </div>
                    </div>
                    <Reactions
                      summary={a.reactions}
                      label={r => t(q.reactLabel, { name, reaction: q.reactions[r] })}
                      onToggle={r => run(toggleReactionAction(a.id, r))}
                    />
                  </li>
                );
              })}
            </ul>
          )}
          {shared.length > 0 && <small className="muted">{plural(q.sharedCount, shared.length)}</small>}
        </section>}

        <section className="stack-sm">
          <h2>{q.followUps}</h2>
          <ul className="follow-ups">
            {questionPrompts(question, d).map(p => <li key={p}>{p}</li>)}
          </ul>
        </section>
      </div>
    </div>
  );
}
