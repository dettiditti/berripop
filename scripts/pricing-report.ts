/**
 * Read-only pricing and conversion report (docs/analytics.md). Like
 * scripts/funnel-report.ts it counts real members only: rows without a member
 * (left by the verify:* scripts' deleted test users) and test_ ids are left
 * out, and so are the ids in EXCLUDE_USERS (comma-separated, e.g. the owner's
 * own accounts). Runs in a read-only transaction and prints counts, never
 * member ids, names or content.
 *
 *   npm run pricing-report            the last 30 days
 *   npm run pricing-report -- 90      the last 90 days
 */
import { neon } from "@neondatabase/serverless";
import { PRICES } from "../lib/billing/plans";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const days = Number(process.argv[2] ?? 30);
  if (!Number.isInteger(days) || days < 1) throw new Error("Usage: npm run pricing-report -- [days]");
  const excluded = (process.env.EXCLUDE_USERS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const sql = neon(url);

  const members = sql`select id from users where id not like 'test\\_%' and not (id = any(${excluded}::text[]))`;
  const since = sql`now() - make_interval(days => ${days})`;
  // Monthly list price of each plan and interval (App Store prices are close, see lib/billing/apple.ts).
  const monthly = Object.values(PRICES).map(p => ({ plan: p.plan, interval: p.interval, perMonth: p.interval === "year" ? p.amount / 12 : p.amount }));

  const [plans, conversion, trial, churn, paywall, ai] = await sql.transaction([
    // Who is on what now: Stripe and App Store subscriptions that grant access, and trials.
    sql`with m as (${members}),
      paid as (
        select user_id, plan_id, interval from subscriptions where status in ('active', 'trialing', 'past_due') and user_id in (select id from m)
        union all
        select user_id, plan_id, interval from apple_subscriptions where status in ('active', 'grace') and expires_at > now() and user_id in (select id from m))
      select coalesce(p.plan_id, case when g.ends_at > now() then 'trial (free)' else 'free' end) as plan, p.interval, count(*)::int as members
      from m left join paid p on p.user_id = m.id
      left join entitlement_grants g on g.user_id = m.id and g.kind = 'premium_trial'
      group by 1, 2 order by 1, 2`,
    // Conversions in the period, from the server-side purchase events.
    sql`with m as (${members})
      select count(distinct user_id) filter (where event in ('checkout_completed', 'apple_purchase_recorded') and plan = 'premium')::int as to_premium,
        count(distinct user_id) filter (where event in ('checkout_completed', 'apple_purchase_recorded') and plan = 'premium_plus')::int as to_plus_direct,
        count(distinct user_id) filter (where event = 'plan_changed' and plan = 'premium_plus')::int as premium_to_plus,
        (select count(*) from m)::int as members
      from funnel_events where created_at >= ${since} and user_id in (select id from m)`,
    sql`with m as (${members})
      select count(*) filter (where event = 'trial_started')::int as started,
        count(*) filter (where event = 'trial_completed')::int as completed,
        count(*) filter (where event = 'trial_completed' and context = 'converted')::int as converted
      from funnel_events where created_at >= ${since} and user_id in (select id from m)`,
    sql`with m as (${members})
      select count(distinct user_id) filter (where event = 'subscription_canceled')::int as canceled,
        (select count(*) from subscriptions where status in ('active', 'trialing', 'past_due') and user_id in (select id from m))::int
          + (select count(*) from apple_subscriptions where status in ('active', 'grace') and expires_at > now() and user_id in (select id from m))::int as paying_now
      from funnel_events where created_at >= ${since} and user_id in (select id from m)`,
    sql`with m as (${members})
      select event, coalesce(context, '') as context, coalesce(plan, '') as plan, coalesce(interval, '') as interval, count(*)::int as events, count(distinct user_id)::int as members
      from funnel_events
      where created_at >= ${since} and user_id in (select id from m)
        and event in ('pricing_viewed', 'feature_paywall_viewed', 'upgrade_prompt_shown', 'plan_selected', 'checkout_started', 'free_quota_exhausted', 'ai_cost_cap_reached', 'thought_dissector_quota_exhausted')
      group by 1, 2, 3, 4 order by 1, 2, 3, 4`,
    // Estimated AI cost (ai_calls, micro-USD) per member in the period.
    sql`with m as (${members}), c as (
        select user_id, sum(cost_micro_usd)::bigint as cost, count(*)::int as calls from ai_calls where created_at >= ${since} and user_id in (select id from m) group by user_id)
      select count(*)::int as members_using_ai, coalesce(sum(calls), 0)::int as calls,
        round(coalesce(sum(cost), 0) / 1e6, 4)::text as total_usd, round(coalesce(avg(cost), 0) / 1e6, 4)::text as avg_usd_per_ai_member,
        round(coalesce(max(cost), 0) / 1e6, 4)::text as max_usd_one_member
      from c`,
  ], { readOnly: true });

  const paying = (plans as { plan: string; interval: string | null; members: number }[]).filter(r => r.plan === "premium" || r.plan === "premium_plus");
  const payingCount = paying.reduce((n, r) => n + r.members, 0);
  const mrr = paying.reduce((n, r) => n + r.members * (monthly.find(p => p.plan === r.plan && p.interval === r.interval)?.perMonth ?? 0), 0);
  const annual = paying.filter(r => r.interval === "year").reduce((n, r) => n + r.members, 0);
  const c = conversion[0] as { to_premium: number; to_plus_direct: number; premium_to_plus: number; members: number };
  const tr = trial[0] as { started: number; completed: number; converted: number };
  const ch = churn[0] as { canceled: number; paying_now: number };
  const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "–");

  console.log(`Real members, last ${days} days${excluded.length ? ` (${excluded.length} excluded)` : ""}`);
  console.log("\nPlans now");
  console.table(plans);
  console.log("\nKey numbers");
  console.table([{
    "Free → Premium": pct(c.to_premium, c.members),
    "Free → Plus": pct(c.to_plus_direct, c.members),
    "Premium → Plus": `${c.premium_to_plus} members`,
    "Trial → paid": `${pct(tr.converted, tr.completed)} (${tr.converted} of ${tr.completed} ended; ${tr.started} started)`,
    "Churn (canceled / paying)": pct(ch.canceled, ch.canceled + ch.paying_now),
    "Annual share": pct(annual, payingCount),
    "ARPPU / month (list price, HUF)": payingCount ? Math.round(mrr / payingCount) : "–",
    "MRR (list price, HUF)": Math.round(mrr),
  }]);
  console.log("\nPricing and paywall events");
  console.table(paywall);
  console.log("\nAI cost (estimate from ai_calls)");
  console.table(ai);
}

main().catch(err => {
  console.error(`Failed: ${(err as Error)?.message ?? err}`);
  process.exitCode = 1;
});
