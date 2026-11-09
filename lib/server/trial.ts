import "server-only";
import { and, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { entitlementGrants } from "../db/schema";
import { PREMIUM_TRIAL, trialEndsAt } from "../billing/entitlements";
import { isPaidPlan } from "../billing/plans";
import { track } from "./analytics";
import { getUserEntitlements } from "./entitlements";

/*
 * The one-time 7-day Premium trial. No card and no subscription: the server
 * stores a grant (entitlement_grants) and, while it runs, a Free member gets
 * the trial limits (PLAN_QUOTAS.trial). It can be started once per account,
 * by the member, and never restarts (signing out or reinstalling changes
 * nothing). When it ends the member is simply on Free again.
 */

export type StartTrialResult =
  | { ok: true; endsAt: string }
  | { ok: false; error: "already_used" | "already_premium" };

export async function startPremiumTrial(userId: string, now = new Date()): Promise<StartTrialResult> {
  const ent = await getUserEntitlements(userId);
  if (isPaidPlan(ent.plan)) return { ok: false, error: "already_premium" };
  if (ent.trial.status !== "available") return { ok: false, error: "already_used" };
  // The primary key (user, kind) makes this a once-per-account insert, also under parallel requests.
  const [row] = await getDb().insert(entitlementGrants)
    .values({ userId, kind: PREMIUM_TRIAL, startedAt: now, endsAt: trialEndsAt(now) })
    .onConflictDoNothing()
    .returning({ endsAt: entitlementGrants.endsAt });
  if (!row) return { ok: false, error: "already_used" };
  await track(userId, "trial_started");
  return { ok: true, endsAt: row.endsAt.toISOString() };
}

/**
 * Daily: records each ended trial once (trial_completed), with whether the
 * member went on to a paid plan ("converted") or not. Plan and context only.
 */
export async function recordEndedTrials(now = new Date()): Promise<number> {
  const ended = await getDb().select({ userId: entitlementGrants.userId }).from(entitlementGrants)
    .where(and(sql`${entitlementGrants.kind} = ${PREMIUM_TRIAL}`, lte(entitlementGrants.endsAt, now), isNull(entitlementGrants.completedAt)))
    .limit(500);
  for (const { userId } of ended) {
    // Marked first, so a parallel run never records the same trial twice.
    const [claimed] = await getDb().update(entitlementGrants).set({ completedAt: now })
      .where(and(sql`${entitlementGrants.userId} = ${userId}`, sql`${entitlementGrants.kind} = ${PREMIUM_TRIAL}`, isNull(entitlementGrants.completedAt)))
      .returning({ userId: entitlementGrants.userId });
    if (!claimed) continue;
    const ent = await getUserEntitlements(userId);
    await track(userId, "trial_completed", { plan: ent.plan, context: isPaidPlan(ent.plan) ? "converted" : "not_converted" });
  }
  return ended.length;
}
