/*
 * The daily "your spark" greeting: once a day, when the member opens Today,
 * Berri celebrates how many days in a row they have been here (or welcomes
 * them back after a break). Which day it was last shown lives in this
 * browser only (localStorage), one entry per member.
 */
import { addDays } from "./dates";
import type { StreakInfo } from "./progress";

export type StreakWelcomeKind = "spark" | "back";

/** What to show today: the spark count, a welcome back after a break, or nothing (no activity yet ever). */
export function streakWelcomeKind(streak: StreakInfo): StreakWelcomeKind | null {
  if (streak.welcomeBack) return "back";
  if (streak.current >= 1) return "spark";
  return null;
}

export type WeekDay = { date: string; weekday: number; on: boolean; today: boolean };

/** The last seven days ending today, oldest first; weekday 0 is Sunday. */
export function lastSevenDays(active: ReadonlySet<string>, today: string): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, weekday: new Date(`${date}T12:00:00Z`).getUTCDay(), on: active.has(date), today: i === 6 };
  });
}

export const streakSeenKey = (userId: string) => `berripop-streak-welcome:${userId}`;

/** True once per day: the first call on a day records it, later calls that day say false. */
export function claimStreakWelcome(userId: string, today: string): boolean {
  try {
    const key = streakSeenKey(userId);
    if (window.localStorage.getItem(key) === today) return false;
    window.localStorage.setItem(key, today);
    return true;
  } catch {
    // Storage blocked: better to skip the greeting than to show it on every visit.
    return false;
  }
}
