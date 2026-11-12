import { describe, expect, it } from "vitest";
import { combinedEntitlements } from "../lib/billing/apple";
import { trialEndsAt, withTrial, entitlementsFrom } from "../lib/billing/entitlements";
import { PLAN_LIMITS, PLAN_QUOTAS, quotaTotal, TRIAL_DAYS, type QuotaKey, type Tier } from "../lib/billing/plans";
import { poolPeriod, reserveOutcome, reserveStatements, usageFrom, quotaUseKey } from "../lib/billing/quota";
import { runAiCall } from "../lib/ai/run";
import { memoryQuota } from "./helpers/memory-quota";

/*
 * The central allowance rules (lib/billing/plans.ts, lib/billing/quota.ts)
 * and the trial week. The SQL itself is checked against a real Postgres
 * separately (see the pre-release checklist); here the same rules run in memory.
 */

const NOW = new Date("2026-11-11T10:00:00Z"); // a Wednesday
const KEYS: QuotaKey[] = ["assist", "journal", "assessment", "thought", "relationship"];

describe("central configuration", () => {
  it("every allowance is finite, and paid plans never get less than Free", () => {
    for (const tier of Object.keys(PLAN_QUOTAS) as Tier[]) for (const k of KEYS) {
      const total = quotaTotal(PLAN_QUOTAS[tier][k]);
      expect(Number.isFinite(total) && total > 0).toBe(true);
    }
    for (const k of KEYS) {
      expect(quotaTotal(PLAN_QUOTAS.premium[k])).toBeGreaterThanOrEqual(quotaTotal(PLAN_QUOTAS.free[k]));
      expect(quotaTotal(PLAN_QUOTAS.premium_plus[k])).toBeGreaterThanOrEqual(quotaTotal(PLAN_QUOTAS.premium[k]));
    }
  });

  it("the plan limits shown in the UI are derived from the same numbers", () => {
    for (const tier of Object.keys(PLAN_QUOTAS) as Tier[]) {
      expect(PLAN_LIMITS[tier].aiPerPeriod).toBe(quotaTotal(PLAN_QUOTAS[tier].assist));
      expect(PLAN_LIMITS[tier].journalAiPerPeriod).toBe(quotaTotal(PLAN_QUOTAS[tier].journal));
      expect(PLAN_LIMITS[tier].thoughtSessions).toBe(quotaTotal(PLAN_QUOTAS[tier].thought));
    }
  });

  it("Free: 1 journal reflection a week and one Gondolatboncoló for the account's lifetime; the trial adds exactly one", () => {
    expect(PLAN_QUOTAS.free.journal).toEqual([{ window: "week", limit: 1 }]);
    expect(PLAN_QUOTAS.free.thought).toEqual([{ window: "once", limit: 1, name: "first" }]);
    expect(PLAN_QUOTAS.trial.thought).toEqual([{ window: "once", limit: 1, name: "first" }, { window: "once", limit: 1, name: "trial" }]);
  });

  it("the trial is capped too, and the cost safety net sits above every allowance", () => {
    expect(PLAN_LIMITS.trial.journalAiPerPeriod).toBeLessThan(PLAN_LIMITS.premium.journalAiPerPeriod);
    for (const tier of Object.keys(PLAN_LIMITS) as Tier[]) expect(PLAN_LIMITS[tier].aiMonthlyCostCapMicroUsd).toBeGreaterThan(0);
    expect(PLAN_LIMITS.premium_plus.aiMonthlyCostCapMicroUsd).toBeGreaterThan(PLAN_LIMITS.premium.aiMonthlyCostCapMicroUsd);
  });
});

describe("pools and periods", () => {
  it("weeks start on Monday (Budapest), months are calendar months, one-time pools never change", () => {
    expect(poolPeriod({ window: "week", limit: 1 }, NOW)).toBe("week:2026-11-09");
    expect(poolPeriod({ window: "month", limit: 1 }, NOW)).toBe("month:2026-11");
    expect(poolPeriod({ window: "once", limit: 1, name: "first" }, NOW)).toBe("once:first");
    expect(poolPeriod({ window: "once", limit: 1, name: "first" }, new Date("2030-01-01T00:00:00Z"))).toBe("once:first");
  });

  it("usage: one-time quotas have no reset date; weekly ones reset next Monday", () => {
    expect(usageFrom("free", "thought", {}, NOW)).toEqual({ used: 0, limit: 1, remaining: 1, reached: false, resets: null, window: "once" });
    expect(usageFrom("free", "journal", { "week:2026-11-09": 1 }, NOW)).toMatchObject({ used: 1, limit: 1, reached: true, resets: "2026-11-16" });
    // Last week's uses don't count this week.
    expect(usageFrom("free", "journal", { "week:2026-11-02": 1 }, NOW)).toMatchObject({ used: 0, reached: false });
  });

  it("the SQL locks per member, checks the key first, then tries each pool in order", () => {
    const st = reserveStatements("u1", "thought", PLAN_QUOTAS.trial.thought, quotaUseKey("thought", "session:s1"), NOW);
    expect(st).toHaveLength(4);
    expect(st[0].text).toContain("pg_advisory_xact_lock");
    expect(st[1].text).toContain("idem_key");
    expect(st[2].params).toEqual(["u1", "thought", "once:first", "thought:session:s1", 1]);
    expect(st[3].params).toEqual(["u1", "thought", "once:trial", "thought:session:s1", 1]);
  });

  it("reads the outcome: duplicate beats everything, else the first pool that took the use, else the limit", () => {
    expect(reserveOutcome([[], [{ id: "a", period: "once:first" }], [], []])).toEqual({ ok: false, reason: "duplicate" });
    expect(reserveOutcome([[], [], [], [{ id: "b", period: "once:trial" }]])).toEqual({ ok: true, reservation: { id: "b", period: "once:trial" } });
    expect(reserveOutcome([[], [], [], []])).toEqual({ ok: false, reason: "limit" });
  });
});

