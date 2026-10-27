"use server";

import { cookies, headers } from "next/headers";
import { clerkClient, currentUser } from "@clerk/nextjs/server";
import { appOrigin } from "../billing/origin";
import { isPaidPlan, type BillingInterval, type PaidPlanId } from "../billing/plans";
import type { ActionResult, AnswerContext, QuestionRef, RewardDTO } from "../domain/types";
import { isLocale, LOCALE_COOKIE } from "../i18n/config";
import { track, trackDaily, type FunnelEvent } from "./analytics";
import type { AssessmentResult } from "../assessment/types";
import * as account from "./account";
import * as assessment from "./assessment";
import * as billing from "./billing";
import * as checkin from "./checkin";
import type { CheckinInput } from "../checkin/checkin";
import * as growth from "./growth";
import * as journal from "./journal";
import * as legal from "./legal";
import type { JournalResult } from "../journal/types";
import * as goalJourney from "./goalJourney";
import * as personal from "./personal";
import * as service from "./service";
import { requireUserId } from "./session";

/** Server actions: authenticate the caller, then delegate to the circle, growth or billing services. */

async function origin() {
  return appOrigin(process.env, await headers());
}

async function locale(): Promise<"hu" | "en"> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : "hu";
}

/* ---------- Goals, AI and billing ---------- */

export async function createGoalAction(input: { title: string; details: string; source: string }): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };
  return growth.createGoal(userId, input);
}

export async function updateGoalAction(goalId: string, input: { title: string; details: string }): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };
  return growth.updateGoal(userId, goalId, input);
}

export async function setGoalStatusAction(goalId: string, status: "active" | "paused"): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };
  return growth.setGoalStatus(userId, goalId, status === "active" ? "active" : "paused");
}

export async function deleteGoalAction(goalId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };
  return growth.deleteGoal(userId, goalId);
}

export async function aiFollowUpAction(input: { circleId: string | null; questionRef: QuestionRef; answerText: string }) {
  const userId = await requireUserId();
  if (!userId) return { ok: false as const, error: "unauthorized" as const };
  return growth.aiFollowUp(userId, { ...input, locale: await locale() });
}

export async function weeklySummaryAction(circleId: string | null) {
  const userId = await requireUserId();
  if (!userId) return { ok: false as const, error: "unauthorized" as const };
  return growth.weeklySummary(userId, { circleId, locale: await locale() });
}

export async function startCheckoutAction(interval: BillingInterval, plan: PaidPlanId = "premium") {
  const userId = await requireUserId();
  if (!userId) return { ok: false as const, error: "unauthorized" as const };
  if ((interval !== "month" && interval !== "year") || !isPaidPlan(plan)) return { ok: false as const, error: "invalid" as const };
  // No payment before the current Terms are accepted (the pricing page sits outside the in-app gate).
  if ((await legal.getLegalStatus(userId)).terms !== "granted") return { ok: false as const, error: "terms_required" as const };
  const user = await currentUser();
  return billing.createCheckoutSession(userId, plan, interval, await origin(), { email: user?.primaryEmailAddress?.emailAddress, locale: await locale() });
}

/** Premium ⇄ Premium Plus for a member who already pays (Stripe Customer Portal confirmation). */
export async function changePlanAction(plan: PaidPlanId) {
  const userId = await requireUserId();
  if (!userId) return { ok: false as const, error: "unauthorized" as const };
  if (!isPaidPlan(plan)) return { ok: false as const, error: "invalid" as const };
  return billing.createPlanChangeSession(userId, plan, await origin(), await locale());
}

/** Success page: asks Stripe (server-side) whether this user's checkout really completed. */
export async function confirmCheckoutAction(sessionId: string) {
  const userId = await requireUserId();
  if (!userId) return { state: "invalid" as const, plan: "free" as const };
  const { state, entitlements } = await billing.confirmCheckout(userId, sessionId);
  return { state, plan: entitlements.plan };
}

export async function openBillingPortalAction() {
  const userId = await requireUserId();
  if (!userId) return { ok: false as const, error: "unauthorized" as const };
  return billing.createPortalSession(userId, await origin(), await locale());
}

/** Client-side funnel events: a fixed allowlist, no free text. */
const CLIENT_EVENTS = new Set<string>([
  "pricing_viewed", "upgrade_prompt_shown", "upgrade_prompt_dismissed", "checkout_canceled", "premium_feature_requested",
  "today_step_started", "weekly_recap_viewed",
]);
export async function trackAction(event: string, context?: string): Promise<void> {
  if (!CLIENT_EVENTS.has(event)) return;
  const userId = await requireUserId();
  await track(userId, event as FunnelEvent, { context });
}

/** Once per member per local day: the base of the retention numbers (docs/analytics.md). */
export async function appOpenedAction(): Promise<void> {
  const userId = await requireUserId();
  if (userId) await trackDaily(userId, "app_opened");
}

/* ---------- Circles ---------- */

export async function getSnapshotAction(circleId?: string | null): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return service.getSnapshot(userId, circleId);
}

