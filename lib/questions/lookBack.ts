import { journeyNodes } from "../content";

/**
 * On the journey's look-back days the member sees their own earlier answers
 * (63-day plan, section 3.4). Only their own text, shown as written: no
 * analysis, no conclusions, nothing sent to the AI, never shown to others.
 */
export type LookBackGroup = {
  /** Week number the answers are from, or "pair" for day 63's first-and-last pair. */
  key: number | "pair";
  days: number[];
};

const questionDays = (...weeks: number[]) =>
  journeyNodes.filter(n => n.kind === "quest" && weeks.includes(n.week)).map(n => n.day);

export function lookBackGroups(day: number): LookBackGroup[] {
  switch (day) {
    case 7:
    case 21:
      return [{ key: 1, days: questionDays(1) }];
    case 42:
      return [4, 5, 6].map(w => ({ key: w, days: questionDays(w) }));
    case 63:
      // The pair first; its two days are not repeated in their weeks.
      return [{ key: "pair", days: [3, 62] }, { key: 1, days: questionDays(1).filter(d => d !== 3) }, { key: 9, days: questionDays(9).filter(d => d !== 62) }];
    default:
      return [];
  }
}

export type LookBackItem = { day: number; question: string; answer: string };
export type LookBack = { key: number | "pair"; items: LookBackItem[] }[];

/** The member's answers for the look-back groups of `day`; days without an answer are left out. */
export function lookBackFor(day: number, answerOf: (day: number) => { question: string; answer: string } | null): LookBack {
  return lookBackGroups(day)
    .map(g => ({ key: g.key, items: g.days.flatMap(d => { const a = answerOf(d); return a ? [{ day: d, ...a }] : []; }) }))
    .filter(g => g.items.length > 0);
}
