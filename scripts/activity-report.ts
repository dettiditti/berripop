/**
 * Read-only activity report: are the members still coming back? Counts real
 * members only (test_ ids are left out). Runs in a read-only transaction and
 * prints counts, dates and feature names, never member ids, names or content.
 *
 *   npm run activity
 *   npm run activity -- --name Jázmin   (marks members whose display name matches with ★, still without printing it)
 */
import { neon } from "@neondatabase/serverless";

const TZ = "Europe/Budapest";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);

  // A member's active days: days they opened the app (funnel_events) or did a step (user_activity).
  const days = sql`select user_id, (created_at at time zone ${TZ})::date as d from funnel_events where event = 'app_opened' and user_id is not null
    union select user_id, date::date from user_activity`;
  const members = sql`select id, row_number() over (order by created_at) as n, created_at, signup_source from users where id not like 'test\\_%'`;

  const nameArg = process.argv.indexOf("--name");
  const name = nameArg > 0 ? process.argv[nameArg + 1] ?? "" : "";

  const [summary, perMember, usage] = await sql.transaction([
    sql`with m as (${members}), a as (${days}), last as (select user_id, max(d) as d from a group by user_id)
      select count(*)::int as members,
        count(*) filter (where l.d >= current_date - 1)::int as active_last_2_days,
        count(*) filter (where l.d >= current_date - 6)::int as active_last_7_days,
        count(*) filter (where l.d >= current_date - 29)::int as active_last_30_days,
        count(*) filter (where l.d is null)::int as never_active
      from m left join last l on l.user_id = m.id`,
    sql`with m as (${members}), a as (${days})
      select m.n as member, m.signup_source as source, (m.created_at at time zone ${TZ})::date::text as joined,
        max(a.d)::text as last_active, (current_date - max(a.d))::int as days_since,
        count(distinct a.d) filter (where a.d >= current_date - 6)::int as days_last_7,
        count(distinct a.d)::int as days_total
      from m left join a on a.user_id = m.id group by m.n, m.created_at, m.signup_source order by last_active desc nulls last`,
    // What each member uses: counts only (journal, check-ins, moments etc. are never read, just counted).
    sql`with m as (${members})
      select m.n as member,
        case when ${name} <> '' and u.display_name ilike ${"%" + name + "%"} then '★' else '' end as match,
        (select count(*) from user_activity x where x.user_id = m.id and x.kind = 'daily')::int as daily_q,
        (select count(*) from user_activity x where x.user_id = m.id and x.kind = 'journey')::int as journey_days,
        (select count(*) from user_activity x where x.user_id = m.id and x.kind = 'goal')::int as goal_days,
        (select count(*) from growth_goals x where x.user_id = m.id)::int as goals,
        (select count(*) from journal_entries x where x.user_id = m.id and x.status = 'saved')::int as journal,
        (select count(*) from daily_checkins x where x.user_id = m.id)::int as checkins,
        (select count(*) from world_moments x where x.user_id = m.id)::int as moments,
        (select count(*) from thought_sessions x where x.user_id = m.id)::int as thoughts,
        (select count(*) from relationship_records x where x.user_id = m.id)::int as relation,
        (select count(*) from circle_members x where x.user_id = m.id)::int as circles,
        (select coalesce(sum(amount), 0) from user_xp_events x where x.user_id = m.id)::int as xp,
        (select count(*) from push_devices x where x.user_id = m.id)::int as push,
        coalesce((select s.plan_id || ':' || s.status from subscriptions s where s.user_id = m.id and s.status <> 'none'),
          (select a.plan_id || ':' || a.status from apple_subscriptions a where a.user_id = m.id order by a.updated_at desc limit 1), '') as plan,
        (select string_agg(feature || '×' || c, ' ' order by c desc) from (select feature, count(*) c from ai_calls x where x.user_id = m.id group by feature) f) as ai
      from m join users u on u.id = m.id order by m.n`,
  ], { readOnly: true });

  console.log(`Today (${TZ}): ${new Date().toLocaleDateString("hu-HU", { timeZone: TZ })}`);
  console.table(summary);
  console.log("Per member (numbered by join order, most recently active first)");
  console.table(perMember);
  console.log("What they use (counts only)");
  console.table(usage);
}

main().catch(err => {
  console.error(`Failed: ${(err as Error)?.message ?? err}`);
  process.exit(1);
});
