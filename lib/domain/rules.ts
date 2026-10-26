import { builtInQuestions, CHAPTER_DAYS, journeyNodes, libraryQuestions, XP_RULES } from "../content";
import { hash } from "../dates";
import type { BadgeId } from "../progress";
import type { CategoryId, JourneyNode, QuestTheme, Question, Tone } from "../types";
import type { CircleDTO, QuestionRef } from "./types";

/**
 * Shared domain rules for circles. The server uses these to decide what to
 * record; the client uses the same functions to display progress, so there is
 * exactly one definition of every rule.
 */

/* ---------- Dates ---------- */

/** Circles share one calendar so "today's quest" is the same for every member. */
export const CIRCLE_TIME_ZONE = "Europe/Budapest";

export function circleToday(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: CIRCLE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function dateOf(iso: string): string {
  return circleToday(new Date(iso));
}

/* ---------- Questions ---------- */

export const isCustomRef = (ref: QuestionRef) => ref.startsWith("c:");

/** Resolves a question reference within a circle (custom questions carry their own text). */
export function resolveQuestion(ref: QuestionRef, circle: Pick<CircleDTO, "customQuestions"> | null): Question | null {
  if (isCustomRef(ref)) {
    const c = circle?.customQuestions.find(q => q.ref === ref);
    return c ? { id: ref, text: c.text, theme: c.theme as QuestTheme, category: c.category as CategoryId, minutes: 2, source: "custom" } : null;
  }
  return builtInQuestions.find(q => q.id === ref) ?? null;
}

export function journeyDayOf(ref: QuestionRef): number | null {
  return journeyNodes.find(n => n.questionId === ref)?.day ?? null;
}

/**
 * Today's circle quest: a stable pick from the circle's own question list plus
 * the library, avoiding questions already used as a daily quest.
 */
export function pickDailyQuestion(circleId: string, date: string, circleRefs: QuestionRef[], usedRefs: QuestionRef[]): QuestionRef {
  const pool = [...new Set([...circleRefs, ...libraryQuestions.map(q => q.id)])];
  const fresh = pool.filter(r => !usedRefs.includes(r));
  const list = fresh.length ? fresh : pool;
  return list[hash(`${circleId}:${date}`) % list.length];
}

/* ---------- XP ---------- */

export const SHARED_XP = {
  /** Every member completed the same day's circle quest. */
  dailyTogether: 20,
  /** A journey day became shared-complete. */
  journeyTogether: 30,
  /** A circle milestone unlocked. */
  milestone: 50,
} as const;

export { XP_RULES };

/* ---------- Journey ---------- */

/**
 * Individual completion: a member saved an answer for that day's activity
 * (private is fine). One new stop per member per day; members move at their
 * own pace and can always revisit finished stops.
 *
 * Shared completion: a day is shared-complete once every member of a circle
 * with at least two members has completed it individually. Once recorded it
 * stays, even if someone joins later.
 */
export type JourneyStopState = "done" | "current" | "tomorrow" | "locked";

/** One stop a day, in order. `nodes`: the built-in journey (all chapters) or a goal journey's 21 days. */
export function journeyStateFor(myDone: Record<number, string>, today: string, nodes: JourneyNode[] = journeyNodes) {
  const doneToday = Object.values(myDone).includes(today);
  const next = nodes.find(n => !myDone[n.day]) ?? null;
  const stateOf = (day: number): JourneyStopState =>
    myDone[day] ? "done" : next?.day === day ? (doneToday ? "tomorrow" : "current") : "locked";
  return { next, doneToday, stateOf, canStart: (day: number) => !!myDone[day] || stateOf(day) === "current" };
}

export function isSharedComplete(day: number, circle: Pick<CircleDTO, "members" | "participation">): boolean {
  const members = circle.members;
  return members.length >= 2 && members.every(m => !!circle.participation.journey[m.id]?.[day]);
}

/* ---------- Facts, achievements, milestones ---------- */

export type Facts = {
  answered: number;
  themesTried: number;
  journeyDone: number;
  listeningDone: number;
  weeksDone: number;
  /** Dates on which you and at least one other member took part. */
  togetherDays: number;
  memberCount: number;
  /** Days every member finished the circle quest + shared journey days. */
  teamCompletions: number;
  /** Dates on which every member (2+) took part in something. */
  allMemberDates: number;
  sharedDays: number;
  sharedWeeks: number;
  /** All dates you took part on (for the streak). */
  myActiveDates: Set<string>;
};

function membersOn(circle: Pick<CircleDTO, "members">, date: string) {
  return circle.members.filter(m => dateOf(m.joinedAt) <= date);
}

export function computeFacts(circle: CircleDTO, meId: string): Facts {
  const myJourney = circle.participation.journey[meId] ?? {};
  const myDaily = circle.participation.daily[meId] ?? [];
  const activeBy = new Map<string, Set<string>>();
  for (const m of circle.members) {
    const dates = new Set([...(circle.participation.daily[m.id] ?? []), ...Object.values(circle.participation.journey[m.id] ?? {})]);
    activeBy.set(m.id, dates);
  }
  const myActiveDates = new Set([...(activeBy.get(meId) ?? []), ...circle.myAnswers.map(a => a.date)]);

  const allDates = new Set([...activeBy.values()].flatMap(s => [...s]));
  let allMemberDates = 0;
  let dailyTogether = 0;
  for (const date of allDates) {
    const present = membersOn(circle, date);
    if (present.length < 2) continue;
    if (present.every(m => activeBy.get(m.id)?.has(date))) allMemberDates++;
    if (present.every(m => (circle.participation.daily[m.id] ?? []).includes(date))) dailyTogether++;
  }

  let togetherDays = 0;
  for (const date of activeBy.get(meId) ?? []) {
    if (circle.members.some(m => m.id !== meId && activeBy.get(m.id)?.has(date))) togetherDays++;
  }

  const days = (week: number) => journeyNodes.filter(n => n.week === week).map(n => n.day);
  const sharedDays = Object.keys(circle.sharedJourney).length;

  return {
    answered: circle.myAnswers.length,
    themesTried: circle.xp.myEvents.filter(e => e.reason === "new-topic").length,
    journeyDone: Object.keys(myJourney).length,
    listeningDone: journeyNodes.filter(n => myJourney[n.day] && builtInQuestions.find(q => q.id === n.questionId)?.category === "listening").length,
    weeksDone: [1, 2, 3].filter(w => days(w).every(d => myJourney[d])).length,
    togetherDays,
    memberCount: circle.members.length,
    teamCompletions: dailyTogether + sharedDays,
    allMemberDates,
    sharedDays,
    sharedWeeks: [1, 2, 3].filter(w => days(w).every(d => circle.sharedJourney[d])).length,
    myActiveDates: new Set([...myActiveDates, ...myDaily]),
  };
}

export type AchievementDef = {
  id: BadgeId;
  tone: Tone;
  target: number;
  needsCircle?: boolean;
  metric: (f: Facts) => number;
};

/** Personal achievements within a circle. None reward sharing or reading private answers. */
export const achievementDefs: AchievementDef[] = [
  { id: "first-tiny-step", tone: "purple", target: 1, metric: f => f.answered },
  { id: "curious-mind", tone: "sky", target: 4, metric: f => f.themesTried },
  { id: "seven-little-wins", tone: "sun", target: 7, metric: f => f.answered },
  { id: "good-listener", tone: "mint", target: 2, metric: f => f.listeningDone },
  { id: "growing-together", tone: "coral", target: 3, needsCircle: true, metric: f => f.togetherDays },
  { id: "journey-explorer", tone: "purple", target: 1, metric: f => f.weeksDone },
  { id: "full-bunch", tone: "sun", target: CHAPTER_DAYS, metric: f => f.journeyDone },
];

export type MilestoneId = "first-together" | "ten-team" | "first-week" | "shared-week-1" | "shared-week-2" | "shared-week-3";

/** Circle milestones. They need at least two members and celebrate the group, never rank it. */
export const milestoneDefs: { id: MilestoneId; target: number; metric: (f: Facts) => number }[] = [
  { id: "first-together", target: 1, metric: f => f.teamCompletions },
  { id: "first-week", target: 7, metric: f => f.allMemberDates },
  { id: "ten-team", target: 10, metric: f => f.teamCompletions },
  { id: "shared-week-1", target: 1, metric: f => (f.sharedWeeks >= 1 ? 1 : 0) },
  { id: "shared-week-2", target: 1, metric: f => (f.sharedWeeks >= 2 ? 1 : 0) },
  { id: "shared-week-3", target: 1, metric: f => (f.sharedWeeks >= 3 ? 1 : 0) },
];

export function unlockedAchievements(f: Facts): BadgeId[] {
  return achievementDefs.filter(a => a.metric(f) >= a.target).map(a => a.id);
}

export function unlockedMilestones(f: Facts): MilestoneId[] {
  if (f.memberCount < 2) return [];
  return milestoneDefs.filter(m => m.metric(f) >= m.target).map(m => m.id);
}
