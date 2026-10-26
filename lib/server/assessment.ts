import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { growthGoals, growthSteps, pathAssessments, userPrefs } from "../db/schema";
import { grantGrowthXp } from "./progress";
import {
  baseComplete, describeAnswers, followupInstructions, MAX_AI_CALLS, MAX_FOLLOWUPS, parseFollowup, parsePlan, PLAN_STEP, planInstructions,
  sanitizeAccepted, sanitizeAnswers, sanitizeFollowups, TOTAL_STEPS, type PathPlan,
} from "../assessment/model";
import type { AssessmentDTO, AssessmentError, AssessmentResult, AssessmentState, AssessmentStatus } from "../assessment/types";
import { isLocale } from "../i18n/config";
import { runMeteredAi } from "./ai";
import { track } from "./analytics";
import { getUserEntitlements } from "./entitlements";

/*
 * My Path initial assessment. Every query is filtered by the owner's id.
 * Answers are stored at each step (never only in the browser), AI calls go
 * through the shared wrapper on the "assessment" allowance, and each
 * assessment is additionally capped at MAX_AI_CALLS. State changes that must
 * not run twice (plan generation, accepting) use conditional updates, so a
 * double click or a second tab can't create duplicate plans, goals or steps.
 */

const fail = (error: AssessmentError) => ({ ok: false as const, error });
const STALE_GENERATING = sql`now() - interval '2 minutes'`;

function toDTO(row: typeof pathAssessments.$inferSelect): AssessmentDTO {
  return {
    status: row.status as AssessmentStatus,
    step: row.step,
    answers: sanitizeAnswers(row.answers),
    followups: sanitizeFollowups(row.followups),
    plan: (row.plan as PathPlan | null) ?? null,
    aiCallsLeft: Math.max(0, MAX_AI_CALLS - row.aiCalls),
  };
}

export async function loadAssessmentState(userId: string): Promise<AssessmentState> {
  const db = getDb();
  const [[row], steps] = await Promise.all([
    db.select().from(pathAssessments).where(eq(pathAssessments.userId, userId)).limit(1),
    db.select().from(growthSteps).where(eq(growthSteps.userId, userId)).orderBy(asc(growthSteps.position), asc(growthSteps.createdAt)),
  ]);
  return {
    assessment: row ? toDTO(row) : null,
    steps: steps.map(s => ({ id: s.id, goalId: s.goalId, title: s.title, kind: s.kind, position: s.position, done: s.status === "done" })),
  };
}

const ok = async (userId: string): Promise<AssessmentResult> => ({ ok: true, state: await loadAssessmentState(userId) });

/** Starts (or resumes a skipped) assessment. Idempotent. */
export async function startAssessment(userId: string): Promise<AssessmentResult> {
  const db = getDb();
  const inserted = await db.insert(pathAssessments).values({ userId }).onConflictDoNothing().returning({ userId: pathAssessments.userId });
  if (inserted.length) await track(userId, "assessment_started");
  else await db.update(pathAssessments).set({ status: "in_progress", updatedAt: new Date() }).where(and(eq(pathAssessments.userId, userId), eq(pathAssessments.status, "skipped")));
  return ok(userId);
}

/** Saves answers and the current step. Editing answers after a plan was made keeps the plan until it's regenerated. */
export async function saveAnswers(userId: string, rawAnswers: unknown, rawStep: number): Promise<AssessmentResult> {
  const db = getDb();
  const [row] = await db.select().from(pathAssessments).where(eq(pathAssessments.userId, userId)).limit(1);
  if (!row) return fail("not_found");
  if (row.status === "accepted" || row.status === "accepting" || row.status === "generating") return fail("busy");
  const answers = { ...sanitizeAnswers(row.answers), ...sanitizeAnswers(rawAnswers) };
  const step = Math.min(Math.max(0, Math.round(Number(rawStep) || 0)), TOTAL_STEPS - 1);
  await db.update(pathAssessments).set({ answers, step, status: row.status === "skipped" ? "in_progress" : row.status, updatedAt: new Date() }).where(eq(pathAssessments.userId, userId));
  return ok(userId);
}

/** Reserves one AI call on this assessment; false when its cap is reached or it is not editable. */
async function reserveCall(userId: string): Promise<boolean> {
  const rows = await getDb().update(pathAssessments)
    .set({ aiCalls: sql`${pathAssessments.aiCalls} + 1`, updatedAt: new Date() })
    .where(and(eq(pathAssessments.userId, userId), sql`${pathAssessments.aiCalls} < ${MAX_AI_CALLS}`, sql`${pathAssessments.status} in ('in_progress', 'ready')`))
    .returning({ n: pathAssessments.aiCalls });
  return rows.length > 0;
}

