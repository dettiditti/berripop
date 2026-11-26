import type { WorldItemId } from "./wardrobe";

/*
 * The advent calendar: 24 windows, one opening each day from 1 to 24
 * December (Europe/Budapest). Each holds a short winter question or tiny
 * exercise, written in advance and the same for everyone (lib/i18n
 * dictionaries: advent.windows). Opening a window gives a star; a few days
 * also bring a thing for Berri's world. A window missed on its day stays
 * openable until 31 December, so nobody is punished for a day away.
 * Shared by the server (which decides) and the app (which shows).
 */

export const ADVENT_DAYS = 24;
/** Stars for opening a window, and instead of a gift the member already has. */
export const ADVENT_STARS = 1;
export const GIFT_BONUS_STARS = 5;

/** Days that bring a winter thing for Berri's world (Saint Nicholas day, mid-December, the solstice week, Christmas Eve). */
export const ADVENT_GIFTS: Partial<Record<number, WorldItemId>> = { 6: "snowfall", 13: "sled", 20: "snowman", 24: "firtree" };

export type AdventOpened = { day: number; gift: string | null };
export type WindowState = "opened" | "open" | "missed" | "locked";

/** The calendar's year and today's December day, or null outside 1–31 December. `today` is "YYYY-MM-DD" (Budapest). */
export function adventDay(today: string): { year: number; day: number } | null {
  const [y, m, d] = today.split("-").map(Number);
  if (m !== 12 || !d) return null;
  return { year: y, day: d };
}

/** Shown from 1 to 31 December: after the 24th, missed windows can still be opened. */
export const adventActive = (today: string) => adventDay(today) !== null;

/** "open": today's window; "missed": an earlier one not opened yet (still openable); "locked": a later day. */
export function windowState(day: number, today: string, opened: Set<number>): WindowState {
  if (opened.has(day)) return "opened";
  const now = adventDay(today);
  if (!now || day > now.day) return "locked";
  return day === now.day ? "open" : "missed";
}

export const canOpen = (day: number, today: string, opened: Set<number>) =>
  Number.isInteger(day) && day >= 1 && day <= ADVENT_DAYS && ["open", "missed"].includes(windowState(day, today, opened));

/** The window Today's card offers: today's if not opened yet, else the earliest missed one, else none. */
export function nextWindow(today: string, opened: Set<number>): number | null {
  const now = adventDay(today);
  if (!now) return null;
  const last = Math.min(now.day, ADVENT_DAYS);
  if (now.day <= ADVENT_DAYS && !opened.has(now.day)) return now.day;
  for (let d = 1; d <= last; d++) if (!opened.has(d)) return d;
  return null;
}

/** Stars the calendar gave: one per window, plus a bonus where a gift was already owned. */
export function adventStars(opened: AdventOpened[]): number {
  return opened.reduce((n, w) => n + ADVENT_STARS + (w.gift === "stars" ? GIFT_BONUS_STARS : 0), 0);
}

/** Things received as gifts: owned without being paid for with stars. */
export const giftedItems = (opened: AdventOpened[]) => opened.map(w => w.gift).filter((g): g is string => !!g && g !== "stars");
