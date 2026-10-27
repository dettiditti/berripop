import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { cleanCheckin, parseCheckinReply, type CheckinInput, type CheckinNeed, type CheckinState, type CheckinTopic } from "../checkin/checkin";
import { dailyCheckins, growthGoals } from "../db/schema";
import { dictionaries } from "../i18n/dictionaries";
import { isLocale, type Locale } from "../i18n/config";
import { crisisSignal } from "../safety/crisis";
import { runMeteredAi } from "./ai";
import { track } from "./analytics";
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

/**
 * "Think it through together": one AI request the member starts themselves,
 * counted in the weekly journal AI allowance and refused without AI consent.
 * Context is only today's check-in and the titles of their active goals;
 * journal entries, inner-world moments and saved insights are never sent.
 */
export async function thinkTogether(userId: string, localeInput: string): Promise<ActionResult<{ safety: boolean }>> {
  const row = await todayCheckin(userId);
  if (!row) return fail("not_found");
  const locale: Locale = isLocale(localeInput) ? localeInput : "hu";
  const c = dictionaries[locale].checkin;
  const goals = await getDb().select({ title: growthGoals.title }).from(growthGoals).where(and(eq(growthGoals.userId, userId), eq(growthGoals.status, "active")));
  const prompt = [
    goals.length ? `Goals:\n${goals.map(g => `- ${g.title}`).join("\n")}` : "Goals: none",
    "Today's check-in:",
    `- feeling: ${row.state ? c.states[row.state as CheckinState] : "not given"}`,
    `- on their mind: ${row.topics.length ? row.topics.map(t => c.topics[t as CheckinTopic]).join(", ") : "not given"}`,
    `- what would help: ${row.need ? c.needs[row.need as CheckinNeed] : "not given"}`,
    row.note ? `- in their words: ${row.note}` : "",
  ].filter(Boolean).join("\n");

  const out = await runMeteredAi(userId, "journal", { feature: "checkin_together", instructions: c.ai.instructions, prompt, maxOutputTokens: 500, parse: parseCheckinReply });
  if (!out.ok) {
    if (out.reason === "limit") await track(userId, "ai_allowance_reached", { context: "checkin" });
    return fail(out.error);
  }
  const { safety, ...reply } = out.value;
  await getDb().update(dailyCheckins).set({ aiReply: reply }).where(and(eq(dailyCheckins.id, row.id), eq(dailyCheckins.userId, userId)));
  return { ok: true, snapshot: await loadSnapshot(userId), data: { safety: safety || crisisSignal(row.note) } };
}
