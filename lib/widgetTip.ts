/*
 * The "put Berri on your home screen" tip in the iPhone app. Shown on Today
 * when nothing else is open, never on the same visit as the daily spark
 * greeting. "I'll do it" retires it for good; "Later" asks again a few days
 * on. Remembered in this browser only (localStorage), one entry per member.
 */
import { addDays } from "./dates";

export const LATER_DAYS = 3;
export const widgetTipKey = (userId: string) => `berripop-widget-tip:${userId}`;

type Saved = { done?: boolean; later?: string };

function read(userId: string): Saved | null {
  const raw = window.localStorage.getItem(widgetTipKey(userId));
  if (!raw) return {};
  const v = JSON.parse(raw) as unknown;
  return v && typeof v === "object" ? (v as Saved) : {};
}

/** Whether the tip may show today. Blocked storage: never (rather than on every visit). */
export function widgetTipDue(userId: string, today: string): boolean {
  try {
    const s = read(userId);
    if (!s || s.done) return false;
    return !s.later || today >= addDays(s.later, LATER_DAYS);
  } catch {
    return false;
  }
}

function save(userId: string, s: Saved) {
  try {
    window.localStorage.setItem(widgetTipKey(userId), JSON.stringify(s));
  } catch {
    // Blocked storage: the tip simply will not come back.
  }
}

export const widgetTipDone = (userId: string) => save(userId, { done: true });
export const widgetTipLater = (userId: string, today: string) => save(userId, { later: today });
