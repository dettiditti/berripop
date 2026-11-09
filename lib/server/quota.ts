import "server-only";
import { randomUUID } from "node:crypto";
import { getSql } from "../db";
import type { QuotaKey, Tier } from "../billing/plans";
import {
  poolPeriod, poolsFor, releaseStatement, reserveOutcome, reserveStatements, settleStatement, usageFrom, usageStatement, useKey,
  type QuotaUsage, type Reservation, type ReserveResult, type Statement,
} from "../billing/quota";

/*
 * The AI allowances on the database (rules and SQL: lib/billing/quota.ts,
 * numbers: PLAN_QUOTAS in lib/billing/plans.ts). The tier always comes from
 * getUserEntitlements on the server, never from the client.
 */

const run = (s: Statement) => getSql().query(s.text, s.params) as Promise<Record<string, unknown>[]>;

/**
 * Reserves one use. With an idempotency key, a request that repeats one still
 * in progress (or a one-time use already made) is never charged again: it gets
 * "duplicate". Without a key every call is a new use.
 */
export async function reserveQuota(userId: string, tier: Tier, quota: QuotaKey, opts: { idempotencyKey?: string; now?: Date } = {}): Promise<ReserveResult> {
  const now = opts.now ?? new Date();
  const pools = poolsFor(tier, quota);
  if (!pools.length) return { ok: false, reason: "limit" };
  const key = useKey(quota, opts.idempotencyKey ?? randomUUID());
  const sql = getSql();
  const results = await sql.transaction(reserveStatements(userId, quota, pools, key, now).map(s => sql.query(s.text, s.params)));
  return reserveOutcome(results as { id: string; period: string }[][]);
}

/** Gives the use back (the AI call failed or was unusable). */
export async function releaseQuota(userId: string, r: Reservation): Promise<void> {
  await run(releaseStatement(userId, r.id));
}

/** The request finished: the same key may be charged again later (one-time uses stay). */
export async function settleQuota(userId: string, r: Reservation): Promise<void> {
  await run(settleStatement(userId, r.id));
}

export async function quotaUsage(userId: string, tier: Tier, quota: QuotaKey, now = new Date()): Promise<QuotaUsage> {
  const periods = poolsFor(tier, quota).map(p => poolPeriod(p, now));
  let rows: Record<string, unknown>[] = [];
  try {
    if (periods.length) rows = await run(usageStatement(userId, quota, periods));
  } catch (err) {
    // Before the quota_uses migration (0014) has run: nothing used yet. Charging still needs the table.
    const e = err as { code?: unknown; cause?: { code?: unknown } };
    if (e?.code !== "42P01" && e?.cause?.code !== "42P01") throw err;
  }
  const counts = Object.fromEntries(rows.map(r => [String(r.period), Number(r.n)]));
  return usageFrom(tier, quota, counts, now);
}
