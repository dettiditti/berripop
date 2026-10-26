import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "../db";
import { answers, growthGoals } from "../db/schema";
import { resolveQuestion } from "../domain/rules";
import type { ActionResult, QuestionRef, Snapshot } from "../domain/types";
import { dictionaries } from "../i18n/dictionaries";
import { isLocale, type Locale } from "../i18n/config";
import { questionText } from "../i18n/content";
import { track } from "./analytics";
import { aiConfigured, runMeteredAi } from "./ai";
import { canAccessWeeklySummary, canCreateGrowthGoal } from "./entitlements";
import { roleIn } from "./membership";
import { loadSnapshot } from "./snapshot";

/*
 * Growth goals and AI-assisted reflection. Plan limits are enforced here, on
 * the server, through the entitlement service.
 */

const fail = (error: Extract<ActionResult, { ok: false }>["error"]) => ({ ok: false as const, error });
const result = async (userId: string): Promise<ActionResult> => ({ ok: true, snapshot: await loadSnapshot(userId) });

/* ---------- Goals ---------- */

type GoalSource = "guided" | "reflection" | "custom";
const SOURCES = new Set<string>(["guided", "reflection", "custom"]);

export async function createGoal(userId: string, input: { title: string; details: string; source: string }): Promise<ActionResult> {
  const title = input.title.trim().slice(0, 120);
  const details = input.details.trim().slice(0, 2000);
  if (title.length < 3 || !SOURCES.has(input.source)) return fail("invalid");
  if (!(await canCreateGrowthGoal(userId))) {
    await track(userId, "premium_feature_requested", { context: "goals" });
    return fail("limit_goals");
  }
  const isFirst = (await getDb().select({ id: growthGoals.id }).from(growthGoals).where(eq(growthGoals.userId, userId)).limit(1)).length === 0;
  await getDb().insert(growthGoals).values({ userId, title, details, source: input.source as GoalSource });
  if (isFirst) await track(userId, "first_goal_created");
  return result(userId);
}

async function ownGoal(userId: string, goalId: string) {
  const [g] = await getDb().select().from(growthGoals).where(and(eq(growthGoals.id, goalId), eq(growthGoals.userId, userId))).limit(1);
  return g ?? null;
}

export async function updateGoal(userId: string, goalId: string, input: { title: string; details: string }): Promise<ActionResult> {
  const g = await ownGoal(userId, goalId);
  if (!g) return fail("not_found");
  const title = input.title.trim().slice(0, 120);
  if (title.length < 3) return fail("invalid");
  await getDb().update(growthGoals).set({ title, details: input.details.trim().slice(0, 2000), updatedAt: new Date() }).where(eq(growthGoals.id, goalId));
  return result(userId);
}

/** Pausing is always allowed; re-activating respects the active-goal limit. Existing goals are never locked. */
export async function setGoalStatus(userId: string, goalId: string, status: "active" | "paused"): Promise<ActionResult> {
  const g = await ownGoal(userId, goalId);
  if (!g) return fail("not_found");
  if (status === "active" && g.status !== "active" && !(await canCreateGrowthGoal(userId))) {
    await track(userId, "premium_feature_requested", { context: "goals" });
    return fail("limit_goals");
  }
  await getDb().update(growthGoals).set({ status, updatedAt: new Date() }).where(eq(growthGoals.id, goalId));
  return result(userId);
}

export async function deleteGoal(userId: string, goalId: string): Promise<ActionResult> {
  const g = await ownGoal(userId, goalId);
  if (!g) return fail("not_found");
  await getDb().delete(growthGoals).where(eq(growthGoals.id, goalId));
  return result(userId);
}

/* ---------- AI ---------- */

export { aiConfigured };

const languageName = (locale: Locale) => (locale === "hu" ? "Hungarian" : "English");

type AiError = "limit_ai" | "ai_unavailable";

