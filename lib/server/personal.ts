import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { answers, worldMoments } from "../db/schema";
import { CHAPTER_DAYS, journeyNodes } from "../content";
import { cleanMoment, type MomentInput } from "../domain/personal";
import { journeyDayOf, journeyStateFor, resolveQuestion, XP_RULES } from "../domain/rules";
import { goalNodes, goalQuestion, goalRef, parseGoalRef } from "../journey/goal";
import type { ActionResult, AnswerContext, QuestionRef, RewardDTO } from "../domain/types";
import type { QuestTheme } from "../types";
import { loadSnapshot } from "./snapshot";
import { track } from "./analytics";
import { evaluatePersonal, grantPersonalXp, recordActivity } from "./progress";

/*
 * The member's own path, with or without a circle: answering the journey and
 * the personal daily question, and the private "My Inner World" moments.
 * Every function takes the already-authenticated user id and only ever reads
 * or writes that member's own rows.
 */

const fail = (error: Extract<ActionResult, { ok: false }>["error"]) => ({ ok: false as const, error });

const MAX_IMPORT = 200;

/**
 * Saves an answer on the member's own path. Journey days follow the one
 * personal journey (also walked in circles); the daily question is the
 * personal one, which only members without a circle get.
 */
export async function savePersonalAnswer(userId: string, input: {
  questionRef: QuestionRef;
  text: string;
  reflection: string;
  reflectionPrompt: string;
  context: AnswerContext;
}): Promise<ActionResult<RewardDTO>> {
  const { questionRef } = input;
  const text = input.text.trim().slice(0, 2000);
  const reflection = input.reflection.trim().slice(0, 1000);
  if (text.length < 2) return fail("invalid");
  const db = getDb();
  const before = await loadSnapshot(userId);
  const progress = before.progress;
  const today = progress.today;

  // Own path: built-in questions, or a day of the member's active goal journey (custom questions live in circles).
  const goal = parseGoalRef(questionRef);
  const goalJourney = progress.goalJourney;
  const goalDay = goal && goalJourney && goal.journeyId === goalJourney.id ? goalJourney.days.find(d => d.day === goal.day) : undefined;
  if (goal && !goalDay) return fail("not_found");
  const question = goalDay ? goalQuestion(goalJourney!.id, goalDay) : resolveQuestion(questionRef, null);
  if (!question) return fail("not_found");

  let context = input.context;
  if (goalDay) {
    // A goal journey day is always answered as that day, at the journey's own pace.
    if (context.kind !== "goal" || context.day !== goalDay.day) return fail("invalid");
    if (!journeyStateFor(goalJourney!.done, today, goalNodes).canStart(goalDay.day)) return fail("locked");
  } else if (context.kind === "goal") return fail("invalid");
  if (context.kind === "daily" && progress.dailyQuestion?.questionRef !== questionRef) context = { kind: "bonus" };
  if (context.kind === "journey") {
    if (journeyDayOf(questionRef) !== context.day) return fail("invalid");
    if (!journeyStateFor(progress.journey, today).canStart(context.day)) return fail("locked");
  }

  const existing = progress.answers.find(a => a.questionRef === questionRef);
  const isNew = !existing;
  const reflectionPrompt = reflection ? input.reflectionPrompt.slice(0, 300) : "";
  if (existing) {
    await db.update(answers).set({ text, reflection, reflectionPrompt, updatedAt: new Date() })
      .where(and(eq(answers.id, existing.id), eq(answers.userId, userId), isNull(answers.circleId)));
  } else {
    await db.insert(answers).values({ userId, circleId: null, questionRef, text, reflection, reflectionPrompt }).onConflictDoNothing();
  }

  const xpItems: RewardDTO["xpItems"] = [];
  const give = async (reason: string, amount: number, ref: string, theme?: string) => {
    if (await grantPersonalXp(userId, reason, amount, ref, theme, today)) xpItems.push({ reason, amount, theme });
  };

  let journeyDay: number | null = null;
  let weekCompleted: number | null = null;
  if (context.kind === "daily") {
    if (await recordActivity(userId, "daily", today, questionRef, today)) {
      await give("daily", XP_RULES.daily, `daily:${today}`);
      await track(userId, "daily_answered", { context: "personal" });
    }
  } else if (context.kind === "journey") {
    const day = context.day;
    journeyDay = day;
    if (await recordActivity(userId, "journey", String(day), questionRef, today)) {
      await give("daily", XP_RULES.daily, `journey:${day}`);
      await track(userId, "journey_day_completed", { context: "journey" });
      if (day % CHAPTER_DAYS === 0) await track(userId, "journey_finished", { context: "journey" });
      const node = journeyNodes.find(n => n.day === day)!;
      if (node.kind === "challenge") {
        await give("weekly", XP_RULES.weekly, `weekly:${node.week}`);
        weekCompleted = node.week;
      }
    }
  } else if (context.kind === "goal" && goalDay) {
    journeyDay = goalDay.day;
    if (await recordActivity(userId, "goal", `${goalJourney!.id}:${goalDay.day}`, goalRef(goalJourney!.id, goalDay.day), today)) {
      await give("daily", XP_RULES.daily, `goal:${goalJourney!.id}:${goalDay.day}`);
      await track(userId, "journey_day_completed", { context: "goal" });
      if (goalDay.day === goalJourney!.days.length) await track(userId, "journey_finished", { context: "goal" });
      if (goalDay.kind === "challenge") {
        await give("weekly", XP_RULES.weekly, `goal-weekly:${goalJourney!.id}:${goalDay.week}`);
        weekCompleted = goalDay.week;
      }
    }
  } else if (isNew) {
    await give("bonus", XP_RULES.bonus, `bonus:${today}`);
  }
  if (isNew) await give("new-topic", XP_RULES.newTopic, `theme:${question.theme}`, question.theme as QuestTheme);
  if (reflection && context.kind !== "bonus") await give("reflection", XP_RULES.reflection, `reflection:${questionRef}`);

  const newAchievements = await evaluatePersonal(userId);
  const snapshot = await loadSnapshot(userId);
  return {
    ok: true,
    snapshot,
    data: {
      questionRef, context: context.kind, isNew, shared: false, xpItems,
      xpBefore: progress.xp.total, xpAfter: snapshot.progress.xp.total,
      newAchievements, newMilestones: [], journeyDay, weekCompleted, sharedDayCompleted: null,
    },
  };
}

