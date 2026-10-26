import "server-only";

import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  achievements, answerReactions, answers, circleEvents, circleMembers, circleMilestones, circleQuestions, circles,
  customQuestions, participations, savedQuestions, sharedJourneyDays, userPrefs, users, xpEvents,
} from "../db/schema";
import { categoryTheme, CHAPTER_DAYS, journeyNodes } from "../content";
import { isLocale } from "../i18n/config";
import { isGoalRef } from "../journey/goal";
import {
  computeFacts, isCustomRef, isSharedComplete, journeyDayOf, journeyStateFor, resolveQuestion,
  SHARED_XP, unlockedAchievements, unlockedMilestones, XP_RULES,
} from "../domain/rules";
import { REACTIONS, type ActionResult, type AnswerContext, type QuestionRef, type RewardDTO } from "../domain/types";
import type { CategoryId, QuestTheme } from "../types";
import { loadSnapshot } from "./snapshot";
import { roleIn } from "./membership";
import { canOwnAnotherCircle } from "./entitlements";
import { track } from "./analytics";
import { evaluatePersonal, grantPersonalXp, recordActivity } from "./progress";

/*
 * Circle service: every function takes the already-authenticated user id.
 * Server actions (actions.ts) authenticate and delegate here; tests call it directly.
 *
 * Every operation: authenticate → check circle membership → mutate → return a fresh
 * snapshot built with the same privacy filtering as the initial load.
 * Unique constraints make every reward idempotent (no duplicate XP or badges).
 */

const fail = (error: Extract<ActionResult, { ok: false }>["error"]) => ({ ok: false as const, error });

function newInviteCode() {
  // Unambiguous characters, 8 long.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(8), b => alphabet[b % alphabet.length]).join("");
}

async function event(circleId: string, actorId: string | null, type: string, ref = "") {
  await getDb().insert(circleEvents).values({ circleId, actorId, type, ref });
}

/** Grants XP once per (circle, ref). Returns true if this call granted it. */
async function grantXp(circleId: string, userId: string | null, reason: string, amount: number, ref: string, theme?: string) {
  const rows = await getDb()
    .insert(xpEvents)
    .values({ circleId, userId, reason, amount, ref, theme: theme ?? null })
    .onConflictDoNothing()
    .returning({ id: xpEvents.id });
  return rows.length > 0;
}

/**
 * Re-evaluates achievements (for this member) and milestones (for the circle)
 * from persisted data and records anything newly unlocked. Never removes.
 */
async function evaluate(userId: string, circleId: string) {
  const snap = await loadSnapshot(userId, circleId);
  const circle = snap.circle;
  if (!circle) return { newAchievements: [] as string[], newMilestones: [] as string[] };
  const facts = computeFacts(circle, userId);
  const haveA = new Set(circle.achievements.map(a => a.id));
  const haveM = new Set(circle.milestones.map(m => m.id));
  const newAchievements = unlockedAchievements(facts).filter(id => !haveA.has(id));
  const newMilestones = unlockedMilestones(facts).filter(id => !haveM.has(id));
  const db = getDb();
  if (newAchievements.length) {
    await db.insert(achievements).values(newAchievements.map(achievementId => ({ userId, circleId, achievementId }))).onConflictDoNothing();
  }
  // Badges earned in a circle are the member's own and stay with them.
  await evaluatePersonal(userId, circle.achievements.map(a => a.id).concat(newAchievements));
  for (const id of newMilestones) {
    const inserted = await db.insert(circleMilestones).values({ circleId, milestoneId: id }).onConflictDoNothing().returning({ id: circleMilestones.milestoneId });
    if (inserted.length) {
      await grantXp(circleId, null, "milestone", SHARED_XP.milestone, `circle:milestone:${id}`);
      await event(circleId, null, "milestone_unlocked", id);
    }
  }
  return { newAchievements, newMilestones };
}

async function result(userId: string, circleId?: string | null): Promise<ActionResult> {
  return { ok: true, snapshot: await loadSnapshot(userId, circleId) };
}

/* ---------- Session & profile ---------- */

export async function getSnapshot(userId: string, circleId?: string | null): Promise<ActionResult> {
  const snap = await loadSnapshot(userId, circleId);
  if (snap.circle) {
    // Catch up on achievements/milestones unlocked through other members' activity.
    const { newAchievements, newMilestones } = await evaluate(userId, snap.circle.id);
    if (newAchievements.length || newMilestones.length) return result(userId, snap.circle.id);
  }
  return { ok: true, snapshot: snap };
}

