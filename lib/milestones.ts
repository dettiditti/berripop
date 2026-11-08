import type { Locale } from "./i18n/config";

/*
 * Personal milestones on Profile: small, honest markers of what the member has
 * already done, counted from data the app already keeps (counts only, never
 * content). Nothing here can be lost: streaks use the best one ever reached.
 */

export type MilestoneGroup = "journal" | "streak" | "reflection" | "circles" | "goals";
export const MILESTONE_GROUPS: MilestoneGroup[] = ["journal", "streak", "reflection", "circles", "goals"];

/** What the server counts for one member (see lib/server/milestones.ts). */
export type MilestoneCounts = {
  entries: number;
  /** Saved entries with a feeling sticker; null while stickers can't be stored yet. */
  stickered: number | null;
  /** Different feelings used so far; null while stickers can't be stored yet. */
  feelings: number | null;
  reflections: number;
  insights: number;
  circles: number;
  circleAnswers: number;
  /** Reactions the member gave plus reactions on the member's answers. */
  reactions: number;
  goals: number;
  stepsDone: number;
  /** Days completed on the member's own goal journey. */
  goalDays: number;
};

export type MilestoneId =
  | "first-entry" | "entries-10" | "entries-50" | "first-sticker" | "all-feelings"
  | "streak-3" | "streak-7" | "streak-30"
  | "first-reflection" | "kept-insight" | "reflections-10"
  | "first-circle" | "first-answer" | "reactions-5"
  | "first-goal" | "first-step" | "goal-week";

export type Milestone = { id: MilestoneId; group: MilestoneGroup; have: number; need: number; done: boolean };

const DEFS: { id: MilestoneId; group: MilestoneGroup; need: number; count: (c: MilestoneCounts, bestStreak: number) => number | null }[] = [
  { id: "first-entry", group: "journal", need: 1, count: c => c.entries },
  { id: "entries-10", group: "journal", need: 10, count: c => c.entries },
  { id: "first-sticker", group: "journal", need: 1, count: c => c.stickered },
  { id: "all-feelings", group: "journal", need: 7, count: c => c.feelings },
  { id: "entries-50", group: "journal", need: 50, count: c => c.entries },
  { id: "streak-3", group: "streak", need: 3, count: (_, s) => s },
  { id: "streak-7", group: "streak", need: 7, count: (_, s) => s },
  { id: "streak-30", group: "streak", need: 30, count: (_, s) => s },
  { id: "first-reflection", group: "reflection", need: 1, count: c => c.reflections },
  { id: "kept-insight", group: "reflection", need: 1, count: c => c.insights },
  { id: "reflections-10", group: "reflection", need: 10, count: c => c.reflections },
  { id: "first-circle", group: "circles", need: 1, count: c => c.circles },
  { id: "first-answer", group: "circles", need: 1, count: c => c.circleAnswers },
  { id: "reactions-5", group: "circles", need: 5, count: c => c.reactions },
  { id: "first-goal", group: "goals", need: 1, count: c => c.goals },
  { id: "first-step", group: "goals", need: 1, count: c => c.stepsDone },
  { id: "goal-week", group: "goals", need: 7, count: c => c.goalDays },
];

/** Every milestone the member can reach now (sticker ones are left out until stickers can be stored). */
export function milestonesFrom(counts: MilestoneCounts, bestStreak: number): Milestone[] {
  return DEFS.flatMap(def => {
    const raw = def.count(counts, bestStreak);
    if (raw === null) return [];
    const have = Math.max(0, Math.min(raw, def.need));
    return [{ id: def.id, group: def.group, have, need: def.need, done: raw >= def.need }];
  });
}

/** The unfinished milestone closest to done (ties: the earlier one in the list). */
export function nextMilestone(list: Milestone[]): Milestone | null {
  let best: Milestone | null = null;
  for (const m of list) if (!m.done && (!best || m.have / m.need > best.have / best.need)) best = m;
  return best;
}

type Copy = {
  title: string; eyebrow: string; next: string; done: string; all: string; more: string; less: string; filter: string; progress: string; allDone: string;
  groups: Record<MilestoneGroup, string>;
  items: Record<MilestoneId, { label: string; hint: string }>;
};