/** Deletes the text of an own-path answer. Completions and earned rewards stay. */
export async function deletePersonalAnswer(userId: string, answerId: string): Promise<ActionResult> {
  const removed = await getDb().delete(answers)
    .where(and(eq(answers.id, answerId), eq(answers.userId, userId), isNull(answers.circleId)))
    .returning({ id: answers.id });
  if (!removed.length) return fail("not_found");
  return { ok: true, snapshot: await loadSnapshot(userId) };
}

/* ---------- My Inner World ---------- */

export type { MomentInput };

export async function addMoment(userId: string, input: MomentInput): Promise<ActionResult> {
  const clean = cleanMoment(input);
  if (!clean) return fail("invalid");
  const today = (await loadSnapshot(userId)).progress.today;
  await getDb().insert(worldMoments).values({ userId, date: today, ...clean });
  return { ok: true, snapshot: await loadSnapshot(userId) };
}

export async function deleteMoment(userId: string, momentId: string): Promise<ActionResult> {
  const removed = await getDb().delete(worldMoments).where(and(eq(worldMoments.id, momentId), eq(worldMoments.userId, userId))).returning({ id: worldMoments.id });
  if (!removed.length) return fail("not_found");
  return { ok: true, snapshot: await loadSnapshot(userId) };
}

/**
 * One-time move of moments saved on this device (before they were stored on
 * the server). Idempotent: each device moment is imported at most once.
 */
export async function importMoments(userId: string, items: unknown): Promise<ActionResult<number>> {
  if (!Array.isArray(items)) return fail("invalid");
  const rows = items.slice(0, MAX_IMPORT).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const m = raw as Record<string, unknown>;
    const clean = cleanMoment(m as MomentInput);
    const clientId = typeof m.id === "string" ? m.id.slice(0, 64) : null;
    const date = typeof m.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(m.date) ? m.date : null;
    const createdAt = typeof m.createdAt === "number" && Number.isFinite(m.createdAt) ? new Date(m.createdAt) : null;
    if (!clean || !clientId || !date || !createdAt || Number.isNaN(createdAt.getTime())) return [];
    return [{ userId, clientId, date, createdAt, ...clean }];
  });
  const inserted = rows.length
    ? await getDb().insert(worldMoments).values(rows).onConflictDoNothing().returning({ id: worldMoments.id })
    : [];
  return { ok: true, snapshot: await loadSnapshot(userId), data: inserted.length };
}