export async function setDisplayNameAction(name: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return service.setDisplayName(userId, name);
}

export async function createCircleAction(name: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return service.createCircle(userId, name);
}

export async function joinCircleAction(code: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return service.joinCircle(userId, code);
}

export async function switchCircleAction(circleId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return service.switchCircle(userId, circleId);
}

export async function renameCircleAction(circleId: string, name: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return service.renameCircle(userId, circleId, name);
}

export async function regenerateInviteAction(circleId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return service.regenerateInvite(userId, circleId);
}

export async function removeMemberAction(circleId: string, memberId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return service.removeMember(userId, circleId, memberId);
}

export async function leaveCircleAction(circleId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return service.leaveCircle(userId, circleId);
}

export async function createQuestionAction(circleId: string, text: string, category: string, addToCircle: boolean): Promise<ActionResult<QuestionRef>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return service.createQuestion(userId, circleId, text, category, addToCircle);
}

export async function addQuestionToCircleAction(circleId: string, ref: QuestionRef): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return service.addQuestionToCircle(userId, circleId, ref);
}

export async function toggleSavedAction(circleId: string | null, ref: QuestionRef): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return service.toggleSaved(userId, circleId, ref);
}

export async function saveAnswerAction(input: {
  circleId: string;
  questionRef: QuestionRef;
  text: string;
  reflection: string;
  reflectionPrompt: string;
  share: boolean;
  context: AnswerContext;
}): Promise<ActionResult<RewardDTO>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return service.saveAnswer(userId, input);
}

export async function shareAnswerAction(answerId: string, share: boolean): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return service.shareAnswer(userId, answerId, share);
}

export async function deleteAnswerAction(answerId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return service.deleteAnswer(userId, answerId);
}

/* ---------- Own path (with or without a circle) ---------- */

export async function savePersonalAnswerAction(input: {
  questionRef: QuestionRef;
  text: string;
  reflection: string;
  reflectionPrompt: string;
  context: AnswerContext;
}): Promise<ActionResult<RewardDTO>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return personal.savePersonalAnswer(userId, input);
}

/** Builds (or, when the goals changed, rebuilds) the member's own journey from their goals. One AI call. */
export async function buildGoalJourneyAction(): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return goalJourney.buildGoalJourney(userId, await locale());
}

export async function deletePersonalAnswerAction(answerId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return personal.deletePersonalAnswer(userId, answerId);
}

export async function addMomentAction(input: personal.MomentInput): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return personal.addMoment(userId, input);
}

export async function deleteMomentAction(momentId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return personal.deleteMoment(userId, momentId);
}

export async function saveCheckinAction(input: CheckinInput): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return checkin.saveCheckin(userId, input);
}

/** "Think it through together" on today's check-in (an AI request the member starts). */
export async function thinkTogetherAction(): Promise<ActionResult<{ safety: boolean }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return checkin.thinkTogether(userId, await locale());
}

export async function deleteCheckinAction(): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return checkin.deleteCheckin(userId);
}

/** Moves moments saved on this device to the member's account (once). */
export async function importMomentsAction(items: unknown): Promise<ActionResult<number>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return personal.importMoments(userId, items);
}

export async function toggleReactionAction(answerId: string, emoji: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return service.toggleReaction(userId, answerId, emoji);
}
export async function startPersonalPathAction(): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" } as const;
  return service.startPersonalPath(userId);
}

export async function setLocaleAction(locale: string): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  if (!userId) return { ok: false };
  return service.setLocale(userId, locale);
}

export async function previewInviteAction(code: string): Promise<{ ok: true; name: string; members: number; alreadyMember: boolean } | { ok: false; error: string }> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };
  return service.previewInvite(userId, code);
}

/* ---------- Daily journal (owner-only) ---------- */

const noUser = { ok: false, error: "unauthorized" } as const;

export async function getJournalAction(): Promise<JournalResult> {
  const userId = await requireUserId();
  if (!userId) return noUser;
  return { ok: true, state: await journal.loadJournal(userId) };
}

export async function saveJournalEntryAction(input: { id?: string | null; body: string; status: "draft" | "saved" }): Promise<JournalResult<string>> {
  const userId = await requireUserId();
  if (!userId) return noUser;
  return journal.saveEntry(userId, input);
}

export async function deleteJournalEntryAction(entryId: string): Promise<JournalResult> {
  const userId = await requireUserId();
  if (!userId) return noUser;
  return journal.deleteEntry(userId, entryId);
}

/** `useInsights` is the owner's per-request opt-in; saved insights are never sent otherwise. */
export async function reflectOnEntryAction(entryId: string, useInsights = false, mode: string = "reflect"): Promise<JournalResult<{ reflectionId: string; safety: boolean }>> {
  const userId = await requireUserId();
  if (!userId) return noUser;
  return journal.reflectOnEntry(userId, entryId, await locale(), useInsights === true, mode);
}

