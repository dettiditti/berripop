import { builtInQuestions, companionPrompts, feelingWords, journeyNodes, XP_RULES } from "../content";
import type { BadgeId } from "../progress";
import { achievementDefs, pickDailyQuestion, unlockedAchievements, type Facts } from "./rules";
import type { QuestionRef } from "./types";

/**
 * Personal progress rules: the same journey, XP and badges with or without a
 * circle. The server records with these; the client displays with them.
 */

/** XP reasons that come from My Path and the journal, limited per day. */
export const GROWTH_REASONS = ["step", "journal"] as const;
export type GrowthReason = (typeof GROWTH_REASONS)[number];

/** How much growth XP can still be earned today (steps and journal entries share one cap). */
export function growthXpFor(reason: GrowthReason, earnedToday: number): number {
  const amount = XP_RULES[reason];
  return earnedToday + amount <= XP_RULES.growthDailyCap ? amount : 0;
}

/** A member without a circle gets their own daily question from the library. */
export function pickPersonalDaily(userId: string, date: string, usedRefs: QuestionRef[]): QuestionRef {
  return pickDailyQuestion(`u:${userId}`, date, [], usedRefs);
}

export type PersonalFactsInput = {
  /** Questions the member has answered anywhere (refs; repeats are fine). */
  answeredRefs: QuestionRef[];
  journey: Record<number, string>;
  /** Days done on the member's goal journey (counts for journey badges and the world, like the built-in one). */
  goalJourney?: Record<number, string>;
  /** XP the member earned: reasons and dates only. */
  xp: { reason: string; date: string }[];
  activityDates: string[];
};

export function personalFacts(input: PersonalFactsInput): Facts {
  const { journey } = input;
  const goal = input.goalJourney ?? {};
  const days = (week: number) => journeyNodes.filter(n => n.week === week).map(n => n.day);
  const weeksOf = (done: Record<number, string>) => [1, 2, 3].filter(w => days(w).every(d => done[d])).length;
  return {
    answered: new Set(input.answeredRefs).size,
    themesTried: input.xp.filter(e => e.reason === "new-topic").length,
    journeyDone: Math.max(Object.keys(journey).length, Object.keys(goal).length),
    listeningDone: journeyNodes.filter(n => journey[n.day] && builtInQuestions.find(q => q.id === n.questionId)?.category === "listening").length,
    weeksDone: Math.max(weeksOf(journey), weeksOf(goal)),
    // Together-only facts belong to circles.
    togetherDays: 0,
    memberCount: 1,
    teamCompletions: 0,
    allMemberDates: 0,
    sharedDays: 0,
    sharedWeeks: 0,
    myActiveDates: new Set([...input.activityDates, ...input.xp.map(e => e.date)]),
  };
}

/** Badges the member can earn on their own (circle-only badges are earned in a circle). */
export function personalBadges(f: Facts): BadgeId[] {
  const own = new Set(achievementDefs.filter(a => !a.needsCircle).map(a => a.id));
  return unlockedAchievements(f).filter(id => own.has(id));
}

/* ---------- My Inner World ---------- */

const MAX_OWN_WORDS = 8;
const promptIds = new Set<string>(Object.values(companionPrompts).flat());
const feelings = new Set<string>(feelingWords);

export type MomentInput = { words: unknown; ownWords: unknown; promptId: unknown; note: unknown };

/** Keeps only known feeling words and prompts, and trims what the member wrote. Null if nothing is left. */
export function cleanMoment(input: MomentInput) {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const words = [...new Set(list(input.words).filter(w => feelings.has(w)))];
  const ownWords = [...new Set(list(input.ownWords).map(w => w.trim().slice(0, 30)).filter(Boolean))].slice(0, MAX_OWN_WORDS);
  const promptId = typeof input.promptId === "string" && promptIds.has(input.promptId) ? input.promptId : null;
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 1000) : "";
  if (!words.length && !ownWords.length && !note) return null;
  return { words, ownWords, promptId, note };
}
