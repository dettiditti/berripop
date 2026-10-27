import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { dailyCheckins } from "../db/schema";
import { cleanCheckin, type CheckinInput } from "../checkin/checkin";
import { circleToday } from "../domain/rules";
import type { ActionResult } from "../domain/types";
import { loadSnapshot } from "./snapshot";

/*
 * The daily check-in. Only ever reads or writes the member's own row for
 * today; saving grants no XP and records no activity, so streaks are
 * untouched. The prepared answer is chosen on the client from content.
 */

const fail = (error: Extract<ActionResult, { ok: false }>["error"]) => ({ ok: false as const, error });

export async function todayCheckin(userId: string, today = circleToday()): Promise<typeof dailyCheckins.$inferSelect | null> {
  const [row] = await getDb().select().from(dailyCheckins).where(and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.date, today))).limit(1);
  return row ?? null;
}

/** Saves (or replaces) today's check-in. A changed check-in drops an earlier AI follow-up. */
export async function saveCheckin(userId: string, input: CheckinInput): Promise<ActionResult> {
  const clean = cleanCheckin(input ?? {});
  if (!clean) return fail("invalid");
  const date = circleToday();
  const now = new Date();
  await getDb().insert(dailyCheckins).values({ userId, date, ...clean })
    .onConflictDoUpdate({ target: [dailyCheckins.userId, dailyCheckins.date], set: { ...clean, aiReply: null, updatedAt: now } });
  return { ok: true, snapshot: await loadSnapshot(userId) };
}

/** Removes today's check-in. */
export async function deleteCheckin(userId: string): Promise<ActionResult> {
  await getDb().delete(dailyCheckins).where(and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.date, circleToday())));
  return { ok: true, snapshot: await loadSnapshot(userId) };
}
