"use client";

import { ArrowRight, Check, Clock, Compass, Lock, NotebookPen, Sparkles, Sprout, UserPlus, Users } from "lucide-react";
import { chapterNodes, chapterOf, journeyNodes } from "@/lib/content";
import { berripopSays, moodFor, type MessageKey } from "@/lib/berripop-messages";
import { recommendNext } from "@/lib/domain/next";
import type { View } from "@/lib/domain/view";
import { useI18n } from "@/lib/i18n/client";
import { questionText } from "@/lib/i18n/content";
import { trackAction } from "@/lib/server/actions";
import { goalNodes, goalRef } from "@/lib/journey/goal";
import { deriveWorld } from "@/lib/world";
import AchievementBadge from "../AchievementBadge";
import BerripopReaction from "../berripop/BerripopReaction";
import CheckinCard from "../checkin/CheckinCard";
import Feed from "../Feed";
import StreakIndicator from "../StreakIndicator";
import ThemeGlyph from "../world/ThemeGlyph";
import WorldScene from "../world/WorldScene";
import WeeklyRecap from "../WeeklyRecap";
import XPProgress from "../XPProgress";
import type { ScreenProps } from "./types";

/** Chooses Berripop's line from real state only. */
function greetingKey(view: View): MessageKey {
  const { facts, streak, circle } = view;
  if (facts.journeyDone >= journeyNodes.length) return "greeting.journeyDone";
  if (facts.answered === 0) return "greeting.first";
  if (streak.welcomeBack) return "greeting.welcomeBack";
  if (circle && circle.members.length > 1 && circle.daily.completedBy.length === circle.members.length) return "circle.together";
  if (streak.current >= 3 && streak.activeToday) return "greeting.streak";
  if (view.dailyDoneByMe) return "greeting.done";
  if (streak.restedYesterday) return "greeting.restDay";
  return "greeting.ready";
}

function Avatar({ name, tone = "purple", done }: { name: string; tone?: string; done?: boolean }) {
  return (
    <span className={`avatar avatar--sm tone-${tone} ${done ? "is-done" : ""}`} title={name}>
      {name[0]?.toUpperCase() ?? "?"}
      {done && <i className="avatar-check"><Check size={9} strokeWidth={4} /></i>}
    </span>
  );
}

const TONES = ["purple", "coral", "mint", "sky", "sun"];

