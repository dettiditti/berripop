/**
 * My Path initial assessment: the answer shape, input cleaning, prompts and
 * parsing of AI output. Pure (no I/O), so it is unit-tested directly.
 */

export const AREAS = ["relationships", "confidence", "stress", "communication", "habits", "selfcare", "other"] as const;
export const OBSTACLES = ["time", "motivation", "fear", "unclear", "energy", "people", "other"] as const;
export const TIMES = ["daily5", "daily15", "weekly2", "weekly1"] as const;
export const SUPPORTS = ["questions", "exercises", "reflection", "routine"] as const;

export type Area = (typeof AREAS)[number];
export type Obstacle = (typeof OBSTACLES)[number];
export type TimeBudget = (typeof TIMES)[number];
export type Support = (typeof SUPPORTS)[number];

export type AssessmentAnswers = {
  area?: Area;
  areaText?: string;
  situation?: string;
  outcome?: string;
  obstacles?: Obstacle[];
  obstaclesText?: string;
  time?: TimeBudget;
  support?: Support[];
};

export type Followup = { question: string; answer: string };

export type PathPlan = {
  summary: string;
  goals: { title: string; why: string }[];
  firstStep: { title: string; minutes: number };
  nextSteps: { title: string }[];
  weeklyRhythm: string;
};

/** Base questions (fixed), then AI follow-ups, then the plan. */
export const BASE_STEPS = ["area", "situation", "outcome", "obstacles", "time", "support"] as const;
export const FOLLOWUP_STEP = BASE_STEPS.length; // 6
export const PLAN_STEP = FOLLOWUP_STEP + 1; // 7
export const TOTAL_STEPS = PLAN_STEP + 1; // 8

/** Hard caps per assessment: 2 follow-up questions + 1 plan + 1 regeneration. */
export const MAX_FOLLOWUPS = 2;
export const MAX_AI_CALLS = 4;
export const MAX_TEXT = 600;

const clean = (v: unknown, max = MAX_TEXT) => (typeof v === "string" ? v.trim().slice(0, max) : undefined) || undefined;
const pick = <T extends string>(v: unknown, allowed: readonly T[]) => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);
const pickMany = <T extends string>(v: unknown, allowed: readonly T[]) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is T => typeof x === "string" && (allowed as readonly string[]).includes(x)))] : undefined;

/** Keeps only known fields, known option keys and trimmed, length-limited text. */
export function sanitizeAnswers(raw: unknown): AssessmentAnswers {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: AssessmentAnswers = {
    area: pick(r.area, AREAS),
    areaText: clean(r.areaText, 200),
    situation: clean(r.situation),
    outcome: clean(r.outcome),
    obstacles: pickMany(r.obstacles, OBSTACLES),
    obstaclesText: clean(r.obstaclesText, 300),
    time: pick(r.time, TIMES),
    support: pickMany(r.support, SUPPORTS),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))) as AssessmentAnswers;
}

export function sanitizeFollowups(raw: unknown): Followup[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map(f => ({ question: clean(f.question, 300) ?? "", answer: clean(f.answer) ?? "" }))
    .filter(f => f.question)
    .slice(0, MAX_FOLLOWUPS);
}

/** Whether a base step has enough to continue. Free-text steps need a few words. */
export function stepComplete(a: AssessmentAnswers, step: (typeof BASE_STEPS)[number]): boolean {
  switch (step) {
    case "area": return !!a.area && (a.area !== "other" || (a.areaText?.length ?? 0) >= 3);
    case "situation": return (a.situation?.length ?? 0) >= 10;
    case "outcome": return (a.outcome?.length ?? 0) >= 5;
    case "obstacles": return !!a.obstacles?.length || (a.obstaclesText?.length ?? 0) >= 3;
    case "time": return !!a.time;
    case "support": return !!a.support?.length;
  }
}

export const baseComplete = (a: AssessmentAnswers) => BASE_STEPS.every(s => stepComplete(a, s));

/* ---------- Prompts (the model always gets English labels; it answers in the user's language) ---------- */

export const AREA_EN: Record<Area, string> = {
  relationships: "relationships and closeness", confidence: "self-confidence and speaking up", stress: "handling stress and calm",
  communication: "communication and conflicts", habits: "habits and consistency", selfcare: "self-care and rest", other: "something else",
};
const OBSTACLE_EN: Record<Obstacle, string> = {
  time: "little time", motivation: "staying motivated", fear: "fear or self-doubt", unclear: "not knowing where to start",
  energy: "low energy", people: "other people or circumstances", other: "other",
};
export const TIME_EN: Record<TimeBudget, string> = { daily5: "about 5 minutes a day", daily15: "10-15 minutes a day", weekly2: "2-3 times a week", weekly1: "about once a week" };
const SUPPORT_EN: Record<Support, string> = { questions: "reflective questions", exercises: "small practical exercises", reflection: "feedback on their writing", routine: "a steady routine" };