export async function setDisplayName(userId: string, name: string): Promise<ActionResult> {
  const clean = name.trim().slice(0, 40);
  if (!clean) return fail("invalid");
  await getDb().update(users).set({ displayName: clean }).where(eq(users.id, userId));
  return result(userId);
}

/** Saves the language on the profile (signed-in preference wins over the device setting). */
export async function setLocale(userId: string, locale: string): Promise<{ ok: boolean }> {
  if (!isLocale(locale)) return { ok: false };
  await getDb().insert(userPrefs).values({ userId, locale }).onConflictDoUpdate({ target: userPrefs.userId, set: { locale } });
  return { ok: true };
}

/** The member starts on their own (My Path); circles stay available any time. Stored in the existing user_prefs.onboarded flag. */
export async function startPersonalPath(userId: string): Promise<ActionResult> {
  await getDb().insert(userPrefs).values({ userId, onboarded: true }).onConflictDoUpdate({ target: userPrefs.userId, set: { onboarded: true } });
  await track(userId, "path_chosen", { context: "personal" });
  return result(userId);
}

/* ---------- Circles & membership ---------- */

export async function createCircle(userId: string, name: string): Promise<ActionResult> {
  const clean = name.trim().slice(0, 60);
  if (clean.length < 2) return fail("invalid");
  // Owning more circles is a plan limit; joining others is always free.
  if (!(await canOwnAnotherCircle(userId))) {
    await track(userId, "premium_feature_requested", { context: "circles" });
    return fail("limit_circles");
  }
  const db = getDb();
  const [c] = await db.insert(circles).values({ name: clean, createdBy: userId, inviteCode: newInviteCode() }).returning({ id: circles.id });
  await db.insert(circleMembers).values({ circleId: c.id, userId, role: "owner" });
  await db.insert(userPrefs).values({ userId, lastCircleId: c.id }).onConflictDoUpdate({ target: userPrefs.userId, set: { lastCircleId: c.id } });
  await event(c.id, userId, "circle_created");
  await track(userId, "circle_created", { context: "circle" });
  return result(userId, c.id);
}

/** Looks up a circle by invite code without revealing anything beyond its name and size. */
export async function previewInvite(userId: string, code: string): Promise<{ ok: true; name: string; members: number; alreadyMember: boolean } | { ok: false; error: string }> {
  const db = getDb();
  const [c] = await db.select({ id: circles.id, name: circles.name }).from(circles).where(eq(circles.inviteCode, code.trim().toUpperCase())).limit(1);
  if (!c) return { ok: false, error: "not_found" };
  const members = await db.select({ userId: circleMembers.userId }).from(circleMembers).where(eq(circleMembers.circleId, c.id));
  return { ok: true, name: c.name, members: members.length, alreadyMember: members.some(m => m.userId === userId) };
}

export async function joinCircle(userId: string, code: string): Promise<ActionResult> {
  const db = getDb();
  const [c] = await db.select({ id: circles.id }).from(circles).where(eq(circles.inviteCode, code.trim().toUpperCase())).limit(1);
  if (!c) return fail("not_found");
  const inserted = await db.insert(circleMembers).values({ circleId: c.id, userId, role: "member" }).onConflictDoNothing().returning({ id: circleMembers.userId });
  if (inserted.length) {
    await event(c.id, userId, "member_joined");
    await track(userId, "circle_joined", { context: "circle" });
  }
  await db.insert(userPrefs).values({ userId, lastCircleId: c.id }).onConflictDoUpdate({ target: userPrefs.userId, set: { lastCircleId: c.id } });
  return result(userId, c.id);
}

export async function switchCircle(userId: string, circleId: string): Promise<ActionResult> {
  if (!(await roleIn(userId, circleId))) return fail("not_member");
  await getDb().insert(userPrefs).values({ userId, lastCircleId: circleId }).onConflictDoUpdate({ target: userPrefs.userId, set: { lastCircleId: circleId } });
  return result(userId, circleId);
}

