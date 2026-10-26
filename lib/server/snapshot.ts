import "server-only";
import { and, desc, eq, inArray, isNotNull, ne, or, sum } from "drizzle-orm";
import { getDb } from "../db";
import {
  achievements, answerReactions, answers, circleEvents, circleMembers, circleMilestones, circleQuestions,
  circles, customQuestions, dailyQuests, growthGoals, participations, savedQuestions, sharedJourneyDays, subscriptions, userPrefs, users, xpEvents,
} from "../db/schema";
import { aiConfigured } from "./ai";
import { getAiUsage, getUserEntitlements } from "./entitlements";
import { loadProgress } from "./progress";
import { circleToday, dateOf, pickDailyQuestion } from "../domain/rules";
import { REACTIONS, type AccountDTO, type CircleDTO, type FeedEventType, type Reaction, type ReactionSummary, type Snapshot } from "../domain/types";

/**
 * Builds everything the app needs for one member and their current circle.
 * Privacy: other members' answers are selected only when shared, and only
 * from current members; participation is reported as facts, never text.
 */
export async function loadSnapshot(userId: string, requestedCircleId?: string | null): Promise<Snapshot> {
  const db = getDb();
  const [meRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const [prefs] = await db.select().from(userPrefs).where(eq(userPrefs.userId, userId)).limit(1);
  const myCircles = await db
    .select({ id: circles.id, name: circles.name, role: circleMembers.role, joinedAt: circleMembers.joinedAt })
    .from(circleMembers)
    .innerJoin(circles, eq(circles.id, circleMembers.circleId))
    .where(eq(circleMembers.userId, userId))
    .orderBy(circleMembers.joinedAt);
  const saved = await db.select({ ref: savedQuestions.questionRef }).from(savedQuestions).where(eq(savedQuestions.userId, userId));

  const pick =
    myCircles.find(c => c.id === requestedCircleId) ??
    myCircles.find(c => c.id === prefs?.lastCircleId) ??
    myCircles[0];

  const [circle, account, progress] = await Promise.all([
    pick ? loadCircle(userId, pick.id) : Promise.resolve(null),
    loadAccount(userId, myCircles.filter(c => c.role === "owner").length),
    loadProgress(userId, myCircles.length > 0),
  ]);
  return {
    me: { id: userId, name: meRow?.displayName ?? "", locale: prefs?.locale ?? null, personalPath: prefs?.onboarded ?? false },
    circles: myCircles.map(c => ({ id: c.id, name: c.name, role: c.role })),
    circle,
    saved: saved.map(s => s.ref),
    account,
    progress,
  };
}

/** Plan, AI allowance and goals: all read from trusted server-side state. */
async function loadAccount(userId: string, ownedCircles: number): Promise<AccountDTO> {
  const db = getDb();
  const [entitlements, ai, goalRows, subRows] = await Promise.all([
    getUserEntitlements(userId),
    getAiUsage(userId),
    db.select().from(growthGoals).where(eq(growthGoals.userId, userId)).orderBy(growthGoals.createdAt),
    db.select({ id: subscriptions.userId }).from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1),
  ]);
  return {
    entitlements,
    ai,
    goals: goalRows.map(g => ({ id: g.id, title: g.title, details: g.details, source: g.source, status: g.status, createdAt: g.createdAt.toISOString() })),
    ownedCircles,
    hasBillingCustomer: subRows.length > 0,
    billingConfigured: !!process.env.STRIPE_SECRET_KEY,
    aiConfigured: aiConfigured(),
  };
}

