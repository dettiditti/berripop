import { poolPeriod, poolsFor, useKey, usageFrom, type ReserveResult } from "../../lib/billing/quota";
import type { QuotaKey, Tier } from "../../lib/billing/plans";

/**
 * The allowance rules of lib/billing/quota.ts on an in-memory list instead
 * of Postgres: same pools, periods, keys and outcomes, for unit tests.
 */
export function memoryQuota(tierOf: (userId: string) => Tier, now: () => Date) {
  const rows: { id: string; userId: string; quota: QuotaKey; period: string; idemKey: string | null }[] = [];
  let n = 0;
  return {
    rows,
    reserve(userId: string, quota: QuotaKey, idempotencyKey: string = `rnd-${++n}`): ReserveResult {
      const key = useKey(quota, idempotencyKey);
      if (rows.some(r => r.userId === userId && r.idemKey === key)) return { ok: false, reason: "duplicate" };
      for (const pool of poolsFor(tierOf(userId), quota)) {
        const period = poolPeriod(pool, now());
        if (rows.filter(r => r.userId === userId && r.quota === quota && r.period === period).length < pool.limit) {
          const row = { id: `use-${++n}`, userId, quota, period, idemKey: key };
          rows.push(row);
          return { ok: true, reservation: { id: row.id, period } };
        }
      }
      return { ok: false, reason: "limit" };
    },
    find(userId: string, quota: QuotaKey, idempotencyKey: string) {
      const r = rows.find(x => x.userId === userId && x.idemKey === useKey(quota, idempotencyKey));
      return r ? { id: r.id, period: r.period } : null;
    },
    release(userId: string, id: string) {
      const i = rows.findIndex(r => r.id === id && r.userId === userId);
      if (i >= 0) rows.splice(i, 1);
    },
    usage(userId: string, quota: QuotaKey) {
      const counts: Record<string, number> = {};
      for (const r of rows) if (r.userId === userId && r.quota === quota) counts[r.period] = (counts[r.period] ?? 0) + 1;
      return usageFrom(tierOf(userId), quota, counts, now());
    },
  };
}