export function describeAnswers(a: AssessmentAnswers, followups: Followup[]): string {
  const lines = [
    `Area: ${a.area ? AREA_EN[a.area] : "-"}${a.areaText ? ` (${a.areaText})` : ""}`,
    `Current situation, in their words: ${a.situation ?? "-"}`,
    `Desired outcome: ${a.outcome ?? "-"}`,
    `Obstacles: ${(a.obstacles ?? []).map(o => OBSTACLE_EN[o]).join(", ") || "-"}${a.obstaclesText ? ` (${a.obstaclesText})` : ""}`,
    `Realistic time: ${a.time ? TIME_EN[a.time] : "-"}`,
    `Preferred support: ${(a.support ?? []).map(s => SUPPORT_EN[s]).join(", ") || "-"}`,
  ];
  for (const f of followups) if (f.answer) lines.push(`Follow-up Q: ${f.question}\nA: ${f.answer}`);
  return lines.join("\n");
}

const language = (locale: string) => (locale === "en" ? "English" : "Hungarian");

export const SAFETY = "Never diagnose, label their personality or mental health, or claim to know how they feel. Do not ask for sensitive data (health, finances, identities of other people, contact details). Keep a warm, informal tone.";

export function followupInstructions(locale: string): string {
  return [
    `You are Berripop, a warm companion in a personal growth app. Write in ${language(locale)}, addressing the person informally.`,
    "Based on their answers, ask exactly ONE short, open follow-up question (at most 25 words) that would most help to build a concrete, realistic growth plan for them. Ask about something they have not answered yet; do not repeat earlier questions.",
    SAFETY,
    'Respond ONLY with JSON: {"question": string}.',
  ].join(" ");
}

export function planInstructions(locale: string): string {
  return [
    `You are Berripop, a warm companion in a personal growth app. Write in ${language(locale)}, addressing the person informally.`,
    "Using only what they told you, create a small, realistic starting plan that fits their available time and preferred support.",
    'Respond ONLY with JSON: {"summary": string, "goals": [{"title": string, "why": string}], "firstStep": {"title": string, "minutes": number}, "nextSteps": [{"title": string}], "weeklyRhythm": string}.',
    "summary: 2-3 sentences reflecting back what you understood, in their own words where possible. goals: 1-3 concrete, positive growth goals (title at most 8 words, why one sentence). firstStep: one small action doable today in 2-15 minutes. nextSteps: 3-5 gradual, concrete steps for the coming weeks. weeklyRhythm: one sentence suggesting how often and when to practise.",
    SAFETY,
  ].join(" ");
}

/* ---------- Parsing AI output ---------- */

export function extractJson(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export function parseFollowup(raw: string): string | null {
  const j = extractJson(raw) as { question?: unknown } | null;
  return str(j?.question, 300);
}

export function parsePlan(raw: string): PathPlan | null {
  const j = extractJson(raw) as Record<string, unknown> | null;
  if (!j) return null;
  const summary = str(j.summary, 800);
  const goals = (Array.isArray(j.goals) ? j.goals : [])
    .map(g => ({ title: str((g as Record<string, unknown>)?.title, 120), why: str((g as Record<string, unknown>)?.why, 300) ?? "" }))
    .filter((g): g is { title: string; why: string } => !!g.title)
    .slice(0, 3);
  const fs = (j.firstStep ?? {}) as Record<string, unknown>;
  const firstTitle = str(fs.title, 200);
  const minutes = Math.min(60, Math.max(1, Math.round(Number(fs.minutes) || 5)));
  const nextSteps = (Array.isArray(j.nextSteps) ? j.nextSteps : [])
    .map(s => ({ title: str((s as Record<string, unknown>)?.title, 200) }))
    .filter((s): s is { title: string } => !!s.title)
    .slice(0, 5);
  const weeklyRhythm = str(j.weeklyRhythm, 300) ?? "";
  if (!summary || goals.length === 0 || !firstTitle || nextSteps.length === 0) return null;
  return { summary, goals, firstStep: { title: firstTitle, minutes }, nextSteps, weeklyRhythm };
}

/** What the member approved (edited) before accepting; validated again on the server. */
export type AcceptedPlan = { goals: string[]; firstStep: string; nextSteps: string[] };

export function sanitizeAccepted(raw: unknown): AcceptedPlan | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown, max: number, n: number) =>
    (Array.isArray(v) ? v : []).map(x => (typeof x === "string" ? x.trim().slice(0, max) : "")).filter(x => x.length >= 3).slice(0, n);
  const goals = list(r.goals, 120, 3);
  const firstStep = typeof r.firstStep === "string" ? r.firstStep.trim().slice(0, 200) : "";
  const nextSteps = list(r.nextSteps, 200, 5);
  if (goals.length === 0 || firstStep.length < 3) return null;
  return { goals, firstStep, nextSteps };
}
