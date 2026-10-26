/**
 * Database-level checks for plans and limits. Uses temporary users, never real
 * payment credentials, and cleans up after itself.
 *
 *   npm run verify:billing
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../lib/db";
import { circles, funnelEvents, subscriptions, users } from "../lib/db/schema";
import { PLAN_LIMITS } from "../lib/billing/plans";
import { confirmCheckout, createCheckoutSession, createPlanChangeSession, handleWebhook, storeSubscriptionSnapshot } from "../lib/server/billing";
import { consumeAiAllowance, getAiUsage, getUserEntitlements } from "../lib/server/entitlements";
import * as growth from "../lib/server/growth";
import * as svc from "../lib/server/service";

let failures = 0;
function check(label: string, ok: boolean) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures++;
}

const stamp = Date.now();
const F = `test_free_${stamp}`, P = `test_premium_${stamp}`, L = `test_lifecycle_${stamp}`, X = `test_plus_${stamp}`;

async function setStatus(userId: string, status: string, planId = "premium") {
  await getDb()
    .insert(subscriptions)
    .values({ userId, stripeCustomerId: `cus_test_${userId}`, status, planId, interval: "month" })
    .onConflictDoUpdate({ target: subscriptions.userId, set: { status, planId } });
}

async function main() {
  const db = getDb();
  await db.insert(users).values([{ id: F, displayName: "Free" }, { id: P, displayName: "Premium" }, { id: L, displayName: "Lifecycle" }, { id: X, displayName: "Plus" }]);
  const circleIds: string[] = [];
  try {
    // Free plan limits
    check("new user is on Free", (await getUserEntitlements(F)).plan === "free");
    const g1 = await growth.createGoal(F, { title: "Listen more", details: "", source: "guided" });
    check("free user can create one goal", g1.ok);
    const goalEvents = await getDb().select().from(funnelEvents).where(eq(funnelEvents.userId, F));
    check("the first goal is tracked as first_goal_created, without its title", goalEvents.filter(e => e.event === "first_goal_created").length === 1 && !JSON.stringify(goalEvents).includes("Listen more"));
    const g2 = await growth.createGoal(F, { title: "Rest more", details: "", source: "custom" });
    check("second active goal is refused on Free", !g2.ok && g2.error === "limit_goals");
    const firstGoal = g1.ok ? g1.snapshot.account.goals[0].id : "";
    await growth.setGoalStatus(F, firstGoal, "paused");
    check("pausing frees the slot", (await growth.createGoal(F, { title: "Rest more", details: "", source: "reflection" })).ok);
    const resume = await growth.setGoalStatus(F, firstGoal, "active");
    check("re-activating past the limit is refused", !resume.ok && resume.error === "limit_goals");
    check("existing goals stay readable and editable", (await growth.updateGoal(F, firstGoal, { title: "Listen more patiently", details: "" })).ok);

    const c1 = await svc.createCircle(F, "Free circle");
    if (c1.ok) circleIds.push(c1.snapshot.circle!.id);
    check("free user can own one circle", c1.ok);
    const c2 = await svc.createCircle(F, "Second circle");
    check("second owned circle is refused on Free", !c2.ok && c2.error === "limit_circles");

    const summary = await growth.weeklySummary(F, { circleId: circleIds[0], locale: "hu" });
    check("weekly summary is Premium-only", !summary.ok && summary.error === "premium_required");

    // AI allowance: concurrent requests can't exceed the limit
    const results = await Promise.all(Array.from({ length: PLAN_LIMITS.free.aiPerPeriod * 2 }, () => consumeAiAllowance(F)));
    check(`exactly ${PLAN_LIMITS.free.aiPerPeriod} of ${results.length} parallel AI requests succeed`, results.filter(Boolean).length === PLAN_LIMITS.free.aiPerPeriod);
    const usage = await getAiUsage(F);
    check("usage shows the allowance as reached", usage.reached && usage.used === PLAN_LIMITS.free.aiPerPeriod);
    const blocked = await growth.aiFollowUp(F, { circleId: circleIds[0], questionRef: "l01", answerText: "x", locale: "hu" });
    check("AI follow-up is refused once the allowance is used", !blocked.ok && (blocked.error === "limit_ai" || blocked.error === "ai_unavailable"));

    // Premium only from trusted subscription state
    await setStatus(P, "active");
    const pe = await getUserEntitlements(P);
    check("active subscription grants Premium", pe.plan === "premium" && pe.limits.activeGoals === PLAN_LIMITS.premium.activeGoals);
    for (let i = 0; i < 3; i++) await growth.createGoal(P, { title: `Goal ${i + 1}`, details: "", source: "custom" });
    check("Premium allows several active goals", (await growth.createGoal(P, { title: "Goal 4", details: "", source: "custom" })).ok);
    await setStatus(P, "past_due");
    const pd = await getUserEntitlements(P);
    check("past_due keeps Premium with a payment warning", pd.plan === "premium" && pd.paymentIssue);
    await setStatus(P, "canceled");
    const cn = await getUserEntitlements(P);
    check("canceled subscription returns to Free", cn.plan === "free" && cn.ended);
    check("goals created on Premium are kept after it ends", (await growth.updateGoal(P, (await svc.getSnapshot(P)).ok ? ((await svc.getSnapshot(P)) as { ok: true; snapshot: { account: { goals: { id: string }[] } } }).snapshot.account.goals[0].id : "", { title: "Still mine", details: "" })).ok);

    // Checkout confirmation and webhooks can't be faked
    const forged = await confirmCheckout(F, "cs_test_forged_session_id");
    check("a made-up checkout session does not grant Premium", forged.state === "invalid" && forged.entitlements.plan === "free");
    const noSig = await handleWebhook("{}", null);
    check("webhook without a valid signature is rejected", noSig.status === 400 || noSig.status === 503);

    // Subscription lifecycle as the webhook stores it (snapshots stand in for Stripe reads; no Stripe calls)
    const cus = `cus_test_${L}`;
    const day = 24 * 3600 * 1000;
    const snap = (id: string, status: string, over: Partial<Parameters<typeof storeSubscriptionSnapshot>[0]> = {}) => ({
      id, customerId: cus, status, lookupKey: "kozos_premium_monthly_huf", interval: "month", periodEnd: new Date(Date.now() + 30 * day), cancelAtPeriodEnd: false, metadataUserId: L, ...over,
    });
    const end1 = new Date(Date.now() + 30 * day);
    check("new subscription (via checkout metadata) grants Premium", await storeSubscriptionSnapshot(snap(`sub_a_${stamp}`, "active", { periodEnd: end1 })) && (await getUserEntitlements(L)).plan === "premium");
    await storeSubscriptionSnapshot(snap(`sub_a_${stamp}`, "active", { periodEnd: end1 }));
    const again = await getUserEntitlements(L);
    check("a redelivered event leaves the same state", again.plan === "premium" && again.currentPeriodEnd === end1.toISOString());
    const end2 = new Date(end1.getTime() + 30 * day);
    await storeSubscriptionSnapshot(snap(`sub_a_${stamp}`, "active", { periodEnd: end2 }));
    check("renewal moves the period end forward", (await getUserEntitlements(L)).currentPeriodEnd === end2.toISOString());
    await storeSubscriptionSnapshot(snap(`sub_a_${stamp}`, "active", { periodEnd: end2, cancelAtPeriodEnd: true }));
    const sched = await getUserEntitlements(L);
    check("cancel at period end keeps Premium until then", sched.plan === "premium" && sched.cancelAtPeriodEnd);
    await storeSubscriptionSnapshot(snap(`sub_a_${stamp}`, "past_due", { periodEnd: end2 }));
    const due = await getUserEntitlements(L);
    check("failed renewal (past_due) keeps Premium with a payment warning", due.plan === "premium" && due.paymentIssue);
    await storeSubscriptionSnapshot(snap(`sub_a_${stamp}`, "canceled", { periodEnd: end2 }));
    const gone = await getUserEntitlements(L);
    check("subscription end (canceled) returns to Free", gone.plan === "free" && gone.ended);
    check("re-subscribing with a new subscription grants Premium again", await storeSubscriptionSnapshot(snap(`sub_b_${stamp}`, "active")) && (await getUserEntitlements(L)).plan === "premium");
    const late = await storeSubscriptionSnapshot(snap(`sub_a_${stamp}`, "canceled"));
    check("a late event about the old subscription is ignored", !late && (await getUserEntitlements(L)).plan === "premium");
    check("an unknown Stripe customer is ignored", !(await storeSubscriptionSnapshot({ ...snap(`sub_x_${stamp}`, "active"), customerId: `cus_unknown_${stamp}`, metadataUserId: null })));
    await storeSubscriptionSnapshot(snap(`sub_b_${stamp}`, "active", { lookupKey: "someone_elses_price" }));
    check("a subscription to a price that isn't ours does not grant Premium", (await getUserEntitlements(L)).plan === "free");

    // Premium Plus: Free → Plus, limits enforced on the server, switching both ways, failure, cancel, duplicates
    const cusX = `cus_test_${X}`;
    const plusSnap = (id: string, status: string, over: Partial<Parameters<typeof storeSubscriptionSnapshot>[0]> = {}) => ({
      id, customerId: cusX, status, lookupKey: "kozos_premium_plus_monthly_huf", interval: "month", periodEnd: new Date(Date.now() + 30 * day), cancelAtPeriodEnd: false, metadataUserId: X, ...over,
    });
    const subX = `sub_plus_${stamp}`;
    check("Free → Premium Plus: the Plus price grants Premium Plus", await storeSubscriptionSnapshot(plusSnap(subX, "active")) && (await getUserEntitlements(X)).plan === "premium_plus");
    const xe = await getUserEntitlements(X);
    check("Premium Plus gets its own limits", xe.limits.aiPerPeriod === PLAN_LIMITS.premium_plus.aiPerPeriod && xe.limits.activeGoals === PLAN_LIMITS.premium_plus.activeGoals);
    check("the AI allowance follows Premium Plus", (await getAiUsage(X)).limit === PLAN_LIMITS.premium_plus.aiPerPeriod && (await getAiUsage(X, new Date(), "journal")).limit === PLAN_LIMITS.premium_plus.journalAiPerPeriod);
    let made = 0;
    for (let i = 0; i < PLAN_LIMITS.premium_plus.activeGoals; i++) if ((await growth.createGoal(X, { title: `Plus goal ${i + 1}`, details: "", source: "custom" })).ok) made++;
    const extra = await growth.createGoal(X, { title: "One too many", details: "", source: "custom" });
    check(`Premium Plus allows ${PLAN_LIMITS.premium_plus.activeGoals} active goals and refuses one more (server-side)`, made === PLAN_LIMITS.premium_plus.activeGoals && !extra.ok && extra.error === "limit_goals");
    const dupCheckout = await createCheckoutSession(X, "premium", "month", "http://localhost");
    check("a paying member can't start a second subscription via checkout", !dupCheckout.ok && dupCheckout.error === "already_premium");
    const yearlyPlus = await createCheckoutSession(F, "premium_plus", "year", "http://localhost");
    check("Premium Plus can't be bought yearly (no such price)", !yearlyPlus.ok && yearlyPlus.error === "invalid");
    const samePlan = await createPlanChangeSession(X, "premium_plus", "http://localhost");
    check("switching to the plan you already have is refused", !samePlan.ok && samePlan.error === "invalid");
    const freeSwitch = await createPlanChangeSession(F, "premium_plus", "http://localhost");
    check("a Free member can't 'switch' (they go through checkout)", !freeSwitch.ok && freeSwitch.error === "not_subscribed");

    await storeSubscriptionSnapshot(plusSnap(subX, "active", { lookupKey: "kozos_premium_monthly_huf" }));
    check("Premium Plus → Premium (portal price change on the same subscription) is applied", (await getUserEntitlements(X)).plan === "premium");
    await storeSubscriptionSnapshot(plusSnap(subX, "active"));
    check("Premium → Premium Plus is applied", (await getUserEntitlements(X)).plan === "premium_plus");
    const changes = await db.select().from(funnelEvents).where(eq(funnelEvents.userId, X));
    check("plan switches are tracked as plan_changed with the new plan", changes.filter(e => e.event === "plan_changed").map(e => e.plan).join(",") === "premium,premium_plus");
    check("Free → Premium Plus is tracked as checkout_completed for premium_plus", changes.some(e => e.event === "checkout_completed" && e.plan === "premium_plus"));
    await storeSubscriptionSnapshot(plusSnap(subX, "active"));
    check("a duplicated event leaves Premium Plus unchanged", (await getUserEntitlements(X)).plan === "premium_plus" && (await db.select().from(funnelEvents).where(eq(funnelEvents.userId, X))).length === changes.length);
    await storeSubscriptionSnapshot(plusSnap(subX, "past_due"));
    const xd = await getUserEntitlements(X);
    check("failed payment (past_due) keeps Premium Plus with a payment warning", xd.plan === "premium_plus" && xd.paymentIssue);
    await storeSubscriptionSnapshot(plusSnap(subX, "active", { cancelAtPeriodEnd: true }));
    const xc = await getUserEntitlements(X);
    check("cancel at period end keeps Premium Plus until then", xc.plan === "premium_plus" && xc.cancelAtPeriodEnd);
    await storeSubscriptionSnapshot(plusSnap(subX, "canceled"));
    const xg = await getUserEntitlements(X);
    check("when Premium Plus ends, the member is back on Free and keeps their goals", xg.plan === "free" && xg.ended && (await growth.updateGoal(X, (await svc.getSnapshot(X) as { ok: true; snapshot: { account: { goals: { id: string }[] } } }).snapshot.account.goals[0].id, { title: "Still mine", details: "" })).ok);
  } finally {
    if (circleIds.length) await db.delete(circles).where(inArray(circles.id, circleIds));
    await db.delete(users).where(inArray(users.id, [F, P, L, X]));
    await db.delete(subscriptions).where(eq(subscriptions.userId, P));
    console.log("cleaned up test data");
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