export async function renameCircle(userId: string, circleId: string, name: string): Promise<ActionResult> {
  if ((await roleIn(userId, circleId)) !== "owner") return fail("not_owner");
  const clean = name.trim().slice(0, 60);
  if (clean.length < 2) return fail("invalid");
  await getDb().update(circles).set({ name: clean }).where(eq(circles.id, circleId));
  return result(userId, circleId);
}

export async function regenerateInvite(userId: string, circleId: string): Promise<ActionResult> {
  if ((await roleIn(userId, circleId)) !== "owner") return fail("not_owner");
  await getDb().update(circles).set({ inviteCode: newInviteCode() }).where(eq(circles.id, circleId));
  return result(userId, circleId);
}

export async function removeMember(userId: string, circleId: string, memberId: string): Promise<ActionResult> {
  if ((await roleIn(userId, circleId)) !== "owner" || memberId === userId) return fail("not_owner");
  await getDb().delete(circleMembers).where(and(eq(circleMembers.circleId, circleId), eq(circleMembers.userId, memberId)));
  return result(userId, circleId);
}

export async function leaveCircle(userId: string, circleId: string): Promise<ActionResult> {
  const role = await roleIn(userId, circleId);
  if (!role) return fail("not_member");
  if (role === "owner") return fail("owner_cannot_leave");
  await getDb().delete(circleMembers).where(and(eq(circleMembers.circleId, circleId), eq(circleMembers.userId, userId)));
  return result(userId);
}

/* ---------- Questions ---------- */

async function canUseQuestion(userId: string, circleId: string, ref: QuestionRef) {
  if (!isCustomRef(ref)) return !!resolveQuestion(ref, null);
  const id = ref.slice(2);
  const db = getDb();
  const [q] = await db.select({ authorId: customQuestions.authorId }).from(customQuestions).where(eq(customQuestions.id, id)).limit(1);
  if (!q) return false;
  if (q.authorId === userId) return true;
  const inCircle = await db.select({ ref: circleQuestions.questionRef }).from(circleQuestions).where(and(eq(circleQuestions.circleId, circleId), eq(circleQuestions.questionRef, ref))).limit(1);
  return inCircle.length > 0;
}

export async function createQuestion(userId: string, circleId: string, text: string, category: string, addToCircle: boolean): Promise<ActionResult<QuestionRef>> {
  if (!(await roleIn(userId, circleId))) return fail("not_member");
  const clean = text.trim().slice(0, 240);
  if (clean.length < 5 || !(category in categoryTheme)) return fail("invalid");
  const db = getDb();
  const [q] = await db
    .insert(customQuestions)
    .values({ authorId: userId, text: clean, category, theme: categoryTheme[category as CategoryId] })
    .returning({ id: customQuestions.id });
  const ref = `c:${q.id}`;
  if (addToCircle) {
    await db.insert(circleQuestions).values({ circleId, questionRef: ref, addedBy: userId }).onConflictDoNothing();
    await event(circleId, userId, "question_added", ref);
  }
  return { ok: true, snapshot: await loadSnapshot(userId, circleId), data: ref };
}

export async function addQuestionToCircle(userId: string, circleId: string, ref: QuestionRef): Promise<ActionResult> {
  if (!(await roleIn(userId, circleId))) return fail("not_member");
  if (!(await canUseQuestion(userId, circleId, ref))) return fail("not_found");
  const inserted = await getDb().insert(circleQuestions).values({ circleId, questionRef: ref, addedBy: userId }).onConflictDoNothing().returning({ ref: circleQuestions.questionRef });
  if (inserted.length) await event(circleId, userId, "question_added", ref);
  return result(userId, circleId);
}

export async function toggleSaved(userId: string, circleId: string | null, ref: QuestionRef): Promise<ActionResult> {
  const db = getDb();
  const removed = await db.delete(savedQuestions).where(and(eq(savedQuestions.userId, userId), eq(savedQuestions.questionRef, ref))).returning({ ref: savedQuestions.questionRef });
  if (!removed.length) await db.insert(savedQuestions).values({ userId, questionRef: ref }).onConflictDoNothing();
  return result(userId, circleId);
}

/* ---------- Answers ---------- */