/** A skipped assessment that the member continues (asks for a follow-up or a plan) becomes active again. */
async function resumeIfSkipped(userId: string) {
  await getDb().update(pathAssessments).set({ status: "in_progress", updatedAt: new Date() })
    .where(and(eq(pathAssessments.userId, userId), eq(pathAssessments.status, "skipped")));
}

async function releaseCall(userId: string) {
  await getDb().update(pathAssessments).set({ aiCalls: sql`greatest(${pathAssessments.aiCalls} - 1, 0)` }).where(eq(pathAssessments.userId, userId));
}

/** Asks for one adaptive follow-up question (at most MAX_FOLLOWUPS per assessment). */
export async function requestFollowup(userId: string, localeInput: string): Promise<AssessmentResult> {
  const db = getDb();
  const [row] = await db.select().from(pathAssessments).where(eq(pathAssessments.userId, userId)).limit(1);
  if (!row) return fail("not_found");
  const answers = sanitizeAnswers(row.answers);
  const followups = sanitizeFollowups(row.followups);
  if (!baseComplete(answers)) return fail("invalid");
  if (followups.length >= MAX_FOLLOWUPS) return fail("limit_assessment");
  if (row.status === "skipped") await resumeIfSkipped(userId);
  if (!(await reserveCall(userId))) {
    const [now] = await db.select({ status: pathAssessments.status, aiCalls: pathAssessments.aiCalls }).from(pathAssessments).where(eq(pathAssessments.userId, userId)).limit(1);
    return fail(now && now.aiCalls >= MAX_AI_CALLS ? "limit_assessment" : "busy");
  }

  const locale = isLocale(localeInput) ? localeInput : "hu";
  const out = await runMeteredAi(userId, "assessment", {
    feature: "assessment_followup",
    instructions: followupInstructions(locale),
    prompt: describeAnswers(answers, followups) + (followups.length ? `\nAlready asked: ${followups.map(f => f.question).join(" | ")}` : ""),
    maxOutputTokens: 300,
    parse: parseFollowup,
  });
  if (!out.ok) {
    await releaseCall(userId);
    return fail(out.error);
  }
  // Append only while below the cap, so two parallel requests can't add a third question.
  await db.update(pathAssessments)
    .set({ followups: sql`${pathAssessments.followups} || ${JSON.stringify([{ question: out.value, answer: "" }])}::jsonb`, step: PLAN_STEP - 1, updatedAt: new Date() })
    .where(and(eq(pathAssessments.userId, userId), sql`jsonb_array_length(${pathAssessments.followups}) < ${MAX_FOLLOWUPS}`));
  return ok(userId);
}

export async function answerFollowup(userId: string, index: number, answer: string): Promise<AssessmentResult> {
  const db = getDb();
  const [row] = await db.select().from(pathAssessments).where(eq(pathAssessments.userId, userId)).limit(1);
  if (!row) return fail("not_found");
  if (row.status === "accepted" || row.status === "accepting" || row.status === "generating") return fail("busy");
  const followups = sanitizeFollowups(row.followups);
  if (!Number.isInteger(index) || index < 0 || index >= followups.length) return fail("invalid");
  followups[index] = { ...followups[index], answer: answer.trim().slice(0, 600) };
  await db.update(pathAssessments).set({ followups, updatedAt: new Date() }).where(eq(pathAssessments.userId, userId));
  return ok(userId);
}

/** Generates (or regenerates) the plan. Only one generation can run at a time. */
export async function generatePlan(userId: string, localeInput: string): Promise<AssessmentResult> {
  const db = getDb();
  const [row] = await db.select().from(pathAssessments).where(eq(pathAssessments.userId, userId)).limit(1);
  if (!row) return fail("not_found");
  const answers = sanitizeAnswers(row.answers);
  if (!baseComplete(answers)) return fail("invalid");
  const hadPlan = !!row.plan;
  if (row.status === "skipped") await resumeIfSkipped(userId);
  const claimed = await db.update(pathAssessments)
    .set({ status: "generating", aiCalls: sql`${pathAssessments.aiCalls} + 1`, updatedAt: new Date() })
    .where(and(
      eq(pathAssessments.userId, userId),
      sql`${pathAssessments.aiCalls} < ${MAX_AI_CALLS}`,
      sql`(${pathAssessments.status} in ('in_progress', 'ready') or (${pathAssessments.status} = 'generating' and ${pathAssessments.updatedAt} < ${STALE_GENERATING}))`,
    ))
    .returning({ userId: pathAssessments.userId });
  if (!claimed.length) {
    // Decide from the state now, not the one read before the claim (a parallel request may have just claimed it).
    const [now] = await db.select({ status: pathAssessments.status, aiCalls: pathAssessments.aiCalls }).from(pathAssessments).where(eq(pathAssessments.userId, userId)).limit(1);
    return fail(now && now.aiCalls >= MAX_AI_CALLS && now.status !== "generating" ? "limit_assessment" : "busy");
  }

  const locale = isLocale(localeInput) ? localeInput : "hu";
  const out = await runMeteredAi(userId, "assessment", {
    feature: "assessment_plan",
    instructions: planInstructions(locale),
    prompt: describeAnswers(answers, sanitizeFollowups(row.followups)),
    maxOutputTokens: 1400,
    parse: parsePlan,
  });
  if (!out.ok) {
    await db.update(pathAssessments)
      .set({ status: hadPlan ? "ready" : "in_progress", aiCalls: sql`greatest(${pathAssessments.aiCalls} - 1, 0)`, updatedAt: new Date() })
      .where(and(eq(pathAssessments.userId, userId), eq(pathAssessments.status, "generating")));
    return fail(out.error);
  }
  await db.update(pathAssessments).set({ status: "ready", plan: out.value, step: PLAN_STEP, updatedAt: new Date() }).where(eq(pathAssessments.userId, userId));
  await track(userId, "assessment_plan_ready");
  return ok(userId);
}