export const MILESTONE_COPY: Record<Locale, Copy> = {
  hu: {
    title: "Mérföldkövek", eyebrow: "A saját utad", next: "Legközelebb", done: "Megvan", all: "Mind", more: "Mind a {n} megnézése", less: "Kevesebb",
    filter: "Mérföldkövek szűrése", progress: "{done} mérföldkő megvan a {total}-ből", allDone: "Minden mérföldkő megvan. Berri nagyon büszke rád!",
    groups: { journal: "Napló", streak: "Sorozat", reflection: "Reflexió", circles: "Körök", goals: "Célok" },
    items: {
      "first-entry": { label: "Első bejegyzés", hint: "Leírtad az első gondolatodat" },
      "entries-10": { label: "10 bejegyzés", hint: "Tíz alkalommal írtál magadnak" },
      "entries-50": { label: "50 bejegyzés", hint: "Ötven alkalommal írtál magadnak" },
      "first-sticker": { label: "Első matrica", hint: "Érzést tűztél egy bejegyzéshez" },
      "all-feelings": { label: "Minden érzés", hint: "Mind a 7 érzésmatricát használtad" },
      "streak-3": { label: "3 napos sorozat", hint: "Három nap egymás után" },
      "streak-7": { label: "Egy egész hét", hint: "Hét nap egymás után" },
      "streak-30": { label: "30 napos sorozat", hint: "Egy hónapnyi figyelem magadra" },
      "first-reflection": { label: "Első reflexió", hint: "Berri először visszatükrözött" },
      "kept-insight": { label: "Megtartott gondolat", hint: "Elmentettél egy felismerést" },
      "reflections-10": { label: "10 reflexió", hint: "Tíz bejegyzést gondoltatok át együtt" },
      "first-circle": { label: "Első kör", hint: "Tagja lettél egy körnek" },
      "first-answer": { label: "Első közös válasz", hint: "Válaszoltál a kör kérdésére" },
      "reactions-5": { label: "5 szív a körben", hint: "Öt reakciót kaptál vagy adtál" },
      "first-goal": { label: "Első cél", hint: "Kitűztél egy fejlődési célt" },
      "first-step": { label: "Első lépés", hint: "Teljesítetted egy cél első lépését" },
      "goal-week": { label: "Egy hét a saját utadon", hint: "Hét napot teljesítettél a saját utadon" },
    },
  },
  en: {
    title: "Milestones", eyebrow: "Your own path", next: "Up next", done: "Done", all: "All", more: "See all {n}", less: "Show less",
    filter: "Filter milestones", progress: "{done} of {total} milestones reached", allDone: "Every milestone reached. Berri is so proud of you!",
    groups: { journal: "Journal", streak: "Streak", reflection: "Reflection", circles: "Circles", goals: "Goals" },
    items: {
      "first-entry": { label: "First entry", hint: "You wrote down your first thought" },
      "entries-10": { label: "10 entries", hint: "You wrote to yourself ten times" },
      "entries-50": { label: "50 entries", hint: "You wrote to yourself fifty times" },
      "first-sticker": { label: "First sticker", hint: "You pinned a feeling to an entry" },
      "all-feelings": { label: "Every feeling", hint: "You used all 7 feeling stickers" },
      "streak-3": { label: "3-day streak", hint: "Three days in a row" },
      "streak-7": { label: "A whole week", hint: "Seven days in a row" },
      "streak-30": { label: "30-day streak", hint: "A month of paying attention to yourself" },
      "first-reflection": { label: "First reflection", hint: "Berri reflected with you for the first time" },
      "kept-insight": { label: "A thought kept", hint: "You saved an insight" },
      "reflections-10": { label: "10 reflections", hint: "You thought ten entries through together" },
      "first-circle": { label: "First circle", hint: "You became part of a circle" },
      "first-answer": { label: "First shared answer", hint: "You answered your circle's question" },
      "reactions-5": { label: "5 hearts in the circle", hint: "You gave or received five reactions" },
      "first-goal": { label: "First goal", hint: "You set a growth goal" },
      "first-step": { label: "First step", hint: "You finished a goal's first step" },
      "goal-week": { label: "A week on your own path", hint: "You completed seven days on your own path" },
    },
  },
};
