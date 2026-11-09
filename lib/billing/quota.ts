import { aiPeriodKey, aiPeriodResets, thoughtPeriodKey, thoughtPeriodResets, PLAN_QUOTAS, quotaTotal, quotaWindow, type QuotaKey, type QuotaPool, type QuotaWindow, type Tier } from "./plans";

/*
 * Allowance accounting without the database driver: which pool a use goes
 * to, and the SQL that charges it. lib/server/quota.ts runs these statements
 * in one Postgres transaction; tests run the same text against a real
 * Postgres. Never touches content.
 */

/** The stored period of a pool now: "week:2026-11-09", "month:2026-11" or "once:first". */
export function poolPeriod(pool: QuotaPool, now: Date): string {
  if (pool.window === "week") return `week:${aiPeriodKey(now)}`;
  if (pool.window === "month") return `month:${thoughtPeriodKey(now)}`;
  return `once:${pool.name ?? "default"}`;
}

/** When the pool's window ends (YYYY-MM-DD, Budapest); null for one-time pools. */
export function poolResets(pool: QuotaPool, now: Date): string | null {
  if (pool.window === "week") return aiPeriodResets(now);
  if (pool.window === "month") return thoughtPeriodResets(now);
  return null;
}

export const poolsFor = (tier: Tier, quota: QuotaKey): readonly QuotaPool[] => PLAN_QUOTAS[tier][quota].filter(p => p.limit > 0);

/** The key stored for one use; scoped by quota so features never collide. */
export const quotaUseKey = (quota: QuotaKey, idempotencyKey: string) => `${quota}:${idempotencyKey}`.slice(0, 200);

export type Statement = { text: string; params: unknown[] };

/**
 * Charges one use, all in one transaction:
 *   0. a per-member advisory lock, so parallel requests are counted one after another;
 *   1. finds an existing use with the same key (a repeated request);
 *   2+. inserts into the first pool with room, one statement per pool, each
 *       skipped once the key exists (so a use lands in exactly one pool).
 * Read the outcome with reserveOutcome().
 */
export function reserveStatements(userId: string, quota: QuotaKey, pools: readonly QuotaPool[], key: string, now: Date): Statement[] {
  return [
    { text: "select pg_advisory_xact_lock(hashtextextended($1, 0))", params: [`quota:${userId}`] },
    { text: "select id, period from quota_uses where user_id = $1 and idem_key = $2", params: [userId, key] },
    ...pools.map(pool => ({
      text: `insert into quota_uses (user_id, quota, period, idem_key)
        select $1, $2, $3, $4
        where not exists (select 1 from quota_uses where user_id = $1 and idem_key = $4)
          and (select count(*) from quota_uses where user_id = $1 and quota = $2 and period = $3) < $5
        returning id, period`,
      params: [userId, quota, poolPeriod(pool, now), key, pool.limit],
    })),
  ];
}

export type Reservation = { id: string; period: string };
export type ReserveResult = { ok: true; reservation: Reservation } | { ok: false; reason: "limit" | "duplicate" };
type Row = { id: string; period: string };

/** The outcome of reserveStatements' results (one row array per statement). */
export function reserveOutcome(results: Row[][]): ReserveResult {
  if (results[1]?.[0]) return { ok: false, reason: "duplicate" };
  for (const rows of results.slice(2)) if (rows[0]) return { ok: true, reservation: { id: rows[0].id, period: rows[0].period } };
  return { ok: false, reason: "limit" };
}

/** Gives a use back (a failed AI call): exactly the reserved row. */
export const releaseStatement = (userId: string, id: string): Statement => ({ text: "delete from quota_uses where id = $1 and user_id = $2", params: [id, userId] });

/**
 * After a finished request: frees its key, so a later request with the same
 * key is a new, separately charged one. One-time pools keep their key (charged once, ever).
 */
export const settleStatement = (userId: string, id: string): Statement => ({
  text: "update quota_uses set idem_key = null where id = $1 and user_id = $2 and period not like 'once:%'",
  params: [id, userId],
});

export const usageStatement = (userId: string, quota: QuotaKey, periods: string[]): Statement => ({
  text: "select period, count(*)::int as n from quota_uses where user_id = $1 and quota = $2 and period = any($3::text[]) group by period",
  params: [userId, quota, periods],
});

export type QuotaUsage = { used: number; limit: number; remaining: number; reached: boolean; resets: string | null; window: QuotaWindow };

/** Usage across the tier's pools from per-period counts. */
export function usageFrom(tier: Tier, quota: QuotaKey, counts: Record<string, number>, now: Date): QuotaUsage {
  const pools = poolsFor(tier, quota);
  const used = pools.reduce((n, p) => n + Math.min(p.limit, counts[poolPeriod(p, now)] ?? 0), 0);
  const limit = quotaTotal(pools);
  const remaining = Math.max(0, limit - used);
  const periodic = pools.find(p => p.window !== "once");
  return { used, limit, remaining, reached: remaining === 0, resets: periodic ? poolResets(periodic, now) : null, window: quotaWindow(pools) };
}
