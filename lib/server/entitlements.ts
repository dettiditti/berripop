import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { appleSubscriptions, circleMembers, entitlementGrants, growthGoals, subscriptions } from "../db/schema";
import { combinedEntitlements, type AppleRow } from "../billing/apple";
import { allowance, PREMIUM_TRIAL, type Entitlements, type TrialGrant } from "../billing/entitlements";
import { aiPeriodResets, type QuotaKey } from "../billing/plans";
import { poolPeriod, poolsFor, type ReserveResult } from "../billing/quota";
import { quotaUsage, releaseQuota, reserveQuota, settleQuota } from "./quota";

/**
 * The single place that decides what a user may do. Reads only trusted,
 * server-side subscription state. UI checks are convenience; these are authority.
 */
export async function getUserEntitlements(userId: string): Promise<Entitlements> {
  const [[row], apple, trial] = await Promise.all([
    getDb().select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1),
    appleRows(userId),
    trialGrant(userId),
  ]);
  return combinedEntitlements(row ?? null, apple, new Date(), trial);
}

/** Before a migration has run its table does not exist (42P01): treated as empty. */
const missingTable = (err: unknown) => {
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  return e?.code === "42P01" || e?.cause?.code === "42P01";
};

/** The member's 7-day trial, if it was ever started; none before the entitlement_grants migration has run. */
async function trialGrant(userId: string): Promise<TrialGrant | null> {
  try {
    const [g] = await getDb().select({ startedAt: entitlementGrants.startedAt, endsAt: entitlementGrants.endsAt }).from(entitlementGrants)
      .where(and(eq(entitlementGrants.userId, userId), eq(entitlementGrants.kind, PREMIUM_TRIAL))).limit(1);
    return g ?? null;
  } catch (err) {
    if (missingTable(err)) return null;
    throw err;
  }
}

/** The member's App Store subscriptions; none before the apple_subscriptions migration has run. */
async function appleRows(userId: string): Promise<AppleRow[]> {
  try {
    return await getDb().select({
      planId: appleSubscriptions.planId, interval: appleSubscriptions.interval, status: appleSubscriptions.status,
      expiresAt: appleSubscriptions.expiresAt, autoRenew: appleSubscriptions.autoRenew,
    }).from(appleSubscriptions).where(eq(appleSubscriptions.userId, userId));
  } catch (err) {
    if (missingTable(err)) return [];
    throw err;
  }
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
 * The AI allowances (PLAN_QUOTAS in lib/billing/plans.ts): "assist" (follow-up
 * questions, weekly summary), "journal" (journal reflections, check-ins,
 * Gondolatboncoló patterns), "assessment" (My Path, goal journeys) and
 * "thought" (Gondolatboncoló sessions, see lib/server/thought.ts).
 */
export type AiBucket = Exclude<QuotaKey, "thought">;

export async function getAiUsage(userId: string, now = new Date(), bucket: AiBucket = "assist") {
  const ent = await getUserEntitlements(userId);
  const u = await quotaUsage(userId, ent.tier, bucket, now);
  return { ...allowance(u.used, u.limit), resets: u.resets ?? aiPeriodResets(now) };
}

/**
 * Reserves one use of the member's allowance for their current tier.
 * Concurrent requests can never push usage past the limit (one transaction
 * per member, see lib/billing/quota.ts). Pass an idempotency key to make a
 * repeated request "duplicate" instead of a second charge.
 */
export async function reserveAi(userId: string, bucket: QuotaKey, opts: { idempotencyKey?: string; now?: Date } = {}): Promise<ReserveResult> {
  const ent = await getUserEntitlements(userId);
  return reserveQuota(userId, ent.tier, bucket, opts);
}

/** For scripts and simple callers: reserves one use without a key; false when used up. */
export async function consumeAiAllowance(userId: string, now = new Date(), bucket: AiBucket = "assist"): Promise<boolean> {
  return (await reserveAi(userId, bucket, { now })).ok;
}

/** For scripts: gives back the newest use of this allowance in its current windows. */
export async function refundAiAllowance(userId: string, now = new Date(), bucket: AiBucket = "assist"): Promise<void> {
  const ent = await getUserEntitlements(userId);
  const periods = poolsFor(ent.tier, bucket).map(p => poolPeriod(p, now));
  await getDb().execute(sql`
    delete from quota_uses where id = (
      select id from quota_uses where user_id = ${userId} and quota = ${bucket} and period in (${sql.join(periods.map(p => sql`${p}`), sql`, `)})
      order by created_at desc limit 1)`);
}

export { releaseQuota, settleQuota };

export async function canAccessWeeklyJournal(userId: string): Promise<boolean> {
  return (await getUserEntitlements(userId)).limits.weeklyJournal;
}
