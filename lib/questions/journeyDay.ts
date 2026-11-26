import { journeyNodes } from "../content";
import { bankQuestion, bankQuestions, journeyPlan, type BankQuestion } from "./bank";

/**
 * Which question a member gets on a journey day (63-day plan, section 3.1).
 *
 * A level-2 day only asks its own question once the member has answered a
 * level-1 bank question of the same theme somewhere (journey or daily). Until
 * then the day asks an easier, level-1 question of that theme instead, and the
 * level-2 question is only offered afterwards ("Mennél egy kicsit mélyebbre?").
 * Either way the day counts, and the journey does not shift.
 *
 * In the planned order this only matters for members who walked earlier days
 * with the first journey's questions.
 */
export type JourneyDayQuestion = {
  /** The question to ask today. */
  ref: string;
  /** The day's own, deeper question, when `ref` is an easier stand-in for it. */
  deeper?: string;
};

const answeredBank = (answered: Iterable<string>) =>
  [...answered].map(r => bankQuestion(r)).filter((b): b is BankQuestion => !!b);

/** Level-1 bank questions that may stand in for a level-2 day: light, on their own, not yet used. */
function easierFor(day: number, deep: BankQuestion, answered: Set<string>): BankQuestion | undefined {
  const usedFamilies = new Set(answeredBank(answered).map(b => b.family).filter(Boolean));
  const laterOnJourney = new Set(journeyPlan.slice(day - 1));
  const fits = (b: BankQuestion) =>
    b.theme === deep.theme && b.depth === 1 && !b.followUpOnly && b.sensitivity === "light" && !b.only
    && !["G1", "G2", "G3"].includes(b.subtheme) && b.family !== "friend-lens"
    && !(b.family && usedFamilies.has(b.family)) && !answered.has(b.id) && !laterOnJourney.has(b.id);
  // Prefer the theme's earlier journey questions (already reviewed for this order), then the rest of the bank.
  const earlier = journeyPlan.slice(0, day - 1).map(id => bankQuestion(id)).filter((b): b is BankQuestion => !!b && fits(b));
  return earlier[0] ?? bankQuestions.find(fits);
}

export function journeyQuestionFor(day: number, answeredRefs: Iterable<string>): JourneyDayQuestion {
  const node = journeyNodes[day - 1];
  if (!node) return { ref: "" };
  const deep = bankQuestion(node.questionId);
  if (!deep || deep.depth !== 2) return { ref: node.questionId };
  const answered = new Set(answeredRefs);
  if (answeredBank(answered).some(b => b.theme === deep.theme && b.depth === 1)) return { ref: node.questionId };
  const easier = easierFor(day, deep, answered);
  return easier ? { ref: easier.id, deeper: node.questionId } : { ref: node.questionId };
}

/**
 * Whether answering `ref` completes journey `day`: the day's own question, the
 * question the member is given that day, or the one they already answered it with.
 */
export function journeyDayAccepts(day: number, ref: string, answeredRefs: Iterable<string>, recordedRef?: string): boolean {
  const node = journeyNodes[day - 1];
  if (!node) return false;
  return ref === node.questionId || ref === recordedRef || ref === journeyQuestionFor(day, answeredRefs).ref;
}
