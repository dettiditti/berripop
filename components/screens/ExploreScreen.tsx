"use client";

import { useState } from "react";
import { Bookmark, Check, Lock, Plus, Users } from "lucide-react";
import { categoryTone, libraryQuestions, questThemes } from "@/lib/content";
import type { QuestionRef } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n/client";
import { questionText } from "@/lib/i18n/content";
import { toggleSavedAction } from "@/lib/server/actions";
import type { QuestTheme } from "@/lib/types";
import BerripopMascot from "../berripop/BerripopMascot";
import ThemeGlyph from "../world/ThemeGlyph";
import type { ScreenProps } from "./types";

type TabId = "browse" | "circle" | "saved" | "mine";

export default function ExploreScreen({ view, run, openQuestion, onCompose }: ScreenProps & { onCompose: () => void }) {
  const { d, plural, relativeDay } = useI18n();
  const e = d.questions.explore;
  const q = d.qa;
  const [tab, setTab] = useState<TabId>("browse");
  const [theme, setTheme] = useState<QuestTheme | "all">("all");
  const { circle } = view;

  const customRefs = circle?.customQuestions.map(c => c.ref) ?? [];
  const inCircle = new Set(circle?.circleQuestions.map(c => c.ref) ?? []);
  const browse: QuestionRef[] = [...customRefs, ...libraryQuestions.map(x => x.id)];
  const refs: QuestionRef[] =
    tab === "browse" ? browse.filter(r => theme === "all" || view.question(r)?.theme === theme)
      : tab === "circle" ? circle?.circleQuestions.map(c => c.ref) ?? []
        : tab === "saved" ? view.snapshot.saved
          : [];

  // The circle's question list only exists in a circle.
  const tabs: TabId[] = circle ? ["browse", "circle", "saved", "mine"] : ["browse", "saved", "mine"];

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <span className="eyebrow">{e.eyebrow}</span>
          <h1>{e.title}</h1>
          <p>{e.introAvailable}</p>
        </div>
        {circle && <button className="btn btn--primary btn--sm" onClick={onCompose}><Plus size={18} /> {e.writeOwn}</button>}
      </header>

      <div className={`segmented segmented--${tabs.length}`} role="tablist" aria-label={e.filterLabel}>
        {tabs.map(id => (
          <button key={id} role="tab" aria-selected={tab === id} className={`segmented-option ${tab === id ? "is-active" : ""}`} onClick={() => setTab(id)}>
            {q.tabs[id]}
          </button>
        ))}
      </div>

      {tab === "browse" && (
        <div className="chip-row chip-row--scroll" role="group" aria-label={e.filterLabel}>
          {(["all", ...questThemes] as const).map(id => (
            <button key={id} className={`chip ${theme === id ? "is-active" : ""}`} aria-pressed={theme === id} onClick={() => setTheme(id)}>
              {id === "all" ? e.all : d.themes[id].name}
            </button>
          ))}
        </div>
      )}

      {tab === "mine" ? (
        view.myAnswers.length === 0 ? (
          <div className="card empty"><BerripopMascot mood="curious" size={72} /><p>{q.mineEmpty}</p></div>
        ) : (
          <ul className="answer-list">
            {[...view.myAnswers].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(a => {
              const question = view.question(a.questionRef);
              if (!question) return null;
              return (
                <li key={a.id} className={`card answer-item tone-${categoryTone[question.category]}`}>
                  <button className="answer-item-main" onClick={() => openQuestion(a.questionRef)}>
                    <span className="question-item-topic">{d.themes[question.theme].name} · {relativeDay(a.date, view.today)}</span>
                    <strong>{questionText(question, d)}</strong>
                    <span className="answer-preview">{a.text}</span>
                  </button>
                  <div className="answer-item-foot">
                    {a.shared ? <span className="tag tag--coral"><Users size={13} /> {q.sharedTag}</span> : <span className="tag"><Lock size={13} /> {q.privateTag}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : refs.length === 0 ? (
        <div className="card empty">
          <BerripopMascot mood={tab === "saved" ? "sleepy" : "curious"} size={72} />
          <strong>{tab === "saved" ? e.emptySavedTitle : e.emptyTitle}</strong>
          <p>{tab === "saved" ? e.emptySavedBody : q.circleEmpty}</p>
        </div>
      ) : (
        <ul className="question-list">
          {refs.map(ref => {
            const question = view.question(ref);
            if (!question) return null;
            const saved = view.isSaved(ref);
            const answered = !!view.answerFor(ref);
            const sharedN = view.sharedFor(ref).length;
            return (
              <li key={ref} className={`question-item tone-${categoryTone[question.category]} lift`}>
                <button className="question-item-main" onClick={() => openQuestion(ref)}>
                  <span className="question-item-topic">
                    <ThemeGlyph theme={question.theme} size={13} /> {d.themes[question.theme].name}
                    {question.source === "custom" && ` · ${e.yours}`}
                  </span>
                  <span className="question-item-text">{questionText(question, d)}</span>
                  <span className="question-item-meta">
                    {answered && <span className="done-tag"><Check size={13} strokeWidth={3} /> {e.answered}</span>}
                    {inCircle.has(ref) && <span className="tag"><Users size={12} /> {q.inCircle}</span>}
                    {sharedN > 0 && <span>{plural(q.sharedCount, sharedN)}</span>}
                  </span>
                </button>
                <button className={`icon-btn bookmark ${saved ? "is-saved" : ""}`} onClick={() => run(toggleSavedAction(circle?.id ?? null, ref))} aria-pressed={saved} aria-label={saved ? e.unsaveQuestion : e.saveQuestion}>
                  <Bookmark size={20} fill={saved ? "currentColor" : "none"} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
