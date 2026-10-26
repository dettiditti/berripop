import { questThemes } from "../content";
import { getLevelInfo, streakOf, type LevelInfo, type StreakInfo } from "../progress";
import type { QuestTheme, Question } from "../types";
import { personalFacts } from "./personal";
import {
  achievementDefs, computeFacts, journeyStateFor, milestoneDefs, resolveQuestion,
  type AchievementDef, type Facts, type MilestoneId,
} from "./rules";
import { goalNodes, goalQuestion, parseGoalRef } from "../journey/goal";
import type { AnswerDTO, CircleDTO, GoalJourneyDTO, MemberDTO, QuestionRef, SharedAnswerDTO, Snapshot } from "./types";

/**
 * Display-only view over a server snapshot. Uses the same rule functions the
 * server uses, so what you see always matches what was recorded.
 *
 * Personal progress (journey, XP, level, streak, badges) is the member's own
 * and the same with or without a circle. `circle` is the shared layer on top:
 * null when the member has no circle.
 */
export type View = {
  snapshot: Snapshot;
  circle: CircleDTO | null;
  me: MemberDTO;
  /** Local date (Europe/Budapest), "YYYY-MM-DD". */
  today: string;
  /** Personal facts; the together facts come from the current circle (0 without one). */
  facts: Facts;
  xp: number;
  level: LevelInfo;
  circleLevel: LevelInfo | null;
  streak: StreakInfo;
  themeCounts: Record<QuestTheme, number>;
  /** The built-in journey (walked together in circles, and by members without a goal journey). */
  myJourney: Record<number, string>;
  journey: ReturnType<typeof journeyStateFor>;
  /** The member's own journey built from their goals, and its state. */
  goalJourney: GoalJourneyDTO | null;
  goalState: ReturnType<typeof journeyStateFor> | null;
  /** Today's question: the circle's in a circle, otherwise the member's own. */
  dailyRef: QuestionRef | null;
  dailyQuestion: Question | null;
  dailyDoneByMe: boolean;
  /** The member's answers: in the current circle, then on their own path. */
  myAnswers: AnswerDTO[];
  achievementIds: Set<string>;
  milestoneIds: Set<string>;
  nextAchievement: { def: AchievementDef; current: number } | null;
  nextMilestone: { id: MilestoneId; current: number; target: number } | null;
  /** Other members' names (sharing needs at least one). */
  otherNames: string[];
  question: (ref: QuestionRef) => Question | null;
  answerFor: (ref: QuestionRef) => AnswerDTO | undefined;
  sharedFor: (ref: QuestionRef) => SharedAnswerDTO[];
  memberName: (id: string | null) => string;
  isSaved: (ref: QuestionRef) => boolean;
};

export function buildView(snapshot: Snapshot, unnamed: string): View {
  const { circle, progress } = snapshot;
  const today = circle?.today ?? progress.today;
  const me = circle?.members.find(m => m.isMe) ?? {
    id: snapshot.me.id, name: snapshot.me.name, role: circle?.role ?? "owner", joinedAt: circle?.createdAt ?? today, isMe: true,
  };

  const own = personalFacts({
    answeredRefs: [...progress.answeredRefs, ...(circle?.myAnswers.map(a => a.questionRef) ?? [])],
    journey: progress.journey,
    goalJourney: progress.goalJourney?.done,
    xp: progress.xp.events,
    activityDates: progress.activeDates,
  });
  const together = circle ? computeFacts(circle, me.id) : null;
  const facts: Facts = together
    ? {
        ...own,
        togetherDays: together.togetherDays, memberCount: together.memberCount, teamCompletions: together.teamCompletions,
        allMemberDates: together.allMemberDates, sharedDays: together.sharedDays, sharedWeeks: together.sharedWeeks,
      }
    : own;

  const myAnswers = [
    ...(circle?.myAnswers ?? []),
    ...progress.answers.filter(a => !circle?.myAnswers.some(c => c.questionRef === a.questionRef)),
  ];
  const themeCounts = Object.fromEntries(questThemes.map(t => [t, 0])) as Record<QuestTheme, number>;
  for (const ref of new Set([...progress.answeredRefs, ...myAnswers.map(a => a.questionRef)])) {
    const theme = resolveQuestion(ref, circle)?.theme;
    if (theme) themeCounts[theme]++;
  }

  const members = circle?.members.length ?? 1;
  const achievementIds = new Set([...progress.achievements.map(a => a.id), ...(circle?.achievements.map(a => a.id) ?? [])]);
  const milestoneIds = new Set(circle?.milestones.map(m => m.id) ?? []);
  const lockedA = achievementDefs
    .filter(a => !achievementIds.has(a.id) && (!a.needsCircle || members > 1))
    .map(def => ({ def, current: Math.min(def.target, def.metric(facts)) }))
    .sort((a, b) => b.current / b.def.target - a.current / a.def.target);
  const nextM = members > 1
    ? milestoneDefs.filter(m => !milestoneIds.has(m.id)).map(m => ({ id: m.id, current: Math.min(m.target, m.metric(facts)), target: m.target }))[0] ?? null
    : null;

  const dailyRef = circle ? circle.daily.questionRef : progress.dailyQuestion?.questionRef ?? null;
  const names = new Map(circle?.members.map(m => [m.id, m.name || unnamed]) ?? []);
  return {
    snapshot,
    circle,
    me,
    today,
    facts,
    xp: progress.xp.total,
    level: getLevelInfo(progress.xp.total),
    circleLevel: circle ? getLevelInfo(circle.xp.circle) : null,
    streak: streakOf(facts.myActiveDates, today),
    themeCounts,
    myJourney: progress.journey,
    journey: journeyStateFor(progress.journey, today),
    goalJourney: progress.goalJourney,
    goalState: progress.goalJourney ? journeyStateFor(progress.goalJourney.done, today, goalNodes) : null,
    dailyRef,
    dailyQuestion: dailyRef ? resolveQuestion(dailyRef, circle) : null,
    dailyDoneByMe: circle ? circle.daily.completedBy.includes(me.id) : !!progress.dailyQuestion?.done,
    myAnswers,
    achievementIds,
    milestoneIds,
    nextAchievement: lockedA[0] ?? null,
    nextMilestone: nextM,
    otherNames: circle?.members.filter(m => !m.isMe).map(m => m.name || unnamed) ?? [],
    question: ref => {
      const g = parseGoalRef(ref);
      if (!g) return resolveQuestion(ref, circle);
      const day = progress.goalJourney?.id === g.journeyId ? progress.goalJourney.days.find(x => x.day === g.day) : undefined;
      return day ? goalQuestion(g.journeyId, day) : null;
    },
    answerFor: ref => myAnswers.find(a => a.questionRef === ref),
    sharedFor: ref => circle?.sharedAnswers.filter(a => a.questionRef === ref) ?? [],
    memberName: id => (id ? names.get(id) ?? unnamed : ""),
    isSaved: ref => snapshot.saved.includes(ref),
  };
}