async function ensureDailyQuest(circleId: string, today: string): Promise<string> {
  const db = getDb();
  const existing = await db.select().from(dailyQuests).where(and(eq(dailyQuests.circleId, circleId), eq(dailyQuests.date, today))).limit(1);
  if (existing[0]) return existing[0].questionRef;
  const [refs, used] = await Promise.all([
    db.select({ ref: circleQuestions.questionRef }).from(circleQuestions).where(eq(circleQuestions.circleId, circleId)),
    db.select({ ref: dailyQuests.questionRef }).from(dailyQuests).where(eq(dailyQuests.circleId, circleId)),
  ]);
  const ref = pickDailyQuestion(circleId, today, refs.map(r => r.ref), used.map(u => u.ref));
  await db.insert(dailyQuests).values({ circleId, date: today, questionRef: ref }).onConflictDoNothing();
  const [row] = await db.select().from(dailyQuests).where(and(eq(dailyQuests.circleId, circleId), eq(dailyQuests.date, today))).limit(1);
  return row?.questionRef ?? ref;
}

async function loadCircle(userId: string, circleId: string): Promise<CircleDTO> {
  const db = getDb();
  const today = circleToday();

  const [[circle], memberRows, dailyRef, cqRows, myAnswerRows, partRows, sharedDayRows, myXp, circleXp, myEventRows, achRows, msRows, eventRows] =
    await Promise.all([
      db.select().from(circles).where(eq(circles.id, circleId)).limit(1),
      db
        .select({ id: users.id, name: users.displayName, role: circleMembers.role, joinedAt: circleMembers.joinedAt })
        .from(circleMembers)
        .innerJoin(users, eq(users.id, circleMembers.userId))
        .where(eq(circleMembers.circleId, circleId))
        .orderBy(circleMembers.joinedAt),
      ensureDailyQuest(circleId, today),
      db.select({ ref: circleQuestions.questionRef, addedBy: circleQuestions.addedBy }).from(circleQuestions).where(eq(circleQuestions.circleId, circleId)).orderBy(desc(circleQuestions.addedAt)),
      db.select().from(answers).where(and(eq(answers.circleId, circleId), eq(answers.userId, userId))),
      db.select({ userId: participations.userId, kind: participations.kind, key: participations.key, date: participations.date }).from(participations).where(eq(participations.circleId, circleId)),
      db.select().from(sharedJourneyDays).where(eq(sharedJourneyDays.circleId, circleId)),
      db.select({ total: sum(xpEvents.amount) }).from(xpEvents).where(and(eq(xpEvents.circleId, circleId), eq(xpEvents.userId, userId))),
      db.select({ total: sum(xpEvents.amount) }).from(xpEvents).where(eq(xpEvents.circleId, circleId)),
      db.select({ reason: xpEvents.reason, amount: xpEvents.amount, ref: xpEvents.ref, theme: xpEvents.theme }).from(xpEvents).where(and(eq(xpEvents.circleId, circleId), eq(xpEvents.userId, userId))),
      db.select({ id: achievements.achievementId, unlockedAt: achievements.unlockedAt }).from(achievements).where(and(eq(achievements.circleId, circleId), eq(achievements.userId, userId))),
      db.select({ id: circleMilestones.milestoneId, unlockedAt: circleMilestones.unlockedAt }).from(circleMilestones).where(eq(circleMilestones.circleId, circleId)),
      db.select().from(circleEvents).where(eq(circleEvents.circleId, circleId)).orderBy(desc(circleEvents.createdAt)).limit(40),
    ]);

  const memberIds = memberRows.map(m => m.id);
  // Shared answers from other current members only. Private answers are never selected.
  const sharedRows = memberIds.length
    ? await db
        .select({ id: answers.id, userId: answers.userId, questionRef: answers.questionRef, text: answers.text, reflection: answers.reflection, reflectionPrompt: answers.reflectionPrompt, sharedAt: answers.sharedAt })
        .from(answers)
        .where(and(eq(answers.circleId, circleId), isNotNull(answers.sharedAt), ne(answers.userId, userId), inArray(answers.userId, memberIds)))
        .orderBy(desc(answers.sharedAt))
    : [];

  const customRefs = cqRows.map(r => r.ref).filter(r => r.startsWith("c:")).map(r => r.slice(2));
  const customRows = await db
    .select()
    .from(customQuestions)
    .where(customRefs.length ? or(eq(customQuestions.authorId, userId), inArray(customQuestions.id, customRefs)) : eq(customQuestions.authorId, userId));

  // Reactions on answers this member can see (their own, and shared ones).
  const visibleIds = [...myAnswerRows.map(a => a.id), ...sharedRows.map(a => a.id)];
  const reactionRows = visibleIds.length
    ? await db.select().from(answerReactions).where(and(inArray(answerReactions.answerId, visibleIds), inArray(answerReactions.userId, memberIds)))
    : [];
  const summary = (answerId: string, visible: boolean): ReactionSummary => {
    const rows = visible ? reactionRows.filter(r => r.answerId === answerId) : [];
    const counts: Partial<Record<Reaction, number>> = {};
    for (const r of rows) if ((REACTIONS as readonly string[]).includes(r.emoji)) counts[r.emoji as Reaction] = (counts[r.emoji as Reaction] ?? 0) + 1;
    return { counts, mine: rows.filter(r => r.userId === userId).map(r => r.emoji as Reaction) };
  };

  const journey: Record<string, Record<number, string>> = {};
  const daily: Record<string, string[]> = {};
  for (const p of partRows) {
    if (!memberIds.includes(p.userId)) continue;
    if (p.kind === "journey") (journey[p.userId] ??= {})[Number(p.key)] = p.date;
    else (daily[p.userId] ??= []).push(p.date);
  }

  const visibleSharedIds = new Set([...sharedRows.map(a => a.id), ...myAnswerRows.filter(a => a.sharedAt).map(a => a.id)]);
  const feed = eventRows
    .filter(e => e.type !== "answer_shared" || visibleSharedIds.has(e.ref))
    .slice(0, 20)
    .map(e => ({ id: e.id, type: e.type as FeedEventType, actorId: e.actorId, ref: e.ref, createdAt: e.createdAt.toISOString() }));

  const me = memberRows.find(m => m.id === userId);
  return {
    id: circleId,
    name: circle.name,
    role: me?.role ?? "member",
    inviteCode: circle.inviteCode,
    createdAt: circle.createdAt.toISOString(),
    members: memberRows.map(m => ({ id: m.id, name: m.name, role: m.role, joinedAt: m.joinedAt.toISOString(), isMe: m.id === userId })),
    today,
    daily: { questionRef: dailyRef, completedBy: memberIds.filter(id => (daily[id] ?? []).includes(today)) },
    circleQuestions: cqRows,
    customQuestions: customRows.map(q => ({ ref: `c:${q.id}`, text: q.text, theme: q.theme, category: q.category, authorId: q.authorId })),
    myAnswers: myAnswerRows.map(a => ({
      id: a.id, questionRef: a.questionRef, text: a.text, reflectionPrompt: a.reflectionPrompt, reflection: a.reflection,
      shared: !!a.sharedAt, date: dateOf(a.createdAt.toISOString()), updatedAt: a.updatedAt.toISOString(), reactions: summary(a.id, !!a.sharedAt),
    })),
    sharedAnswers: sharedRows.map(a => ({
      id: a.id, authorId: a.userId, questionRef: a.questionRef, text: a.text, reflection: a.reflection, reflectionPrompt: a.reflectionPrompt,
      sharedAt: (a.sharedAt as Date).toISOString(), reactions: summary(a.id, true),
    })),
    participation: { journey, daily },
    sharedJourney: Object.fromEntries(sharedDayRows.map(r => [r.day, dateOf(r.completedAt.toISOString())])),
    xp: { mine: Number(myXp[0]?.total ?? 0), circle: Number(circleXp[0]?.total ?? 0), myEvents: myEventRows },
    achievements: achRows.map(a => ({ id: a.id, unlockedAt: a.unlockedAt.toISOString() })),
    milestones: msRows.map(m => ({ id: m.id, unlockedAt: m.unlockedAt.toISOString() })),
    feed,
  };
}