describe("idempotent charging", () => {
  it("the same key is charged once; a released use can be charged again", () => {
    const q = memoryQuota(() => "free", () => NOW);
    const first = q.reserve("u1", "journal", "reflect:e1:reflect");
    expect(first.ok).toBe(true);
    expect(q.reserve("u1", "journal", "reflect:e1:reflect")).toEqual({ ok: false, reason: "duplicate" });
    if (first.ok) q.release("u1", first.reservation.id);
    expect(q.reserve("u1", "journal", "reflect:e1:reflect").ok).toBe(true);
    expect(q.rows).toHaveLength(1);
  });

  it("different members and different allowances never share a key", () => {
    const q = memoryQuota(() => "premium", () => NOW);
    expect(q.reserve("u1", "journal", "weekly").ok).toBe(true);
    expect(q.reserve("u2", "journal", "weekly").ok).toBe(true);
    expect(q.reserve("u1", "assist", "weekly").ok).toBe(true);
  });

  it("a use lands in exactly one pool", () => {
    const q = memoryQuota(() => "trial", () => NOW);
    q.reserve("u1", "thought", "session:a");
    q.reserve("u1", "thought", "session:b");
    expect(q.rows.map(r => r.period)).toEqual(["once:first", "once:trial"]);
    expect(q.reserve("u1", "thought", "session:c")).toEqual({ ok: false, reason: "limit" });
  });
});

describe("AI calls and the allowance", () => {
  const generate = async () => ({ text: "ok", usage: { inputTokens: 10, outputTokens: 5 } });
  const record = async () => {};

  it("a repeated request in progress is refused without a charge or an AI call", async () => {
    let calls = 0;
    const out = await runAiCall({ feature: "f", model: "openai/gpt-5-mini", instructions: "", prompt: "", maxOutputTokens: 10, parse: t => t },
      { generate: async () => { calls++; return generate(); }, reserve: async () => "duplicate", release: async () => {}, record });
    expect(out).toEqual({ ok: false, error: "ai_unavailable", reason: "duplicate" });
    expect(calls).toBe(0);
  });

  it("success commits the use; failure releases it and never commits", async () => {
    const log: string[] = [];
    const deps = { reserve: async () => true, release: async () => { log.push("release"); }, commit: async () => { log.push("commit"); }, record, sleep: async () => {} };
    await runAiCall({ feature: "f", model: "m", instructions: "", prompt: "", maxOutputTokens: 10, parse: t => t }, { ...deps, generate });
    await runAiCall({ feature: "f", model: "m", instructions: "", prompt: "", maxOutputTokens: 10, parse: () => null }, { ...deps, generate });
    expect(log).toEqual(["commit", "release"]);
  });
});

describe("the 7-day trial", () => {
  const free = entitlementsFrom(null);
  const grant = (startedAt: Date) => ({ startedAt, endsAt: trialEndsAt(startedAt) });

  it("not started: available, Free limits", () => {
    expect(withTrial(free, null, NOW)).toMatchObject({ plan: "free", tier: "free", trial: { status: "available", endsAt: null } });
  });

  it("running: billing stays Free, the trial limits apply, and it ends after exactly 7 days", () => {
    const e = withTrial(free, grant(NOW), NOW);
    expect(e).toMatchObject({ plan: "free", tier: "trial", source: null, trial: { status: "active" } });
    expect(e.limits).toEqual(PLAN_LIMITS.trial);
    expect(new Date(e.trial.endsAt!).getTime() - NOW.getTime()).toBe(TRIAL_DAYS * 24 * 3600 * 1000);
  });

  it("over: used, back to Free limits; it never restarts", () => {
    const later = new Date(NOW.getTime() + (TRIAL_DAYS * 24 + 1) * 3600 * 1000);
    expect(withTrial(free, grant(NOW), later)).toMatchObject({ plan: "free", tier: "free", trial: { status: "used" } });
  });

  it("a paying member keeps their plan's limits during a trial", () => {
    const paid = combinedEntitlements({ status: "active", planId: "premium_plus", interval: "month", currentPeriodEnd: null, cancelAtPeriodEnd: false }, [], NOW, grant(NOW));
    expect(paid).toMatchObject({ plan: "premium_plus", tier: "premium_plus", source: "stripe" });
    expect(paid.limits).toEqual(PLAN_LIMITS.premium_plus);
  });
});
