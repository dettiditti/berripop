import "server-only";
import { lt } from "drizzle-orm";
import { getDb } from "../db";
import { aiCalls, circleEvents, funnelEvents, stripeEvents } from "../db/schema";
import { retentionDays, type RetentionTable } from "../retention/policy";

const column = {
  stripe_events: { table: stripeEvents, at: stripeEvents.processedAt },
  funnel_events: { table: funnelEvents, at: funnelEvents.createdAt },
  circle_events: { table: circleEvents, at: circleEvents.createdAt },
  ai_calls: { table: aiCalls, at: aiCalls.createdAt },
} as const;

/** Deletes records older than their configured retention period; tables without one are untouched. */
export async function applyRetention(): Promise<Partial<Record<RetentionTable, number>>> {
  const db = getDb();
  const deleted: Partial<Record<RetentionTable, number>> = {};
  for (const [name, days] of Object.entries(retentionDays(process.env)) as [RetentionTable, number][]) {
    const { table, at } = column[name];
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const rows = await db.delete(table).where(lt(at, cutoff)).returning({ at });
    deleted[name] = rows.length;
  }
  return deleted;
}
