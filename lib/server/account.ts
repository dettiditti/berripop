import "server-only";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "../db";
import {
  aiCalls, answers, circleMembers, circles, customQuestions, funnelEvents, growthGoals, growthSteps,
  pathAssessments, subscriptions, userAchievements, userActivity, userPrefs, users, userXpEvents, worldMoments,
} from "../db/schema";
import { deletionBlock, isDeleteConfirmation, type DeletionBlock } from "../account/policy";
import { exportJournal } from "./journal";
import { getUserEntitlements } from "./entitlements";

/*
 * Account data rights: export everything stored about the member, and delete
 * the account. Deletion removes the user row; foreign keys cascade to all
 * personal content (answers, journal, goals, steps, assessment, progress, inner-world moments, AI usage and
 * cost logs, circle memberships, the local subscription mirror). Funnel
 * events and circle activity keep no link to the person (set null). Stripe
 * keeps its own customer, invoice and payment records, as required for
 * accounting; nothing financial is stored only here.
 */

export type DeleteError = "unauthorized" | "confirmation" | DeletionBlock;

/** Everything we store about the member, for download (their own data only). */
export async function exportAccount(userId: string) {
  const db = getDb();
  const [[user], [prefs], [sub], memberships, myAnswers, myQuestions, goals, steps, [assessment], journal, usage, events, activity, xp, badges, moments] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(userPrefs).where(eq(userPrefs.userId, userId)).limit(1),
    db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1),
    db.select({ circle: circles.name, role: circleMembers.role, joinedAt: circleMembers.joinedAt })
      .from(circleMembers).innerJoin(circles, eq(circles.id, circleMembers.circleId)).where(eq(circleMembers.userId, userId)),
    db.select({ circle: circles.name, question: answers.questionRef, text: answers.text, reflection: answers.reflection, sharedAt: answers.sharedAt, createdAt: answers.createdAt, updatedAt: answers.updatedAt })
      .from(answers).leftJoin(circles, eq(circles.id, answers.circleId)).where(eq(answers.userId, userId)).orderBy(desc(answers.createdAt)),
    db.select({ text: customQuestions.text, theme: customQuestions.theme, category: customQuestions.category, createdAt: customQuestions.createdAt }).from(customQuestions).where(eq(customQuestions.authorId, userId)),
    db.select({ title: growthGoals.title, details: growthGoals.details, status: growthGoals.status, source: growthGoals.source, createdAt: growthGoals.createdAt }).from(growthGoals).where(eq(growthGoals.userId, userId)),
    db.select({ title: growthSteps.title, kind: growthSteps.kind, status: growthSteps.status, doneAt: growthSteps.doneAt }).from(growthSteps).where(eq(growthSteps.userId, userId)).orderBy(asc(growthSteps.position)),
    db.select().from(pathAssessments).where(eq(pathAssessments.userId, userId)).limit(1),
    exportJournal(userId),
    db.select({ feature: aiCalls.feature, model: aiCalls.model, status: aiCalls.status, inputTokens: aiCalls.inputTokens, outputTokens: aiCalls.outputTokens, costMicroUsd: aiCalls.costMicroUsd, createdAt: aiCalls.createdAt }).from(aiCalls).where(eq(aiCalls.userId, userId)).orderBy(desc(aiCalls.createdAt)),
    db.select({ event: funnelEvents.event, plan: funnelEvents.plan, context: funnelEvents.context, createdAt: funnelEvents.createdAt }).from(funnelEvents).where(eq(funnelEvents.userId, userId)).orderBy(desc(funnelEvents.createdAt)),
    db.select({ kind: userActivity.kind, key: userActivity.key, question: userActivity.questionRef, date: userActivity.date }).from(userActivity).where(eq(userActivity.userId, userId)),
    db.select({ reason: userXpEvents.reason, amount: userXpEvents.amount, date: userXpEvents.date }).from(userXpEvents).where(eq(userXpEvents.userId, userId)).orderBy(asc(userXpEvents.createdAt)),
    db.select({ badge: userAchievements.achievementId, unlockedAt: userAchievements.unlockedAt }).from(userAchievements).where(eq(userAchievements.userId, userId)),
    db.select({ date: worldMoments.date, words: worldMoments.words, ownWords: worldMoments.ownWords, promptId: worldMoments.promptId, note: worldMoments.note, createdAt: worldMoments.createdAt }).from(worldMoments).where(eq(worldMoments.userId, userId)).orderBy(desc(worldMoments.createdAt)),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: { id: userId, displayName: user?.displayName ?? "", createdAt: user?.createdAt ?? null, language: prefs?.locale ?? null },
    subscription: sub ? { plan: sub.planId, status: sub.status, interval: sub.interval, currentPeriodEnd: sub.currentPeriodEnd, cancelAtPeriodEnd: sub.cancelAtPeriodEnd } : null,
    circles: memberships,
    answers: myAnswers,
    customQuestions: myQuestions,
    goals,
    pathSteps: steps,
    assessment: assessment ? { status: assessment.status, answers: assessment.answers, followups: assessment.followups, plan: assessment.plan, acceptedAt: assessment.acceptedAt } : null,
    journal: { entries: journal.entries, reflections: journal.reflections, insights: journal.insights },
    aiUsage: usage,
    productEvents: events,
    progress: { activity, xp, badges },
    innerWorldMoments: moments,
  };
}

/**
 * Deletes the member's data. Circles they own are handed to the longest-standing
 * other member (so others keep their circle and answers); circles with no other
 * member are deleted. The Clerk login is removed separately by the caller.
 */
export async function deleteAccountData(userId: string, confirmation: unknown): Promise<{ ok: true } | { ok: false; error: DeleteError }> {
  if (!isDeleteConfirmation(confirmation)) return { ok: false, error: "confirmation" };
  const block = deletionBlock(await getUserEntitlements(userId));
  if (block) return { ok: false, error: block };

  const db = getDb();
  const owned = await db.select({ id: circles.id }).from(circles).where(eq(circles.createdBy, userId));
  const ownedByRole = await db.select({ id: circleMembers.circleId }).from(circleMembers).where(and(eq(circleMembers.userId, userId), eq(circleMembers.role, "owner")));
  const circleIds = [...new Set([...owned, ...ownedByRole].map(c => c.id))];

  for (const circleId of circleIds) {
    const [heir] = await db.select({ userId: circleMembers.userId }).from(circleMembers)
      .where(and(eq(circleMembers.circleId, circleId), ne(circleMembers.userId, userId))).orderBy(asc(circleMembers.joinedAt)).limit(1);
    if (heir) {
      await db.update(circleMembers).set({ role: "owner" }).where(and(eq(circleMembers.circleId, circleId), eq(circleMembers.userId, heir.userId)));
      await db.update(circles).set({ createdBy: heir.userId }).where(eq(circles.id, circleId));
    } else {
      await db.delete(circles).where(eq(circles.id, circleId));
    }
  }

  // Everything else cascades from the user row (see the header comment).
  await db.delete(users).where(eq(users.id, userId));
  const [left] = await db.select({ id: users.id }).from(users).where(inArray(users.id, [userId])).limit(1);
  if (left) throw new Error("account deletion did not complete");
  return { ok: true };
}
