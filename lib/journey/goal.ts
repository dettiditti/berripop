import { CHAPTER_DAYS, chapterNodes, questThemes } from "../content";
import { extractJson, SAFETY } from "../assessment/model";
import type { CategoryId, QuestTheme, Question } from "../types";

/**
 * The member's own journey, built by the AI from their goals: the same shape
 * as the built-in journey (21 days, 3 weeks, a challenge every 7th day), but
 * with their own titles and questions. Circles keep walking the built-in
 * journey together; this one belongs to the member alone.
 */

export const GOAL_JOURNEY_DAYS = CHAPTER_DAYS;
/** A goal journey has the shape of one built-in chapter (its days, weeks and challenges). */
export const goalNodes = chapterNodes(1);

export type GoalJourneyWeek = { week: number; theme: string; tagline: string };
export type GoalJourneyDay = {
  day: number;
  week: number;
  kind: "quest" | "challenge";
  title: string;
  prompt: string;
  theme: QuestTheme;
  followups: string[];
};
export type GoalJourneyContent = { weeks: GoalJourneyWeek[]; days: GoalJourneyDay[] };

/** Answers to a goal journey day are stored under this reference. */
export const goalRef = (journeyId: string, day: number) => `g:${journeyId}:${day}`;
export const isGoalRef = (ref: string) => ref.startsWith("g:");
export function parseGoalRef(ref: string): { journeyId: string; day: number } | null {
  const m = /^g:([0-9a-f-]{36}):(\d{1,2})$/.exec(ref);
  if (!m) return null;
  const day = Number(m[2]);
  return day >= 1 && day <= GOAL_JOURNEY_DAYS ? { journeyId: m[1], day } : null;
}

/** Badges and colours use categories; each theme maps to one. */
const THEME_CATEGORY: Record<QuestTheme, CategoryId> = {
  discover: "curiosity", feel: "emotions", connect: "communication", recharge: "needs", grow: "intentions",
};

/** A goal journey day as a question the answer flow can show. */
export function goalQuestion(journeyId: string, d: GoalJourneyDay): Question {
  return {
    id: goalRef(journeyId, d.day), category: THEME_CATEGORY[d.theme], theme: d.theme,
    minutes: d.kind === "challenge" ? 10 : 3, source: "goal", text: d.prompt, prompts: d.followups,
  };
}

/* ---------- AI ---------- */

const language = (locale: string) => (locale === "en" ? "English" : "Hungarian");

export function goalJourneyInstructions(locale: string): string {
  return [
    `You are Berripop, a warm companion in a personal growth app. Write in ${language(locale)}, addressing the person informally.`,
    `Create a gentle ${GOAL_JOURNEY_DAYS}-day journey (3 weeks of 7 days) that helps them move towards THEIR goals, using only what they told you.`,
    "Each day is one short reflective question or tiny practical exercise doable in 2-5 minutes. The 7th day of every week is a weekly challenge: one small real-life action (10-15 minutes) that builds on that week.",
    "Build gradually: week 1 explores where they are and what matters, week 2 practises small steps, week 3 consolidates and looks ahead.",
    // Days nested per week: counting to 7 three times is reliable, a flat list of 21 often came back with 20.
    `Respond ONLY with JSON: {"weeks": [{"theme": string, "tagline": string, "days": [{"day": number, "title": string, "prompt": string, "theme": one of ${questThemes.map(t => `"${t}"`).join(", ")}, "followups": [string, string]}]}]}.`,
    `weeks: exactly 3 (theme at most 4 words, tagline one short sentence). Each week has exactly 7 days, numbered 1-7 within the week (title at most 6 words, prompt one or two sentences, followups: two short optional deeper questions).`,
    SAFETY,
  ].join(" ");
}

/**
 * What the AI gets: goal titles and reasons, plus the area and time they chose.
 * For a next chapter, also the week themes of the chapter they just finished
 * (titles the AI wrote itself, never their answers). Never journal entries.
 */
export function describeGoals(input: { goals: { title: string; details: string }[]; area?: string; time?: string; previousWeeks?: string[] }): string {
  return [
    "Their goals:",
    ...input.goals.map(g => `- ${g.title}${g.details ? ` (${g.details})` : ""}`),
    input.area ? `Area they want to grow in: ${input.area}` : "",
    input.time ? `Realistic time: ${input.time}` : "",
    input.previousWeeks?.length
      ? `They just finished a previous ${GOAL_JOURNEY_DAYS}-day chapter with these weeks: ${input.previousWeeks.join("; ")}. Write the NEXT chapter: build on it, go one step deeper or more practical, and do not repeat its questions.`
      : "",
  ].filter(Boolean).join("\n");
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);

/** Keeps only a complete, well-formed journey; anything less is rejected (and the allowance refunded). */
export function parseGoalJourney(raw: string): GoalJourneyContent | null {
  const j = extractJson(raw) as { weeks?: unknown; days?: unknown } | null;
  if (!j || !Array.isArray(j.weeks)) return null;
  const weekList = j.weeks.slice(0, 3).map(w => (w ?? {}) as Record<string, unknown>);
  const weeks = weekList.map((o, i) => {
    const theme = str(o.theme, 40);
    return theme ? { week: i + 1, theme, tagline: str(o.tagline, 140) ?? "" } : null;
  });
  if (weeks.length !== 3 || weeks.some(w => !w)) return null;
  // Days come nested per week (7 each); a flat "days" list is the earlier format.
  const nested = weekList.every(w => Array.isArray(w.days));
  const all: unknown[] | null = nested
    ? (weekList.every(w => (w.days as unknown[]).length >= 7) ? weekList.flatMap(w => (w.days as unknown[]).slice(0, 7)) : null)
    : Array.isArray(j.days) ? j.days : null;
  if (!all || all.length < GOAL_JOURNEY_DAYS) return null;
  const days: GoalJourneyDay[] = [];
  for (const node of goalNodes) {
    const o = (all[node.day - 1] ?? {}) as Record<string, unknown>;
    const title = str(o.title, 60);
    const prompt = str(o.prompt, 280);
    if (!title || !prompt) return null;
    const theme = questThemes.includes(o.theme as QuestTheme) ? (o.theme as QuestTheme) : "grow";
    const followups = (Array.isArray(o.followups) ? o.followups : []).map(f => str(f, 160)).filter((f): f is string => !!f).slice(0, 2);
    days.push({ day: node.day, week: node.week, kind: node.kind, title, prompt, theme, followups });
  }
  return { weeks: weeks as GoalJourneyWeek[], days };
}

/** Normalised goal titles, to tell whether the journey still matches the member's goals. */
export function goalsKey(titles: string[]): string {
  return [...new Set(titles.map(t => t.trim().toLowerCase()).filter(Boolean))].sort().join("\n");
}