/** Today ("Ma"): one recommended step first, the other options in one row, then progress and the circle. */
export default function HomeScreen({ view, run, notify, go, startQuest, openQuestion, onInvite, openJourney, assessmentStatus, openAssessment, journeyBuilding, writeInJournal }: ScreenProps) {
  const { d, t, num, plural } = useI18n();
  const h = d.dashboard;
  const td = d.today;
  const { circle } = view;
  const key = greetingKey(view);
  const daily = view.dailyQuestion;
  const members = circle?.members ?? [];
  const together = members.length > 1;
  const memberTone = (id: string) => TONES[members.findIndex(m => m.id === id) % TONES.length];
  const step = recommendNext(view, assessmentStatus, journeyBuilding);
  // Which recommended step people actually start (event name and step kind only).
  const started = () => void trackAction("today_step_started", step.kind).catch(() => {});

  // The journey Today follows: the member's own goal journey when there is one, otherwise the built-in one.
  const goal = view.goalJourney;
  const own = goal && view.goalState ? { state: view.goalState, done: goal.done, title: (n: number) => goal.days.find(x => x.day === n)?.title ?? "" } : null;
  const jState = own?.state ?? view.journey;
  const jNext = jState.next;
  // Progress within the current chapter (a goal journey is one chapter of 21 days).
  const chapter = own ? 1 : chapterOf(jNext?.day ?? journeyNodes.length);
  const jNodes = own ? goalNodes : chapterNodes(chapter);
  const jDone = jNodes.filter(n => (own?.done ?? view.myJourney)[n.day]).length;
  const startJourneyDay = (day: number) =>
    own ? startQuest(goalRef(goal!.id, day), { kind: "goal", day }) : startQuest(journeyNodes[day - 1].questionId, { kind: "journey", day });

  return (
    <div className="stack">
      <header className="page-head home-head">
        <div>
          <span className="eyebrow">{td.eyebrow}</span>
          <h1>{view.snapshot.me.name ? t(td.titleNamed, { name: view.snapshot.me.name }) : td.title}</h1>
        </div>
        <div className="home-chips"><StreakIndicator streak={view.streak} /></div>
      </header>

      <BerripopReaction mood={moodFor[key]} message={berripopSays(d, key, view.today, { n: view.streak.current })} size={64} className="home-berripop" />

      <section className="quest-card" aria-labelledby="next-title">
        {step.kind === "daily" && daily && view.dailyRef ? (
          <>
            <span className="eyebrow"><ThemeGlyph theme={daily.theme} size={14} /> {circle ? h.dailyEyebrow : td.ownDailyEyebrow} · {d.themes[daily.theme].name}</span>
            <h2 id="next-title" className="quest-card-question-text">{questionText(daily, d)}</h2>
            {circle && (
              <div className="participation">
                <div className="member-stack">
                  {members.map(m => <Avatar key={m.id} name={m.name || d.common.you} tone={memberTone(m.id)} done={circle.daily.completedBy.includes(m.id)} />)}
                </div>
                <span>{t(h.participation, { done: circle.daily.completedBy.length, total: members.length })}</span>
              </div>
            )}
            <div className="quest-card-meta">
              <span className="pill"><Clock size={14} /> {plural(d.common.minutesShort, daily.minutes)}</span>
              <span className="pill"><Lock size={14} /> {d.home.quest.privateByDefault}</span>
            </div>
            <button className="btn btn--white btn--lg btn--block" onClick={() => { started(); startQuest(view.dailyRef!, { kind: "daily" }); }}>{h.answer} <ArrowRight size={20} /></button>
          </>
        ) : step.kind === "assessment" ? (
          <>
            <span className="eyebrow"><Compass size={14} /> {td.nextEyebrow}</span>
            <h2 id="next-title">{td.assessmentTitle}</h2>
            <p>{td.assessmentBody}</p>
            <button className="btn btn--white btn--lg btn--block" onClick={() => { started(); openAssessment(); }}>{step.resume ? td.assessmentResume : td.assessmentStart} <ArrowRight size={20} /></button>
          </>
        ) : step.kind === "building" ? (
          <>
            <span className="eyebrow"><Sparkles size={14} /> {d.journey.eyebrowGoals}</span>
            <h2 id="next-title" aria-live="polite">{td.buildingTitle}</h2>
            <p>{td.buildingBody}</p>
          </>
        ) : step.kind === "goal" || step.kind === "journey" ? (
          <>
            <span className="eyebrow">
              {step.kind === "goal" ? <Sprout size={14} /> : <Compass size={14} />} {step.kind === "goal" ? d.journey.eyebrowGoals : together ? h.journeyEyebrow : td.journeyEyebrow} · {t(d.journey.day, { n: step.day })}
            </span>
            <h2 id="next-title">{step.kind === "goal" ? goal?.days.find(x => x.day === step.day)?.title : d.journey.titles[step.day - 1]}</h2>
            {step.kind === "journey" && together && circle && (
              <p className="journey-members">{t(h.journeyMembers, { done: members.filter(m => circle.participation.journey[m.id]?.[step.day]).length, total: members.length })}</p>
            )}
            <button className="btn btn--white btn--lg btn--block" onClick={() => { started(); if (step.kind === "goal") startQuest(goalRef(goal!.id, step.day), { kind: "goal", day: step.day }); else startQuest(journeyNodes[step.day - 1].questionId, { kind: "journey", day: step.day }); }}>
              {t(h.journeyStart, { n: step.day })} <ArrowRight size={20} />
            </button>
          </>
        ) : (
          <>
            <span className="eyebrow"><Check size={14} strokeWidth={3} /> {td.eyebrow}</span>
            <h2 id="next-title">{td.restTitle}</h2>
            <p>{td.restBody}</p>
            <div className="sheet-actions">
              <button className="btn btn--white" onClick={() => go("journal")}><NotebookPen size={16} /> {td.restJournal}</button>
              <button className="btn btn--white" onClick={() => go("world")}><Sparkles size={16} /> {td.restWorld}</button>
            </div>
          </>
        )}
      </section>

      <nav className="home-shortcuts" aria-label={td.choicesTitle}>
        <button
          type="button"
          className={`card home-shortcut tone-coral lift ${view.dailyDoneByMe ? "is-done" : ""}`}
          disabled={!view.dailyRef}
          onClick={() => view.dailyRef && (view.dailyDoneByMe ? openQuestion(view.dailyRef) : startQuest(view.dailyRef, { kind: "daily" }))}
        >
          {view.dailyDoneByMe ? <Check size={20} strokeWidth={3} /> : <Sparkles size={20} />} {td.choiceDaily}
          <small>{view.dailyDoneByMe ? td.choiceDone : td.choiceOpen}</small>
        </button>
        <button
          type="button"
          className={`card home-shortcut tone-mint lift ${jState.doneToday ? "is-done" : ""}`}
          onClick={() => (jNext && !jState.doneToday ? startJourneyDay(jNext.day) : openJourney(own ? "own" : circle ? "shared" : "own"))}
        >
          {jState.doneToday ? <Check size={20} strokeWidth={3} /> : <Compass size={20} />} {td.choiceJourney}
          <small>{!jNext ? h.journeyDone : jState.doneToday ? td.choiceTomorrow : t(td.choiceJourneyDay, { n: jNext.day })}</small>
        </button>
        <button type="button" className="card home-shortcut tone-sky lift" onClick={() => go("journal")}>
          <NotebookPen size={20} /> {td.choiceJournal}
          <small>{td.choiceOpen}</small>
        </button>
      </nav>

      <CheckinCard checkin={view.snapshot.progress.checkin} run={run} notify={notify} onJournal={writeInJournal} />

      <button type="button" className="card home-journey lift" onClick={() => openJourney(own ? "own" : circle ? "shared" : "own")}>
        <span className="eyebrow">{own ? <><Sprout size={13} /> {d.journey.eyebrowGoals}</> : <><Compass size={13} /> {t(d.journey.chapterLabel, { n: chapter })} · {d.journey.chapters[chapter - 1]}</>}</span>
        <span className="home-journey-row">
          <strong>{jNext ? (own ? own.title(jNext.day) : d.journey.titles[jNext.day - 1]) : h.journeyDone}</strong>
          <small className="muted">{t(td.journeyProgress, { done: jDone, total: jNodes.length })}</small>
        </span>
        <span className="bar bar--thin tone-mint"><span style={{ width: `${(jDone / jNodes.length) * 100}%` }} /></span>
      </button>

      <section className="card progress-card">
        <span className="eyebrow">{td.progressTitle}</span>
        <XPProgress xp={view.xp} label={`${h.myXp} · ${num(view.xp)} XP`} />
        {view.nextAchievement && (
          <div className="home-next-badge">
            <span className="shared-progress-label">{d.home.upNext}</span>
            <AchievementBadge def={view.nextAchievement.def} unlocked={false} current={view.nextAchievement.current} />
          </div>
        )}
      </section>

      <WeeklyRecap view={view} />

      <div className="home-more">
        <button type="button" className="card world-teaser lift" onClick={() => go("world")}>
          <WorldScene world={deriveWorld(view, view.snapshot.progress.moments)} label={d.innerWorld.homeBody} compact mood={view.dailyDoneByMe ? "proud" : "curious"} />
          <span className="world-teaser-copy">
            <span><strong>{d.innerWorld.homeTitle}</strong><small>{d.innerWorld.homeBody}</small></span>
            <span className="pill">{d.innerWorld.homeCta} <ArrowRight size={14} /></span>
          </span>
        </button>
        <nav className="home-links" aria-label={td.shortcuts}>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => go("goals")}><Sprout size={16} /> {d.navigation.goals}</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => go("explore")}><Compass size={16} /> {d.navigation.explore}</button>
        </nav>
      </div>

      {circle ? (
        <section className="card together-card stack-sm" aria-labelledby="together-title">
          <span className="eyebrow"><Users size={13} /> {d.navigation.circle}</span>
          <div className="together-card-head">
            <h2 id="together-title">{circle.name}</h2>
            <div className="member-stack" aria-label={members.map(m => m.name).join(", ")}>
              {members.map(m => <Avatar key={m.id} name={m.name || d.common.you} tone={memberTone(m.id)} />)}
              <button className="avatar avatar--sm avatar--add" onClick={onInvite} aria-label={h.invite}><UserPlus size={14} /></button>
            </div>
          </div>
          {step.kind !== "daily" && together && <p className="muted">{t(td.dailyCircle, { done: circle.daily.completedBy.length, total: members.length })}</p>}
          {!together && <p className="muted">{h.soloHint}</p>}
          <div className="shared-progress">
            <span className="shared-progress-icon"><Sparkles size={18} /></span>
            <div className="shared-progress-body">
              <span className="shared-progress-label">{h.circleXp}</span>
              <strong>{num(circle.xp.circle)} XP</strong>
              {!together ? <small className="muted">{h.soloMilestones}</small> : view.nextMilestone ? (
                <>
                  <small className="muted">{h.nextMilestone}: {d.gamification.milestones[view.nextMilestone.id].title}</small>
                  <div className="bar bar--thin tone-coral"><span style={{ width: `${(view.nextMilestone.current / view.nextMilestone.target) * 100}%` }} /></div>
                </>
              ) : <small className="muted">{h.allMilestones}</small>}
            </div>
          </div>
          {circle.feed.length > 0 && <Feed view={view} events={circle.feed.slice(0, 3)} onOpen={openQuestion} />}
          <div className="sheet-actions">
            <button className="btn btn--ghost btn--sm" onClick={() => go("circle")}>{td.togetherOpen} <ArrowRight size={16} /></button>
            {goal && <button className="btn btn--text btn--sm" onClick={() => openJourney("shared")}>{d.journey.sharedLink}</button>}
          </div>
        </section>
      ) : (
        <section className="card together-card stack-sm" aria-labelledby="together-title">
          <span className="eyebrow"><Users size={13} /> {d.navigation.circle}</span>
          <h2 id="together-title">{td.togetherTitle}</h2>
          <p className="muted">{td.togetherBody}</p>
          <button className="btn btn--coral btn--sm" onClick={() => go("circle")}><UserPlus size={16} /> {td.togetherCta}</button>
        </section>
      )}
    </div>
  );
}
