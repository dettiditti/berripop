/**
 * End-to-end check of the goal-based journey against the real database, with
 * a fake AI generator. Uses temporary users and deletes everything it created.
 *
 *   npm run verify:goal-journey
 */
import "./db-guard";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../lib/db";
import { aiCalls, circles, funnelEvents, goalJourneys, growthGoals, userActivity, users } from "../lib/db/schema";
import { XP_RULES } from "../lib/content";
import { goalRef } from "../lib/journey/goal";
import type { GenerateFn } from "../lib/ai/run";
import { setAiGeneratorForTesting } from "../lib/server/ai";
import { buildGoalJourney } from "../lib/server/goalJourney";
import * as personal from "../lib/server/personal";
import * as svc from "../lib/server/service";
import type { ActionResult, Snapshot } from "../lib/domain/types";

let failures = 0;
function check(label: string, ok: boolean) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures++;
}
function snap<T>(r: ActionResult<T>): Snapshot {
  if (!r.ok) throw new Error(`action failed: ${r.error}`);
  return r.snapshot;
}

const stamp = Date.now();
const A = `test_ga_${stamp}`, B = `test_gb_${stamp}`;
const SECRET = `goal-answer-${stamp}`;
let calls = 0;
let broken = false;
const content = JSON.stringify({
  weeks: [1, 2, 3].map(w => ({ theme: `Hét ${w}`, tagline: "Kis lépések." })),
  days: Array.from({ length: 21 }, (_, i) => ({ title: `Nap ${i + 1}`, prompt: `Mi segítene ma a célodban? (${i + 1})`, theme: "grow", followups: ["Miért fontos?"] })),
});
let lastRequest = "";
const fake: GenerateFn = async request => {
  calls++;
  lastRequest = JSON.stringify(request);
  return { text: broken ? "{ not json" : content, usage: { inputTokens: 400, outputTokens: 2000 } };
};
const yesterday = (today: string) => new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const save = (user: string, ref: string, day: number, text = SECRET) =>
  personal.savePersonalAnswer(user, { questionRef: ref, text, reflection: "", reflectionPrompt: "", context: { kind: "goal", day } });