/** One metered AI call on the "assist" allowance; see lib/server/ai.ts. An empty response counts as unusable. */
async function metered(userId: string, feature: string, instructions: string, prompt: string, maxOutputTokens: number): Promise<{ ok: true; text: string } | { ok: false; error: AiError }> {
  const out = await runMeteredAi(userId, "assist", { feature, instructions, prompt, maxOutputTokens, parse: text => text.trim() || null });
  if (out.ok) return { ok: true, text: out.value };
  if (out.reason === "limit") await track(userId, "ai_allowance_reached", { context: feature === "weekly_summary" ? "summary" : "ai" });
  return { ok: false, error: out.error };
}

/**
 * Suggests one gentle follow-up question. The member's own draft is sent to the
 * AI provider only because they explicitly asked; we don't store it.
 */
export async function aiFollowUp(
  userId: string,
  input: { circleId: string | null; questionRef: QuestionRef; answerText: string; locale: string },
): Promise<{ ok: true; question: string; snapshot: Snapshot } | { ok: false; error: "not_member" | "invalid" | AiError }> {
  if (input.circleId && !(await roleIn(userId, input.circleId))) return { ok: false, error: "not_member" };
  const locale: Locale = isLocale(input.locale) ? input.locale : "hu";
  const snap = await loadSnapshot(userId, input.circleId);
  const q = resolveQuestion(input.questionRef, snap.circle);
  if (!q) return { ok: false, error: "invalid" };
  const instructions = [
    `You are Berripop, a warm, playful companion in a personal growth app. Write in ${languageName(locale)}, addressing the person informally.`,
    "Suggest exactly ONE short, open, gentle follow-up question (at most 20 words) that helps them reflect a little deeper on their own words.",
    "No advice, no diagnosis, no judgement, no assumptions about how they feel. Return only the question.",
  ].join(" ");
  const answer = input.answerText.trim().slice(0, 2000);
  const prompt = `Question: ${questionText(q, dictionaries[locale])}\nTheir answer so far: ${answer || "(not written yet)"}`;
  const out = await metered(userId, "follow_up", instructions, prompt, 250);
  if (!out.ok) return out;
  return { ok: true, question: out.text.replace(/^["„“]|["”]$/g, ""), snapshot: await loadSnapshot(userId, input.circleId) };
}

/** Premium: a short summary of the member's OWN answers from the last 7 days (in this circle, or everywhere when none is given). */
export async function weeklySummary(
  userId: string,
  input: { circleId: string | null; locale: string },
): Promise<{ ok: true; summary: string; snapshot: Snapshot } | { ok: false; error: "not_member" | "premium_required" | "invalid" | AiError }> {
  if (input.circleId && !(await roleIn(userId, input.circleId))) return { ok: false, error: "not_member" };
  if (!(await canAccessWeeklySummary(userId))) {
    await track(userId, "premium_feature_requested", { context: "summary" });
    return { ok: false, error: "premium_required" };
  }
  const locale: Locale = isLocale(input.locale) ? input.locale : "hu";
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const rows = await getDb()
    .select({ ref: answers.questionRef, text: answers.text, reflection: answers.reflection })
    .from(answers)
    .where(and(eq(answers.userId, userId), input.circleId ? eq(answers.circleId, input.circleId) : undefined, gte(answers.updatedAt, since)))
    .orderBy(desc(answers.updatedAt))
    .limit(20);
  if (!rows.length) return { ok: false, error: "invalid" };
  const snap = await loadSnapshot(userId, input.circleId);
  const d = dictionaries[locale];
  const material = rows
    .map(r => {
      const q = resolveQuestion(r.ref, snap.circle);
      return `Q: ${q ? questionText(q, d) : r.ref}\nA: ${r.text}${r.reflection ? `\nMore: ${r.reflection}` : ""}`;
    })
    .join("\n\n");
  const instructions = [
    `You are Berripop, a warm companion in a personal growth app. Write in ${languageName(locale)}, addressing the person informally.`,
    "Write a short weekly reflection (at most 120 words) based only on their own answers: name recurring themes in their own words, then offer 1-2 small next steps framed as optional ideas.",
    "Never diagnose, label their personality, or claim to know how they feel. No headings.",
  ].join(" ");
  const out = await metered(userId, "weekly_summary", instructions, material, 700);
  if (!out.ok) return out;
  return { ok: true, summary: out.text, snapshot: await loadSnapshot(userId, input.circleId) };
}
