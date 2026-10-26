import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { answers, goalJourneys, growthGoals, personalDailyQuests, userAchievements, userActivity, userXpEvents, worldMoments } from "../db/schema";
import { XP_RULES } from "../content";
import { circleToday, dateOf } from "../domain/rules";
import { GROWTH_REASONS, personalBadges, personalFacts, pickPersonalDaily, type GrowthReason } from "../domain/personal";
import type { GoalJourneyDTO, ProgressDTO } from "../domain/types";
import { goalsKey, type GoalJourneyDay, type GoalJourneyWeek } from "../journey/goal";

/*
 * Personal progress: the member's own journey, XP and badges, the same with or
 * without a circle. Circles mirror what members earn there into these records,
 * so leaving or deleting a circle never takes anything away.
 */

const MOMENTS_IN_SNAPSHOT = 60;

/** Grants personal XP once per (member, ref). Returns true if this call granted it. */
export async function grantPersonalXp(userId: string, reason: string, amount: number, ref: string, theme?: string | null, date = circleToday()) {
  const rows = await getDb()
    .insert(userXpEvents)
    .values({ userId, reason, amount, ref, theme: theme ?? null, date })
    .onConflictDoNothing()
    .returning({ id: userXpEvents.id });
  return rows.length > 0;
}

/** Records a journey day or a daily question once per member. Returns true if it is new. */
export async function recordActivity(userId: string, kind: "daily" | "journey" | "goal", key: string, questionRef: string, date: string) {
  const rows = await getDb()
    .insert(userActivity)
    .values({ userId, kind, key, questionRef, date })
    .onConflictDoNothing()
    .returning({ key: userActivity.key });
  return rows.length > 0;
}

/**
 * XP for a finished step or a saved journal entry: once per item, and within
 * one shared daily cap. Only the item id is used, never its content.
 * Returns the amount granted (0 if already granted or over the cap).
 */
export async function grantGrowthXp(userId: string, reason: GrowthReason, itemId: string, date = circleToday()): Promise<number> {
  const amount = XP_RULES[reason];
  const ref = `${reason}:${itemId}`;
  // One statement, so two requests at once cannot both pass the cap.
  const res = await getDb().execute(sql`
    insert into user_xp_events (user_id, reason, amount, ref, date)
    select ${userId}, ${reason}, ${amount}, ${ref}, ${date}
    where (select coalesce(sum(amount), 0) from user_xp_events
           where user_id = ${userId} and date = ${date} and reason in (${sql.join(GROWTH_REASONS.map(r => sql`${r}`), sql`, `)})) + ${amount} <= ${XP_RULES.growthDailyCap}
    on conflict do nothing
    returning id`);
  return res.rows.length ? amount : 0;
}

/** Records personal badges unlocked by the member's own progress. Never removes. */
export async function evaluatePersonal(userId: string, extra: string[] = []): Promise<string[]> {
  const db = getDb();
  const [answerRows, activityRows, xpRows, have] = await Promise.all([
    db.select({ ref: answers.questionRef }).from(answers).where(eq(answers.userId, userId)),
    db.select().from(userActivity).where(eq(userActivity.userId, userId)),
    db.select({ reason: userXpEvents.reason, date: userXpEvents.date }).from(userXpEvents).where(eq(userXpEvents.userId, userId)),
    db.select({ id: userAchievements.achievementId }).from(userAchievements).where(eq(userAchievements.userId, userId)),
  ]);
  const journey = Object.fromEntries(activityRows.filter(a => a.kind === "journey").map(a => [Number(a.key), a.date]));
  const active = await activeGoalJourney(userId);
  const facts = personalFacts({
    answeredRefs: [...answerRows.map(a => a.ref), ...activityRows.map(a => a.questionRef)],
    journey,
    goalJourney: active ? goalDone(active.id, activityRows) : {},
    xp: xpRows,
    activityDates: activityRows.map(a => a.date),
  });
  const owned = new Set(have.map(h => h.id));
  const fresh = [...new Set([...personalBadges(facts), ...extra])].filter(id => !owned.has(id));
  if (!fresh.length) return [];
  const inserted = await db.insert(userAchievements).values(fresh.map(achievementId => ({ userId, achievementId }))).onConflictDoNothing()
    .returning({ id: userAchievements.achievementId });
  return inserted.map(r => r.id);
}

/** The member's active goal journey row, if any. */
export async function activeGoalJourney(userId: string) {
  const [row] = await getDb().select().from(goalJourneys).where(and(eq(goalJourneys.userId, userId), isNull(goalJourneys.archivedAt))).limit(1);
  return row ?? null;
}

/** Day → date for one goal journey, from the member's activity rows. */
export function goalDone(journeyId: string, rows: { kind: string; key: string; date: string }[]): Record<number, string> {
  const prefix = `${journeyId}:`;
  return Object.fromEntries(rows.filter(r => r.kind === "goal" && r.key.startsWith(prefix)).map(r => [Number(r.key.slice(prefix.length)), r.date]));
}

