import "server-only";
import { and, eq } from "drizzle-orm";
import { ADVENT_GIFTS, adventDay, canOpen, type AdventOpened } from "../advent";
import { getDb } from "../db";
import { adventWindows, berriItems } from "../db/schema";
import { circleToday } from "../domain/rules";
import { track } from "./analytics";

/*
 * The advent calendar (rules in lib/advent). Reads and writes only window
 * numbers, dates and gift ids: never anything the member writes about a
 * window (that goes to their journal, if they choose).
 */

export type AdventState = { today: string; year: number; opened: AdventOpened[] };

/** The member's windows this December, or null outside December. */
export async function loadAdvent(userId: string, today = circleToday()): Promise<AdventState | null> {
  const now = adventDay(today);
  if (!now) return null;
  const rows = await getDb().select({ day: adventWindows.day, gift: adventWindows.gift }).from(adventWindows)
    .where(and(eq(adventWindows.userId, userId), eq(adventWindows.year, now.year)));
  return { today, year: now.year, opened: rows.sort((a, b) => a.day - b.day) };
}

export type OpenResult = { ok: true; state: AdventState; gift: string | null; fresh: boolean } | { ok: false; error: "invalid" };

/**
 * Opens a window: today's, or a missed one until 31 December; later days stay
 * shut. Opening it again changes nothing. A gift day puts its thing in Berri's
 * world (out right away, like a bought one); if the member already has it,
 * they get bonus stars instead.
 */
export async function openWindow(userId: string, day: number, today = circleToday()): Promise<OpenResult> {
  const before = await loadAdvent(userId, today);
  if (!before) return { ok: false, error: "invalid" };
  const opened = new Set(before.opened.map(w => w.day));
  if (opened.has(day)) return { ok: true, state: before, gift: before.opened.find(w => w.day === day)?.gift ?? null, fresh: false };
  if (!canOpen(day, today, opened)) return { ok: false, error: "invalid" };

  const db = getDb();
  // Claim the window first, so two taps at once can't both give its stars or gift.
  const claimed = await db.insert(adventWindows).values({ userId, year: before.year, day }).onConflictDoNothing().returning({ day: adventWindows.day });
  if (!claimed.length) {
    const state = (await loadAdvent(userId, today))!;
    return { ok: true, state, gift: state.opened.find(w => w.day === day)?.gift ?? null, fresh: false };
  }
  const item = ADVENT_GIFTS[day];
  let gift: string | null = null;
  if (item) {
    const added = await db.insert(berriItems).values({ userId, itemId: item, equipped: true }).onConflictDoNothing().returning({ itemId: berriItems.itemId });
    gift = added.length ? item : "stars";
    await db.update(adventWindows).set({ gift }).where(and(eq(adventWindows.userId, userId), eq(adventWindows.year, before.year), eq(adventWindows.day, day)));
  }
  await track(userId, "advent_window_opened");
  return { ok: true, state: (await loadAdvent(userId, today))!, gift, fresh: true };
}
