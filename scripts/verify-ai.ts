/**
 * Regression checks for the four AI features running through the shared
 * wrapper (lib/server/ai.ts), with a FAKE generator: no real AI request is
 * made. Checks response formats, allowance use and refunds, and that cost
 * logging stores no user text. Temporary users; cleans up.
 *
 *   npm run verify:ai
 */
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../lib/db";
import { aiCalls, circles, subscriptions, users } from "../lib/db/schema";
import { PLAN_LIMITS } from "../lib/billing/plans";
import type { GenerateFn, GenerateRequest } from "../lib/ai/run";
import { defaultAiModel, setAiGeneratorForTesting } from "../lib/server/ai";
import { estimateCostMicroUsd } from "../lib/ai/prices";
import { getAiUsage } from "../lib/server/entitlements";
import * as growth from "../lib/server/growth";
import * as journal from "../lib/server/journal";
import * as svc from "../lib/server/service";

let failures = 0;
function check(label: string, ok: boolean) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures++;
}

const stamp = Date.now();
const P = `test_aip_${stamp}`;
const SECRET = `ai-secret-${stamp}`;
const usage = { inputTokens: 1000, outputTokens: 200 };
/** Expected estimate for the fake usage with the configured model, from the versioned price list. */
const expectedCost = () => estimateCostMicroUsd(defaultAiModel(), { inputTokens: 1000, outputTokens: 200, cacheReadTokens: null, cacheWriteTokens: null });

/** Answers by feature, inferred from the request; `mode` switches in failures. */
let mode: "ok" | "parse" | "error" = "ok";
const seen: GenerateRequest[] = [];
const fake: GenerateFn = async req => {
  seen.push(req);
  if (mode === "error") throw Object.assign(new Error(`upstream echoed ${SECRET}`), { name: "AI_APICallError", statusCode: 500, isRetryable: false });
  if (mode === "parse") return { text: "this is not json", usage };
  if (req.maxOutputTokens === 250) return { text: "„Mi segített ebben a legjobban?”", usage };
  if (req.maxOutputTokens === 700) return { text: "  Ezen a héten a bátorság volt a fő téma.  ", usage };
  if (req.maxOutputTokens === 1000) return { text: JSON.stringify({ noticed: "Segítséget kértél.", strength: "Kezdeményeztél.", explore: "Mi könnyítette meg?", nextStep: null, suggestion: null }), usage };
  return { text: JSON.stringify({ youSaid: ["Segítséget kértél."], maybe: [], questions: ["Mi segített?"], proposals: [] }), usage };
};

async function lastCall(feature: string) {
  const rows = await getDb().select().from(aiCalls).where(eq(aiCalls.userId, P)).orderBy(desc(aiCalls.createdAt));
  return rows.find(r => r.feature === feature);
}