/** Titles of the member's active goals (what a goal journey is built from). */
export async function activeGoalTitles(userId: string) {
  const rows = await getDb().select({ title: growthGoals.title, details: growthGoals.details }).from(growthGoals)
    .where(and(eq(growthGoals.userId, userId), eq(growthGoals.status, "active"))).orderBy(asc(growthGoals.createdAt));
  return rows;
}

async function ensurePersonalDaily(userId: string, today: string) {
  const db = getDb();
  const [existing] = await db.select().from(personalDailyQuests).where(and(eq(personalDailyQuests.userId, userId), eq(personalDailyQuests.date, today))).limit(1);
  if (existing) return existing.questionRef;
  const [used, answered] = await Promise.all([
    db.select({ ref: personalDailyQuests.questionRef }).from(personalDailyQuests).where(eq(personalDailyQuests.userId, userId)),
    db.select({ ref: answers.questionRef }).from(answers).where(eq(answers.userId, userId)),
  ]);
  const ref = pickPersonalDaily(userId, today, [...used, ...answered].map(r => r.ref));
  await db.insert(personalDailyQuests).values({ userId, date: today, questionRef: ref }).onConflictDoNothing();
  const [row] = await db.select().from(personalDailyQuests).where(and(eq(personalDailyQuests.userId, userId), eq(personalDailyQuests.date, today))).limit(1);
  return row.questionRef;
}

/** Everything about the member's own progress. Only their own rows are read. */
export async function loadProgress(userId: string, inCircle: boolean, today = circleToday()): Promise<ProgressDTO> {
  const db = getDb();
  const [activityRows, xpRows, achRows, answerRows, allRefs, momentRows, dailyRef, goalRow, goals] = await Promise.all([
    db.select().from(userActivity).where(eq(userActivity.userId, userId)),
    db.select().from(userXpEvents).where(eq(userXpEvents.userId, userId)).orderBy(asc(userXpEvents.createdAt)),
    db.select().from(userAchievements).where(eq(userAchievements.userId, userId)).orderBy(asc(userAchievements.unlockedAt)),
    db.select().from(answers).where(and(eq(answers.userId, userId), isNull(answers.circleId))).orderBy(desc(answers.createdAt)),
    db.selectDistinct({ ref: answers.questionRef }).from(answers).where(eq(answers.userId, userId)),
    db.select().from(worldMoments).where(eq(worldMoments.userId, userId)).orderBy(desc(worldMoments.createdAt)).limit(MOMENTS_IN_SNAPSHOT),
    inCircle ? Promise.resolve(null) : ensurePersonalDaily(userId, today),
    activeGoalJourney(userId),
    activeGoalTitles(userId),
  ]);
  const journey: Record<number, string> = {};
  const daily: string[] = [];
  for (const a of activityRows) {
    if (a.kind === "journey") journey[Number(a.key)] = a.date;
    else if (a.kind === "daily") daily.push(a.date);
  }
  const goalJourney: GoalJourneyDTO | null = goalRow ? {
    id: goalRow.id,
    createdAt: goalRow.createdAt.toISOString(),
    goals: goalRow.goals,
    weeks: goalRow.weeks as GoalJourneyWeek[],
    days: goalRow.days as GoalJourneyDay[],
    done: goalDone(goalRow.id, activityRows),
    outdated: goals.length > 0 && goalsKey(goals.map(g => g.title)) !== goalsKey(goalRow.goals),
  } : null;
  return {
    today,
    journey,
    daily: daily.sort(),
    dailyQuestion: dailyRef ? { questionRef: dailyRef, done: daily.includes(today) } : null,
    answers: answerRows.map(a => ({
      id: a.id, questionRef: a.questionRef, text: a.text, reflectionPrompt: a.reflectionPrompt, reflection: a.reflection,
      shared: false, date: dateOf(a.createdAt.toISOString()), updatedAt: a.updatedAt.toISOString(), reactions: { counts: {}, mine: [] },
    })),
    answeredRefs: [...new Set([...allRefs.map(r => r.ref), ...activityRows.map(a => a.questionRef)])],
    xp: {
      total: xpRows.reduce((s, e) => s + e.amount, 0),
      today: xpRows.filter(e => e.date === today).reduce((s, e) => s + e.amount, 0),
      events: xpRows.map(e => ({ reason: e.reason, amount: e.amount, ref: e.ref, theme: e.theme, date: e.date })),
    },
    activeDates: [...new Set([...activityRows.map(a => a.date), ...xpRows.map(e => e.date)])].sort(),
    achievements: achRows.map(a => ({ id: a.achievementId, unlockedAt: a.unlockedAt.toISOString() })),
    goalJourney,
    canBuildJourney: goals.length > 0,
    moments: momentRows.map(m => ({
      id: m.id, date: m.date, createdAt: m.createdAt.toISOString(), words: m.words, ownWords: m.ownWords, promptId: m.promptId, note: m.note,
    })),
  };
}
