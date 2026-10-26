import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { aiUsage, circleMembers, growthGoals, subscriptions } from "../db/schema";
import { allowance, entitlementsFrom, type Entitlements } from "../billing/entitlements";
import { aiPeriodKey, aiPeriodResets } from "../billing/plans";

/**
 * The single place that decides what a user may do. Reads only trusted,
 * server-side subscription state. UI checks are convenience; these are authority.
 */
export async function getUserEntitlements(userId: string): Promise<Entitlements> {
  const [row] = await getDb().select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return entitlementsFrom(row ?? null);
}

export async function canCreateGrowthGoal(userId: string): Promise<boolean> {
  const ent = await getUserEntitlements(userId);
  const active = await getDb().select({ id: growthGoals.id }).from(growthGoals).where(and(eq(growthGoals.userId, userId), eq(growthGoals.status, "active")));
  return active.length < ent.limits.activeGoals;
}

export async function canOwnAnotherCircle(userId: string): Promise<boolean> {
  const ent = await getUserEntitlements(userId);
  const owned = await getDb().select({ id: circleMembers.circleId }).from(circleMembers).where(and(eq(circleMembers.userId, userId), eq(circleMembers.role, "owner")));
  return owned.length < ent.limits.ownedCircles;
}

export async function canAccessWeeklySummary(userId: string): Promise<boolean> {
  return (await getUserEntitlements(userId)).limits.weeklySummary;
}

/**
 * Two separate weekly allowances: "assist" (follow-up questions, weekly summary)
 * and "journal" (journal reflections). Same reset policy.
 */
export type AiBucket = "assist" | "journal" | "assessment";
const periodFor = (bucket: AiBucket, now: Date) => (bucket === "assist" ? aiPeriodKey(now) : `${bucket}:${aiPeriodKey(now)}`);
const limitFor = (ent: Entitlements, bucket: AiBucket) =>
  bucket === "journal" ? ent.limits.journalAiPerPeriod : bucket === "assessment" ? ent.limits.assessmentAiPerPeriod : ent.limits.aiPerPeriod;

export async function getAiUsage(userId: string, now = new Date(), bucket: AiBucket = "assist") {
  const ent = await getUserEntitlements(userId);
  const period = periodFor(bucket, now);
  const [row] = await getDb().select({ count: aiUsage.count }).from(aiUsage).where(and(eq(aiUsage.userId, userId), eq(aiUsage.period, period))).limit(1);
  return { ...allowance(row?.count ?? 0, limitFor(ent, bucket)), resets: aiPeriodResets(now) };
}

/**
 * Atomically reserves one AI interaction. A single conditional upsert means
 * concurrent requests can never push the count past the limit.
 * Returns false when the allowance is used up.
 */
export async function consumeAiAllowance(userId: string, now = new Date(), bucket: AiBucket = "assist"): Promise<boolean> {
  const ent = await getUserEntitlements(userId);
  const limit = limitFor(ent, bucket);
  if (limit <= 0) return false;
  const period = periodFor(bucket, now);
  const result = await getDb().execute(sql`
    insert into ai_usage (user_id, period, count) values (${userId}, ${period}, 1)
    on conflict (user_id, period) do update set count = ai_usage.count + 1
    where ai_usage.count < ${limit}
    returning count`);
  return result.rows.length > 0;
}

/** Gives a reserved interaction back when the AI call itself failed. */
export async function refundAiAllowance(userId: string, now = new Date(), bucket: AiBucket = "assist"): Promise<void> {
  await getDb().execute(sql`
    update ai_usage set count = count - 1
    where user_id = ${userId} and period = ${periodFor(bucket, now)} and count > 0`);
}

export async function canAccessWeeklyJournal(userId: string): Promise<boolean> {
  return (await getUserEntitlements(userId)).limits.weeklyJournal;
}
