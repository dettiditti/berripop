import { levels } from "../content";
import type { Question } from "../types";
import type { BuiltInQuestionId, Dictionary } from "./dictionaries";
import { fmt } from "./format";

/**
 * Built-in questions are stored by id and translated here. Questions people
 * write themselves keep their original text in every language.
 */
export function questionText(q: Question, d: Dictionary): string {
  if (q.source === "custom" || q.source === "goal") return q.text ?? "";
  return d.content.questions[q.id as BuiltInQuestionId]?.text ?? q.id;
}

export function questionPrompts(q: Question, d: Dictionary): string[] {
  if (q.source === "goal") return q.prompts?.length ? q.prompts : d.questions.customPrompts;
  if (q.source === "custom") return d.questions.customPrompts;
  return d.content.questions[q.id as BuiltInQuestionId]?.prompts ?? [];
}

export function levelName(d: Dictionary, level: number): string {
  const names = d.gamification.levels;
  if (level <= names.length) return names[level - 1];
  return fmt(d.gamification.levelOverflow, { name: names[names.length - 1], n: level - levels.length + 1 });
}

export function weekText(d: Dictionary, week: number) {
  return d.journey.weeks[`w${week}` as keyof Dictionary["journey"]["weeks"]];
}