async function main() {
  const db = getDb();
  setAiGeneratorForTesting(fake);
  await db.insert(users).values([{ id: A, displayName: "Anna" }, { id: B, displayName: "Bence" }]);
  let circleId = "";
  try {
    const none = await buildGoalJourney(A, "hu");
    check("without goals there is nothing to build from", !none.ok && none.error === "invalid" && calls === 0);
    const start = snap(await svc.getSnapshot(A));
    check("…the built-in journey stays, and the app offers no build", start.progress.goalJourney === null && !start.progress.canBuildJourney);

    await db.insert(growthGoals).values([{ userId: A, title: "Bátrabban megszólalni", details: "a megbeszéléseken", source: "custom" }]);
    check("with a goal the app offers to build one", snap(await svc.getSnapshot(A)).progress.canBuildJourney);

    broken = true;
    const bad = await buildGoalJourney(A, "hu");
    check("malformed AI output is refused and nothing is stored", !bad.ok && (await db.select().from(goalJourneys).where(eq(goalJourneys.userId, A))).length === 0);
    broken = false;

    const built = await buildGoalJourney(A, "hu");
    const gj = built.ok ? built.snapshot.progress.goalJourney : null;
    check("one AI call builds a 21-day journey from the goals", !!gj && gj.days.length === 21 && gj.weeks.length === 3 && gj.goals[0] === "Bátrabban megszólalni" && !gj.outdated);
    const again = await buildGoalJourney(A, "hu");
    check("rebuilding with unchanged goals is refused (no extra AI use)", !again.ok && again.error === "invalid" && calls === 2);
    const logged = await db.select().from(aiCalls).where(eq(aiCalls.userId, A));
    check("the AI call is logged as goal_journey", logged.some(r => r.feature === "goal_journey"));

    const id = gj!.id;
    const d1 = await save(A, goalRef(id, 1), 1);
    check("goal day 1 can be answered, with daily XP", d1.ok && d1.data!.context === "goal" && d1.data!.xpItems.some(x => x.reason === "daily" && x.amount === XP_RULES.daily));
    check("…and is marked done on the goal journey only", d1.ok && !!snap(d1).progress.goalJourney?.done[1] && !snap(d1).progress.journey[1]);
    const re = await save(A, goalRef(id, 1), 1, SECRET + " edited");
    check("re-saving grants no duplicate XP", re.ok && !re.data!.xpItems.some(x => x.reason === "daily"));
    const d2 = await save(A, goalRef(id, 2), 2);
    check("one new goal stop per day (day 2 is for tomorrow)", !d2.ok && d2.error === "locked");
    const wrongCtx = await personal.savePersonalAnswer(A, { questionRef: goalRef(id, 3), text: "x y", reflection: "", reflectionPrompt: "", context: { kind: "goal", day: 1 } });
    check("a goal ref answered as another day is refused", !wrongCtx.ok && wrongCtx.error === "invalid");
    const asJourney = await personal.savePersonalAnswer(A, { questionRef: goalRef(id, 1), text: "x y", reflection: "", reflectionPrompt: "", context: { kind: "journey", day: 1 } });
    check("a goal ref answered as a built-in journey day is refused", !asJourney.ok && asJourney.error === "invalid");
    const builtinAsGoal = await personal.savePersonalAnswer(A, { questionRef: "j01", text: "x y", reflection: "", reflectionPrompt: "", context: { kind: "goal", day: 1 } });
    check("a built-in question answered as a goal day is refused", !builtinAsGoal.ok && builtinAsGoal.error === "invalid");
    const otherUser = await save(B, goalRef(id, 1), 1);
    check("another member cannot answer this member's journey", !otherUser.ok && otherUser.error === "not_found");

    // Days 1-6 done before today: the weekly challenge (day 7) opens.
    const today = snap(d1).progress.today;
    await db.delete(userActivity).where(eq(userActivity.userId, A));
    await db.insert(userActivity).values([1, 2, 3, 4, 5, 6].map(day => ({ userId: A, kind: "goal" as const, key: `${id}:${day}`, questionRef: goalRef(id, day), date: yesterday(today) })));
    const d7 = await save(A, goalRef(id, 7), 7);
    check("the day-7 challenge gives the weekly bonus and completes week 1", d7.ok && d7.data!.weekCompleted === 1 && d7.data!.xpItems.some(x => x.reason === "weekly" && x.amount === XP_RULES.weekly));
    check("…and the built-in journey is untouched", d7.ok && Object.keys(snap(d7).progress.journey).length === 0);

    // Circles walk the built-in journey; a goal context there is refused.
    circleId = snap(await svc.createCircle(A, "Cél teszt")).circle!.id;
    const inCircle = await svc.saveAnswer(A, { circleId, questionRef: goalRef(id, 8), text: "x y", reflection: "", reflectionPrompt: "", share: false, context: { kind: "goal", day: 8 } });
    check("a circle answer with a goal context is refused", !inCircle.ok && inCircle.error === "invalid");
    const personalInCircle = await save(A, goalRef(id, 8), 8);
    check("…while the member's own save still takes goal days in a circle (day 8 is for tomorrow)", !personalInCircle.ok && personalInCircle.error === "locked");
    const withCircle = snap(await svc.getSnapshot(A));
    check("the goal journey is still there with a circle", withCircle.progress.goalJourney?.id === id && !!withCircle.circle);

    // Changed goals: the journey is outdated and can be rebuilt (progress starts again, XP stays).
    const xpBefore = withCircle.progress.xp.total;
    await db.insert(growthGoals).values([{ userId: A, title: "Felkészülni előre", details: "", source: "custom" }]);
    const outdated = snap(await svc.getSnapshot(A)).progress.goalJourney;
    check("adding a goal marks the journey outdated", !!outdated?.outdated);
    const rebuilt = await buildGoalJourney(A, "en");
    const next = rebuilt.ok ? rebuilt.snapshot.progress.goalJourney : null;
    check("rebuilding makes a new journey from day 1", !!next && next.id !== id && Object.keys(next.done).length === 0 && !next.outdated && next.goals.length === 2);
    check("…earned XP stays", rebuilt.ok && rebuilt.snapshot.progress.xp.total === xpBefore);
    const rows = await db.select().from(goalJourneys).where(eq(goalJourneys.userId, A));
    check("the old journey is archived; exactly one is active", rows.length === 2 && rows.filter(r => !r.archivedAt).length === 1);
    const oldRef = await personal.savePersonalAnswer(A, { questionRef: goalRef(id, 8), text: "x y", reflection: "", reflectionPrompt: "", context: { kind: "goal", day: 8 } });
    check("an archived journey can no longer be answered", !oldRef.ok && oldRef.error === "not_found");
    // A finished journey can continue as a next chapter, even with unchanged goals.
    const callsBefore = calls;
    const notYet = await buildGoalJourney(A, "hu");
    check("an unfinished journey with unchanged goals is not rebuilt", !notYet.ok && calls === callsBefore);
    await db.insert(userActivity).values(Array.from({ length: 21 }, (_, i) => ({ userId: A, kind: "goal" as const, key: `${next!.id}:${i + 1}`, questionRef: goalRef(next!.id, i + 1), date: yesterday(today) })));
    const chapter2 = await buildGoalJourney(A, "hu");
    const c2 = chapter2.ok ? chapter2.snapshot.progress.goalJourney : null;
    check("after all 21 days, the next chapter is built", !!c2 && c2.id !== next!.id && Object.keys(c2.done).length === 0);
    check("…from the finished chapter's week themes (no answers sent)", lastRequest.includes("NEXT chapter") && lastRequest.includes("Hét 1") && !lastRequest.includes(SECRET));
    check("no user text went to the AI log", !JSON.stringify(await db.select().from(aiCalls).where(eq(aiCalls.userId, A))).includes(SECRET));
  } finally {
    setAiGeneratorForTesting(null);
    if (circleId) await db.delete(circles).where(eq(circles.id, circleId));
    await db.delete(funnelEvents).where(inArray(funnelEvents.userId, [A, B]));
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