/**
 * Turns the member's (possibly edited) plan into real goals and steps. Runs at
 * most once: the ready → accepting transition is a conditional update.
 */
export async function acceptPlan(userId: string, raw: unknown): Promise<AssessmentResult> {
  const accepted = sanitizeAccepted(raw);
  if (!accepted) return fail("invalid");
  const db = getDb();
  const ent = await getUserEntitlements(userId);
  const existing = await db.select({ id: growthGoals.id, status: growthGoals.status }).from(growthGoals).where(eq(growthGoals.userId, userId));
  // Goals beyond the plan's active-goal limit are kept as paused goals (never locked, activatable later).
  const slots = Math.max(0, ent.limits.activeGoals - existing.filter(g => g.status === "active").length);

  const claimed = await db.update(pathAssessments).set({ status: "accepting", updatedAt: new Date() })
    .where(and(eq(pathAssessments.userId, userId), eq(pathAssessments.status, "ready"))).returning({ userId: pathAssessments.userId });
  if (!claimed.length) return fail("busy");

  try {
    const goals = await db.insert(growthGoals)
      .values(accepted.goals.map((title, i) => ({ userId, title, details: "", source: "guided" as const, status: i < slots ? ("active" as const) : ("paused" as const) })))
      .returning({ id: growthGoals.id });
    const goalId = goals[0]?.id ?? null;
    await db.insert(growthSteps).values([
      { userId, goalId, title: accepted.firstStep, kind: "first" as const, position: 0 },
      ...accepted.nextSteps.map((title, i) => ({ userId, goalId, title, kind: "next" as const, position: i + 1 })),
    ]);
    await db.update(pathAssessments).set({ status: "accepted", acceptedAt: new Date(), updatedAt: new Date() }).where(eq(pathAssessments.userId, userId));
    await db.insert(userPrefs).values({ userId, onboarded: true }).onConflictDoUpdate({ target: userPrefs.userId, set: { onboarded: true } });
  } catch {
    await db.update(pathAssessments).set({ status: "ready", updatedAt: new Date() }).where(and(eq(pathAssessments.userId, userId), eq(pathAssessments.status, "accepting")));
    return fail("invalid");
  }
  if (existing.length === 0) await track(userId, "first_goal_created");
  await track(userId, "path_accepted");
  return ok(userId);
}

/** "Later": the member can set goals by hand and come back to the assessment from My Path. */
export async function skipAssessment(userId: string): Promise<AssessmentResult> {
  const db = getDb();
  await db.insert(pathAssessments).values({ userId, status: "skipped" }).onConflictDoNothing();
  await db.update(pathAssessments).set({ status: "skipped", updatedAt: new Date() })
    .where(and(eq(pathAssessments.userId, userId), sql`${pathAssessments.status} in ('in_progress', 'ready')`));
  await track(userId, "assessment_skipped", { context: "assessment" });
  return ok(userId);
}

export async function setStepDone(userId: string, stepId: string, done: boolean): Promise<AssessmentResult> {
  const res = await getDb().update(growthSteps).set({ status: done ? "done" : "todo", doneAt: done ? new Date() : null })
    .where(and(eq(growthSteps.id, stepId), eq(growthSteps.userId, userId))).returning({ id: growthSteps.id });
  if (!res.length) return fail("not_found");
  // Once per step, within the daily growth cap; undoing keeps what was earned.
  if (done) await grantGrowthXp(userId, "step", stepId);
  return ok(userId);
}