export async function saveAnswer(userId: string, input: {
  circleId: string;
  questionRef: QuestionRef;
  text: string;
  reflection: string;
  reflectionPrompt: string;
  share: boolean;
  context: AnswerContext;
}): Promise<ActionResult<RewardDTO>> {
  const { circleId, questionRef } = input;
  if (!(await roleIn(userId, circleId))) return fail("not_member");
  const text = input.text.trim().slice(0, 2000);
  const reflection = input.reflection.trim().slice(0, 1000);
  if (text.length < 2) return fail("invalid");
  // Goal journeys are personal: answered on the member's own path, never in a circle.
  if (input.context.kind === "goal" || isGoalRef(questionRef)) return fail("invalid");
  if (!(await canUseQuestion(userId, circleId, questionRef))) return fail("not_found");

  const db = getDb();
  const before = await loadSnapshot(userId, circleId);
  const circle = before.circle!;
  const today = circle.today;
  const question = resolveQuestion(questionRef, circle);
  if (!question) return fail("not_found");

  // Validate the context against persisted state.
  let context = input.context;
  if (context.kind === "daily" && circle.daily.questionRef !== questionRef) context = { kind: "bonus" };
  if (context.kind === "journey") {
    if (journeyDayOf(questionRef) !== context.day) return fail("invalid");
    // One journey: the member's own, wherever they walked it.
    const state = journeyStateFor(before.progress.journey, today);
    if (!state.canStart(context.day)) return fail("locked");
  }

  const existing = circle.myAnswers.find(a => a.questionRef === questionRef);
  const isNew = !existing;
  if (existing) {
    await db
      .update(answers)
      .set({ text, reflection, reflectionPrompt: reflection ? input.reflectionPrompt.slice(0, 300) : "", updatedAt: new Date(), ...(input.share && !existing.shared ? { sharedAt: new Date() } : {}) })
      .where(eq(answers.id, existing.id));
  } else {
    await db.insert(answers).values({
      userId, circleId, questionRef, text, reflection,
      reflectionPrompt: reflection ? input.reflectionPrompt.slice(0, 300) : "",
      sharedAt: input.share ? new Date() : null,
    });
  }
  // Sharing only ever happens on the author's explicit request.
  if (input.share && !existing?.shared) {
    const [row] = await db.select({ id: answers.id }).from(answers).where(and(eq(answers.userId, userId), eq(answers.circleId, circleId), eq(answers.questionRef, questionRef))).limit(1);
    if (row) await event(circleId, userId, "answer_shared", row.id);
  }

  const xpItems: RewardDTO["xpItems"] = [];
  const give = async (reason: string, amount: number, ref: string, theme?: string) => {
    if (await grantXp(circleId, userId, reason, amount, `u:${userId}:${ref}`, theme)) xpItems.push({ reason, amount, theme });
    // The same reward on the member's own profile (counted once across circles).
    await grantPersonalXp(userId, reason, amount, ref, theme, today);
  };

  let journeyDay: number | null = null;
  let weekCompleted: number | null = null;
  let sharedDayCompleted: number | null = null;

  if (context.kind === "daily") {
    const inserted = await db
      .insert(participations)
      .values({ userId, circleId, kind: "daily", key: today, questionRef, date: today })
      .onConflictDoNothing()
      .returning({ key: participations.key });
    await recordActivity(userId, "daily", today, questionRef, today);
    if (inserted.length) {
      await give("daily", XP_RULES.daily, `daily:${today}`);
      await event(circleId, userId, "daily_completed", questionRef);
      await track(userId, "daily_answered", { context: "circle" });
      // Everyone in today's circle did it: shared reward for the circle.
      const done = new Set([...circle.daily.completedBy, userId]);
      if (circle.members.length >= 2 && circle.members.every(m => done.has(m.id))) {
        await grantXp(circleId, null, "daily-together", SHARED_XP.dailyTogether, `circle:daily:${today}`);
      }
    }
  } else if (context.kind === "journey") {
    const day = context.day;
    journeyDay = day;
    const inserted = await db
      .insert(participations)
      .values({ userId, circleId, kind: "journey", key: String(day), questionRef, date: today })
      .onConflictDoNothing()
      .returning({ key: participations.key });
    await recordActivity(userId, "journey", String(day), questionRef, today);
    if (inserted.length) {
      await give("daily", XP_RULES.daily, `journey:${day}`);
      const node = journeyNodes.find(n => n.day === day)!;
      if (node.kind === "challenge") {
        await give("weekly", XP_RULES.weekly, `weekly:${node.week}`);
        weekCompleted = node.week;
      }
      await event(circleId, userId, "journey_completed", String(day));
      await track(userId, "journey_day_completed", { context: "journey" });
      if (day % CHAPTER_DAYS === 0) await track(userId, "journey_finished", { context: "journey" });
      // Shared completion: every current member (2+) has completed this day.
      const after = await loadSnapshot(userId, circleId);
      if (after.circle && isSharedComplete(day, after.circle) && !after.circle.sharedJourney[day]) {
        const rec = await db.insert(sharedJourneyDays).values({ circleId, day }).onConflictDoNothing().returning({ day: sharedJourneyDays.day });
        if (rec.length) {
          sharedDayCompleted = day;
          await grantXp(circleId, null, "journey-together", SHARED_XP.journeyTogether, `circle:journey:${day}`);
          await event(circleId, userId, "shared_journey_completed", String(day));
        }
      }
    }
  } else if (isNew) {
    await give("bonus", XP_RULES.bonus, `bonus:${today}`);
  }

  if (isNew) await give("new-topic", XP_RULES.newTopic, `theme:${question.theme}`, question.theme as QuestTheme);
  if (reflection && context.kind !== "bonus") await give("reflection", XP_RULES.reflection, `reflection:${questionRef}`);

  const { newAchievements, newMilestones } = await evaluate(userId, circleId);
  const snapshot = await loadSnapshot(userId, circleId);
  const sharedNow = !!snapshot.circle?.myAnswers.find(a => a.questionRef === questionRef)?.shared;

  return {
    ok: true,
    snapshot,
    data: {
      questionRef, context: context.kind, isNew, shared: sharedNow, xpItems,
      // Level progress is the member's own (the same with or without a circle).
      xpBefore: before.progress.xp.total, xpAfter: snapshot.progress.xp.total,
      newAchievements, newMilestones, journeyDay, weekCompleted, sharedDayCompleted,
    },
  };
}

