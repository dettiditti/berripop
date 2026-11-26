import { bankQuestion, bankQuestions, journeyPlan, type BankQuestion, type BankTheme } from "./questions/bank";
import type { CategoryId, JourneyNode, QuestTheme, Question, Tone, Week } from "./types";

/**
 * Language-neutral content structure. All text (question wording, prompts,
 * category and week names) lives in the i18n dictionaries, keyed by these ids.
 */

export const categoryTone: Record<CategoryId, Tone> = {
  emotions: "coral",
  needs: "sky",
  strengths: "sun",
  listening: "mint",
  communication: "purple",
  understanding: "coral",
  boundaries: "sky",
  "self-compassion": "mint",
  intentions: "sun",
  playful: "sun",
  confidence: "purple",
  friendship: "coral",
  curiosity: "sky",
  gratitude: "mint",
};

export const questThemes: QuestTheme[] = ["discover", "feel", "connect", "recharge", "grow"];

/** Theme for questions people write themselves, based on the topic they pick. */
export const categoryTheme: Record<CategoryId, QuestTheme> = {
  emotions: "feel",
  needs: "recharge",
  strengths: "grow",
  listening: "connect",
  communication: "connect",
  understanding: "connect",
  boundaries: "recharge",
  "self-compassion": "feel",
  intentions: "grow",
  playful: "recharge",
  confidence: "grow",
  friendship: "connect",
  curiosity: "discover",
  gratitude: "feel",
};

const j = (id: string, category: CategoryId, theme: QuestTheme, minutes = 2): Question => ({ id, category, theme, minutes, source: "journey" });
const l = (id: string, category: CategoryId, theme: QuestTheme, minutes = 2): Question => ({ id, category, theme, minutes, source: "library" });

/**
 * The first version of the 63-day journey (j01–j63). These ids stay valid so old
 * answers keep their question; the journey itself now follows `journeyPlan`.
 */
export const legacyJourneyQuestions: Question[] = [
  j("j01", "emotions", "feel"), j("j02", "emotions", "recharge"), j("j03", "needs", "connect"), j("j04", "needs", "recharge"),
  j("j05", "strengths", "grow"), j("j06", "strengths", "discover"), j("j07", "strengths", "discover", 4),
  j("j08", "listening", "connect"), j("j09", "listening", "connect"), j("j10", "communication", "feel"), j("j11", "communication", "connect"),
  j("j12", "understanding", "discover"), j("j13", "understanding", "connect"), j("j14", "understanding", "connect", 4),
  j("j15", "gratitude", "connect"), j("j16", "boundaries", "recharge"), j("j17", "boundaries", "grow"), j("j18", "intentions", "connect"),
  j("j19", "intentions", "grow"), j("j20", "intentions", "connect"), j("j21", "intentions", "grow", 4),
  // Chapter 2 (days 22-42) and chapter 3 (days 43-63).
  j("j22", "self-compassion", "feel"), j("j23", "self-compassion", "recharge"), j("j24", "emotions", "feel"), j("j25", "needs", "recharge"), j("j26", "self-compassion", "grow"), j("j27", "gratitude", "feel"), j("j28", "self-compassion", "feel", 4),
  j("j29", "emotions", "feel"), j("j30", "needs", "connect"), j("j31", "emotions", "discover"), j("j32", "needs", "recharge"), j("j33", "emotions", "feel"), j("j34", "communication", "connect"), j("j35", "emotions", "feel", 4),
  j("j36", "confidence", "grow"), j("j37", "confidence", "discover"), j("j38", "boundaries", "recharge"), j("j39", "intentions", "grow"), j("j40", "confidence", "connect"), j("j41", "intentions", "grow"), j("j42", "confidence", "grow", 4),
  j("j43", "curiosity", "discover"), j("j44", "curiosity", "connect"), j("j45", "curiosity", "discover"), j("j46", "playful", "recharge"), j("j47", "understanding", "connect"), j("j48", "curiosity", "discover"), j("j49", "curiosity", "discover", 4),
  j("j50", "friendship", "connect"), j("j51", "gratitude", "connect"), j("j52", "listening", "connect"), j("j53", "friendship", "recharge"), j("j54", "communication", "connect"), j("j55", "gratitude", "feel"), j("j56", "gratitude", "connect", 4),
  j("j57", "intentions", "grow"), j("j58", "strengths", "grow"), j("j59", "self-compassion", "feel"), j("j60", "intentions", "connect"), j("j61", "needs", "recharge"), j("j62", "intentions", "grow"), j("j63", "intentions", "grow", 4),
];

/** Topic and theme of each bank theme (A–I), for colours, badges and XP topics. */
const bankCategory: Record<BankTheme, [CategoryId, QuestTheme]> = {
  A: ["emotions", "feel"],
  B: ["understanding", "discover"],
  C: ["self-compassion", "feel"],
  D: ["understanding", "discover"],
  E: ["friendship", "connect"],
  F: ["boundaries", "recharge"],
  G: ["understanding", "discover"],
  H: ["intentions", "grow"],
  I: ["gratitude", "recharge"],
};

