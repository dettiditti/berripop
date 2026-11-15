/**
 * Read-only activity report: are the members still coming back? Counts real
 * members only (test_ ids are left out). Runs in a read-only transaction and
 * prints counts and dates, never member ids, names or content.
 *
 *   npm run activity
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

  const [summary, perMember] = await sql.transaction([
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
  ], { readOnly: true });

  console.log(`Today (${TZ}): ${new Date().toLocaleDateString("hu-HU", { timeZone: TZ })}`);
  console.table(summary);
  console.log("Per member (numbered by join order, most recently active first)");
  console.table(perMember);
}

main().catch(err => {
  console.error(`Failed: ${(err as Error)?.message ?? err}`);
  process.exit(1);
});