async function ownAnswer(userId: string, answerId: string) {
  const [a] = await getDb().select().from(answers).where(and(eq(answers.id, answerId), eq(answers.userId, userId))).limit(1);
  return a ?? null;
}

export async function shareAnswer(userId: string, answerId: string, share: boolean): Promise<ActionResult> {
  const a = await ownAnswer(userId, answerId);
  if (!a || !a.circleId) return fail("not_found");
  if (!(await roleIn(userId, a.circleId))) return fail("not_member");
  if (share && !a.sharedAt) {
    await getDb().update(answers).set({ sharedAt: new Date() }).where(eq(answers.id, answerId));
    await event(a.circleId, userId, "answer_shared", answerId);
  } else if (!share && a.sharedAt) {
    await getDb().update(answers).set({ sharedAt: null }).where(eq(answers.id, answerId));
  }
  return result(userId, a.circleId);
}

/** Deletes the answer text. Participation records and earned rewards stay. */
export async function deleteAnswer(userId: string, answerId: string): Promise<ActionResult> {
  const a = await ownAnswer(userId, answerId);
  if (!a) return fail("not_found");
  await getDb().delete(answers).where(eq(answers.id, answerId));
  return result(userId, a.circleId);
}

export async function toggleReaction(userId: string, answerId: string, emoji: string): Promise<ActionResult> {
  if (!(REACTIONS as readonly string[]).includes(emoji)) return fail("invalid");
  const db = getDb();
  const [a] = await db.select({ circleId: answers.circleId, userId: answers.userId, sharedAt: answers.sharedAt }).from(answers).where(eq(answers.id, answerId)).limit(1);
  // Only shared answers by other members of your circle can get reactions.
  if (!a || !a.circleId || !a.sharedAt || a.userId === userId) return fail("not_found");
  if (!(await roleIn(userId, a.circleId)) || !(await roleIn(a.userId, a.circleId))) return fail("not_member");
  const removed = await db
    .delete(answerReactions)
    .where(and(eq(answerReactions.answerId, answerId), eq(answerReactions.userId, userId), eq(answerReactions.emoji, emoji)))
    .returning({ e: answerReactions.emoji });
  if (!removed.length) await db.insert(answerReactions).values({ answerId, userId, emoji }).onConflictDoNothing();
  return result(userId, a.circleId);
}