const fromBank = (b: BankQuestion, source: Question["source"]): Question =>
  ({ id: b.id, category: bankCategory[b.theme][0], theme: bankCategory[b.theme][1], minutes: 2, source });

const challenge = (id: string): Question =>
  id === "k42" ? j("k42", "confidence", "grow", 4) : legacyJourneyQuestions.find(q => q.id === id)!;

/** The 63-day journey in day order: bank questions, and a challenge every seventh day. */
export const journeyQuestions: Question[] = journeyPlan.map((id, i) =>
  (i + 1) % 7 === 0 ? challenge(id) : fromBank(bankQuestion(id)!, "journey"));

/** Bank questions that are not on the journey (used by the daily question and the guided sequences). */
export const otherBankQuestions: Question[] = bankQuestions
  .filter(b => !journeyPlan.includes(b.id))
  .map(b => fromBank(b, "bank"));


export const libraryQuestions: Question[] = [
  l("l13", "curiosity", "discover"), l("l14", "gratitude", "recharge"), l("l15", "emotions", "feel"),
  l("l16", "needs", "recharge"), l("l17", "confidence", "grow"),
  l("l01", "playful", "discover"), l("l02", "playful", "recharge"), l("l03", "playful", "recharge"),
  l("l04", "confidence", "feel"), l("l05", "confidence", "grow"),
  l("l06", "friendship", "connect"), l("l07", "friendship", "connect"),
  l("l08", "curiosity", "discover"), l("l09", "curiosity", "grow"),
  l("l10", "gratitude", "connect"), l("l11", "gratitude", "feel"),
  l("l12", "confidence", "discover"),
];

/** The built-in journey comes in chapters of 21 days (3 weeks of 7). */
export const CHAPTER_DAYS = 21;
const WEEK_TONES = ["coral", "sky", "mint", "sun", "purple", "coral", "sky", "mint", "sun"] as const;

export const weeks: Week[] = WEEK_TONES.map((tone, i) => ({ week: i + 1, tone }));

export const journeyNodes: JourneyNode[] = journeyQuestions.map((q, i) => ({
  id: `day-${i + 1}`,
  day: i + 1,
  week: Math.floor(i / 7) + 1,
  chapter: Math.floor(i / CHAPTER_DAYS) + 1,
  kind: (i + 1) % 7 === 0 ? "challenge" : "quest",
  questionId: q.id,
}));

export const CHAPTERS = journeyNodes.length / CHAPTER_DAYS;
export const chapterOf = (day: number) => Math.ceil(day / CHAPTER_DAYS);
export const chapterNodes = (chapter: number) => journeyNodes.filter(n => n.chapter === chapter);
export const chapterWeeks = (chapter: number) => [...new Set(chapterNodes(chapter).map(n => n.week))];

export const builtInQuestions: Question[] = [
  ...journeyQuestions,
  ...legacyJourneyQuestions.filter(q => !journeyPlan.includes(q.id)),
  ...otherBankQuestions,
  ...libraryQuestions,
];

/** The old journey question of a day (for members who answered it before the new journey). */
export const legacyJourneyId = (day: number) => legacyJourneyQuestions[day - 1]?.id;

export const XP_RULES = {
  daily: 20,
  reflection: 5,
  newTopic: 10,
  bonus: 10,
  weekly: 50,
  /** A finished step on My Path. */
  step: 5,
  /** A saved journal entry (its content is never read for this). */
  journal: 5,
  /** Steps and journal entries together earn at most this much per day. */
  growthDailyCap: 15,
} as const;

/**
 * Level thresholds; names are in the dictionaries (`gamification.levels`).
 * Append entries to extend; levels past the last keep counting every `overflowStep` XP.
 */
export const levels = [
  { level: 1, min: 0 },
  { level: 2, min: 60 },
  { level: 3, min: 150 },
  { level: 4, min: 300 },
  { level: 5, min: 500 },
  { level: 6, min: 800 },
  { level: 7, min: 1200 },
];
export const overflowStep = 500;

/**
 * Words for "My Inner World". Deliberately an unsorted cloud: no groups and
 * no scores on screen. Each only tints that day in the mood calendar, as one of
 * the soft "How are you?" colours (lib/checkin/moodCalendar). Text is in the
 * dictionaries (`innerWorld.words`).
 */
export const feelingWords = [
  "calm", "curious", "tired", "hopeful", "restless", "grateful", "tender", "proud",
  "overwhelmed", "light", "lonely", "playful", "content", "unsure", "energised", "sad",
  "relieved", "excited", "irritated", "safe", "nostalgic", "inspired", "anxious", "cosy",
] as const;
export type FeelingWord = (typeof feelingWords)[number];

/** Original companions that join the mascot (Berripop) through participation. */
export const companions = ["nubi", "zing", "kobi"] as const;
export type CompanionId = (typeof companions)[number];

/** Optional prompts each companion offers in My Inner World (text in dictionaries). */
export const companionPrompts: Record<CompanionId, readonly string[]> = {
  nubi: ["nubi-1", "nubi-2"],
  zing: ["zing-1", "zing-2"],
  kobi: ["kobi-1", "kobi-2"],
};
