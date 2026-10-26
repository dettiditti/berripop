import { describe, expect, it } from "vitest";
import { allowance, entitlementsFrom, type SubscriptionRecord } from "../lib/billing/entitlements";
import { aiPeriodKey, aiPeriodResets, isPaidPlan, PLAN_LIMITS, planForLookupKey, PRICES, priceFor, stripeAmount } from "../lib/billing/plans";

const sub = (over: Partial<SubscriptionRecord>): SubscriptionRecord => ({
  status: "active", planId: "premium", interval: "month", currentPeriodEnd: new Date("2026-11-25T00:00:00Z"), cancelAtPeriodEnd: false, ...over,
});

describe("plan configuration", () => {
  it("has a monthly and an annual HUF price", () => {
    expect(PRICES.monthly).toMatchObject({ interval: "month", amount: 2990, currency: "HUF" });
    expect(PRICES.annual).toMatchObject({ interval: "year", amount: 23990, currency: "HUF" });
    expect(priceFor("premium", "month")).toBe(PRICES.monthly);
    expect(priceFor("premium", "year")).toBe(PRICES.annual);
  });
  it("sells Premium Plus monthly only, at 3990 HUF", () => {
    expect(PRICES.plus_monthly).toMatchObject({ plan: "premium_plus", interval: "month", amount: 3990, currency: "HUF" });
    expect(priceFor("premium_plus", "month")).toBe(PRICES.plus_monthly);
    expect(priceFor("premium_plus", "year")).toBeNull();
    expect(stripeAmount(PRICES.plus_monthly)).toBe(399000);
  });
  it("maps every lookup key to exactly one plan, and unknown prices to none", () => {
    const keys = Object.values(PRICES).map(p => p.lookupKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(planForLookupKey("kozos_premium_monthly_huf")).toBe("premium");
    expect(planForLookupKey("kozos_premium_annual_huf")).toBe("premium");
    expect(planForLookupKey("kozos_premium_plus_monthly_huf")).toBe("premium_plus");
    expect(planForLookupKey("someone_elses_price")).toBeNull();
    expect(planForLookupKey(null)).toBeNull();
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan("premium_plus")).toBe(true);
  });
  it("uses distinct lookup keys and Stripe's two-decimal HUF amounts", () => {
    expect(PRICES.monthly.lookupKey).not.toBe(PRICES.annual.lookupKey);
    expect(stripeAmount(PRICES.monthly)).toBe(299000);
    expect(stripeAmount(PRICES.annual)).toBe(2399000);
  });
  it("gives Premium strictly more than Free", () => {
    expect(PLAN_LIMITS.premium.activeGoals).toBeGreaterThan(PLAN_LIMITS.free.activeGoals);
    expect(PLAN_LIMITS.premium.aiPerPeriod).toBeGreaterThan(PLAN_LIMITS.free.aiPerPeriod);
    expect(PLAN_LIMITS.free.weeklySummary).toBe(false);
    expect(PLAN_LIMITS.premium.weeklySummary).toBe(true);
  });
  it("gives Premium Plus at least Premium everywhere, more AI, and still a finite cap", () => {
    const p = PLAN_LIMITS.premium, plus = PLAN_LIMITS.premium_plus;
    for (const k of ["activeGoals", "aiPerPeriod", "ownedCircles", "journalAiPerPeriod", "assessmentAiPerPeriod"] as const) {
      expect(plus[k]).toBeGreaterThanOrEqual(p[k]);
      expect(Number.isFinite(plus[k])).toBe(true);
    }
    expect(plus.aiPerPeriod).toBeGreaterThan(p.aiPerPeriod);
    expect(plus.journalAiPerPeriod).toBeGreaterThan(p.journalAiPerPeriod);
  });
});

describe("entitlements from subscription status", () => {
  it("no subscription is Free", () => {
    expect(entitlementsFrom(null)).toMatchObject({ plan: "free", status: "none", paymentIssue: false, ended: false });
  });
  it.each(["active", "trialing"])("%s is Premium", status => {
    expect(entitlementsFrom(sub({ status })).plan).toBe("premium");
  });
  it("past_due keeps Premium during retries but flags a payment issue", () => {
    expect(entitlementsFrom(sub({ status: "past_due" }))).toMatchObject({ plan: "premium", paymentIssue: true });
  });
  it.each(["canceled", "unpaid", "incomplete_expired"])("%s ends Premium", status => {
    expect(entitlementsFrom(sub({ status }))).toMatchObject({ plan: "free", ended: true });
  });
  it.each(["incomplete", "paused"])("%s is not Premium", status => {
    expect(entitlementsFrom(sub({ status })).plan).toBe("free");
  });
  it("cancel at period end stays Premium until the period ends", () => {
    const e = entitlementsFrom(sub({ cancelAtPeriodEnd: true }));
    expect(e).toMatchObject({ plan: "premium", cancelAtPeriodEnd: true });
    expect(e.currentPeriodEnd).toBe("2026-11-25T00:00:00.000Z");
  });
  it("an active subscription to another product is not Premium", () => {
    expect(entitlementsFrom(sub({ planId: "free" })).plan).toBe("free");
  });
  it("an active Premium Plus subscription is Premium Plus, with its own limits", () => {
    const e = entitlementsFrom(sub({ planId: "premium_plus" }));
    expect(e).toMatchObject({ plan: "premium_plus", cancelAtPeriodEnd: false });
    expect(e.limits).toEqual(PLAN_LIMITS.premium_plus);
  });
  it.each(["canceled", "unpaid", "incomplete_expired"])("%s ends Premium Plus too", status => {
    expect(entitlementsFrom(sub({ planId: "premium_plus", status }))).toMatchObject({ plan: "free", ended: true });
  });
  it("past_due keeps Premium Plus with a payment warning", () => {
    expect(entitlementsFrom(sub({ planId: "premium_plus", status: "past_due" }))).toMatchObject({ plan: "premium_plus", paymentIssue: true });
  });
  it("an unknown stored plan id grants nothing", () => {
    expect(entitlementsFrom(sub({ planId: "gold" })).plan).toBe("free");
  });
  it("limits follow the plan", () => {
    expect(entitlementsFrom(null).limits).toEqual(PLAN_LIMITS.free);
    expect(entitlementsFrom(sub({})).limits).toEqual(PLAN_LIMITS.premium);
  });
});

describe("AI allowance", () => {
  it("reports remaining and reached", () => {
    expect(allowance(3, 5)).toEqual({ used: 3, limit: 5, remaining: 2, reached: false });
    expect(allowance(5, 5).reached).toBe(true);
    expect(allowance(7, 5).remaining).toBe(0);
  });
  it("resets weekly on Monday (Budapest)", () => {
    // Wednesday 2026-10-28 → week starts Monday 2026-10-26, resets 2026-11-02.
    const wed = new Date("2026-10-28T10:00:00Z");
    expect(aiPeriodKey(wed)).toBe("2026-10-26");
    expect(aiPeriodResets(wed)).toBe("2026-11-02");
    // Sunday late evening still belongs to the same week.
    expect(aiPeriodKey(new Date("2026-11-01T20:00:00Z"))).toBe("2026-10-26");
  });
});
