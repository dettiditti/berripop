/**
 * Database checks for the My Path assessment with a FAKE AI generator (no real
 * AI request): saving and resuming, AI failure, caps, duplicate submissions,
 * ownership and the goals/steps created on accept. Temporary users; cleans up.
 *
 *   npm run verify:assessment   (requires migration 0004_my_path)
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../lib/db";
import { aiCalls, growthGoals, growthSteps, pathAssessments, users } from "../lib/db/schema";
import { MAX_AI_CALLS } from "../lib/assessment/model";
import type { GenerateFn } from "../lib/ai/run";
import * as as from "../lib/server/assessment";
import { setAiGeneratorForTesting } from "../lib/server/ai";
import { getAiUsage } from "../lib/server/entitlements";

let failures = 0;
function check(label: string, ok: boolean) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures++;
}

const stamp = Date.now();
const A = `test_as_a_${stamp}`, B = `test_as_b_${stamp}`;
const SECRET = `assessment-secret-${stamp}`;
let mode: "ok" | "error" | "slow" = "ok";
let calls = 0;

const plan = {
  summary: "Szeretnél bátrabban megszólalni a megbeszéléseken.",
  goals: [{ title: "Megszólalni a megbeszéléseken", why: "Hogy hallják a hangod." }, { title: "Felkészülni előre", why: "Biztonságot ad." }],
  firstStep: { title: "Írj fel egy mondatot a holnapi megbeszélésre.", minutes: 5 },
  nextSteps: [{ title: "Egy kérdés a héten" }, { title: "Egy vélemény a héten" }, { title: "Visszanézni a hetet" }],
  weeklyRhythm: "Hétköznap reggel 5 perc.",
};
const fake: GenerateFn = async req => {
  calls++;
  if (mode === "error") throw Object.assign(new Error("upstream"), { name: "AI_APICallError", statusCode: 500, isRetryable: false });
  if (mode === "slow") await new Promise(r => setTimeout(r, 400));
  const usage = { inputTokens: 500, outputTokens: 120 };
  return req.instructions.includes('"question"') ? { text: JSON.stringify({ question: `Mikor a legnehezebb? (${calls})` }), usage } : { text: JSON.stringify(plan), usage };
};

const answers = { area: "confidence", situation: `${SECRET} A megbeszéléseken hallgatok.`, outcome: "Merjek szólni", obstacles: ["fear"], time: "daily5", support: ["exercises"] };

async function main() {
  const db = getDb();
  setAiGeneratorForTesting(fake);
  await db.insert(users).values([{ id: A, displayName: "Anna" }, { id: B, displayName: "Bence" }]);
  try {
    // Start and resume
    check("starting is idempotent", (await as.startAssessment(A)).ok && (await as.startAssessment(A)).ok);
    const half = await as.saveAnswers(A, { area: "confidence", situation: "röviden de elég hosszan", evil: "x" }, 2);
    check("answers are saved with the step, unknown fields dropped", half.ok && half.state.assessment?.step === 2 && !("evil" in (half.state.assessment?.answers ?? {})));
    check("an abandoned assessment resumes where it was left", (await as.loadAssessmentState(A)).assessment?.step === 2);
    check("another user sees nothing of it", (await as.loadAssessmentState(B)).assessment === null);
    check("follow-ups need the base questions first", !(await as.requestFollowup(A, "hu")).ok);
    await as.saveAnswers(A, answers, 6);

    // AI failure keeps answers and gives the calls back
    mode = "error";
    const failed = await as.requestFollowup(A, "hu");
    const afterFail = await as.loadAssessmentState(A);
    check("AI error: clear error, answers kept", !failed.ok && failed.error === "ai_unavailable" && afterFail.assessment?.answers.outcome === "Merjek szólni");
    check("AI error: the assessment's AI call is given back", afterFail.assessment?.aiCallsLeft === MAX_AI_CALLS);
    check("AI error: the weekly assessment allowance is given back", (await getAiUsage(A, new Date(), "assessment")).used === 0);

    // Follow-ups: at most 2
    mode = "ok";
    const f1 = await as.requestFollowup(A, "hu");
    check("an adaptive follow-up question is added", f1.ok && f1.state.assessment?.followups.length === 1);
    await as.answerFollowup(A, 0, "Főnök előtt");
    const f2 = await as.requestFollowup(A, "hu");
    const f3 = await as.requestFollowup(A, "hu");
    check("at most two follow-up questions", f2.ok && !f3.ok && (await as.loadAssessmentState(A)).assessment?.followups.length === 2);
    check("another user can't answer the follow-ups", !(await as.answerFollowup(B, 0, "hijack")).ok);

    // Plan: duplicate submissions run one generation
    mode = "slow";
    const before = calls;
    const [p1, p2] = await Promise.all([as.generatePlan(A, "hu"), as.generatePlan(A, "hu")]);
    check("two parallel plan requests: one succeeds, one is told it's busy", [p1, p2].filter(r => r.ok).length === 1 && [p1, p2].some(r => !r.ok && r.error === "busy"));
    check("…and only one AI call is made", calls - before === 1);
    mode = "ok";
    const ready = await as.loadAssessmentState(A);
    check("the plan is stored and ready", ready.assessment?.status === "ready" && ready.assessment.plan?.goals.length === 2);
    check("the per-assessment AI cap is reached (2 follow-ups + 1 plan + 1 left)", ready.assessment?.aiCallsLeft === MAX_AI_CALLS - 3);

    // Accept: real goals and steps, exactly once
    const edited = { goals: ["Megszólalni a megbeszéléseken", "Felkészülni előre"], firstStep: "Írj fel egy mondatot.", nextSteps: ["Egy kérdés a héten", "Egy vélemény a héten"] };
    const [a1, a2] = await Promise.all([as.acceptPlan(A, edited), as.acceptPlan(A, edited)]);
    check("two parallel accepts: exactly one succeeds", [a1, a2].filter(r => r.ok).length === 1);
    const goals = await db.select().from(growthGoals).where(eq(growthGoals.userId, A));
    const steps = await db.select().from(growthSteps).where(eq(growthSteps.userId, A));
    check("accepted goals are created once (Free: 1 active, the other paused)", goals.length === 2 && goals.filter(g => g.status === "active").length === 1);
    check("first step + next steps are created once, linked to a goal", steps.length === 3 && steps.every(s => !!s.goalId) && steps.some(s => s.kind === "first"));
    check("the assessment is accepted and won't start again", (await as.loadAssessmentState(A)).assessment?.status === "accepted" && !(await as.generatePlan(A, "hu")).ok);

    // Steps: owner-only
    const stepId = steps[0].id;
    check("another user can't tick the owner's step", !(await as.setStepDone(B, stepId, true)).ok);
    const ticked = await as.setStepDone(A, stepId, true);
    check("the owner can tick a step", ticked.ok && ticked.state.steps.find(s => s.id === stepId)?.done === true);

    // Skip and resume
    await as.skipAssessment(B);
    check("skipping stores the choice", (await as.loadAssessmentState(B)).assessment?.status === "skipped");
    check("a skipped assessment can be resumed", (await as.startAssessment(B)).ok && (await as.loadAssessmentState(B)).assessment?.status === "in_progress");
    // Skipped at the follow-up step, then continued without a restart (the wizard resumes where it was)
    await as.saveAnswers(B, answers, 6);
    await as.skipAssessment(B);
    mode = "ok";
    const resumed = await as.requestFollowup(B, "hu");
    check("a follow-up on a skipped assessment resumes it instead of saying busy", resumed.ok && resumed.state.assessment?.status === "in_progress" && resumed.state.assessment.followups.length === 1);
    await as.skipAssessment(B);
    const planned = await as.generatePlan(B, "hu");
    check("a plan request on a skipped assessment resumes it", planned.ok && planned.state.assessment?.status === "ready");

    // Logging and privacy
    const logged = await db.select().from(aiCalls).where(eq(aiCalls.userId, A));
    check("AI calls are logged with cost and no user text", logged.length >= 4 && logged.every(r => r.feature.startsWith("assessment_")) && !JSON.stringify(logged).includes(SECRET));
  } finally {
    setAiGeneratorForTesting(null);
    await db.delete(pathAssessments).where(inArray(pathAssessments.userId, [A, B]));
    await db.delete(users).where(inArray(users.id, [A, B]));
    console.log("cleaned up test data");
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
