import { CHECKIN_STATES, type CheckinState } from "./checkin";

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