export async function reflectionFeedbackAction(reflectionId: string, feedback: "helpful" | "not_helpful", correction?: string): Promise<JournalResult> {
  const userId = await requireUserId();
  if (!userId) return noUser;
  return journal.reflectionFeedback(userId, reflectionId, feedback === "helpful" ? "helpful" : "not_helpful", correction);
}

export async function saveInsightAction(input: { kind: string; text: string; goalId?: string | null; sourceEntryId?: string | null; origin: "user" | "ai_suggested" }): Promise<JournalResult> {
  const userId = await requireUserId();
  if (!userId) return noUser;
  return journal.saveInsight(userId, input);
}

export async function updateInsightAction(insightId: string, text: string): Promise<JournalResult> {
  const userId = await requireUserId();
  if (!userId) return noUser;
  return journal.updateInsight(userId, insightId, text);
}

export async function deleteInsightAction(insightId: string): Promise<JournalResult> {
  const userId = await requireUserId();
  if (!userId) return noUser;
  return journal.deleteInsight(userId, insightId);
}

export async function weeklyJournalAction(useInsights = false) {
  const userId = await requireUserId();
  if (!userId) return noUser;
  return journal.weeklyJournal(userId, await locale(), useInsights === true);
}

export async function exportJournalAction() {
  const userId = await requireUserId();
  if (!userId) return null;
  return journal.exportJournal(userId);
}

export async function deleteAllJournalAction(): Promise<JournalResult> {
  const userId = await requireUserId();
  if (!userId) return noUser;
  return journal.deleteAllJournal(userId);
}

/* ---------- My Path assessment (owner-only) ---------- */

export async function getAssessmentAction(): Promise<AssessmentResult> {
  const userId = await requireUserId();
  if (!userId) return noUser;
  return { ok: true, state: await assessment.loadAssessmentState(userId) };
}

export async function startAssessmentAction(): Promise<AssessmentResult> {
  const userId = await requireUserId();
  if (!userId) return noUser;
  return assessment.startAssessment(userId);
}

export async function saveAssessmentAnswersAction(answers: unknown, step: number): Promise<AssessmentResult> {
  const userId = await requireUserId();
  if (!userId) return noUser;
  return assessment.saveAnswers(userId, answers, step);
}

export async function requestAssessmentFollowupAction(): Promise<AssessmentResult> {
  const userId = await requireUserId();
  if (!userId) return noUser;
  return assessment.requestFollowup(userId, await locale());
}

export async function answerAssessmentFollowupAction(index: number, answer: string): Promise<AssessmentResult> {
  const userId = await requireUserId();
  if (!userId) return noUser;
  return assessment.answerFollowup(userId, index, String(answer ?? ""));
}

export async function generatePathPlanAction(): Promise<AssessmentResult> {
  const userId = await requireUserId();
  if (!userId) return noUser;
  return assessment.generatePlan(userId, await locale());
}

export async function acceptPathPlanAction(plan: unknown): Promise<AssessmentResult> {
  const userId = await requireUserId();
  if (!userId) return noUser;
  return assessment.acceptPlan(userId, plan);
}

export async function skipAssessmentAction(): Promise<AssessmentResult> {
  const userId = await requireUserId();
  if (!userId) return noUser;
  return assessment.skipAssessment(userId);
}

export async function setPathStepDoneAction(stepId: string, done: boolean): Promise<AssessmentResult> {
  const userId = await requireUserId();
  if (!userId) return noUser;
  return assessment.setStepDone(userId, stepId, done === true);
}

/* ---------- Terms acceptance and AI consent ---------- */

export async function getLegalStatusAction(): Promise<legal.LegalStatus | null> {
  const userId = await requireUserId();
  if (!userId) return null;
  return legal.getLegalStatus(userId);
}

/** The client sends the Terms version it showed; a stale one is refused. */
export async function acceptTermsAction(version: string) {
  const userId = await requireUserId();
  if (!userId) return { ok: false as const, error: "unauthorized" as const };
  return legal.acceptTerms(userId, String(version));
}

export async function setAiConsentAction(granted: boolean, version: string) {
  const userId = await requireUserId();
  if (!userId) return { ok: false as const, error: "unauthorized" as const };
  return legal.setAiConsent(userId, granted === true, String(version));
}

/* ---------- Account: export and deletion ---------- */

export async function exportAccountAction() {
  const userId = await requireUserId();
  if (!userId) return null;
  return account.exportAccount(userId);
}

/**
 * Deletes the signed-in member's data, then their Clerk login. The confirmation
 * word and the subscription rule are checked on the server.
 */
export async function deleteAccountAction(confirmation: string): Promise<{ ok: true; loginDeleted: boolean } | { ok: false; error: account.DeleteError }> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };
  const r = await account.deleteAccountData(userId, confirmation);
  if (!r.ok) return r;
  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
    return { ok: true, loginDeleted: true };
  } catch {
    // Data is gone; the login could not be removed. Signing in again would start an empty account.
    return { ok: true, loginDeleted: false };
  }
}
