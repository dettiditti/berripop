import { addDays } from "./dates";

/**
 * Berri's appetite: a playful way to show that small, regular moments of
 * attention keep Berri (and the member's inner world) well. Berri is fed by
 * the member taking part: answering a question, a "how are you" check-in, or
 * a moment saved in the inner world.
 *
 * Kept gentle on purpose. Berri gets peckish, then hungry, and after a longer
 * break simply misses the member and is glad when they come back. Berri is
 * never sad or hurt because of the member, nothing is lost while away, and
 * nothing can be bought here.
 */
export type Hunger = "full" | "peckish" | "hungry" | "missing";

/** Different kinds of "food" eaten today; three fills the bowl. */
export const MEALS_PER_DAY = 3;
export type Meal = "question" | "checkin" | "moment";

export type BerriAppetite = {
  hunger: Hunger;
  /** Which kinds of food Berri had today. */
  mealsToday: Meal[];
  /** Days since Berri last ate; null if never. */
  daysSinceFed: number | null;
};

/** How hungry Berri is after this many days without food. */
export function hungerAfter(days: number | null): Hunger {
  if (days === null) return "peckish";
  if (days <= 0) return "full";
  if (days === 1) return "peckish";
  if (days <= 3) return "hungry";
  return "missing";
}

/** Whole days from `from` to `to` (both "YYYY-MM-DD"), at most `cap`. */
export function daysUntil(from: string, to: string, cap = 60): number {
  let n = 0;
  let d = from;
  while (d < to && n < cap) {
    d = addDays(d, 1);
    n++;
  }
  return n;
}

/** The latest date in the list that is not after today, or null. */
export function lastFedDate(dates: Iterable<string>, today: string): string | null {
  let last: string | null = null;
  for (const d of dates) if (d <= today && (last === null || d > last)) last = d;
  return last;
}

export function appetiteOf(input: { questionDates: Iterable<string>; checkinDates: Iterable<string>; momentDates: Iterable<string> }, today: string): BerriAppetite {
  const q = new Set(input.questionDates);
  const c = new Set(input.checkinDates);
  const m = new Set(input.momentDates);
  const mealsToday: Meal[] = [];
  if (q.has(today)) mealsToday.push("question");
  if (c.has(today)) mealsToday.push("checkin");
  if (m.has(today)) mealsToday.push("moment");
  const last = lastFedDate([...q, ...c, ...m], today);
  const daysSinceFed = last === null ? null : daysUntil(last, today);
  return { hunger: hungerAfter(daysSinceFed), mealsToday, daysSinceFed };
}