async function main() {
  const db = getDb();
  const limitsBefore = JSON.stringify(PLAN_LIMITS);
  setAiGeneratorForTesting(fake);
  await db.insert(users).values({ id: P, displayName: "Petra" });
  await db.insert(subscriptions).values({ userId: P, stripeCustomerId: `cus_test_${P}`, status: "active", planId: "premium", interval: "month" });
  let circleId = "";
  try {
    const c = await svc.createCircle(P, "AI test");
    if (!c.ok || !c.snapshot.circle) throw new Error("circle setup failed");
    circleId = c.snapshot.circle.id;
    const ref = c.snapshot.circle.daily.questionRef;
    await svc.saveAnswer(P, { circleId, questionRef: ref, text: `${SECRET} I spoke up in the meeting.`, reflection: "", reflectionPrompt: "", share: false, context: { kind: "daily" } });

    // 1. Follow-up question (assist)
    const fu = await growth.aiFollowUp(P, { circleId, questionRef: ref, answerText: `${SECRET} draft`, locale: "hu" });
    check("follow-up: returns the question with quotes stripped", fu.ok && fu.question === "Mi segített ebben a legjobban?");
    const fuRow = await lastCall("follow_up");
    check("follow-up: logged with model, provider tokens, cost and status", fuRow?.status === "ok" && fuRow.inputTokens === 1000 && fuRow.outputTokens === 200 && fuRow.costMicroUsd === expectedCost() && fuRow.costMicroUsd !== null && fuRow.attempts === 1 && !!fuRow.priceVersion);
    check("follow-up: uses the configured model and its token cap", seen.at(-1)?.model === (process.env.AI_GATEWAY_MODEL || "openai/gpt-5-mini") && seen.at(-1)?.maxOutputTokens === 250);

    // 2. Circle weekly summary (assist, Premium)
    const ws = await growth.weeklySummary(P, { circleId, locale: "hu" });
    check("weekly summary: returns trimmed text", ws.ok && ws.summary === "Ezen a héten a bátorság volt a fő téma.");
    check("weekly summary: logged", (await lastCall("weekly_summary"))?.status === "ok");
    check("assist allowance: 2 used after 2 successful calls", (await getAiUsage(P)).used === 2);

    // 3. Journal reflection (journal)
    const entry = await journal.saveEntry(P, { body: `${SECRET} Today I asked for help.`, status: "saved" });
    const entryId = entry.ok ? entry.data! : "";
    const rf = await journal.reflectOnEntry(P, entryId, "hu");
    check("reflection: stored with the parsed fields", rf.ok && rf.state.reflections[0]?.noticed === "Segítséget kértél." && rf.state.reflections[0]?.explore === "Mi könnyítette meg?");
    check("reflection: logged", (await lastCall("journal_reflection"))?.status === "ok");

    // 4. Weekly journal (journal, Premium)
    const wj = await journal.weeklyJournal(P, "hu");
    check("weekly journal: returns the parsed structure", wj.ok && wj.weekly.youSaid[0] === "Segítséget kértél." && wj.weekly.questions.length === 1);
    check("journal allowance: 2 used after 2 successful calls", (await getAiUsage(P, new Date(), "journal")).used === 2);

    // Parse failure: refunded once, cost of spent tokens recorded, no second (paid) attempt
    mode = "parse";
    const callsBefore = seen.length;
    const bad = await journal.reflectOnEntry(P, entryId, "hu");
    check("parse failure: clear error to the user", !bad.ok && bad.error === "ai_unavailable");
    check("parse failure: no automatic paid retry", seen.length === callsBefore + 1);
    check("parse failure: allowance given back exactly once", (await getAiUsage(P, new Date(), "journal")).used === 2);
    const pf = await lastCall("journal_reflection");
    check("parse failure: logged as parse_failed with spent tokens and cost", pf?.status === "parse_failed" && pf.costMicroUsd === expectedCost() && pf.costMicroUsd !== null);

    // API error: refunded once, tokens unknown
    mode = "error";
    const err = await growth.aiFollowUp(P, { circleId, questionRef: ref, answerText: "x", locale: "hu" });
    check("API error: clear error to the user", !err.ok && err.error === "ai_unavailable");
    check("API error: allowance given back exactly once", (await getAiUsage(P)).used === 2);
    const er = await lastCall("follow_up");
    check("API error: logged as error, tokens and cost unknown (null)", er?.status === "error" && er.errorKind === "http_500" && er.inputTokens === null && er.costMicroUsd === null);

    // Privacy and unchanged rules
    const rows = await db.select().from(aiCalls).where(eq(aiCalls.userId, P));
    check("cost log never contains user text, prompts or responses", rows.length === 6 && !JSON.stringify(rows).includes(SECRET) && !JSON.stringify(rows).includes("Segítséget"));
    check("plan limits unchanged", JSON.stringify(PLAN_LIMITS) === limitsBefore);
  } finally {
    setAiGeneratorForTesting(null);
    if (circleId) await db.delete(circles).where(eq(circles.id, circleId));
    await db.delete(users).where(inArray(users.id, [P]));
    console.log("cleaned up test data");
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
