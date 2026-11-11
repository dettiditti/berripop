import { CHECKIN_STATES, type CheckinState } from "./checkin";
import type { FeelingWord } from "../content";

/** Date helpers for the mood calendar (My Inner World). */

export type Mood = { date: string; state: CheckinState };

/** "YYYY-MM" of a "YYYY-MM-DD" date. */
export const monthOf = (date: string) => date.slice(0, 7);

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** The days of a month as a Monday-first grid: null for the empty cells before the 1st. */
export function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
}

/** The state noted most often in a month (ties go to the first in the list), or null. */
export function mostOften(moods: Mood[], month: string): CheckinState | null {
  const counts = new Map<CheckinState, number>();
  for (const m of moods) if (monthOf(m.date) === month) counts.set(m.state, (counts.get(m.state) ?? 0) + 1);
  let best: CheckinState | null = null;
  for (const s of CHECKIN_STATES) if ((counts.get(s) ?? 0) > (best ? counts.get(best)! : 0)) best = s;
  return best;
}

/**
 * The calendar colour a moment's feeling words suggest (My Inner World): each
 * word belongs to one of the "How are you?" states. The state most of the
 * chosen words share wins; a tie between different states is "mixed". Own
 * words and the note are never read.
 */
export const FEELING_STATE: Record<FeelingWord, CheckinState> = {
  calm: "calm", content: "calm", safe: "calm", cosy: "calm", relieved: "calm", tender: "calm",
  hopeful: "good", grateful: "good", proud: "good", light: "good", playful: "good", energised: "good", excited: "good", inspired: "good", curious: "good",
  tired: "tired",
  restless: "tense", overwhelmed: "tense", irritated: "tense", anxious: "tense",
  sad: "sad", lonely: "sad", nostalgic: "sad",
  unsure: "mixed",
};

export function feelingState(words: readonly string[]): CheckinState | null {
  const counts = new Map<CheckinState, number>();
  for (const w of words) {
    const s = FEELING_STATE[w as FeelingWord];
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  if (!counts.size) return null;
  const top = Math.max(...counts.values());
  const leaders = [...counts.entries()].filter(([, n]) => n === top).map(([s]) => s);
  return leaders.length === 1 ? leaders[0] : "mixed";
}

/**
 * The days to colour: the "How are you today?" answer where there is one,
 * otherwise the feelings of that day's moments (all of them together).
 * Sorted by date.
 */
export function calendarMoods(moods: Mood[], moments: { date: string; words: readonly string[] }[]): Mood[] {
  const byDate = new Map(moods.map(m => [m.date, m.state]));
  const words = new Map<string, string[]>();
  for (const m of moments) if (!byDate.has(m.date)) words.set(m.date, [...(words.get(m.date) ?? []), ...m.words]);
  for (const [date, ws] of words) {
    const s = feelingState(ws);
    if (s) byDate.set(date, s);
  }
  return [...byDate.entries()].map(([date, state]) => ({ date, state })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
