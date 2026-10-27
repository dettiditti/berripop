/**
 * Retention periods for technical and analytics records, in days. Each one is
 * off until its environment variable is set (after the lawyer has approved
 * the period), so nothing is deleted by default. Invoice records are never
 * deleted here: they are kept for the period the accounting rules require.
 *
 *   RETENTION_STRIPE_EVENTS_DAYS   webhook dedupe ids (stripe_events)
 *   RETENTION_FUNNEL_EVENTS_DAYS   product events (funnel_events)
 *   RETENTION_CIRCLE_EVENTS_DAYS   circle activity log (circle_events)
 *   RETENTION_AI_CALLS_DAYS        AI usage log without content (ai_calls)
 */
export const RETENTION_TABLES = {
  stripe_events: "RETENTION_STRIPE_EVENTS_DAYS",
  funnel_events: "RETENTION_FUNNEL_EVENTS_DAYS",
  circle_events: "RETENTION_CIRCLE_EVENTS_DAYS",
  ai_calls: "RETENTION_AI_CALLS_DAYS",
} as const;
export type RetentionTable = keyof typeof RETENTION_TABLES;

/** Webhook ids must outlive Stripe's retry window (up to 3 days), so shorter periods are refused. */
const MIN_DAYS: Record<RetentionTable, number> = { stripe_events: 30, funnel_events: 1, circle_events: 1, ai_calls: 1 };

export function retentionDays(env: Record<string, string | undefined>): Partial<Record<RetentionTable, number>> {
  const out: Partial<Record<RetentionTable, number>> = {};
  for (const [table, name] of Object.entries(RETENTION_TABLES) as [RetentionTable, string][]) {
    const raw = env[name]?.trim();
    if (!raw || !/^\d+$/.test(raw)) continue;
    const days = Number(raw);
    if (days >= MIN_DAYS[table]) out[table] = days;
  }
  return out;
}
