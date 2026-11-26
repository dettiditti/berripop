import "server-only";
import { and, count, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import { answers, circleQuestions, dailyQuests, personalDailyQuests, questionHistory, userActivity } from "../db/schema";
import { dateOf, isCustomRef } from "../domain/rules";
import { pickCircleQuestion, pickPersonalQuestion, type SeenQuestion } from "../questions/pickNext";

/*
 * The daily question (question concept 6.1, 6.2): which bank question a member
 * or a circle gets today, and setting one aside ("Most nem volt ilyen" /
 * "Inkább mást kérek"). Reads ids and dates only, never answer text.
 */

/** A few times a day at most; after that the question simply stays. */
const SET_ASIDE_PER_DAY = 3;

export type SetAsideOutcome = "not_this_time" | "swapped";
export const isSetAsideOutcome = (v: unknown): v is SetAsideOutcome => v === "not_this_time" || v === "swapped";

/** What the member was asked, answered or set aside, with days (no text). */
async function personalHistory(userId: string) {
  const db = getDb();
  const [assigned, answered, activity, setAside] = await Promise.all([
    db.select({ ref: personalDailyQuests.questionRef, date: personalDailyQuests.date }).from(personalDailyQuests).where(eq(personalDailyQuests.userId, userId)),
    db.select({ ref: answers.questionRef, createdAt: answers.createdAt }).from(answers).where(eq(answers.userId, userId)),
    db.select({ kind: userActivity.kind, key: userActivity.key, ref: userActivity.questionRef, date: userActivity.date }).from(userActivity).where(eq(userActivity.userId, userId)),
    db.select({ ref: questionHistory.questionRef, date: questionHistory.date }).from(questionHistory).where(eq(questionHistory.userId, userId)),
  ]);
  const answeredSeen: SeenQuestion[] = answered.map(a => ({ ref: a.ref, date: dateOf(a.createdAt.toISOString()) }));
  const seen: SeenQuestion[] = [...assigned, ...answeredSeen, ...activity.map(a => ({ ref: a.ref, date: a.date })), ...setAside];
  const journeyDone = Object.fromEntries(activity.filter(a => a.kind === "journey").map(a => [Number(a.key), true]));
  return { seen, answered: [...answered.map(a => a.ref), ...activity.map(a => a.ref)], journeyDone };
}

/** Today's own daily question for a member without a circle; picked once a day. */
export async function ensurePersonalDaily(userId: string, today: string): Promise<string> {
  const db = getDb();
  const where = and(eq(personalDailyQuests.userId, userId), eq(personalDailyQuests.date, today));
  const [existing] = await db.select().from(personalDailyQuests).where(where).limit(1);
  if (existing) return existing.questionRef;
  const h = await personalHistory(userId);
  const ref = pickPersonalQuestion({ seed: `u:${userId}`, date: today, ...h });
  await db.insert(personalDailyQuests).values({ userId, date: today, questionRef: ref }).onConflictDoNothing();
  const [row] = await db.select().from(personalDailyQuests).where(where).limit(1);
  return row?.questionRef ?? ref;
}

/**
 * Sets today's question aside and gives a light one instead. Without a circle the
 * replacement becomes today's own daily question; in a circle the circle's
 * question stays the same for everyone, and the member gets a bonus question.
 * Only the id, the day and which button was pressed are stored.
 */
export async function setAsidePersonal(userId: string, input: { questionRef: string; outcome: SetAsideOutcome; circle: boolean; today: string }): Promise<string | null> {
  const db = getDb();
  const [{ n }] = await db.select({ n: count() }).from(questionHistory).where(and(eq(questionHistory.userId, userId), eq(questionHistory.date, input.today)));
  if (n >= SET_ASIDE_PER_DAY) return null;
  await db.insert(questionHistory).values({
    userId, questionRef: input.questionRef, context: input.circle ? "circle" : "daily", outcome: input.outcome, date: input.today,
  });
  const h = await personalHistory(userId);
  const ref = pickPersonalQuestion({ seed: `u:${userId}:aside`, date: input.today, ...h, lightOnly: true, exclude: [input.questionRef] });
  if (!input.circle) {
    await db.update(personalDailyQuests).set({ questionRef: ref })
      .where(and(eq(personalDailyQuests.userId, userId), eq(personalDailyQuests.date, input.today)));
  }
  return ref;
}

/** A circle's daily question: ⭕ bank questions and the circle's own, waiting per circle. */
export async function ensureCircleDaily(circleId: string, today: string): Promise<string> {
  const db = getDb();
  const where = and(eq(dailyQuests.circleId, circleId), eq(dailyQuests.date, today));
  const [existing] = await db.select().from(dailyQuests).where(where).limit(1);
  if (existing) return existing.questionRef;
  const [refs, asked, answeredRows] = await Promise.all([
    db.select({ ref: circleQuestions.questionRef }).from(circleQuestions).where(eq(circleQuestions.circleId, circleId)),
    db.select({ ref: dailyQuests.questionRef, date: dailyQuests.date }).from(dailyQuests).where(eq(dailyQuests.circleId, circleId)),
    db.selectDistinct({ ref: answers.questionRef }).from(answers).where(and(eq(answers.circleId, circleId), isNotNull(answers.circleId))),
  ]);
  const ref = pickCircleQuestion({
    seed: circleId, date: today, seen: asked, answered: answeredRows.map(a => a.ref),
    customRefs: [...new Set(refs.map(r => r.ref).filter(isCustomRef))], answeredInCircle: answeredRows.map(a => a.ref),
  });
  await db.insert(dailyQuests).values({ circleId, date: today, questionRef: ref }).onConflictDoNothing();
  const [row] = await db.select().from(dailyQuests).where(where).limit(1);
  return row?.questionRef ?? ref;
}
