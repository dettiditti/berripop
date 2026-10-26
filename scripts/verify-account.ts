/**
 * Database checks for account export and deletion (Clerk is not called here).
 * Temporary users; cleans up.
 *
 *   npm run verify:account
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../lib/db";
import { aiCalls, circleMembers, circles, funnelEvents, growthGoals, journalEntries, subscriptions, users } from "../lib/db/schema";
import * as account from "../lib/server/account";
import * as growth from "../lib/server/growth";
import * as journal from "../lib/server/journal";
import * as svc from "../lib/server/service";

let failures = 0;
function check(label: string, ok: boolean) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures++;
}

const stamp = Date.now();
const A = `test_acc_a_${stamp}`, B = `test_acc_b_${stamp}`, P = `test_acc_p_${stamp}`;
const SECRET = `account-secret-${stamp}`;

async function main() {
  const db = getDb();
  await db.insert(users).values([{ id: A, displayName: "Anna" }, { id: B, displayName: "Bence" }, { id: P, displayName: "Petra" }]);
  let sharedId = "", soloId = "";
  try {
    // A owns a shared circle (B joined) and a solo circle; A has goals, journal, AI usage, events.
    const shared = await svc.createCircle(A, "Shared");
    sharedId = shared.ok ? shared.snapshot.circle!.id : "";
    if (shared.ok) await svc.joinCircle(B, shared.snapshot.circle!.inviteCode);
    await db.insert(subscriptions).values({ userId: A, stripeCustomerId: `cus_test_${A}`, status: "active", planId: "premium", interval: "month" });
    const solo = await svc.createCircle(A, "Solo");
    soloId = solo.ok ? solo.snapshot.circle!.id : "";
    await growth.createGoal(A, { title: "Listen more", details: "", source: "guided" });
    await journal.saveEntry(A, { body: `${SECRET} private entry`, status: "saved" });
    await db.insert(aiCalls).values({ userId: A, feature: "test", model: "m", status: "ok" });
    const bAnswerCircle = sharedId;

    // Export: own data only
    const exp = await account.exportAccount(A);
    check("export contains the member's goals, journal and circles", exp.goals.length === 1 && exp.journal.entries.length === 1 && exp.circles.length === 2);
    check("export of another member contains none of it", !JSON.stringify(await account.exportAccount(B)).includes(SECRET));

    // Deletion rules
    check("deletion needs the confirmation word", !(await account.deleteAccountData(A, "yes")).ok);
    const blocked = await account.deleteAccountData(A, "TÖRLÉS");
    check("a renewing subscription blocks deletion", !blocked.ok && blocked.error === "active_subscription");
    await db.update(subscriptions).set({ cancelAtPeriodEnd: true }).where(eq(subscriptions.userId, A));
    const funnelBefore = (await db.select().from(funnelEvents).where(eq(funnelEvents.userId, A))).length;

    const done = await account.deleteAccountData(A, "törlés");
    check("deletion succeeds once the subscription is set to end", done.ok);
    check("the user row is gone", (await db.select().from(users).where(eq(users.id, A))).length === 0);
    check("goals, journal entries and AI logs are gone", (await db.select().from(growthGoals).where(eq(growthGoals.userId, A))).length === 0
      && (await db.select().from(journalEntries).where(eq(journalEntries.userId, A))).length === 0
      && (await db.select().from(aiCalls).where(eq(aiCalls.userId, A))).length === 0);
    check("the local subscription mirror is gone (Stripe keeps its records)", (await db.select().from(subscriptions).where(eq(subscriptions.userId, A))).length === 0);
    const [heir] = await db.select().from(circleMembers).where(eq(circleMembers.circleId, bAnswerCircle));
    const [sharedRow] = await db.select().from(circles).where(eq(circles.id, sharedId));
    check("a shared circle is handed to the remaining member", !!sharedRow && sharedRow.createdBy === B && heir?.userId === B && heir.role === "owner");
    check("a circle with no other member is deleted", (await db.select().from(circles).where(eq(circles.id, soloId))).length === 0);
    check("the remaining member still has access", (await svc.getSnapshot(B, sharedId)).ok);
    check("product events no longer point to the person", funnelBefore >= 0 && (await db.select().from(funnelEvents).where(eq(funnelEvents.userId, A))).length === 0);

    // A Free member with nothing special can delete directly
    check("a free member can delete their account", (await account.deleteAccountData(P, "DELETE")).ok);
  } finally {
    for (const id of [sharedId, soloId]) if (id) await db.delete(circles).where(eq(circles.id, id));
    await db.delete(users).where(inArray(users.id, [A, B, P]));
    console.log("cleaned up test data");
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
