/**
 * End-to-end check of the shared circle rules against the real database.
 * Uses three temporary users (A owner, B member, C outsider) and deletes
 * everything it created at the end.
 *
 *   npm run verify:shared
 */
import "./db-guard";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../lib/db";
import { circles, funnelEvents, users } from "../lib/db/schema";
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
const A = `test_a_${stamp}`, B = `test_b_${stamp}`, C = `test_c_${stamp}`, Z = `test_z_${stamp}`;
const SECRET_A = `secret-answer-A-${stamp}`;
const SECRET_B = `secret-answer-B-${stamp}`;

async function main() {
  const db = getDb();
  await db.insert(users).values([{ id: A, displayName: "Anna" }, { id: B, displayName: "Bence" }, { id: C, displayName: "Csilla" }, { id: Z, displayName: "Zita" }]);
  let circleId = "";
  try {
    // Circle + invitation
    const created = snap(await svc.createCircle(A, "Teszt kör"));
    circleId = created.circle!.id;
    check("owner sees the new circle", created.circle?.role === "owner");
    const joined = snap(await svc.joinCircle(B, created.circle!.inviteCode));
    check("invite code adds member B", joined.circle?.members.length === 2);
    const dailyRef = joined.circle!.daily.questionRef;
    check("both members get the same daily quest", created.circle!.daily.questionRef === dailyRef);

    // Private daily answer
    const r1 = await svc.saveAnswer(A, { circleId, questionRef: dailyRef, text: SECRET_A, reflection: "", reflectionPrompt: "", share: false, context: { kind: "daily" } });
    check("A completes the daily quest privately", r1.ok && !!r1.data && r1.data.xpItems.some(x => x.reason === "daily"));
    const bView = snap(await svc.getSnapshot(B, circleId));
    check("B sees that A participated", bView.circle!.daily.completedBy.includes(A));
    check("B's snapshot never contains A's private text", !JSON.stringify(bView).includes(SECRET_A));
    const r1b = await svc.saveAnswer(A, { circleId, questionRef: dailyRef, text: SECRET_A + " edited", reflection: "", reflectionPrompt: "", share: false, context: { kind: "daily" } });
    check("re-saving grants no duplicate XP", r1b.ok && r1b.data!.xpItems.length === 0);

    // Outsider
    const cView = snap(await svc.getSnapshot(C, circleId));
    check("outsider C cannot load the circle", cView.circle === null);
    check("outsider C sees no answer text", !JSON.stringify(cView).includes(SECRET_A));
    const cSave = await svc.saveAnswer(C, { circleId, questionRef: dailyRef, text: "hi there", reflection: "", reflectionPrompt: "", share: true, context: { kind: "daily" } });
    check("outsider C cannot answer in the circle", !cSave.ok && cSave.error === "not_member");
    const aAnswerId = snap(r1b).circle!.myAnswers.find(a => a.questionRef === dailyRef)!.id;
    const cShare = await svc.shareAnswer(C, aAnswerId, true);
    check("C cannot share someone else's answer", !cShare.ok);
    const bShareA = await svc.shareAnswer(B, aAnswerId, true);
    check("B cannot share A's answer", !bShareA.ok);
    const cReact = await svc.toggleReaction(C, aAnswerId, "heart");
    check("C cannot react", !cReact.ok);

    // Explicit sharing + reactions
    check("B cannot react to a private answer", !(await svc.toggleReaction(B, aAnswerId, "heart")).ok);
    snap(await svc.shareAnswer(A, aAnswerId, true));
    const bAfterShare = snap(await svc.getSnapshot(B, circleId));
    check("after sharing, B can read A's answer", bAfterShare.circle!.sharedAnswers.some(a => a.text.startsWith(SECRET_A)));
    check("feed records the share without text", bAfterShare.circle!.feed.some(e => e.type === "answer_shared") && !JSON.stringify(bAfterShare.circle!.feed).includes(SECRET_A));
    snap(await svc.toggleReaction(B, aAnswerId, "heart"));
    const aAfterReact = snap(await svc.getSnapshot(A, circleId));
    check("A sees B's reaction", aAfterReact.circle!.myAnswers.find(a => a.id === aAnswerId)!.reactions.counts.heart === 1);
    snap(await svc.shareAnswer(A, aAnswerId, false));
    const bAfterUnshare = snap(await svc.getSnapshot(B, circleId));
    check("making it private hides it from B again", !JSON.stringify(bAfterUnshare).includes(SECRET_A));

    // Journey: individual vs shared completion
    const j1 = await svc.saveAnswer(A, { circleId, questionRef: "j01", text: "A day one", reflection: "", reflectionPrompt: "", share: false, context: { kind: "journey", day: 1 } });
    check("A completes journey day 1", j1.ok && j1.data!.journeyDay === 1);
    check("day 1 is NOT shared-complete after one member", j1.ok && !snap(j1).circle!.sharedJourney[1]);
    const j2 = await svc.saveAnswer(A, { circleId, questionRef: "j02", text: "A day two", reflection: "", reflectionPrompt: "", share: false, context: { kind: "journey", day: 2 } });
    check("day 2 stays locked until tomorrow", !j2.ok && j2.error === "locked");
    const jb = await svc.saveAnswer(B, { circleId, questionRef: "j01", text: SECRET_B, reflection: "", reflectionPrompt: "", share: false, context: { kind: "journey", day: 1 } });
    check("B completing day 1 makes it shared-complete", jb.ok && jb.data!.sharedDayCompleted === 1);
    check("A never sees B's private journey answer", !JSON.stringify(snap(await svc.getSnapshot(A, circleId))).includes(SECRET_B));

    // Daily together + milestone
    const bDaily = await svc.saveAnswer(B, { circleId, questionRef: dailyRef, text: "B daily", reflection: "", reflectionPrompt: "", share: false, context: { kind: "daily" } });
    const afterBoth = snap(bDaily);
    check("circle XP includes shared rewards", afterBoth.circle!.xp.circle > afterBoth.circle!.xp.mine);
    check("first shared milestone unlocked from real data", afterBoth.circle!.milestones.some(m => m.id === "first-together"));

    // Delete keeps participation
    snap(await svc.deleteAnswer(A, aAnswerId));
    const aAfterDelete = snap(await svc.getSnapshot(A, circleId));
    check("deleting an answer keeps the participation record", aAfterDelete.circle!.daily.completedBy.includes(A) && !aAfterDelete.circle!.myAnswers.some(a => a.id === aAnswerId));
    check("achievements are kept", aAfterDelete.circle!.achievements.some(a => a.id === "first-tiny-step"));

    // Membership management
    check("member B cannot remove others", !(await svc.removeMember(B, circleId, A)).ok);
    check("owner A cannot leave", !(await svc.leaveCircle(A, circleId)).ok);
    snap(await svc.removeMember(A, circleId, B));
    const bRemoved = snap(await svc.getSnapshot(B, circleId));
    check("removed member loses access", bRemoved.circle === null);

    // My Path without a circle
    check("a new member hasn't chosen a path yet", !snap(await svc.getSnapshot(Z)).me.personalPath);
    const solo = snap(await svc.startPersonalPath(Z));
    check("starting my own path needs no circle", solo.me.personalPath && solo.circle === null && solo.circles.length === 0);
    check("the choice is remembered on the next load", snap(await svc.getSnapshot(Z)).me.personalPath);
    const soloCircle = snap(await svc.createCircle(Z, "Later together"));
    check("a personal-path member can still create a circle", !!soloCircle.circle && soloCircle.circle.role === "owner");
    if (soloCircle.circle) await db.delete(circles).where(eq(circles.id, soloCircle.circle.id));
  } finally {
    if (circleId) await db.delete(circles).where(eq(circles.id, circleId));
    await db.delete(funnelEvents).where(inArray(funnelEvents.userId, [A, B, C, Z]));
    await db.delete(users).where(inArray(users.id, [A, B, C, Z]));
    console.log("cleaned up test data");
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
