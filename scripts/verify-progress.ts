/**
 * End-to-end check of personal progress (with and without a circle) against
 * the real database. Uses temporary users and deletes everything it created.
 *
 *   npm run verify:progress
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../lib/db";
import { circles, growthSteps, userActivity, users } from "../lib/db/schema";
import { journeyNodes, XP_RULES } from "../lib/content";
import * as svc from "../lib/server/service";
import * as personal from "../lib/server/personal";
import { setStepDone } from "../lib/server/assessment";
import { saveEntry } from "../lib/server/journal";
import { exportAccount } from "../lib/server/account";
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
const P = `test_p_${stamp}`, Q = `test_q_${stamp}`, A = `test_ca_${stamp}`, B = `test_cb_${stamp}`, R = `test_r_${stamp}`;
const SECRET = `private-own-path-${stamp}`;
const NOTE = `private-moment-${stamp}`;
const day = (d: number) => journeyNodes.find(n => n.day === d)!.questionId;

async function main() {
  const db = getDb();
  await db.insert(users).values([{ id: P, displayName: "Petra" }, { id: Q, displayName: "Qendrim" }, { id: A, displayName: "Anna" }, { id: B, displayName: "Bence" }, { id: R, displayName: "Réka" }]);
  let circleId = "";
  try {
    /* ---------- Own path, no circle ---------- */
    const start = snap(await svc.startPersonalPath(P));
    const daily = start.progress.dailyQuestion;
    check("a member without a circle gets their own daily question", !!daily && !daily.done);
    check("…the same one on every load", snap(await svc.getSnapshot(P)).progress.dailyQuestion?.questionRef === daily?.questionRef);

    const r1 = await personal.savePersonalAnswer(P, { questionRef: daily!.questionRef, text: SECRET, reflection: "", reflectionPrompt: "", context: { kind: "daily" } });
    check("answering it gives daily XP and a new-topic bonus", r1.ok && r1.data!.xpItems.map(x => x.reason).sort().join() === "daily,new-topic");
    check("…and the first badge, on the member's own profile", r1.ok && r1.data!.newAchievements.includes("first-tiny-step"));
    const s1 = snap(r1);
    check("the daily question is marked done; XP total and level data are there", s1.progress.dailyQuestion?.done === true && s1.progress.xp.total === XP_RULES.daily + XP_RULES.newTopic);
    const again = await personal.savePersonalAnswer(P, { questionRef: daily!.questionRef, text: SECRET + " edited", reflection: "", reflectionPrompt: "", context: { kind: "daily" } });
    check("re-saving grants no duplicate XP", again.ok && again.data!.xpItems.length === 0 && snap(again).progress.answers.length === 1);

    const j1 = await personal.savePersonalAnswer(P, { questionRef: day(1), text: "Day one on my own", reflection: "A thought", reflectionPrompt: "Why?", context: { kind: "journey", day: 1 } });
    check("journey day 1 works without a circle", j1.ok && snap(j1).progress.journey[1] === snap(j1).progress.today);
    check("…with reflection XP", j1.ok && j1.data!.xpItems.some(x => x.reason === "reflection"));
    const j2 = await personal.savePersonalAnswer(P, { questionRef: day(2), text: "Too early", reflection: "", reflectionPrompt: "", context: { kind: "journey", day: 2 } });
    check("one new journey stop per day (day 2 is for tomorrow)", !j2.ok && j2.error === "locked");
    const wrong = await personal.savePersonalAnswer(P, { questionRef: day(3), text: "Wrong day", reflection: "", reflectionPrompt: "", context: { kind: "journey", day: 1 } });
    check("a question that isn't that day's is refused", !wrong.ok && wrong.error === "invalid");
    const custom = await personal.savePersonalAnswer(P, { questionRef: "c:00000000-0000-0000-0000-000000000000", text: "hello", reflection: "", reflectionPrompt: "", context: { kind: "bonus" } });
    check("unknown questions are refused", !custom.ok && custom.error === "not_found");
    check("streak counts today", snap(j1).progress.activeDates.includes(snap(j1).progress.today));

    const qView = snap(await svc.getSnapshot(Q));
    check("another member never receives this member's own-path answers", !JSON.stringify(qView).includes(SECRET) && qView.progress.answers.length === 0);
    const delOther = await personal.deletePersonalAnswer(Q, s1.progress.answers[0].id);
    check("another member cannot delete them", !delOther.ok);
    const xpBeforeDelete = snap(await svc.getSnapshot(P)).progress.xp.total;
    const del = await personal.deletePersonalAnswer(P, s1.progress.answers[0].id);
    check("deleting an answer removes the text but keeps XP", del.ok && snap(del).progress.xp.total === xpBeforeDelete && !JSON.stringify(snap(del)).includes(SECRET));

    /* ---------- Steps and journal: modest XP with a daily cap ---------- */
    const stepRows = await db.insert(growthSteps).values([0, 1, 2, 3].map(i => ({ userId: Q, title: `Step ${i}`, kind: "next" as const, position: i }))).returning({ id: growthSteps.id });
    const xpOf = async (u: string) => snap(await svc.getSnapshot(u)).progress.xp;
    await setStepDone(Q, stepRows[0].id, true);
    check("a finished step gives a little XP", (await xpOf(Q)).total === XP_RULES.step);
    await setStepDone(Q, stepRows[0].id, false);
    await setStepDone(Q, stepRows[0].id, true);
    check("undoing and redoing a step gives nothing more", (await xpOf(Q)).total === XP_RULES.step);
    const draft = await saveEntry(Q, { body: "a draft", status: "draft" });
    check("a journal draft gives no XP", draft.ok && (await xpOf(Q)).total === XP_RULES.step);
    const saved = await saveEntry(Q, { id: draft.ok ? draft.data : null, body: "saved now", status: "saved" });
    check("saving a journal entry gives a little XP", saved.ok && (await xpOf(Q)).total === XP_RULES.step + XP_RULES.journal);
    await saveEntry(Q, { id: saved.ok ? saved.data : null, body: "saved again", status: "saved" });
    check("re-saving the same entry gives nothing more", (await xpOf(Q)).total === XP_RULES.step + XP_RULES.journal);
    for (const s of stepRows.slice(1)) await setStepDone(Q, s.id, true);
    check("steps and journal together stop at the daily cap", (await xpOf(Q)).today === XP_RULES.growthDailyCap);
    const otherStep = await setStepDone(P, stepRows[1].id, true);
    check("a member cannot complete someone else's step", !otherStep.ok);

    /* ---------- My Inner World on the server ---------- */
    const m1 = await personal.addMoment(P, { words: ["calm", "not-a-word"], ownWords: ["sunny"], promptId: "nubi-1", note: NOTE });
    const moment = snap(m1).progress.moments[0];
    check("a moment is saved to the account with only known words", m1.ok && moment.words.join() === "calm" && moment.ownWords.join() === "sunny" && moment.note === NOTE);
    check("an empty moment is refused", !(await personal.addMoment(P, { words: [], ownWords: [], promptId: null, note: " " })).ok);
    check("another member never receives it", !JSON.stringify(snap(await svc.getSnapshot(Q))).includes(NOTE));
    check("…and cannot delete it", !(await personal.deleteMoment(Q, moment.id)).ok);
    const local = [
      { id: "m1700000000000", date: "2026-10-20", createdAt: 1760950000000, words: ["tired"], ownWords: [], promptId: null, note: "" },
      { id: "m1700000000001", date: "2026-10-21", createdAt: 1761036400000, words: [], ownWords: ["mine"], promptId: null, note: "local note" },
      { id: "bad", date: "not a date", createdAt: 1, words: ["calm"], ownWords: [], promptId: null, note: "" },
    ];
    const imp = await personal.importMoments(P, local);
    check("moments from this device are imported (invalid ones skipped)", imp.ok && imp.data === 2);
    const imp2 = await personal.importMoments(P, local);
    check("importing again adds nothing", imp2.ok && imp2.data === 0 && snap(imp2).progress.moments.length === 3);
    const dm = await personal.deleteMoment(P, moment.id);
    check("the owner can delete a moment", dm.ok && !snap(dm).progress.moments.some(m => m.id === moment.id));

    /* ---------- One journey, also in a circle ---------- */
    circleId = snap(await svc.createCircle(A, "Közös út teszt")).circle!.id;
    const joined = snap(await svc.joinCircle(B, snap(await svc.getSnapshot(A, circleId)).circle!.inviteCode));
    check("members of a circle answer the circle's daily question, not a personal one", joined.progress.dailyQuestion === null);
    const cj = await svc.saveAnswer(A, { circleId, questionRef: day(1), text: "Circle day one", reflection: "", reflectionPrompt: "", share: false, context: { kind: "journey", day: 1 } });
    const aProg = snap(cj).progress;
    check("a journey day done in a circle is on the member's own journey", cj.ok && aProg.journey[1] === aProg.today);
    check("…and its XP is on the member's own profile", aProg.xp.events.some(e => e.ref === "journey:1") && aProg.xp.total >= XP_RULES.daily);
    check("…and its badge too", aProg.achievements.some(a => a.id === "first-tiny-step"));
    const own = await personal.savePersonalAnswer(A, { questionRef: day(1), text: "Same day on my path", reflection: "", reflectionPrompt: "", context: { kind: "journey", day: 1 } });
    check("doing the same day on the own path gives no second journey XP", own.ok && !own.data!.xpItems.some(x => x.reason === "daily"));
    const xpInCircle = aProg.xp.total;
    await db.delete(circles).where(eq(circles.id, circleId));
    circleId = "";
    const after = snap(await svc.getSnapshot(A));
    check("deleting the circle keeps the member's XP, journey and badges", after.progress.xp.total >= xpInCircle && !!after.progress.journey[1] && after.progress.achievements.some(a => a.id === "first-tiny-step"));
    check("without a circle the member gets a personal daily question again", after.progress.dailyQuestion !== null);

    /* ---------- Journey chapters (after day 21) ---------- */
    // Earlier days, done on past dates (set up directly: one stop a day would take weeks).
    const past = (days: number[]) => db.insert(userActivity).values(days.map(d => ({ userId: R, kind: "journey" as const, key: String(d), questionRef: day(d), date: "2026-01-01" })));
    await past(Array.from({ length: 20 }, (_, i) => i + 1));
    const early = await personal.savePersonalAnswer(R, { questionRef: day(22), text: "Too soon", reflection: "", reflectionPrompt: "", context: { kind: "journey", day: 22 } });
    check("chapter 2 stays locked until day 21 is done", !early.ok && early.error === "locked");
    await past([21]);
    const c2 = await personal.savePersonalAnswer(R, { questionRef: day(22), text: "Chapter two begins", reflection: "", reflectionPrompt: "", context: { kind: "journey", day: 22 } });
    check("after day 21, day 22 (chapter 2) opens and is saved", c2.ok && snap(c2).progress.journey[22] === snap(c2).progress.today);
    check("…with its journey XP, once", c2.ok && c2.data!.xpItems.some(x => x.reason === "daily") && snap(c2).progress.xp.events.filter(e => e.ref === "journey:22").length === 1);
    const c2again = await personal.savePersonalAnswer(R, { questionRef: day(22), text: "Chapter two, edited", reflection: "", reflectionPrompt: "", context: { kind: "journey", day: 22 } });
    check("…and re-saving it grants nothing more", c2again.ok && !c2again.data!.xpItems.some(x => x.reason === "daily"));
    const d23 = await personal.savePersonalAnswer(R, { questionRef: day(23), text: "Same day", reflection: "", reflectionPrompt: "", context: { kind: "journey", day: 23 } });
    check("one stop a day also in chapter 2 (day 23 is for tomorrow)", !d23.ok && d23.error === "locked");

    /* ---------- Data rights ---------- */
    const exp = await exportAccount(P);
    check("the export has the member's progress and moments", exp.progress.activity.length >= 2 && exp.progress.xp.length > 0 && exp.progress.badges.length > 0 && exp.innerWorldMoments.length === 2);
  } finally {
    if (circleId) await db.delete(circles).where(eq(circles.id, circleId));
    await db.delete(users).where(inArray(users.id, [P, Q, A, B, R]));
    console.log("cleaned up test data");
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
