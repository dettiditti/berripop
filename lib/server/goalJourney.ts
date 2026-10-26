import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { goalJourneys, pathAssessments, userActivity } from "../db/schema";
import { AREA_EN, sanitizeAnswers, TIME_EN } from "../assessment/model";
import type { ActionResult } from "../domain/types";
import { isLocale } from "../i18n/config";
import { describeGoals, GOAL_JOURNEY_DAYS, goalJourneyInstructions, goalsKey, parseGoalJourney, type GoalJourneyWeek } from "../journey/goal";
import { runMeteredAi } from "./ai";
import { track } from "./analytics";
import { activeGoalJourney, activeGoalTitles, goalDone } from "./progress";
import { loadSnapshot } from "./snapshot";

/*
 * Builds the member's own 21-day journey from their goals with one AI call on
 * the "assessment" allowance. Only goal titles and details and the area and
 * time they chose in the assessment are sent; never journal entries or answers.
 * A rebuild is only possible when the goals changed since the last build, or
 * as the next chapter once every day of the current journey is done.
 */

const activityOf = (userId: string) =>
  getDb().select({ kind: userActivity.kind, key: userActivity.key, date: userActivity.date }).from(userActivity)
    .where(and(eq(userActivity.userId, userId), eq(userActivity.kind, "goal")));

const fail = (error: Extract<ActionResult, { ok: false }>["error"]) => ({ ok: false as const, error });

export async function buildGoalJourney(userId: string, localeInput: string): Promise<ActionResult> {
  const locale = isLocale(localeInput) ? localeInput : "hu";
  const goals = await activeGoalTitles(userId);
  if (!goals.length) return fail("invalid");
  const current = await activeGoalJourney(userId);
  const finished = !!current && Object.keys(goalDone(current.id, await activityOf(userId))).length >= GOAL_JOURNEY_DAYS;
  // Nothing new to build from: keep the journey (and its progress) as it is.
  if (current && !finished && goalsKey(current.goals) === goalsKey(goals.map(g => g.title))) return fail("invalid");

  const [assessment] = await getDb().select({ answers: pathAssessments.answers }).from(pathAssessments).where(eq(pathAssessments.userId, userId)).limit(1);
  const a = assessment ? sanitizeAnswers(assessment.answers) : {};
  const out = await runMeteredAi(userId, "assessment", {
    feature: "goal_journey",
    instructions: goalJourneyInstructions(locale),
    prompt: describeGoals({
      goals, area: a.area ? AREA_EN[a.area] : undefined, time: a.time ? TIME_EN[a.time] : undefined,
      previousWeeks: finished ? (current.weeks as GoalJourneyWeek[]).map(w => w.theme) : undefined,
    }),
    maxOutputTokens: 6000,
    parse: parseGoalJourney,
  });
  if (!out.ok) return fail(out.error);

  const db = getDb();
  await db.update(goalJourneys).set({ archivedAt: new Date() }).where(and(eq(goalJourneys.userId, userId), isNull(goalJourneys.archivedAt)));
  // A parallel build may have just inserted one: the active-journey index keeps exactly one.
  await db.insert(goalJourneys).values({ userId, goals: goals.map(g => g.title), weeks: out.value.weeks, days: out.value.days, locale }).onConflictDoNothing();
  await track(userId, current ? "goal_journey_rebuilt" : "goal_journey_built", { context: finished ? "journey" : undefined });
  return { ok: true, snapshot: await loadSnapshot(userId) };
}
