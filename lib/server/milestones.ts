import "server-only";
import { and, countDistinct, count, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  answerReactions, answers, circleMembers, growthGoals, growthInsights, growthSteps, journalEntries, journalMoods,
  journalReflections, userActivity,
} from "../db/schema";
import type { MilestoneCounts } from "../milestones";

const missingTable = (err: unknown) => {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  return e?.code === "42P01" || e?.cause?.code === "42P01";
};

/** Feeling-sticker counts, or nulls before the journal_moods migration has run. */
async function moodCounts(userId: string): Promise<{ stickered: number | null; feelings: number | null }> {
  try {
    const [r] = await getDb().select({ stickered: count(), feelings: countDistinct(journalMoods.mood) }).from(journalMoods)
      .innerJoin(journalEntries, eq(journalEntries.id, journalMoods.entryId))
      .where(and(eq(journalMoods.userId, userId), eq(journalEntries.status, "saved")));
    return { stickered: r?.stickered ?? 0, feelings: r?.feelings ?? 0 };
  } catch (err) {
    if (missingTable(err)) return { stickered: null, feelings: null };
    throw err;
  }
}

/** Counts for the member's milestones. Only numbers; every query is filtered by the owner's id. */
export async function loadMilestoneCounts(userId: string): Promise<MilestoneCounts> {
  const db = getDb();
  const one = (rows: { n: number }[]) => Number(rows[0]?.n ?? 0);
  const [entries, reflections, insights, circles, circleAnswers, given, received, goals, stepsDone, goalDays, moods] = await Promise.all([
    db.select({ n: count() }).from(journalEntries).where(and(eq(journalEntries.userId, userId), eq(journalEntries.status, "saved"))).then(one),
    db.select({ n: count() }).from(journalReflections).where(eq(journalReflections.userId, userId)).then(one),
    db.select({ n: count() }).from(growthInsights).where(eq(growthInsights.userId, userId)).then(one),
    db.select({ n: count() }).from(circleMembers).where(eq(circleMembers.userId, userId)).then(one),
    db.select({ n: count() }).from(answers).where(and(eq(answers.userId, userId), isNotNull(answers.circleId))).then(one),
    db.select({ n: count() }).from(answerReactions).where(eq(answerReactions.userId, userId)).then(one),
    db.select({ n: count() }).from(answerReactions).innerJoin(answers, eq(answers.id, answerReactions.answerId))
      .where(and(eq(answers.userId, userId), sql`${answerReactions.userId} <> ${userId}`)).then(one),
    db.select({ n: count() }).from(growthGoals).where(eq(growthGoals.userId, userId)).then(one),
    db.select({ n: count() }).from(growthSteps).where(and(eq(growthSteps.userId, userId), eq(growthSteps.status, "done"))).then(one),
    db.select({ n: count() }).from(userActivity).where(and(eq(userActivity.userId, userId), eq(userActivity.kind, "goal"))).then(one),
    moodCounts(userId),
  ]);
  return { entries, reflections, insights, circles, circleAnswers, reactions: given + received, goals, stepsDone, goalDays, ...moods };
}
